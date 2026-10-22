import { BASE_CONFIG, KINDS, SPECS, defaultConfig } from './specs';
import type { Graph, GraphEdge, GraphNode, NodeConfig, NodeKind } from './types';

let counter = 0;
export function uid(prefix: string): string {
  counter = (counter + 1) % 1e6;
  return `${prefix}${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function createNode(kind: NodeKind, x: number, y: number, patch: Partial<GraphNode> = {}): GraphNode {
  return {
    id: uid('n'),
    kind,
    label: SPECS[kind].name,
    x: Math.round(x),
    y: Math.round(y),
    down: false,
    config: defaultConfig(kind),
    ...patch,
  };
}

/** Returns why an edge can't be added, or null if it can. */
export function edgeProblem(graph: Graph, from: string, to: string): string | null {
  if (from === to) return 'A node cannot connect to itself';
  if (graph.edges.some((e) => e.from === from && e.to === to)) return 'Already connected';
  if (reaches(graph, to, from)) return 'That would create a routing loop';
  return null;
}

/** True if `target` can be reached from `start` by following edges. */
function reaches(graph: Graph, start: string, target: string): boolean {
  const out = new Map<string, string[]>();
  for (const e of graph.edges) {
    const list = out.get(e.from);
    if (list) list.push(e.to);
    else out.set(e.from, [e.to]);
  }
  const seen = new Set<string>();
  const stack = [start];
  while (stack.length) {
    const id = stack.pop()!;
    if (id === target) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const next of out.get(id) ?? []) stack.push(next);
  }
  return false;
}

export function removeNodes(graph: Graph, ids: Set<string>): Graph {
  return {
    nodes: graph.nodes.filter((n) => !ids.has(n.id)),
    edges: graph.edges.filter((e) => !ids.has(e.from) && !ids.has(e.to)),
  };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

function normalizeConfig(kind: NodeKind, raw: unknown): NodeConfig {
  const base = defaultConfig(kind);
  const c = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    rps: clamp(num(c.rps, base.rps), 0, 400),
    pattern: c.pattern === 'steady' ? 'steady' : c.pattern === 'poisson' ? 'poisson' : base.pattern,
    timeoutMs: clamp(num(c.timeoutMs, base.timeoutMs), 1, 60000),
    strategy:
      c.strategy === 'least-connections' || c.strategy === 'random' || c.strategy === 'round-robin'
        ? c.strategy
        : base.strategy,
    workers: Math.round(clamp(num(c.workers, base.workers), 1, 128)),
    serviceMs: clamp(num(c.serviceMs, base.serviceMs), 0, 60000),
    queueLimit: Math.round(clamp(num(c.queueLimit, base.queueLimit), 0, 5000)),
    hitRate: clamp(num(c.hitRate, BASE_CONFIG.hitRate), 0, 1),
  };
}

/**
 * Turns untrusted input (a share link, an imported file, old localStorage) into
 * a valid graph: unknown kinds are skipped, numbers are clamped, and edges that
 * point at missing nodes or repeat an existing edge are removed.
 */
export function normalizeGraph(raw: unknown): Graph | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as { nodes?: unknown; edges?: unknown };
  if (!Array.isArray(r.nodes)) return null;

  const nodes: GraphNode[] = [];
  const ids = new Set<string>();
  for (const item of r.nodes.slice(0, 500)) {
    if (!item || typeof item !== 'object') continue;
    const n = item as Record<string, unknown>;
    const kind = n.kind as NodeKind;
    if (!KINDS.includes(kind)) continue;
    const id = typeof n.id === 'string' && n.id && !ids.has(n.id) ? n.id : uid('n');
    ids.add(id);
    nodes.push({
      id,
      kind,
      label: typeof n.label === 'string' ? n.label.slice(0, 40) : SPECS[kind].name,
      x: clamp(num(n.x, 0), -1e5, 1e5),
      y: clamp(num(n.y, 0), -1e5, 1e5),
      down: n.down === true,
      config: normalizeConfig(kind, n.config),
    });
  }

  const edges: GraphEdge[] = [];
  const graph: Graph = { nodes, edges };
  for (const item of Array.isArray(r.edges) ? r.edges.slice(0, 2000) : []) {
    if (!item || typeof item !== 'object') continue;
    const e = item as Record<string, unknown>;
    if (typeof e.from !== 'string' || typeof e.to !== 'string') continue;
    if (!ids.has(e.from) || !ids.has(e.to) || edgeProblem(graph, e.from, e.to)) continue;
    edges.push({ id: typeof e.id === 'string' && e.id ? e.id : uid('e'), from: e.from, to: e.to });
  }
  return graph;
}

/** Bounding box of all nodes, or null for an empty graph. */
export function bounds(graph: Graph) {
  if (!graph.nodes.length) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of graph.nodes) {
    minX = Math.min(minX, n.x);
    minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x);
    maxY = Math.max(maxY, n.y);
  }
  return { minX, minY, maxX, maxY };
}
