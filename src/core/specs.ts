import type { LbStrategy, NodeConfig, NodeKind } from './types';

export interface NumberField {
  type: 'number';
  key: 'rps' | 'timeoutMs' | 'workers' | 'serviceMs' | 'queueLimit' | 'hitRate';
  label: string;
  min: number;
  max: number;
  step: number;
  unit?: string;
  /** Use a logarithmic slider for wide ranges. */
  log?: boolean;
  hint?: string;
}

export interface ChoiceField<K extends 'strategy' | 'pattern' = 'strategy' | 'pattern'> {
  type: 'choice';
  key: K;
  label: string;
  options: { value: NodeConfig[K]; label: string }[];
  hint?: string;
}

export type Field = NumberField | ChoiceField;

export interface KindSpec {
  kind: NodeKind;
  name: string;
  /** One-line description for tooltips and the inspector. */
  blurb: string;
  /** 24×24 stroke icon, shared by the canvas (Path2D) and the DOM (<path>). */
  glyph: string;
  shortcut: string;
  fields: Field[];
  defaults: Partial<NodeConfig>;
}

export const BASE_CONFIG: NodeConfig = {
  rps: 4,
  pattern: 'poisson',
  timeoutMs: 3000,
  strategy: 'round-robin',
  workers: 4,
  serviceMs: 120,
  queueLimit: 32,
  hitRate: 0.8,
};

const STRATEGIES: { value: LbStrategy; label: string }[] = [
  { value: 'round-robin', label: 'Round robin' },
  { value: 'least-connections', label: 'Least conn.' },
  { value: 'random', label: 'Random' },
];

export const SPECS: Record<NodeKind, KindSpec> = {
  client: {
    kind: 'client',
    name: 'Client',
    blurb: 'Sends requests and measures how long responses take.',
    glyph: 'M4 5h16v11H4z M9 20h6 M12 16v4',
    shortcut: '1',
    defaults: { rps: 4 },
    fields: [
      { type: 'number', key: 'rps', label: 'Request rate', min: 0.25, max: 400, step: 0.25, unit: 'rps', log: true },
      {
        type: 'choice',
        key: 'pattern',
        label: 'Arrivals',
        options: [
          { value: 'poisson', label: 'Bursty' },
          { value: 'steady', label: 'Steady' },
        ],
        hint: 'Bursty traffic (Poisson) builds queues well below 100% utilisation.',
      },
      { type: 'number', key: 'timeoutMs', label: 'Timeout', min: 100, max: 20000, step: 50, unit: 'ms', log: true },
    ],
  },
  balancer: {
    kind: 'balancer',
    name: 'Load balancer',
    blurb: 'Spreads requests across everything it connects to.',
    glyph: 'M3 12h5 M8 12l5-6h7 M8 12l5 6h7 M8 12h12',
    shortcut: '2',
    defaults: {},
    fields: [{ type: 'choice', key: 'strategy', label: 'Strategy', options: STRATEGIES }],
  },
  server: {
    kind: 'server',
    name: 'Server',
    blurb: 'Processes requests with a fixed pool of workers. Holds a worker while it waits on downstream calls.',
    glyph: 'M4 4h16v6H4z M4 14h16v6H4z M8 7h.01 M8 17h.01',
    shortcut: '3',
    defaults: { workers: 4, serviceMs: 120, queueLimit: 32 },
    fields: [
      { type: 'number', key: 'workers', label: 'Workers', min: 1, max: 64, step: 1 },
      { type: 'number', key: 'serviceMs', label: 'Service time', min: 1, max: 5000, step: 1, unit: 'ms', log: true },
      {
        type: 'number',
        key: 'queueLimit',
        label: 'Queue limit',
        min: 0,
        max: 500,
        step: 1,
        hint: 'Requests beyond workers + queue are rejected.',
      },
    ],
  },
  cache: {
    kind: 'cache',
    name: 'Cache',
    blurb: 'Answers hits directly and forwards misses downstream.',
    glyph: 'M13 3L5 14h6l-1 7 8-11h-6z',
    shortcut: '4',
    defaults: { serviceMs: 4, hitRate: 0.8 },
    fields: [
      { type: 'number', key: 'hitRate', label: 'Hit rate', min: 0, max: 1, step: 0.01, unit: '%' },
      { type: 'number', key: 'serviceMs', label: 'Lookup time', min: 0, max: 500, step: 1, unit: 'ms' },
    ],
  },
  database: {
    kind: 'database',
    name: 'Database',
    blurb: 'A connection-limited store. Slow queries back up into everything upstream.',
    glyph:
      'M4 6c0-1.66 3.58-3 8-3s8 1.34 8 3-3.58 3-8 3-8-1.34-8-3z M4 6v12c0 1.66 3.58 3 8 3s8-1.34 8-3V6 M4 12c0 1.66 3.58 3 8 3s8-1.34 8-3',
    shortcut: '5',
    defaults: { workers: 8, serviceMs: 200, queueLimit: 64 },
    fields: [
      { type: 'number', key: 'workers', label: 'Connections', min: 1, max: 128, step: 1 },
      { type: 'number', key: 'serviceMs', label: 'Query time', min: 1, max: 5000, step: 1, unit: 'ms', log: true },
      { type: 'number', key: 'queueLimit', label: 'Queue limit', min: 0, max: 1000, step: 1 },
    ],
  },
};

export const KINDS: NodeKind[] = ['client', 'balancer', 'server', 'cache', 'database'];

export function defaultConfig(kind: NodeKind): NodeConfig {
  return { ...BASE_CONFIG, ...SPECS[kind].defaults };
}
