import { create } from 'zustand';
import { createNode, edgeProblem, removeNodes, uid } from '../core/graph';
import type { Graph, GraphNode, NodeConfig, NodeKind, Selection } from '../core/types';

const HISTORY_LIMIT = 100;
/** Edits to the same field within this window collapse into one undo step. */
const COALESCE_MS = 800;

export type Theme = 'light' | 'dark';

export interface Toast {
  id: number;
  text: string;
  tone: 'neutral' | 'danger';
}

interface EditorState {
  graph: Graph;
  selection: Selection;
  playing: boolean;
  speed: number;
  theme: Theme;
  past: Graph[];
  future: Graph[];
  toast: Toast | null;
  /** Bumped to ask the simulation to clear traffic and metrics. */
  resetToken: number;
  /** Bumped to ask the viewport to frame the graph. */
  fitToken: number;
  helpOpen: boolean;
}

interface EditorActions {
  /** Records an undo step. Call before a change; `key` merges rapid edits. */
  checkpoint(key?: string): void;
  undo(): void;
  redo(): void;
  loadGraph(graph: Graph, opts?: { history?: boolean; fit?: boolean }): void;
  addNode(kind: NodeKind, x: number, y: number): GraphNode;
  /** Moves without recording history; call `checkpoint()` once when a drag starts. */
  moveNode(id: string, x: number, y: number): void;
  updateNode(id: string, patch: Partial<Omit<GraphNode, 'config'>>): void;
  updateConfig(id: string, patch: Partial<NodeConfig>): void;
  connect(from: string, to: string): boolean;
  deleteSelection(): void;
  duplicateSelection(): void;
  select(selection: Selection): void;
  setPlaying(playing: boolean): void;
  togglePlaying(): void;
  setSpeed(speed: number): void;
  setTheme(theme: Theme): void;
  resetSim(): void;
  fit(): void;
  setHelpOpen(open: boolean): void;
  notify(text: string, tone?: Toast['tone']): void;
}

export type Store = EditorState & EditorActions;

let lastKey: string | undefined;
let lastAt = 0;
let toastId = 0;
let toastTimer: ReturnType<typeof setTimeout> | undefined;

const mapNode = (g: Graph, id: string, fn: (n: GraphNode) => GraphNode): Graph => ({
  ...g,
  nodes: g.nodes.map((n) => (n.id === id ? fn(n) : n)),
});

export const useStore = create<Store>()((set, get) => ({
  graph: { nodes: [], edges: [] },
  selection: null,
  playing: false,
  speed: 0.25,
  theme: 'dark',
  past: [],
  future: [],
  toast: null,
  resetToken: 0,
  fitToken: 0,
  helpOpen: false,

  checkpoint(key) {
    const now = performance.now();
    if (key && key === lastKey && now - lastAt < COALESCE_MS) {
      lastAt = now;
      return;
    }
    lastKey = key;
    lastAt = now;
    const { graph, past } = get();
    set({ past: [...past.slice(-HISTORY_LIMIT + 1), graph], future: [] });
  },

  undo() {
    const { past, future, graph } = get();
    const prev = past[past.length - 1];
    if (!prev) return;
    lastKey = undefined;
    set({ graph: prev, past: past.slice(0, -1), future: [graph, ...future], selection: keepSelection(get().selection, prev) });
  },

  redo() {
    const { past, future, graph } = get();
    const next = future[0];
    if (!next) return;
    lastKey = undefined;
    set({ graph: next, past: [...past, graph], future: future.slice(1), selection: keepSelection(get().selection, next) });
  },

  loadGraph(graph, { history = true, fit = true } = {}) {
    if (history) get().checkpoint();
    set((s) => ({ graph, selection: null, resetToken: s.resetToken + 1, fitToken: fit ? s.fitToken + 1 : s.fitToken }));
  },

  addNode(kind, x, y) {
    get().checkpoint();
    const node = createNode(kind, x, y);
    set((s) => ({ graph: { ...s.graph, nodes: [...s.graph.nodes, node] }, selection: { type: 'node', id: node.id } }));
    return node;
  },

  moveNode(id, x, y) {
    set((s) => ({ graph: mapNode(s.graph, id, (n) => ({ ...n, x, y })) }));
  },

  updateNode(id, patch) {
    get().checkpoint(`${id}:${Object.keys(patch).join()}`);
    set((s) => ({ graph: mapNode(s.graph, id, (n) => ({ ...n, ...patch })) }));
  },

  updateConfig(id, patch) {
    get().checkpoint(`${id}:config:${Object.keys(patch).join()}`);
    set((s) => ({ graph: mapNode(s.graph, id, (n) => ({ ...n, config: { ...n.config, ...patch } })) }));
  },

  connect(from, to) {
    const problem = edgeProblem(get().graph, from, to);
    if (problem) {
      get().notify(problem, 'danger');
      return false;
    }
    get().checkpoint();
    const edge = { id: uid('e'), from, to };
    set((s) => ({ graph: { ...s.graph, edges: [...s.graph.edges, edge] }, selection: { type: 'edge', id: edge.id } }));
    return true;
  },

  deleteSelection() {
    const { selection, graph } = get();
    if (!selection) return;
    get().checkpoint();
    const next =
      selection.type === 'node'
        ? removeNodes(graph, new Set([selection.id]))
        : { ...graph, edges: graph.edges.filter((e) => e.id !== selection.id) };
    set({ graph: next, selection: null });
  },

  duplicateSelection() {
    const { selection, graph } = get();
    if (selection?.type !== 'node') return;
    const src = graph.nodes.find((n) => n.id === selection.id);
    if (!src) return;
    get().checkpoint();
    const copy = createNode(src.kind, src.x + 40, src.y + 40, { label: src.label, down: src.down });
    copy.config = { ...src.config };
    set((s) => ({ graph: { ...s.graph, nodes: [...s.graph.nodes, copy] }, selection: { type: 'node', id: copy.id } }));
  },

  select(selection) {
    const cur = get().selection;
    if (cur?.type === selection?.type && cur?.id === selection?.id) return;
    set({ selection });
  },

  setPlaying: (playing) => set({ playing }),
  togglePlaying: () => set((s) => ({ playing: !s.playing })),
  setSpeed: (speed) => set({ speed }),
  setTheme: (theme) => set({ theme }),
  resetSim: () => set((s) => ({ resetToken: s.resetToken + 1 })),
  fit: () => set((s) => ({ fitToken: s.fitToken + 1 })),
  setHelpOpen: (helpOpen) => set({ helpOpen }),

  notify(text, tone = 'neutral') {
    clearTimeout(toastTimer);
    set({ toast: { id: ++toastId, text, tone } });
    toastTimer = setTimeout(() => set({ toast: null }), 2400);
  },
}));

function keepSelection(sel: Selection, g: Graph): Selection {
  if (!sel) return null;
  const list = sel.type === 'node' ? g.nodes : g.edges;
  return list.some((x) => x.id === sel.id) ? sel : null;
}

export const selectedNode = (s: Store) =>
  s.selection?.type === 'node' ? (s.graph.nodes.find((n) => n.id === s.selection!.id) ?? null) : null;
