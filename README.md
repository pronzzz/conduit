# Conduit

**A deterministic, real-time playground for distributed system design.**

Sketch an architecture of clients, load balancers, servers, caches and databases. Then watch every request move through it. Conduit models worker pools, queues, back-pressure and failures, so you can see *why* a system slows down, not just that it does.

[![License: MIT](https://img.shields.io/badge/License-MIT-black.svg)](LICENSE)

> Conduit is the 2.0 rewrite of **SysArch Interactive**.

## What it does

- **One dot per request.** White dots head toward the backend, green dots are successful responses, and red dots failed. Each response retraces the exact path its request took.
- **A real queueing model.** Servers and databases have a fixed number of workers and a bounded queue. Anything beyond that is rejected. Servers keep a worker busy while they wait on downstream calls, so a slow database backs up into everything upstream.
- **Deterministic.** The engine uses a fixed 120 Hz timestep and a seeded RNG. Reset replays exactly the same traffic, so before/after comparisons are fair.
- **Live metrics.** Throughput, success rate, p50/p95/p99 latency and in-flight requests, with sparklines. Each node shows its own utilisation, queue depth, rejections and cache hit rate.
- **Failure injection.** Take any node down (`X`). Balancers route around nodes that are down, the way health checks would.
- **Load-balancing strategies.** Round robin, least connections and random.
- **Bursty or steady traffic.** Poisson arrivals show why queues build well below 100% utilisation.
- **Distance is latency.** About 1 ms per 3 px, so layout matters. Playback starts at ¼× so the dots are easy to follow; 1× is real time.

### Editing

- Drag components from the left dock, or press `1`–`5`.
- Drag from a node's right-edge handle to another node to connect them. Loops and duplicate edges are blocked.
- Full undo/redo, duplicate, rename (double-click a node), and snap-to-grid (hold `Alt` to move freely).
- Autosaves locally. **Share links** carry the whole design compressed in the URL hash; nothing is uploaded.
- Export PNG, export/import JSON, and four starter templates.
- Light and dark themes. Works with mouse, trackpad (pinch to zoom) and touch.

## Shortcuts

| Key | Action |
| --- | --- |
| `Space` | Run / pause |
| `R` | Reset traffic (same seed) |
| `F` | Fit to view |
| `1`–`5` | Add client, balancer, server, cache, database |
| `⌫` | Delete selection |
| `⌘D` | Duplicate |
| `X` | Take node down / up |
| `⌘Z` / `⇧⌘Z` | Undo / redo |
| `+` / `−` | Zoom |
| `?` | Help |

## Getting started

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # engine test suite
npm run build    # type-check + production build
```

Requires Node 20+.

## How it's built

```
src/
  core/     Graph model, kind specs, validation, templates (no DOM)
  sim/      Simulation engine, latency windows, seeded RNG + tests
  canvas/   Renderer, camera, pointer interaction, frame loop
  state/    Zustand editor store (undo/redo), persistence, live stats
  ui/       React chrome: top bar, dock, inspector, metrics, help
```

- **Engine and UI are separate.** `sim/` is plain TypeScript with no React. Packets are pooled, queues are O(1), and responses follow an explicit call path rather than guessing the upstream node.
- **One canvas, one loop.** Grid, edges, nodes and packets are drawn on a single HiDPI 2D canvas. Packets are batched into nine draw calls per frame however many are in flight. The loop sleeps when nothing is moving.
- **React stays out of the hot path.** The canvas reads the store directly. React only receives a throttled stats snapshot about five times a second.
- **Motion.** Everything eases with frame-rate-independent exponential smoothing (no overshoot): node positions, selection, hover, utilisation bars, queue badges, zoom (anchored under the cursor), pan momentum and fit-to-view. Deleted nodes and edges fade out instead of vanishing. `prefers-reduced-motion` is respected.

### Compared with 1.0

| | 1.0 | 2.0 |
| --- | --- | --- |
| JS bundle (gzip) | 161 KB | 85 KB |
| Max requests per client | ~60 rps (one spawn per frame) | 400 rps |
| Load test (4 × 400 rps, ~2,000 in flight) | n/a | steady display refresh, 0 long tasks |
| Server capacity / queues | not implemented | workers, bounded queues, rejections |
| Response routing | random upstream edge | exact request path |
| Determinism | `Math.random` + wall clock | seeded RNG + fixed timestep |
| Tests | none | engine + graph validation suite |

## Deploying

It's a static Vite app. On Vercel the framework preset is detected automatically. `vercel.json` adds long-lived caching for the hashed assets.

## License

MIT, see [LICENSE](LICENSE).
