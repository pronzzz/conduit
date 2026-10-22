import { useSyncExternalStore } from 'react';
import type { NodeKind } from '../core/types';
import { HISTORY, type SimNode, type Simulation, type Summary } from '../sim/engine';
import type { WindowSummary } from '../sim/window';

/**
 * Throttled read model of the running simulation for React. The frame loop
 * publishes a few times per second; components never touch the engine directly.
 */
export interface NodeStats {
  id: string;
  kind: NodeKind;
  busy: number;
  workers: number;
  queue: number;
  served: number;
  rejected: number;
  hits: number;
  misses: number;
  sent: number;
  completed: number;
  failed: number;
  timeouts: number;
  utilization: number;
  client: WindowSummary | null;
  util: number[];
  queueHistory: number[];
}

export interface LiveSnapshot {
  summary: Summary;
  throughput: number[];
  p95: number[];
  errors: number[];
  node: NodeStats | null;
}

const EMPTY: LiveSnapshot = {
  summary: { time: 0, throughput: 0, success: NaN, p50: NaN, p95: NaN, p99: NaN, mean: NaN, count: 0, inFlight: 0, sent: 0, completed: 0, failed: 0 },
  throughput: [],
  p95: [],
  errors: [],
  node: null,
};

let snapshot = EMPTY;
const listeners = new Set<() => void>();

/** Reads a ring buffer oldest → newest, skipping slots never written. */
function ordered(ring: Float32Array, sim: Simulation): number[] {
  const n = Math.min(sim.samples, HISTORY);
  const out = new Array<number>(n);
  for (let i = 0; i < n; i++) out[i] = ring[(sim.sampleIndex - n + i + HISTORY) % HISTORY];
  return out;
}

function nodeStats(n: SimNode, sim: Simulation): NodeStats {
  return {
    id: n.id,
    kind: n.kind,
    busy: n.busy,
    workers: n.config.workers,
    queue: n.queue.length,
    served: n.served,
    rejected: n.rejected,
    hits: n.hits,
    misses: n.misses,
    sent: n.sent,
    completed: n.completed,
    failed: n.failed,
    timeouts: n.timeouts,
    utilization: n.utilization,
    client: sim.clientSummary(n),
    util: ordered(n.utilHistory, sim),
    queueHistory: ordered(n.queueHistory, sim),
  };
}

export function publish(sim: Simulation, selectedId: string | null) {
  const n = selectedId ? sim.nodes.get(selectedId) : undefined;
  snapshot = {
    summary: sim.summary(),
    throughput: ordered(sim.throughputHistory, sim),
    p95: ordered(sim.p95History, sim),
    errors: ordered(sim.errorHistory, sim),
    node: n ? nodeStats(n, sim) : null,
  };
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export const useLive = () => useSyncExternalStore(subscribe, () => snapshot);
