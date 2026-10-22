import type { Graph, GraphNode, NodeConfig, NodeKind } from '../core/types';
import { createRng } from './rng';
import { LatencyWindow, type WindowSummary } from './window';

/** Fixed simulation step. Every run with the same seed and graph is identical. */
export const STEP_MS = 1000 / 120;
/**
 * Packets travel at this speed (world px per sim ms), so distance acts as
 * network latency: ~200 px between nodes ≈ 65 ms. The UI defaults to ¼× playback
 * so dots stay easy to follow while latencies stay realistic.
 */
export const PACKET_SPEED = 3;
/** Node half-size in world px; packets travel border to border. */
export const NODE_HALF = 26;
const MIN_HOP_MS = 8;
/**
 * Service times vary around the configured mean (log-normal, ~40% spread),
 * which is what gives real systems their latency tails.
 */
const SERVICE_SIGMA = 0.4;
/** Guards against routing loops (A → B → C → A). */
const MAX_DEPTH = 24;
/** How often node and system history is sampled, in sim ms. */
export const SAMPLE_MS = 250;
export const HISTORY = 120;
/** Window used for the headline metrics. */
const SUMMARY_SPAN_MS = 5000;

export interface Packet {
  id: number;
  from: SimNode;
  to: SimNode;
  /** Progress along the current hop, 0 → 1. */
  t: number;
  /** Duration of the current hop in ms. */
  dur: number;
  response: boolean;
  ok: boolean;
  born: number;
  /** Nodes the request has visited; the response retraces it in reverse. */
  path: SimNode[];
}

interface Job {
  packet: Packet;
  doneAt: number;
}

/** First-in-first-out queue without O(n) shifts. */
class Fifo<T> {
  private items: T[] = [];
  private head = 0;
  get length() {
    return this.items.length - this.head;
  }
  push(v: T) {
    this.items.push(v);
  }
  shift(): T | undefined {
    if (this.head >= this.items.length) return undefined;
    const v = this.items[this.head];
    this.items[this.head++] = undefined as T;
    if (this.head > 64 && this.head * 2 > this.items.length) {
      this.items = this.items.slice(this.head);
      this.head = 0;
    }
    return v;
  }
  drain(): T[] {
    const out = this.items.slice(this.head);
    this.items = [];
    this.head = 0;
    return out;
  }
}

export class SimNode {
  readonly id: string;
  readonly kind: NodeKind;
  x = 0;
  y = 0;
  config!: NodeConfig;
  down = false;
  dead = false;

  out: SimNode[] = [];
  active: Job[] = [];
  /** Server only: requests sent downstream while this node keeps a worker busy. */
  held = new Map<number, Packet>();
  queue = new Fifo<Packet>();
  /** Requests headed to or held by this node (used by least-connections). */
  pending = 0;
  rr = 0;
  nextArrival = Infinity;

  // Counters since reset.
  served = 0;
  rejected = 0;
  hits = 0;
  misses = 0;
  sent = 0;
  completed = 0;
  failed = 0;
  timeouts = 0;
  /** Last sim time this node rejected a request (for the red flash). */
  lastReject = -Infinity;

  /** Clients only: latency of the requests they sent. */
  readonly window: LatencyWindow | null;
  readonly utilHistory = new Float32Array(HISTORY);
  readonly queueHistory = new Float32Array(HISTORY);

  constructor(node: GraphNode) {
    this.id = node.id;
    this.kind = node.kind;
    this.window = node.kind === 'client' ? new LatencyWindow(1 << 13) : null;
    this.apply(node);
  }

  apply(node: GraphNode) {
    this.x = node.x;
    this.y = node.y;
    this.config = node.config;
    this.down = node.down;
  }

  /** Workers in use (in service or waiting on downstream). */
  get busy() {
    return this.active.length + this.held.size;
  }

  get utilization() {
    if (this.kind !== 'server' && this.kind !== 'database') return 0;
    return Math.min(1, this.busy / Math.max(1, this.config.workers));
  }

  get hasWorkers() {
    return this.kind === 'server' || this.kind === 'database';
  }
}

export interface Summary extends WindowSummary {
  time: number;
  inFlight: number;
  sent: number;
  completed: number;
  failed: number;
}

export class Simulation {
  time = 0;
  /** Sim time not yet consumed by a full step; used to interpolate rendering. */
  carry = 0;
  packets: Packet[] = [];
  nodes = new Map<string, SimNode>();
  /** Node iteration order (matches the graph). */
  order: SimNode[] = [];
  sampleIndex = 0;
  samples = 0;
  readonly throughputHistory = new Float32Array(HISTORY);
  readonly p95History = new Float32Array(HISTORY);
  readonly errorHistory = new Float32Array(HISTORY);

  private rng: () => number;
  private nextId = 1;
  private nextSample = SAMPLE_MS;
  private readonly window = new LatencyWindow();
  private readonly pool: Packet[] = [];
  private readonly arrived: Packet[] = [];
  private graph: Graph = { nodes: [], edges: [] };
  private totals = { sent: 0, completed: 0, failed: 0 };

  seed: number;

  constructor(seed = 1) {
    this.seed = seed;
    this.rng = createRng(seed);
  }

  // ─── Topology ──────────────────────────────────────────────────────────────

  /** Applies graph edits to the running simulation without losing in-flight work. */
  sync(graph: Graph) {
    this.graph = graph;
    const next = new Map<string, SimNode>();
    const order: SimNode[] = [];

    for (const g of graph.nodes) {
      let n = this.nodes.get(g.id);
      if (!n) {
        n = new SimNode(g);
      } else {
        const rateChanged = n.config.rps !== g.config.rps || n.config.pattern !== g.config.pattern;
        const goingDown = !n.down && g.down;
        n.apply(g);
        if (rateChanged) n.nextArrival = Infinity;
        if (goingDown) this.failAll(n);
        else this.drainQueue(n); // more workers may have been added
      }
      next.set(g.id, n);
      order.push(n);
    }

    for (const [id, n] of this.nodes) {
      if (next.has(id)) continue;
      n.dead = true;
      this.failAll(n);
    }

    for (const n of order) n.out = [];
    for (const e of graph.edges) {
      const a = next.get(e.from);
      const b = next.get(e.to);
      if (a && b) a.out.push(b);
    }

    this.nodes = next;
    this.order = order;
  }

  /** Clears traffic and metrics and restarts the clock, keeping the graph. */
  reset(seed = this.seed) {
    this.seed = seed;
    this.rng = createRng(seed);
    this.time = 0;
    this.carry = 0;
    this.packets = [];
    this.nodes = new Map();
    this.order = [];
    this.nextId = 1;
    this.nextSample = SAMPLE_MS;
    this.sampleIndex = 0;
    this.samples = 0;
    this.window.clear();
    this.throughputHistory.fill(0);
    this.p95History.fill(0);
    this.errorHistory.fill(0);
    this.totals = { sent: 0, completed: 0, failed: 0 };
    this.sync(this.graph);
  }

  // ─── Time ──────────────────────────────────────────────────────────────────

  /**
   * Advances by `ms` of sim time in fixed steps. `maxSteps` lets the frame loop
   * drop time instead of freezing when it falls behind. Returns steps run.
   */
  advance(ms: number, maxSteps = Infinity): number {
    this.carry += ms;
    let steps = 0;
    while (this.carry >= STEP_MS) {
      if (steps >= maxSteps) {
        this.carry = 0;
        break;
      }
      this.tick();
      this.carry -= STEP_MS;
      steps++;
    }
    return steps;
  }

  tick() {
    this.time += STEP_MS;
    const now = this.time;

    for (const n of this.order) {
      if (n.kind === 'client') this.emit(n, now);
      if (n.active.length) this.completeJobs(n, now);
    }

    const packets = this.packets;
    const arrived = this.arrived;
    for (let i = packets.length - 1; i >= 0; i--) {
      const p = packets[i];
      p.t += STEP_MS / p.dur;
      if (p.t >= 1 || p.to.dead || (p.from.dead && p.response)) {
        packets[i] = packets[packets.length - 1];
        packets.pop();
        arrived.push(p);
      }
    }
    for (let i = 0; i < arrived.length; i++) this.arrive(arrived[i]);
    arrived.length = 0;

    if (now >= this.nextSample) {
      this.nextSample += SAMPLE_MS;
      this.sample();
    }
  }

  // ─── Traffic ───────────────────────────────────────────────────────────────

  /** Mean-preserving log-normal sample around `mean`. */
  private serviceTime(mean: number) {
    if (mean <= 0) return 0;
    const u = 1 - this.rng();
    const v = this.rng();
    const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    return mean * Math.exp(SERVICE_SIGMA * z - (SERVICE_SIGMA * SERVICE_SIGMA) / 2);
  }

  private interval(n: SimNode) {
    const mean = 1000 / n.config.rps;
    return n.config.pattern === 'poisson' ? -Math.log(1 - this.rng()) * mean : mean;
  }

  private emit(n: SimNode, now: number) {
    if (n.down || n.config.rps <= 0 || !n.out.length) {
      n.nextArrival = Infinity;
      return;
    }
    if (n.nextArrival === Infinity) n.nextArrival = now + this.interval(n);
    for (let guard = 0; n.nextArrival <= now && guard < 64; guard++) {
      const p = this.alloc(now);
      p.path.push(n);
      n.sent++;
      this.totals.sent++;
      this.send(p, n, this.pick(n));
      n.nextArrival += this.interval(n);
    }
  }

  private alloc(now: number): Packet {
    const p = this.pool.pop();
    if (p) {
      p.id = this.nextId++;
      p.t = 0;
      p.response = false;
      p.ok = true;
      p.born = now;
      p.path.length = 0;
      return p;
    }
    const dummy = null as unknown as SimNode;
    return { id: this.nextId++, from: dummy, to: dummy, t: 0, dur: 1, response: false, ok: true, born: now, path: [] };
  }

  private send(p: Packet, from: SimNode, to: SimNode) {
    p.from = from;
    p.to = to;
    p.t = 0;
    const dist = Math.hypot(to.x - from.x, to.y - from.y) - NODE_HALF * 2;
    p.dur = Math.max(MIN_HOP_MS, dist / PACKET_SPEED);
    if (!p.response) to.pending++;
    this.packets.push(p);
  }

  /** Picks the next hop. Balancers skip nodes that are down if any are up. */
  private pick(n: SimNode): SimNode {
    const out = n.out;
    if (out.length === 1) return out[0];
    if (n.kind !== 'balancer') return out[n.rr++ % out.length];

    const up = out.filter((o) => !o.down);
    const pool = up.length ? up : out;
    switch (n.config.strategy) {
      case 'random':
        return pool[Math.floor(this.rng() * pool.length)];
      case 'least-connections': {
        let best = pool[n.rr % pool.length];
        for (let i = 0; i < pool.length; i++) {
          const c = pool[(n.rr + i) % pool.length];
          if (c.pending < best.pending) best = c;
        }
        n.rr++;
        return best;
      }
      default:
        return pool[n.rr++ % pool.length];
    }
  }

  private arrive(p: Packet) {
    const n = p.to;
    if (p.response) {
      this.onResponse(n, p);
      return;
    }
    if (n.dead) {
      // The node vanished while the request was on its way: bounce a failure back.
      p.response = true;
      p.ok = false;
      this.onResponse(p.from, p);
      return;
    }
    p.path.push(n);
    if (n.down || p.path.length > MAX_DEPTH) {
      this.reject(n, p);
      return;
    }
    switch (n.kind) {
      case 'client':
        this.respond(n, p, true); // clients act as sinks if something sends to them
        return;
      case 'balancer':
        if (n.out.length) this.send(p, n, this.pick(n));
        else this.reject(n, p);
        return;
      case 'cache':
        n.active.push({ packet: p, doneAt: this.time + this.serviceTime(n.config.serviceMs) });
        return;
      default:
        this.admit(n, p);
    }
  }

  private admit(n: SimNode, p: Packet) {
    if (n.busy < n.config.workers) n.active.push({ packet: p, doneAt: this.time + this.serviceTime(n.config.serviceMs) });
    else if (n.queue.length < n.config.queueLimit) n.queue.push(p);
    else this.reject(n, p);
  }

  private reject(n: SimNode, p: Packet) {
    n.rejected++;
    n.lastReject = this.time;
    this.respond(n, p, false);
  }

  private completeJobs(n: SimNode, now: number) {
    const active = n.active;
    for (let i = active.length - 1; i >= 0; i--) {
      const job = active[i];
      if (job.doneAt > now) continue;
      active[i] = active[active.length - 1];
      active.pop();
      this.finishJob(n, job.packet);
    }
  }

  private finishJob(n: SimNode, p: Packet) {
    if (n.kind === 'cache') {
      if (!n.out.length || this.rng() < n.config.hitRate) {
        n.hits++;
        n.served++;
        this.respond(n, p, true);
      } else {
        n.misses++;
        this.send(p, n, this.pick(n));
      }
      return;
    }
    if (n.kind === 'server' && n.out.length) {
      // Keep the worker busy while the downstream call is in flight.
      n.held.set(p.id, p);
      this.send(p, n, this.pick(n));
      return;
    }
    n.served++;
    this.respond(n, p, true);
    this.drainQueue(n);
  }

  /** Starts queued requests while workers are free. */
  private drainQueue(n: SimNode) {
    if (!n.hasWorkers || n.down || n.dead) return;
    while (n.queue.length && n.busy < n.config.workers) {
      n.active.push({ packet: n.queue.shift()!, doneAt: this.time + this.serviceTime(n.config.serviceMs) });
    }
  }

  private onResponse(n: SimNode, p: Packet) {
    if (p.path.length <= 1) {
      this.complete(n, p);
      return;
    }
    if (n.held.delete(p.id)) {
      if (p.ok) n.served++;
      this.respond(n, p, p.ok && !n.down && !n.dead);
      this.drainQueue(n);
      return;
    }
    this.respond(n, p, p.ok && !n.dead);
  }

  /** Sends `p` back one hop toward whoever called `n`. */
  private respond(n: SimNode, p: Packet, ok: boolean) {
    p.response = true;
    p.ok = p.ok && ok;
    if (!n.dead) n.pending--;
    p.path.pop();
    const prev = p.path[p.path.length - 1];
    if (!prev) {
      this.release(p);
      return;
    }
    if (n.dead || prev.dead) {
      // No geometry to animate across; hand it over immediately.
      this.onResponse(prev, p);
      return;
    }
    this.send(p, n, prev);
  }

  /** Response reached the client that sent it. */
  private complete(client: SimNode, p: Packet) {
    if (!client.dead) {
      const latency = this.time - p.born;
      const timedOut = latency > client.config.timeoutMs;
      const ok = p.ok && !timedOut;
      client.completed++;
      if (!ok) client.failed++;
      if (timedOut) client.timeouts++;
      client.window!.push(this.time, latency, ok);
      this.window.push(this.time, latency, ok);
      this.totals.completed++;
      if (!ok) this.totals.failed++;
    }
    this.release(p);
  }

  private release(p: Packet) {
    p.path.length = 0;
    if (this.pool.length < 4096) this.pool.push(p);
  }

  /** Fails everything waiting at or being processed by `n`. */
  private failAll(n: SimNode) {
    const waiting = [...n.active.map((j) => j.packet), ...n.queue.drain()];
    n.active = [];
    for (const p of waiting) this.reject(n, p);
  }

  // ─── Observation ───────────────────────────────────────────────────────────

  private sample() {
    const i = this.sampleIndex;
    for (const n of this.order) {
      n.utilHistory[i] = n.utilization;
      n.queueHistory[i] = n.queue.length;
    }
    const s = this.window.summary(this.time, 1000);
    this.throughputHistory[i] = s.throughput;
    this.p95History[i] = Number.isNaN(s.p95) ? 0 : s.p95;
    this.errorHistory[i] = Number.isNaN(s.success) ? 0 : 1 - s.success;
    this.sampleIndex = (i + 1) % HISTORY;
    this.samples++;
  }

  summary(): Summary {
    let inFlight = 0;
    for (const n of this.order) if (n.kind === 'client') inFlight += n.sent - n.completed;
    return {
      ...this.window.summary(this.time, SUMMARY_SPAN_MS),
      time: this.time,
      inFlight,
      ...this.totals,
    };
  }

  clientSummary(n: SimNode): WindowSummary | null {
    return n.window ? n.window.summary(this.time, SUMMARY_SPAN_MS) : null;
  }
}
