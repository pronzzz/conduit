import { edgeProblem } from '../core/graph';
import type { Graph, GraphNode, NodeKind } from '../core/types';
import { NODE_HALF } from '../sim/engine';
import { useStore } from '../state/store';
import type { Camera } from './camera';
import { HANDLE_OFFSET, type Overlay } from './renderer';

const GRID = 12;
const DRAG_THRESHOLD = 3;

type Mode =
  | { k: 'idle' }
  | { k: 'pan'; pointer: number; lastX: number; lastY: number; lastT: number; vx: number; vy: number; moved: boolean }
  | { k: 'node'; pointer: number; id: string; dx: number; dy: number; downX: number; downY: number; moved: boolean }
  | { k: 'connect'; pointer: number; from: string }
  | { k: 'place'; kind: NodeKind; downX: number; downY: number; moved: boolean }
  | { k: 'pinch'; dist: number; midX: number; midY: number };

const snap = (v: number, free: boolean) => (free ? Math.round(v) : Math.round(v / GRID) * GRID);

export class Interaction {
  readonly overlay: Overlay = {
    hoverNode: null,
    hoverHandle: null,
    hoverEdge: null,
    dragging: null,
    connect: null,
    ghost: null,
  };
  private mode: Mode = { k: 'idle' };
  private touches = new Map<number, { x: number; y: number }>();
  private cleanup: (() => void)[] = [];
  private readonly canvas: HTMLCanvasElement;
  private readonly camera: Camera;
  private readonly invalidate: () => void;

  constructor(canvas: HTMLCanvasElement, camera: Camera, invalidate: () => void) {
    this.canvas = canvas;
    this.camera = camera;
    this.invalidate = invalidate;
    const on = <K extends keyof HTMLElementEventMap>(
      el: HTMLElement | Window,
      type: K,
      fn: (e: HTMLElementEventMap[K]) => void,
      opts?: AddEventListenerOptions,
    ) => {
      el.addEventListener(type, fn as EventListener, opts);
      this.cleanup.push(() => el.removeEventListener(type, fn as EventListener, opts));
    };
    on(canvas, 'pointerdown', this.down);
    on(canvas, 'pointermove', this.move);
    on(canvas, 'pointerup', this.up);
    on(canvas, 'pointercancel', this.cancel);
    on(canvas, 'pointerleave', this.leave);
    on(canvas, 'wheel', this.wheel, { passive: false });
    on(canvas, 'dblclick', this.dblclick);
    // Safari trackpad pinch
    on(canvas, 'gesturestart' as keyof HTMLElementEventMap, (e) => e.preventDefault());
    on(canvas, 'gesturechange' as keyof HTMLElementEventMap, this.gesture);
  }

  dispose() {
    this.cleanup.forEach((f) => f());
    this.endPlace();
  }

  /** True while a gesture needs continuous frames (e.g. the marching connect line). */
  get active() {
    return this.mode.k !== 'idle';
  }

  // ─── Geometry ─────────────────────────────────────────────────────────────

  private local(e: { clientX: number; clientY: number }) {
    const r = this.canvas.getBoundingClientRect();
    return { sx: e.clientX - r.left, sy: e.clientY - r.top, inside: e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom };
  }

  private graph(): Graph {
    return useStore.getState().graph;
  }

  private nodeAt(wx: number, wy: number, except?: string): GraphNode | null {
    const nodes = this.graph().nodes;
    const pad = NODE_HALF + 3;
    for (let i = nodes.length - 1; i >= 0; i--) {
      const n = nodes[i];
      if (n.id !== except && Math.abs(wx - n.x) <= pad && Math.abs(wy - n.y) <= pad) return n;
    }
    return null;
  }

  private handleAt(wx: number, wy: number): GraphNode | null {
    const r = Math.min(14, Math.max(8, 10 / this.camera.scale));
    const nodes = this.graph().nodes;
    for (let i = nodes.length - 1; i >= 0; i--) {
      const n = nodes[i];
      if (Math.hypot(wx - (n.x + HANDLE_OFFSET), wy - n.y) <= r) return n;
    }
    return null;
  }

  /**
   * The connect handle wins only on the node's right edge (or outside it), so
   * at low zoom the handle's hit area never swallows the node body.
   */
  private connectHandle(wx: number, wy: number, node: GraphNode | null): GraphNode | null {
    const handle = this.handleAt(wx, wy);
    if (!handle) return null;
    if (!node) return handle;
    return node.id === handle.id && wx - node.x > NODE_HALF - 8 ? handle : null;
  }

  private edgeAt(wx: number, wy: number): string | null {
    const g = this.graph();
    const byId = new Map(g.nodes.map((n) => [n.id, n]));
    const tol = Math.max(5, 7 / this.camera.scale);
    let best: string | null = null;
    let bestD = tol;
    for (const e of g.edges) {
      const a = byId.get(e.from);
      const b = byId.get(e.to);
      if (!a || !b) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len2 = dx * dx + dy * dy;
      if (!len2) continue;
      const t = Math.max(0, Math.min(1, ((wx - a.x) * dx + (wy - a.y) * dy) / len2));
      const d = Math.hypot(wx - (a.x + dx * t), wy - (a.y + dy * t));
      if (d < bestD) {
        bestD = d;
        best = e.id;
      }
    }
    return best;
  }

  // ─── Pointer ──────────────────────────────────────────────────────────────

  private down = (e: PointerEvent) => {
    if (this.mode.k === 'place') return;
    const { sx, sy } = this.local(e);
    if (e.pointerType === 'touch') {
      this.touches.set(e.pointerId, { x: sx, y: sy });
      if (this.touches.size === 2) {
        this.startPinch();
        return;
      }
    }
    if (e.button !== 0 && e.button !== 1) return;
    this.canvas.setPointerCapture(e.pointerId);
    this.camera.stop();
    const w = this.camera.toWorld(sx, sy);
    const store = useStore.getState();

    if (e.button === 0) {
      const node = this.nodeAt(w.x, w.y);
      const handle = this.connectHandle(w.x, w.y, node);
      if (handle) {
        this.mode = { k: 'connect', pointer: e.pointerId, from: handle.id };
        this.overlay.connect = { from: handle.id, x: w.x, y: w.y, target: null, valid: false };
        this.setCursor('crosshair');
        this.invalidate();
        return;
      }
      if (node) {
        store.select({ type: 'node', id: node.id });
        this.mode = { k: 'node', pointer: e.pointerId, id: node.id, dx: w.x - node.x, dy: w.y - node.y, downX: sx, downY: sy, moved: false };
        this.setCursor('grabbing');
        this.invalidate();
        return;
      }
      const edge = this.edgeAt(w.x, w.y);
      if (edge) {
        store.select({ type: 'edge', id: edge });
        this.invalidate();
        return;
      }
    }
    this.mode = { k: 'pan', pointer: e.pointerId, lastX: sx, lastY: sy, lastT: e.timeStamp, vx: 0, vy: 0, moved: false };
    this.setCursor('grabbing');
  };

  private move = (e: PointerEvent) => {
    const { sx, sy } = this.local(e);
    if (e.pointerType === 'touch' && this.touches.has(e.pointerId)) {
      this.touches.set(e.pointerId, { x: sx, y: sy });
      if (this.mode.k === 'pinch') {
        this.updatePinch();
        return;
      }
    }
    const m = this.mode;
    const w = this.camera.toWorld(sx, sy);

    switch (m.k) {
      case 'pan': {
        const dx = sx - m.lastX;
        const dy = sy - m.lastY;
        const dt = Math.max(1, e.timeStamp - m.lastT);
        if (Math.abs(dx) + Math.abs(dy) > 0) m.moved = true;
        this.camera.panBy(dx, dy);
        m.vx = m.vx * 0.6 + (dx / dt) * 0.4;
        m.vy = m.vy * 0.6 + (dy / dt) * 0.4;
        m.lastX = sx;
        m.lastY = sy;
        m.lastT = e.timeStamp;
        this.invalidate();
        return;
      }
      case 'node': {
        if (!m.moved && Math.hypot(sx - m.downX, sy - m.downY) < DRAG_THRESHOLD) return;
        const store = useStore.getState();
        if (!m.moved) {
          m.moved = true;
          store.checkpoint();
          this.overlay.dragging = m.id;
        }
        store.moveNode(m.id, snap(w.x - m.dx, e.altKey), snap(w.y - m.dy, e.altKey));
        return;
      }
      case 'connect': {
        const c = this.overlay.connect!;
        c.x = w.x;
        c.y = w.y;
        const target = this.nodeAt(w.x, w.y, m.from);
        c.target = target?.id ?? null;
        c.valid = target ? !edgeProblem(this.graph(), m.from, target.id) : false;
        this.invalidate();
        return;
      }
      case 'idle':
        this.hover(w.x, w.y);
    }
  };

  private up = (e: PointerEvent) => {
    if (e.pointerType === 'touch') this.touches.delete(e.pointerId);
    const m = this.mode;
    if (m.k === 'place') return; // the window listener commits palette drops
    if (m.k === 'pinch') {
      if (this.touches.size < 2) this.mode = { k: 'idle' };
      return;
    }
    const store = useStore.getState();
    switch (m.k) {
      case 'pan':
        if (!m.moved) store.select(null);
        else if (e.timeStamp - m.lastT < 60) this.camera.fling(m.vx, m.vy);
        break;
      case 'connect': {
        const c = this.overlay.connect;
        if (c?.target) store.connect(m.from, c.target);
        this.overlay.connect = null;
        break;
      }
      case 'node':
        this.overlay.dragging = null;
        break;
    }
    this.mode = { k: 'idle' };
    const { sx, sy } = this.local(e);
    const w = this.camera.toWorld(sx, sy);
    this.hover(w.x, w.y);
    this.invalidate();
  };

  private cancel = (e: PointerEvent) => {
    this.touches.delete(e.pointerId);
    this.overlay.connect = null;
    this.overlay.dragging = null;
    this.mode = { k: 'idle' };
    this.invalidate();
  };

  private leave = () => {
    if (this.mode.k !== 'idle') return;
    this.overlay.hoverNode = this.overlay.hoverHandle = this.overlay.hoverEdge = null;
    this.invalidate();
  };

  private hover(wx: number, wy: number) {
    const o = this.overlay;
    const node = this.nodeAt(wx, wy);
    const onHandle = this.connectHandle(wx, wy, node)?.id ?? null;
    const hoverNode = node?.id ?? onHandle;
    const hoverEdge = hoverNode ? null : this.edgeAt(wx, wy);
    if (o.hoverNode !== hoverNode || o.hoverHandle !== onHandle || o.hoverEdge !== hoverEdge) {
      o.hoverNode = hoverNode;
      o.hoverHandle = onHandle;
      o.hoverEdge = hoverEdge;
      this.invalidate();
    }
    this.setCursor(onHandle ? 'crosshair' : node ? 'grab' : hoverEdge ? 'pointer' : 'default');
  }

  private dblclick = (e: MouseEvent) => {
    const { sx, sy } = this.local(e);
    const w = this.camera.toWorld(sx, sy);
    const node = this.nodeAt(w.x, w.y);
    if (node) window.dispatchEvent(new CustomEvent('conduit:rename', { detail: node.id }));
  };

  private setCursor(c: string) {
    if (this.canvas.style.cursor !== c) this.canvas.style.cursor = c;
  }

  // ─── Zoom ─────────────────────────────────────────────────────────────────

  private wheel = (e: WheelEvent) => {
    e.preventDefault();
    const { sx, sy } = this.local(e);
    const lines = e.deltaMode === 1;
    const dy = lines ? e.deltaY * 16 : e.deltaY;
    const mouseWheel = lines || (e.deltaX === 0 && Math.abs(e.deltaY) >= 50 && Number.isInteger(e.deltaY));
    if (e.ctrlKey || e.metaKey) {
      // Trackpad pinch arrives as ctrl+wheel with small deltas.
      this.camera.zoomAt(sx, sy, Math.exp(-dy * 0.012));
    } else if (mouseWheel) {
      this.camera.zoomAt(sx, sy, Math.exp(-Math.sign(dy) * Math.min(Math.abs(dy), 200) * 0.0022));
    } else {
      this.camera.panBy(-e.deltaX, -e.deltaY);
    }
    this.invalidate();
  };

  private lastGestureScale = 1;
  private gesture = (e: Event) => {
    e.preventDefault();
    const g = e as Event & { scale: number; clientX: number; clientY: number };
    const { sx, sy } = this.local(g);
    const factor = g.scale / this.lastGestureScale;
    this.lastGestureScale = g.scale;
    if (Number.isFinite(factor) && factor > 0) this.camera.zoomAt(sx, sy, factor);
    this.invalidate();
  };

  private startPinch() {
    const [a, b] = [...this.touches.values()];
    this.overlay.connect = null;
    this.overlay.dragging = null;
    this.mode = { k: 'pinch', dist: Math.hypot(a.x - b.x, a.y - b.y), midX: (a.x + b.x) / 2, midY: (a.y + b.y) / 2 };
  }

  private updatePinch() {
    const m = this.mode;
    if (m.k !== 'pinch') return;
    const [a, b] = [...this.touches.values()];
    const dist = Math.hypot(a.x - b.x, a.y - b.y);
    const midX = (a.x + b.x) / 2;
    const midY = (a.y + b.y) / 2;
    this.camera.panBy(midX - m.midX, midY - m.midY);
    if (m.dist > 0) this.camera.zoomAt(midX, midY, dist / m.dist);
    m.dist = dist;
    m.midX = midX;
    m.midY = midY;
    this.invalidate();
  }

  // ─── Palette drag & drop ──────────────────────────────────────────────────

  beginPlace(kind: NodeKind, e: PointerEvent) {
    this.endPlace();
    this.mode = { k: 'place', kind, downX: e.clientX, downY: e.clientY, moved: false };
    window.addEventListener('pointermove', this.placeMove);
    window.addEventListener('pointerup', this.placeUp);
    window.addEventListener('pointercancel', this.placeCancel);
  }

  private placeMove = (e: PointerEvent) => {
    const m = this.mode;
    if (m.k !== 'place') return;
    if (!m.moved && Math.hypot(e.clientX - m.downX, e.clientY - m.downY) < DRAG_THRESHOLD) return;
    m.moved = true;
    const { sx, sy, inside } = this.local(e);
    const w = this.camera.toWorld(sx, sy);
    this.overlay.ghost = inside ? { kind: m.kind, x: snap(w.x, e.altKey), y: snap(w.y, e.altKey) } : null;
    this.setCursor(inside ? 'copy' : 'default');
    this.invalidate();
  };

  private placeUp = (e: PointerEvent) => {
    const m = this.mode;
    if (m.k !== 'place') return;
    const ghost = this.overlay.ghost;
    if (ghost) useStore.getState().addNode(ghost.kind, ghost.x, ghost.y);
    else if (!m.moved) this.addAtCenter(m.kind);
    this.endPlace();
    const { sx, sy } = this.local(e);
    const w = this.camera.toWorld(sx, sy);
    this.hover(w.x, w.y);
  };

  private placeCancel = () => this.endPlace();

  private endPlace() {
    window.removeEventListener('pointermove', this.placeMove);
    window.removeEventListener('pointerup', this.placeUp);
    window.removeEventListener('pointercancel', this.placeCancel);
    if (this.mode.k === 'place') this.mode = { k: 'idle' };
    this.overlay.ghost = null;
    this.invalidate();
  }

  /** Adds a node near the middle of the view, nudging it off any existing node. */
  addAtCenter(kind: NodeKind) {
    const r = this.canvas.getBoundingClientRect();
    const c = this.camera.toWorld(r.width / 2, r.height / 2);
    let x = snap(c.x, false);
    let y = snap(c.y, false);
    for (let i = 0; i < 24 && this.nodeAt(x, y); i++) {
      x += GRID * 6;
      if (i % 4 === 3) {
        x -= GRID * 24;
        y += GRID * 8;
      }
    }
    useStore.getState().addNode(kind, x, y);
  }
}
