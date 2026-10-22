export function ms(v: number) {
  if (!Number.isFinite(v)) return '—';
  if (v < 10) return `${v.toFixed(1)} ms`;
  if (v < 1000) return `${Math.round(v)} ms`;
  return `${(v / 1000).toFixed(v < 10_000 ? 2 : 1)} s`;
}

export function rate(v: number) {
  if (!Number.isFinite(v)) return '—';
  return v < 10 ? v.toFixed(1) : Math.round(v).toLocaleString();
}

export function pct(v: number) {
  if (!Number.isFinite(v)) return '—';
  if (v >= 0.9995) return '100%';
  return `${(v * 100).toFixed(v > 0.99 ? 2 : 1)}%`;
}

export function count(v: number) {
  return v < 10_000 ? String(v) : `${(v / 1000).toFixed(1)}k`;
}

export function clock(t: number) {
  const s = t / 1000;
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${(s % 60).toFixed(1).padStart(4, '0')}`;
}
