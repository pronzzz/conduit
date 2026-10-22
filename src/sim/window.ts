export interface WindowSummary {
  /** Completed requests per second inside the window. */
  throughput: number;
  /** Share of completed requests that succeeded, or NaN when nothing completed. */
  success: number;
  /** Latency percentiles of successful requests in ms (NaN when none). */
  p50: number;
  p95: number;
  p99: number;
  mean: number;
  count: number;
}

const EMPTY: WindowSummary = { throughput: 0, success: NaN, p50: NaN, p95: NaN, p99: NaN, mean: NaN, count: 0 };

/**
 * Fixed-size ring buffer of completed requests (time, latency, ok).
 * Allocation-free after construction; summaries reuse one scratch buffer.
 */
export class LatencyWindow {
  private readonly times: Float64Array;
  private readonly lat: Float32Array;
  private readonly ok: Uint8Array;
  private readonly scratch: Float64Array;
  private head = 0;
  private size = 0;

  private readonly cap: number;

  constructor(cap = 1 << 15) {
    this.cap = cap;
    this.times = new Float64Array(cap);
    this.lat = new Float32Array(cap);
    this.ok = new Uint8Array(cap);
    this.scratch = new Float64Array(cap);
  }

  push(time: number, latency: number, ok: boolean) {
    this.times[this.head] = time;
    this.lat[this.head] = latency;
    this.ok[this.head] = ok ? 1 : 0;
    this.head = (this.head + 1) % this.cap;
    if (this.size < this.cap) this.size++;
  }

  clear() {
    this.head = 0;
    this.size = 0;
  }

  summary(now: number, spanMs: number): WindowSummary {
    if (!this.size) return EMPTY;
    const from = now - spanMs;
    let count = 0;
    let good = 0;
    let sum = 0;
    for (let i = 1; i <= this.size; i++) {
      const idx = (this.head - i + this.cap) % this.cap;
      if (this.times[idx] < from) break;
      count++;
      if (this.ok[idx]) {
        const l = this.lat[idx];
        this.scratch[good++] = l;
        sum += l;
      }
    }
    if (!count) return EMPTY;
    const sorted = this.scratch.subarray(0, good).sort();
    const pick = (q: number) => (good ? sorted[Math.min(good - 1, Math.floor(q * good))] : NaN);
    // While the sim is younger than the window, divide by elapsed time instead.
    const span = Math.min(spanMs, Math.max(now, 1));
    return {
      throughput: (count * 1000) / span,
      success: good / count,
      p50: pick(0.5),
      p95: pick(0.95),
      p99: pick(0.99),
      mean: good ? sum / good : NaN,
      count,
    };
  }
}
