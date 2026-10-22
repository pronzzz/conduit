import { useEffect, useState, type ReactNode } from 'react';
import { viewport } from '../canvas/api';
import { KINDS, SPECS } from '../core/specs';
import { useLive } from '../state/live';
import { useStore } from '../state/store';
import { IconButton, Kbd, Sparkline } from './controls';
import { count, ms, pct, rate } from './format';
import * as I from './icons';

export function Metrics() {
  const live = useLive();
  const s = live.summary;
  const hasData = s.sent > 0;
  const successTone = !hasData || Number.isNaN(s.success) ? '' : s.success < 0.9 ? 'text-danger' : s.success < 0.99 ? 'text-warn' : '';
  return (
    <section
      aria-label="System metrics"
      className="panel pointer-events-auto absolute bottom-3 left-1/2 z-20 flex h-14 max-w-[calc(100%-24px)] -translate-x-1/2 items-center overflow-x-auto rounded-xl px-1 [scrollbar-width:none]"
    >
      <Metric label="Throughput" value={rate(s.throughput)} unit="rps">
        <Sparkline values={live.throughput} width={56} height={18} />
      </Metric>
      <Metric label="Success" value={hasData ? pct(s.success) : '—'} className={successTone}>
        <Sparkline values={live.errors} width={40} height={18} color={live.errors.some((e) => e > 0) ? 'var(--danger)' : 'var(--faint)'} max={0.05} />
      </Metric>
      <Metric label="p50" value={ms(s.p50)} />
      <Metric label="p95" value={ms(s.p95)}>
        <Sparkline values={live.p95} width={40} height={18} color="var(--muted)" />
      </Metric>
      <Metric label="p99" value={ms(s.p99)} />
      <Metric label="In flight" value={count(s.inFlight)} />
    </section>
  );
}

function Metric({ label, value, unit, className = '', children }: { label: string; value: string; unit?: string; className?: string; children?: ReactNode }) {
  return (
    <div className="flex shrink-0 items-center gap-3 border-r border-line px-3.5 last:border-r-0">
      <div>
        <div className="text-[10px] font-medium tracking-wide whitespace-nowrap text-muted uppercase">{label}</div>
        <div className={`num text-[14px] leading-5 whitespace-nowrap text-ink ${className}`}>
          {value}
          {unit && <span className="ml-1 text-[11px] text-muted">{unit}</span>}
        </div>
      </div>
      {children && <div className="max-md:hidden">{children}</div>}
    </div>
  );
}

export function ZoomControls({ zoom }: { zoom: number }) {
  const fit = useStore((s) => s.fit);
  return (
    <div className="panel pointer-events-auto absolute bottom-3 left-3 z-20 flex h-10 items-center gap-0.5 rounded-xl px-1 max-lg:hidden">
      <IconButton label="Zoom out" shortcut="−" onClick={() => viewport.zoomBy(1 / 1.25)}>
        <I.Minus />
      </IconButton>
      <span className="num w-10 text-center text-[11px] text-muted">{Math.round(zoom * 100)}%</span>
      <IconButton label="Zoom in" shortcut="+" onClick={() => viewport.zoomBy(1.25)}>
        <I.Plus />
      </IconButton>
      <IconButton label="Fit to view" shortcut="F" onClick={fit}>
        <I.Fit />
      </IconButton>
    </div>
  );
}

export function Toast() {
  const toast = useStore((s) => s.toast);
  const [shown, setShown] = useState(toast);
  if (toast && toast !== shown) setShown(toast);
  return (
    <div
      role="status"
      aria-live="polite"
      data-open={Boolean(toast)}
      className={`reveal pointer-events-none absolute bottom-[80px] left-1/2 z-40 -translate-x-1/2 rounded-full px-3.5 py-1.5 text-xs font-medium shadow-lg ${
        shown?.tone === 'danger' ? 'bg-danger text-white' : 'bg-ink text-bg'
      } ${toast ? '' : 'translate-y-1'}`}
    >
      {shown?.text}
    </div>
  );
}

export function EmptyState() {
  const empty = useStore((s) => s.graph.nodes.length === 0);
  return (
    <div data-open={empty} className={`reveal pointer-events-none absolute inset-0 z-10 grid place-items-center ${empty ? '' : 'scale-[0.98]'}`}>
      <div className="max-w-xs text-center">
        <div className="mx-auto mb-3 grid h-10 w-10 place-items-center rounded-xl border border-line text-muted">
          <I.Plus />
        </div>
        <p className="text-[13px] font-medium text-ink">Start with a client</p>
        <p className="mt-1 text-xs leading-5 text-muted">
          Drag components in from the left, then drag from a node’s edge handle to connect it. Or pick a template from the top bar.
        </p>
      </div>
    </div>
  );
}

const SHORTCUTS: [string[], string][] = [
  [['Space'], 'Run / pause'],
  [['R'], 'Reset traffic (same seed, same run)'],
  [['F'], 'Fit design to view'],
  [['1', '–', '5'], 'Add a component'],
  [['⌫'], 'Delete selection'],
  [['⌘', 'D'], 'Duplicate node'],
  [['X'], 'Take selected node down / up'],
  [['⌘', 'Z'], 'Undo'],
  [['⇧', '⌘', 'Z'], 'Redo'],
  [['+', '−'], 'Zoom'],
  [['Alt'], 'Hold while dragging to move freely'],
];

export function Help() {
  const open = useStore((s) => s.helpOpen);
  const setHelpOpen = useStore((s) => s.setHelpOpen);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setHelpOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setHelpOpen]);

  return (
    <div
      data-open={open}
      className="reveal absolute inset-0 z-50 grid place-items-center bg-black/30 p-4"
      onPointerDown={(e) => e.target === e.currentTarget && setHelpOpen(false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Help"
        className={`panel max-h-full w-full max-w-[560px] overflow-y-auto rounded-2xl transition-[scale,translate] duration-200 ease-soft ${open ? '' : 'translate-y-2 scale-[0.98]'}`}
      >
        <div className="flex items-center justify-between border-b border-line p-4 pb-3">
          <div className="flex items-center gap-2">
            <I.Logo />
            <h2 className="text-sm font-semibold">How Conduit works</h2>
          </div>
          <IconButton label="Close" onClick={() => setHelpOpen(false)}>
            <I.Close />
          </IconButton>
        </div>
        <div className="grid gap-6 p-4 sm:grid-cols-2">
          <div className="space-y-3 text-xs leading-5 text-muted">
            <p>
              Every dot is one request. <span className="text-ink">White</span> dots travel toward the backend,{' '}
              <span className="text-ok">green</span> ones are successful responses, <span className="text-danger">red</span> ones
              failed.
            </p>
            <p>
              Responses retrace the exact path their request took. Distance is network latency (about 1 ms per 3 px), so
              spreading nodes apart makes the system slower. Playback starts at ¼× so you can follow the dots; 1× is real
              time.
            </p>
            <p>The run is deterministic. Reset replays the same traffic, so you can compare changes fairly.</p>
            <ul className="space-y-1.5 pt-1">
              {KINDS.map((k) => (
                <li key={k} className="flex gap-2">
                  <I.KindIcon kind={k} size={14} className="mt-[3px] shrink-0 text-ink" />
                  <span>
                    <span className="text-ink">{SPECS[k].name}.</span> {SPECS[k].blurb}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <ul className="space-y-2 text-xs">
            {SHORTCUTS.map(([keys, label]) => (
              <li key={label} className="flex items-center justify-between gap-3">
                <span className="text-muted">{label}</span>
                <span className="flex shrink-0 gap-1">
                  {keys.map((k) => (
                    <Kbd key={k}>{k}</Kbd>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
