import { SPECS } from '../core/specs';
import type { Graph, GraphEdge, GraphNode, NodeKind, Selection } from '../core/types';
import { NODE_HALF, type Simulation } from '../sim/engine';
import type { Camera } from './camera';
import { FONT, MONO, approach, prefersReducedMotion, type Palette } from './theme';

export const HANDLE_OFFSET = NODE_HALF + 1;
const RADIUS = 14;
const EDGE_GAP = 5;
const LANE = 3.2;
const TRAIL = 18;

export interface Overlay {
  hoverNode: string | null;
  hoverHandle: string | null;
  hoverEdge: string | null;
  dragging: string | null;
  connect: { from: string; x: number; y: number; target: string | null; valid: boolean } | null;
  ghost: { kind: NodeKind; x: number; y: number } | null;
}

export interface FrameInput {
  graph: Graph;
  selection: Selection;
  sim: Simulation;
  camera: Camera;
  palette: Palette;
  overlay: Overlay;
  dt: number;
}

interface NodeVis {
  node: GraphNode;
  x: number;
  y: number;
  appear: number;
  scale: number;
  sel: number;
  handle: number;
  load: number;
  badge: number;
  badgeValue: number;
  leaving: boolean;
}

interface EdgeVis {
  edge: GraphEdge;
  grow: number;
  emphasis: number;
  leaving: boolean;
  /** Last known endpoints, so a removed edge can fade out in place. */
  ax: number;
  ay: number;
  bx: number;
  by: number;
}

const glyphCache = new Map<NodeKind, Path2D>();
const glyph = (kind: NodeKind) => {
  let p = glyphCache.get(kind);
  if (!p) glyphCache.set(kind, (p = new Path2D(SPECS[kind].glyph)));
  return p;
};

/** Distance from a node centre to its rounded-square border along (dx, dy). */
function borderDistance(dx: number, dy: number) {
  const m = Math.max(Math.abs(dx), Math.abs(dy));
  return m === 0 ? NODE_HALF : NODE_HALF / m;
}

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private dpr = 1;
  width = 0;
  height = 0;
  private nodes = new Map<string, NodeVis>();
  private edges = new Map<string, EdgeVis>();
  private gridTile: { color: string; pattern: CanvasPattern } | null = null;

  private readonly canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D is not available');
    this.ctx = ctx;
  }

  resize(width: number, height: number, dpr: number) {
    this.width = width;
    this.height = height;
    this.dpr = dpr;
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
  }

  /** Visual (eased) position of a node, used for hit-testing what the user sees. */
  visual(id: string) {
    return this.nodes.get(id);
  }

  /** Draws one frame. Returns true if something is still animating. */
  draw(f: FrameInput): boolean {
    const dt = prefersReducedMotion() ? 1e6 : f.dt;
    const animating = this.sync(f, dt);

    const { ctx, dpr } = this;
    const { camera, palette: pal } = f;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = pal.bg;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.drawGrid(camera, pal);

    ctx.setTransform(dpr * camera.scale, 0, 0, dpr * camera.scale, dpr * camera.x, dpr * camera.y);
    this.drawEdges(f);
    this.drawConnectPreview(f);
    this.drawPackets(f);
    this.drawNodes(f);
    this.drawGhost(f);
    return animating;
  }

  // ─── State easing ─────────────────────────────────────────────────────────

  private sync(f: FrameInput, dt: number): boolean {
    const { graph, selection, overlay, sim } = f;
    let animating = false;
    const seen = new Set<string>();

    for (const n of graph.nodes) {
      seen.add(n.id);
      let v = this.nodes.get(n.id);
      if (!v) {
        v = { node: n, x: n.x, y: n.y, appear: 0, scale: 0.92, sel: 0, handle: 0, load: 0, badge: 0, badgeValue: 0, leaving: false };
        this.nodes.set(n.id, v);
      }
      v.node = n;
      v.leaving = false;
      const selected = selection?.type === 'node' && selection.id === n.id;
      const hovered = overlay.hoverNode === n.id;
      const dragging = overlay.dragging === n.id;
      const sn = sim.nodes.get(n.id);
      const queue = sn ? sn.queue.length : 0;

      const prev = v.x + v.y + v.appear + v.scale + v.sel + v.handle + v.load + v.badge;
      v.x = approach(v.x, n.x, dt, 28);
      v.y = approach(v.y, n.y, dt, 28);
      v.appear = approach(v.appear, 1, dt, 70);
      v.scale = approach(v.scale, dragging ? 1.05 : hovered ? 1.025 : 1, dt, 60);
      v.sel = approach(v.sel, selected ? 1 : 0, dt, 60);
      v.handle = approach(v.handle, hovered || selected || overlay.hoverHandle === n.id ? 1 : 0, dt, 60);
      v.load = approach(v.load, sn ? sn.utilization : 0, dt, 110);
      v.badge = approach(v.badge, queue > 0 ? 1 : 0, dt, 70);
      if (queue > 0) v.badgeValue = queue;
      if (v.x + v.y + v.appear + v.scale + v.sel + v.handle + v.load + v.badge !== prev) animating = true;
    }
    for (const [id, v] of this.nodes) {
      if (seen.has(id)) continue;
      v.leaving = true;
      v.appear = approach(v.appear, 0, dt, 50);
      if (v.appear < 0.02) this.nodes.delete(id);
      else animating = true;
    }

    seen.clear();
    for (const e of graph.edges) {
      seen.add(e.id);
      const a = this.nodes.get(e.from);
      const b = this.nodes.get(e.to);
      if (!a || !b) continue;
      let v = this.edges.get(e.id);
      if (!v) {
        v = { edge: e, grow: 0, emphasis: 0, leaving: false, ax: a.x, ay: a.y, bx: b.x, by: b.y };
        this.edges.set(e.id, v);
      }
      v.edge = e;
      v.leaving = false;
      v.ax = a.x;
      v.ay = a.y;
      v.bx = b.x;
      v.by = b.y;
      const selected = selection?.type === 'edge' && selection.id === e.id;
      const target = selected ? 1 : overlay.hoverEdge === e.id ? 0.5 : 0;
      const prev = v.grow + v.emphasis;
      v.grow = approach(v.grow, 1, dt, 80);
      v.emphasis = approach(v.emphasis, target, dt, 60);
      if (v.grow + v.emphasis !== prev) animating = true;
    }
    for (const [id, v] of this.edges) {
      if (seen.has(id)) continue;
      v.leaving = true;
      v.grow = approach(v.grow, 0, dt, 45);
      if (v.grow < 0.02) this.edges.delete(id);
      else animating = true;
    }
    return animating;
  }

  // ─── Layers ───────────────────────────────────────────────────────────────

  private drawGrid(camera: Camera, pal: Palette) {
    const { ctx, dpr } = this;
    if (!this.gridTile || this.gridTile.color !== pal.grid) {
      const tile = document.createElement('canvas');
      tile.width = tile.height = 32;
      const t = tile.getContext('2d')!;
      t.fillStyle = pal.grid;
      t.beginPath();
      t.arc(16, 16, 1.5, 0, Math.PI * 2);
      t.fill();
      this.gridTile = { color: pal.grid, pattern: ctx.createPattern(tile, 'repeat')! };
    }
    const { pattern } = this.gridTile;
    // Two levels that cross-fade as you zoom, so dots never pop.
    const base = 24 * camera.scale;
    let spacing = base;
    while (spacing < 14) spacing *= 2;
    const fine = Math.min(1, Math.max(0, (spacing - 14) / 14));
    for (const [s, alpha] of [
      [spacing, fine],
      [spacing * 2, 1],
    ] as const) {
      if (alpha <= 0) continue;
      const px = s * dpr;
      const ox = ((camera.x * dpr) % px) - px / 2;
      const oy = ((camera.y * dpr) % px) - px / 2;
      pattern.setTransform(new DOMMatrix().translateSelf(ox, oy).scaleSelf(px / 32));
      ctx.globalAlpha = alpha * Math.min(1, camera.scale * 1.6);
      ctx.fillStyle = pattern;
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
    ctx.globalAlpha = 1;
  }

  private drawEdges(f: FrameInput) {
    const { ctx } = this;
    const pal = f.palette;
    const s = f.camera.scale;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const v of this.edges.values()) {
      const seg = this.segment(v.ax, v.ay, v.bx, v.by);
      if (!seg) continue;
      const { x1, y1, x2, y2, ux, uy, len } = seg;
      const ex = x1 + (x2 - x1) * v.grow;
      const ey = y1 + (y2 - y1) * v.grow;
      ctx.globalAlpha = v.leaving ? v.grow : 1;
      ctx.strokeStyle = v.emphasis > 0.01 ? mix(pal.edge, v.emphasis >= 0.99 ? pal.accent : pal.edgeHover, v.emphasis) : pal.edge;
      ctx.lineWidth = Math.max(1.5, 1 / s) + v.emphasis * 0.8;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(ex, ey);
      ctx.stroke();

      // Direction chevron at the midpoint.
      if (v.grow > 0.55 && len > 60) {
        const mx = (x1 + x2) / 2;
        const my = (y1 + y2) / 2;
        const a = 4;
        ctx.beginPath();
        ctx.moveTo(mx - ux * a - uy * a, my - uy * a + ux * a);
        ctx.lineTo(mx + ux * a * 0.6, my + uy * a * 0.6);
        ctx.lineTo(mx - ux * a + uy * a, my - uy * a - ux * a);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  private drawConnectPreview(f: FrameInput) {
    const c = f.overlay.connect;
    if (!c) return;
    const a = this.nodes.get(c.from);
    if (!a) return;
    const { ctx } = this;
    const b = c.target ? this.nodes.get(c.target) : null;
    const tx = b ? b.x : c.x;
    const ty = b ? b.y : c.y;
    const dx = tx - a.x;
    const dy = ty - a.y;
    const len = Math.hypot(dx, dy);
    if (len < 1) return;
    const ux = dx / len;
    const uy = dy / len;
    const start = borderDistance(ux, uy) + EDGE_GAP;
    const end = b ? len - borderDistance(ux, uy) - EDGE_GAP : len;
    if (end <= start) return;
    ctx.strokeStyle = c.target && !c.valid ? f.palette.danger : f.palette.accent;
    ctx.lineWidth = 1.5 / Math.min(1, f.camera.scale);
    ctx.setLineDash([5, 5]);
    ctx.lineDashOffset = -performance.now() / 40;
    ctx.beginPath();
    ctx.moveTo(a.x + ux * start, a.y + uy * start);
    ctx.lineTo(a.x + ux * end, a.y + uy * end);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  private drawPackets(f: FrameInput) {
    const { ctx } = this;
    const { sim, palette: pal, camera } = f;
    const packets = sim.packets;
    if (!packets.length) return;
    const r = Math.max(2.4, 1.3 / camera.scale);
    const carry = sim.carry;

    // Batch by colour: a long faint tail, a short bright tail and the head,
    // for each of three colours, so nine draw calls no matter how many packets.
    const tails = [new Path2D(), new Path2D(), new Path2D()];
    const trails = [new Path2D(), new Path2D(), new Path2D()];
    const heads = [new Path2D(), new Path2D(), new Path2D()];
    const TAU = Math.PI * 2;

    for (let i = 0; i < packets.length; i++) {
      const p = packets[i];
      const a = this.nodes.get(p.from.id);
      const b = this.nodes.get(p.to.id);
      if (!a || !b) continue;
      const seg = this.segment(a.x, a.y, b.x, b.y);
      if (!seg) continue;
      const t = Math.min(1, p.t + carry / p.dur);
      const ox = -seg.uy * LANE;
      const oy = seg.ux * LANE;
      const x = seg.x1 + (seg.x2 - seg.x1) * t + ox;
      const y = seg.y1 + (seg.y2 - seg.y1) * t + oy;
      const back = Math.min(TRAIL, t * seg.len);
      const bucket = !p.response ? 0 : p.ok ? 1 : 2;
      if (back > 1) {
        tails[bucket].moveTo(x - seg.ux * back, y - seg.uy * back);
        tails[bucket].lineTo(x, y);
        const near = back * 0.45;
        trails[bucket].moveTo(x - seg.ux * near, y - seg.uy * near);
        trails[bucket].lineTo(x, y);
      }
      heads[bucket].moveTo(x + r, y);
      heads[bucket].arc(x, y, r, 0, TAU);
    }

    const colors = [pal.ink, pal.ok, pal.danger];
    ctx.lineCap = 'round';
    ctx.lineWidth = r * 0.9;
    ctx.globalAlpha = 0.12;
    for (let i = 0; i < 3; i++) {
      ctx.strokeStyle = colors[i];
      ctx.stroke(tails[i]);
    }
    ctx.lineWidth = r * 1.5;
    ctx.globalAlpha = 0.22;
    for (let i = 0; i < 3; i++) {
      ctx.strokeStyle = colors[i];
      ctx.stroke(trails[i]);
    }
    ctx.globalAlpha = 1;
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = colors[i];
      ctx.fill(heads[i]);
    }
  }

  private drawNodes(f: FrameInput) {
    const { ctx } = this;
    const { palette: pal, sim, overlay, camera } = f;
    const connectTarget = overlay.connect?.target;

    for (const v of this.nodes.values()) {
      const n = v.node;
      const sn = sim.nodes.get(n.id);
      const eased = easeOut(v.appear);
      const s = v.scale * (0.9 + 0.1 * eased);
      const half = NODE_HALF * s;
      const x = v.x;
      const y = v.y;

      // Brief red flash when the node rejects a request.
      const flash = sn ? Math.max(0, 1 - (sim.time - sn.lastReject) / 320) : 0;

      ctx.globalAlpha = eased * (n.down ? 0.6 : 1);

      // Selection / connect-target halo.
      const halo = Math.max(v.sel, connectTarget === n.id ? 1 : 0);
      if (halo > 0.01) {
        ctx.strokeStyle = connectTarget === n.id && !overlay.connect?.valid ? pal.danger : pal.accent;
        ctx.globalAlpha = eased * halo * 0.35;
        ctx.lineWidth = 4;
        roundRect(ctx, x - half - 4, y - half - 4, (half + 4) * 2, (half + 4) * 2, RADIUS + 4);
        ctx.stroke();
        ctx.globalAlpha = eased * (n.down ? 0.6 : 1);
      }

      roundRect(ctx, x - half, y - half, half * 2, half * 2, RADIUS * s);
      ctx.fillStyle = pal.nodeFill;
      ctx.fill();
      let stroke = pal.nodeStroke;
      if (v.sel > 0.01) stroke = mix(stroke, pal.accent, v.sel);
      if (flash > 0) stroke = mix(stroke, pal.danger, flash);
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1.25 + v.sel * 0.5 + flash;
      if (n.down) ctx.setLineDash([4, 3]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Glyph
      ctx.save();
      const gs = s * 0.86;
      const hasBar = n.kind === 'server' || n.kind === 'database';
      ctx.translate(x - 12 * gs, y - 12 * gs - (hasBar ? 3 * s : 0));
      ctx.scale(gs, gs);
      ctx.strokeStyle = n.down ? pal.muted : pal.ink;
      ctx.lineWidth = 1.6;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke(glyph(n.kind));
      ctx.restore();

      // Utilisation bar
      if (hasBar) {
        const w = 26 * s;
        const bx = x - w / 2;
        const by = y + 15 * s;
        roundRect(ctx, bx, by, w, 2.5 * s, 1.25 * s);
        ctx.fillStyle = pal.nodeStroke;
        ctx.fill();
        if (v.load > 0.005) {
          ctx.fillStyle = v.load > 0.97 ? pal.danger : v.load > 0.75 ? pal.warn : pal.ok;
          roundRect(ctx, bx, by, Math.max(2.5 * s, w * v.load), 2.5 * s, 1.25 * s);
          ctx.fill();
        }
      }

      // Label
      if (camera.scale > 0.35) {
        ctx.font = `500 11px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillStyle = v.sel > 0.5 ? pal.ink : pal.muted;
        ctx.fillText(n.down ? `${n.label} · down` : n.label, x, y + half + 8);
      }

      // Queue badge
      if (v.badge > 0.01) {
        const text = String(v.badgeValue);
        ctx.font = `600 10px ${MONO}`;
        const tw = ctx.measureText(text).width;
        const bw = Math.max(18, tw + 10);
        const bh = 16;
        const cx = x + half - 2;
        const cy = y - half + 2;
        const limit = n.config.queueLimit;
        ctx.globalAlpha = eased * v.badge;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(0.7 + 0.3 * v.badge, 0.7 + 0.3 * v.badge);
        ctx.fillStyle = limit && v.badgeValue >= limit * 0.9 ? pal.danger : pal.warn;
        roundRect(ctx, -bw / 2, -bh / 2, bw, bh, bh / 2);
        ctx.fill();
        ctx.fillStyle = '#111';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, 0, 0.5);
        ctx.restore();
      }

      // Connection handle
      if (v.handle > 0.01 && !v.leaving && !overlay.connect && !overlay.ghost) {
        const hot = overlay.hoverHandle === n.id;
        const hr = (hot ? 5.5 : 4) * (0.5 + 0.5 * v.handle);
        ctx.globalAlpha = eased * v.handle;
        ctx.beginPath();
        ctx.arc(x + HANDLE_OFFSET * s, y, hr, 0, Math.PI * 2);
        ctx.fillStyle = hot ? pal.accent : pal.nodeFill;
        ctx.fill();
        ctx.strokeStyle = hot ? pal.accent : pal.edgeHover;
        ctx.lineWidth = 1.25;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
  }

  private drawGhost(f: FrameInput) {
    const g = f.overlay.ghost;
    if (!g) return;
    const { ctx } = this;
    const pal = f.palette;
    ctx.globalAlpha = 0.55;
    roundRect(ctx, g.x - NODE_HALF, g.y - NODE_HALF, NODE_HALF * 2, NODE_HALF * 2, RADIUS);
    ctx.fillStyle = pal.nodeFill;
    ctx.fill();
    ctx.strokeStyle = pal.accent;
    ctx.lineWidth = 1.25;
    ctx.setLineDash([4, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.save();
    ctx.translate(g.x - 12 * 0.86, g.y - 12 * 0.86);
    ctx.scale(0.86, 0.86);
    ctx.strokeStyle = pal.ink;
    ctx.lineWidth = 1.6;
    ctx.stroke(glyph(g.kind));
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  /** Border-to-border segment between two node centres. */
  private segment(ax: number, ay: number, bx: number, by: number) {
    const dx = bx - ax;
    const dy = by - ay;
    const d = Math.hypot(dx, dy);
    if (d < 1) return null;
    const ux = dx / d;
    const uy = dy / d;
    const cut = borderDistance(ux, uy) + EDGE_GAP;
    if (d <= cut * 2) return null;
    return { x1: ax + ux * cut, y1: ay + uy * cut, x2: bx - ux * cut, y2: by - uy * cut, ux, uy, len: d - cut * 2 };
  }

  /** Renders the current frame to a PNG blob. */
  toBlob(): Promise<Blob | null> {
    return new Promise((resolve) => this.canvas.toBlob(resolve, 'image/png'));
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2));
}

const easeOut = (t: number) => 1 - (1 - t) * (1 - t);

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1, 7), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
/** Linear blend of two #rrggbb colours; returns #rrggbb so blends compose. */
function mix(a: string, b: string, t: number) {
  if (t <= 0) return a;
  if (t >= 1) return b;
  const ca = rgb(a);
  const cb = rgb(b);
  const c = (i: number) => Math.round(ca[i] + (cb[i] - ca[i]) * t);
  return '#' + ((1 << 24) | (c(0) << 16) | (c(1) << 8) | c(2)).toString(16).slice(1);
}
