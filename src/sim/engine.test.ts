import { describe, expect, it } from 'vitest';
import { createNode, edgeProblem, normalizeGraph, uid } from '../core/graph';
import { TEMPLATES } from '../core/templates';
import type { Graph, GraphNode, NodeConfig, NodeKind } from '../core/types';
import { Simulation } from './engine';

function node(kind: NodeKind, x: number, config: Partial<NodeConfig> = {}, extra: Partial<GraphNode> = {}) {
  const n = createNode(kind, x, 0, extra);
  n.config = { ...n.config, ...config };
  return n;
}
const link = (a: GraphNode, b: GraphNode) => ({ id: uid('e'), from: a.id, to: b.id });

/** Every request is either on the wire, in service, or queued: none are lost. */
function live(sim: Simulation) {
  let n = sim.packets.length;
  for (const node of sim.order) n += node.active.length + node.queue.length;
  return n;
}

function run(graph: Graph, ms: number, seed = 7) {
  const sim = new Simulation(seed);
  sim.sync(graph);
  sim.advance(ms);
  return sim;
}

describe('Simulation', () => {
  it('is deterministic for a given seed', () => {
    const a = run(TEMPLATES[2].build(), 20_000, 42).summary();
    const b = run(TEMPLATES[2].build(), 20_000, 42).summary();
    expect(a.completed).toBeGreaterThan(100);
    expect(b).toEqual(a);
  });

  it('serves everything when capacity is ample', () => {
    const c = node('client', 0, { rps: 10, pattern: 'steady' });
    const s = node('server', 300, { workers: 4, serviceMs: 50 });
    const sim = run({ nodes: [c, s], edges: [link(c, s)] }, 10_000);
    const sum = sim.summary();
    expect(sum.failed).toBe(0);
    expect(sum.inFlight).toBe(live(sim));
    expect(sum.completed).toBeGreaterThan(90);
    expect(sum.throughput).toBeCloseTo(10, 0);
    // latency = two hops of network + 50 ms service
    expect(sum.p50).toBeGreaterThan(50);
    expect(sum.p50).toBeLessThan(1000);
  });

  it('rejects requests beyond workers + queue', () => {
    const c = node('client', 0, { rps: 50, pattern: 'steady' });
    const s = node('server', 300, { workers: 1, serviceMs: 200, queueLimit: 2 });
    const sim = run({ nodes: [c, s], edges: [link(c, s)] }, 10_000);
    const server = sim.nodes.get(s.id)!;
    expect(server.rejected).toBeGreaterThan(300);
    // capacity is 1 / 200ms = 5 rps
    expect(server.served).toBeLessThanOrEqual(51);
    expect(sim.summary().success).toBeLessThan(0.2);
  });

  it('routes every response back to the client that sent it', () => {
    const a = node('client', 0, { rps: 7, pattern: 'steady' });
    const b = node('client', 0, { rps: 3, pattern: 'steady' });
    const lb = node('balancer', 300);
    const s1 = node('server', 600);
    const s2 = node('server', 600);
    const graph = { nodes: [a, b, lb, s1, s2], edges: [link(a, lb), link(b, lb), link(lb, s1), link(lb, s2)] };
    const sim = run(graph, 10_000);
    const ca = sim.nodes.get(a.id)!;
    const cb = sim.nodes.get(b.id)!;
    expect(ca.failed + cb.failed).toBe(0);
    expect(ca.sent - ca.completed + cb.sent - cb.completed).toBe(live(sim));
    expect(ca.completed).toBeGreaterThan(55);
    expect(cb.completed).toBeGreaterThan(22);
  });

  it('round robin splits traffic evenly', () => {
    const c = node('client', 0, { rps: 30, pattern: 'steady' });
    const lb = node('balancer', 300, { strategy: 'round-robin' });
    const servers = [0, 1, 2].map(() => node('server', 600, { workers: 16 }));
    const graph = { nodes: [c, lb, ...servers], edges: [link(c, lb), ...servers.map((s) => link(lb, s))] };
    const sim = run(graph, 10_000);
    const served = servers.map((s) => sim.nodes.get(s.id)!.served);
    expect(Math.max(...served) - Math.min(...served)).toBeLessThanOrEqual(1);
  });

  it('least connections avoids the slow server', () => {
    const c = node('client', 0, { rps: 20 });
    const lb = node('balancer', 300, { strategy: 'least-connections' });
    const fast = node('server', 600, { workers: 8, serviceMs: 20 });
    const slow = node('server', 600, { workers: 8, serviceMs: 800 });
    const graph = { nodes: [c, lb, fast, slow], edges: [link(c, lb), link(lb, fast), link(lb, slow)] };
    const sim = run(graph, 20_000);
    expect(sim.nodes.get(fast.id)!.served).toBeGreaterThan(sim.nodes.get(slow.id)!.served * 1.5);
  });

  it('cache hit rate controls database load', () => {
    const c = node('client', 0, { rps: 40, pattern: 'steady' });
    const k = node('cache', 300, { hitRate: 0.75 });
    const db = node('database', 600, { workers: 64 });
    const sim = run({ nodes: [c, k, db], edges: [link(c, k), link(k, db)] }, 20_000);
    const cache = sim.nodes.get(k.id)!;
    const ratio = cache.hits / (cache.hits + cache.misses);
    expect(ratio).toBeGreaterThan(0.7);
    expect(ratio).toBeLessThan(0.8);
    expect(sim.nodes.get(db.id)!.served).toBe(cache.misses - sim.nodes.get(db.id)!.pending);
  });

  it('servers hold a worker while waiting on the database', () => {
    const c = node('client', 0, { rps: 20, pattern: 'steady' });
    const s = node('server', 300, { workers: 2, serviceMs: 1, queueLimit: 0 });
    const db = node('database', 600, { workers: 50, serviceMs: 500 });
    const sim = run({ nodes: [c, s, db], edges: [link(c, s), link(s, db)] }, 10_000);
    // 2 workers / ~0.9s round trip ≈ 2 rps capacity, so most requests are rejected.
    expect(sim.nodes.get(s.id)!.rejected).toBeGreaterThan(100);
    expect(sim.nodes.get(db.id)!.rejected).toBe(0);
  });

  it('down nodes fail requests and balancers route around them', () => {
    const c = node('client', 0, { rps: 10, pattern: 'steady' });
    const lb = node('balancer', 300);
    const up = node('server', 600);
    const off = node('server', 600, {}, { down: true });
    const graph = { nodes: [c, lb, up, off], edges: [link(c, lb), link(lb, up), link(lb, off)] };
    const sim = run(graph, 5_000);
    expect(sim.summary().failed).toBe(0);
    expect(sim.nodes.get(off.id)!.served).toBe(0);

    const direct = node('client', 0, { rps: 10, pattern: 'steady' });
    const dead = node('server', 300, {}, { down: true });
    const sim2 = run({ nodes: [direct, dead], edges: [link(direct, dead)] }, 5_000);
    expect(sim2.summary().success).toBe(0);
  });

  it('removing a node mid-flight releases everything that depended on it', () => {
    const c = node('client', 0, { rps: 20, pattern: 'steady' });
    const s = node('server', 300, { workers: 4, serviceMs: 10 });
    const db = node('database', 600, { workers: 2, serviceMs: 400 });
    const graph = { nodes: [c, s, db], edges: [link(c, s), link(s, db)] };
    const sim = new Simulation(3);
    sim.sync(graph);
    sim.advance(3_000);
    expect(sim.nodes.get(s.id)!.busy).toBeGreaterThan(0);

    sim.sync({ nodes: [c, s], edges: [link(c, s)] });
    sim.advance(3_000);
    const server = sim.nodes.get(s.id)!;
    // No worker stays stuck waiting on the removed database.
    expect(server.held.size).toBe(0);
    // Bookkeeping invariant: pending = in transit to the server + busy + queued.
    const inbound = sim.packets.filter((p) => !p.response && p.to === server).length;
    expect(server.pending).toBe(inbound + server.busy + server.queue.length);
    const client = sim.nodes.get(c.id)!;
    expect(client.sent - client.completed).toBe(live(sim));
  });

  it('reset replays the same run', () => {
    const sim = run(TEMPLATES[3].build(), 8_000, 11);
    const first = sim.summary();
    sim.reset();
    sim.advance(8_000);
    expect(sim.summary()).toEqual(first);
  });
});

describe('graph', () => {
  it('rejects self loops, duplicates and cycles', () => {
    const a = node('server', 0);
    const b = node('server', 0);
    const c = node('server', 0);
    const g = { nodes: [a, b, c], edges: [link(a, b), link(b, c)] };
    expect(edgeProblem(g, a.id, a.id)).toBeTruthy();
    expect(edgeProblem(g, a.id, b.id)).toBeTruthy();
    expect(edgeProblem(g, c.id, a.id)).toBeTruthy();
    expect(edgeProblem(g, a.id, c.id)).toBeNull();
  });

  it('normalises untrusted input', () => {
    const g = normalizeGraph({
      nodes: [
        { id: 'a', kind: 'client', x: 1, y: 2, config: { rps: 1e9, pattern: 'nope' } },
        { id: 'b', kind: 'mainframe' },
        { id: 'c', kind: 'server', x: 'left', config: { workers: -3 } },
      ],
      edges: [
        { from: 'a', to: 'c' },
        { from: 'a', to: 'c' },
        { from: 'a', to: 'b' },
        { from: 'c', to: 'c' },
      ],
    })!;
    expect(g.nodes.map((n) => n.id)).toEqual(['a', 'c']);
    expect(g.nodes[0].config.rps).toBe(400);
    expect(g.nodes[0].config.pattern).toBe('poisson');
    expect(g.nodes[1].x).toBe(0);
    expect(g.nodes[1].config.workers).toBe(1);
    expect(g.edges).toHaveLength(1);
    expect(normalizeGraph('nope')).toBeNull();
  });
});
