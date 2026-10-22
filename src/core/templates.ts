import { createNode, uid } from './graph';
import type { Graph, GraphNode, NodeConfig, NodeKind } from './types';

export interface Template {
  id: string;
  name: string;
  description: string;
  build: () => Graph;
}

type Spec = [key: string, kind: NodeKind, x: number, y: number, config?: Partial<NodeConfig>, label?: string];

function make(specs: Spec[], links: [string, string][]): Graph {
  const byKey = new Map<string, GraphNode>();
  for (const [key, kind, x, y, config, label] of specs) {
    const node = createNode(kind, x, y, label ? { label } : {});
    node.config = { ...node.config, ...config };
    byKey.set(key, node);
  }
  return {
    nodes: [...byKey.values()],
    edges: links.map(([a, b]) => ({ id: uid('e'), from: byKey.get(a)!.id, to: byKey.get(b)!.id })),
  };
}

export const TEMPLATES: Template[] = [
  {
    id: 'basic',
    name: 'Client → Server',
    description: 'The smallest system. Raise the rate until the queue starts to grow.',
    build: () =>
      make(
        [
          ['c', 'client', -180, 0, { rps: 6 }],
          ['s', 'server', 180, 0, { workers: 2, serviceMs: 250 }],
        ],
        [['c', 's']],
      ),
  },
  {
    id: 'balanced',
    name: 'Load balanced',
    description: 'One balancer in front of three servers. Try switching the strategy.',
    build: () =>
      make(
        [
          ['c', 'client', -360, 0, { rps: 24 }],
          ['lb', 'balancer', -100, 0],
          ['s1', 'server', 160, -140, { serviceMs: 300 }, 'Server A'],
          ['s2', 'server', 160, 0, { serviceMs: 300 }, 'Server B'],
          ['s3', 'server', 160, 140, { serviceMs: 300, workers: 2 }, 'Server C'],
        ],
        [
          ['c', 'lb'],
          ['lb', 's1'],
          ['lb', 's2'],
          ['lb', 's3'],
        ],
      ),
  },
  {
    id: 'cache-aside',
    name: 'Cache in front of a database',
    description: 'Servers read through a cache. Lower the hit rate and watch the database saturate.',
    build: () =>
      make(
        [
          ['c', 'client', -460, 0, { rps: 30 }],
          ['lb', 'balancer', -230, 0],
          ['s1', 'server', 0, -90, { workers: 8, serviceMs: 40 }, 'API 1'],
          ['s2', 'server', 0, 90, { workers: 8, serviceMs: 40 }, 'API 2'],
          ['k', 'cache', 230, 0, { hitRate: 0.85 }],
          ['db', 'database', 460, 0, { workers: 4, serviceMs: 180 }],
        ],
        [
          ['c', 'lb'],
          ['lb', 's1'],
          ['lb', 's2'],
          ['s1', 'k'],
          ['s2', 'k'],
          ['k', 'db'],
        ],
      ),
  },
  {
    id: 'cascade',
    name: 'Slow database cascade',
    description: 'The database is the bottleneck. Servers hold workers while they wait, so the failure spreads upstream.',
    build: () =>
      make(
        [
          ['w', 'client', -420, -90, { rps: 14 }, 'Web'],
          ['m', 'client', -420, 90, { rps: 10 }, 'Mobile'],
          ['lb', 'balancer', -180, 0, { strategy: 'least-connections' }],
          ['s1', 'server', 60, -90, { workers: 6, serviceMs: 30, queueLimit: 12 }, 'API 1'],
          ['s2', 'server', 60, 90, { workers: 6, serviceMs: 30, queueLimit: 12 }, 'API 2'],
          ['db', 'database', 320, 0, { workers: 3, serviceMs: 260, queueLimit: 10 }],
        ],
        [
          ['w', 'lb'],
          ['m', 'lb'],
          ['lb', 's1'],
          ['lb', 's2'],
          ['s1', 'db'],
          ['s2', 'db'],
        ],
      ),
  },
  {
    id: 'empty',
    name: 'Blank canvas',
    description: 'Start from nothing.',
    build: () => ({ nodes: [], edges: [] }),
  },
];
