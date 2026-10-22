export type NodeKind = 'client' | 'balancer' | 'server' | 'cache' | 'database';
export type LbStrategy = 'round-robin' | 'least-connections' | 'random';
export type ArrivalPattern = 'steady' | 'poisson';

/**
 * One flat config shape for every kind. Each kind only reads the fields
 * listed in its spec (see `specs.ts`); the rest keep their defaults.
 */
export interface NodeConfig {
  /** client: requests per second */
  rps: number;
  /** client: how requests are spaced in time */
  pattern: ArrivalPattern;
  /** client: responses slower than this count as failures */
  timeoutMs: number;
  /** balancer: how the next downstream node is picked */
  strategy: LbStrategy;
  /** server / database: requests processed in parallel */
  workers: number;
  /** server / cache / database: time spent per request */
  serviceMs: number;
  /** server / database: requests allowed to wait for a free worker */
  queueLimit: number;
  /** cache: chance (0–1) a request is answered without going downstream */
  hitRate: number;
}

export interface GraphNode {
  id: string;
  kind: NodeKind;
  label: string;
  x: number;
  y: number;
  /** Failure injection: a down node rejects everything it receives. */
  down: boolean;
  config: NodeConfig;
}

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
}

export interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export type Selection = { type: 'node'; id: string } | { type: 'edge'; id: string } | null;
