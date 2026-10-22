import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';

export function IconButton({
  label,
  shortcut,
  active,
  className = '',
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; shortcut?: string; active?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={shortcut ? `${label}  (${shortcut})` : label}
      className={`press grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted hover:bg-control-hover hover:text-ink disabled:pointer-events-none disabled:opacity-35 ${
        active ? 'bg-control-hover text-ink' : ''
      } ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Divider({ vertical = true }: { vertical?: boolean }) {
  return <div className={vertical ? 'mx-1 h-4 w-px bg-line' : 'my-1 h-px w-full bg-line'} />;
}

/** Segmented control with a sliding indicator. */
export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  label,
  size = 'md',
}: {
  value: T;
  options: { value: T; label: ReactNode; title?: string }[];
  onChange: (v: T) => void;
  label: string;
  size?: 'sm' | 'md';
}) {
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  return (
    <div role="radiogroup" aria-label={label} className="relative flex rounded-lg bg-control p-0.5">
      <div
        className="absolute inset-y-0.5 rounded-md bg-node shadow-[0_1px_2px_rgba(0,0,0,0.18)] transition-transform duration-200 ease-soft"
        style={{ width: `calc((100% - 4px) / ${options.length})`, transform: `translateX(${index * 100}%)`, left: 2 }}
      />
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={`press relative z-10 flex-1 rounded-md px-2 ${size === 'sm' ? 'h-6 text-[11px]' : 'h-7 text-xs'} font-medium ${
            o.value === value ? 'text-ink' : 'text-muted hover:text-ink'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Closes on outside click or Escape. Kept mounted so it can animate out. */
export function Popover({
  open,
  onClose,
  children,
  align = 'right',
  className = '',
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  align?: 'left' | 'right';
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.parentElement?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);
  return (
    <div
      ref={ref}
      data-open={open}
      role="menu"
      className={`reveal panel absolute top-[calc(100%+8px)] z-40 min-w-56 rounded-xl p-1 ${align === 'right' ? 'right-0 origin-top-right' : 'left-0 origin-top-left'} ${
        open ? '' : '-translate-y-1 scale-[0.98]'
      } ${className}`}
    >
      {children}
    </div>
  );
}

export function MenuItem({
  icon,
  children,
  hint,
  onSelect,
}: {
  icon?: ReactNode;
  children: ReactNode;
  hint?: ReactNode;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onSelect}
      className="press flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left text-ink hover:bg-control-hover"
    >
      {icon && <span className="mt-px text-muted">{icon}</span>}
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] leading-5">{children}</span>
        {hint && <span className="block text-xs leading-4 text-muted">{hint}</span>}
      </span>
    </button>
  );
}

/** Slider with a typed value. `log` maps the track logarithmically. */
export function SliderField({
  label,
  value,
  min,
  max,
  step,
  unit,
  log,
  percent,
  hint,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  log?: boolean;
  percent?: boolean;
  hint?: string;
  onChange: (v: number) => void;
}) {
  const toPos = (v: number) => (log ? Math.log(Math.max(v, min) / min) / Math.log(max / min) : (v - min) / (max - min));
  const fromPos = (p: number) => {
    const raw = log ? min * Math.pow(max / min, p) : min + p * (max - min);
    const snapped = Math.round(raw / step) * step;
    return Math.min(max, Math.max(min, Number(snapped.toFixed(4))));
  };
  const display = percent ? Math.round(value * 100) : value;
  const [draft, setDraft] = useState<string | null>(null);

  const commit = () => {
    if (draft === null) return;
    const n = parseFloat(draft);
    if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, percent ? n / 100 : n)));
    setDraft(null);
  };

  const pos = Math.min(1, Math.max(0, toPos(value)));
  return (
    <label className="block">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="text-xs text-muted">{label}</span>
        <span className="flex items-baseline gap-1">
          <input
            type="number"
            inputMode="decimal"
            value={draft ?? String(display)}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              if (e.key === 'Escape') setDraft(null);
            }}
            className="num w-16 rounded-md bg-transparent px-1 text-right text-xs text-ink outline-none hover:bg-control focus:bg-control"
            aria-label={label}
          />
          {(unit || percent) && <span className="w-5 text-[11px] text-muted">{percent ? '%' : unit}</span>}
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={1000}
        value={Math.round(pos * 1000)}
        onChange={(e) => onChange(fromPos(Number(e.target.value) / 1000))}
        className="range"
        style={{ '--fill': `${pos * 100}%` } as React.CSSProperties}
        aria-label={`${label} slider`}
      />
      {hint && <p className="mt-1 text-[11px] leading-4 text-muted">{hint}</p>}
    </label>
  );
}

/** Minimal inline sparkline. */
export function Sparkline({
  values,
  width = 72,
  height = 20,
  color = 'var(--ink)',
  max,
  fill = true,
}: {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
  max?: number;
  fill?: boolean;
}) {
  const n = 60;
  const data = values.slice(-n);
  const top = Math.max(max ?? 0, ...data, 1e-9);
  const pts = data.map((v, i) => [(i / (n - 1)) * width + (width - ((data.length - 1) / (n - 1)) * width), height - 1 - (v / top) * (height - 2)]);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('');
  return (
    <svg width={width} height={height} className="block overflow-visible" aria-hidden="true">
      {pts.length > 1 && (
        <>
          {fill && <path d={`${line}L${width},${height}L${pts[0][0].toFixed(1)},${height}Z`} fill={color} opacity={0.1} />}
          <path d={line} fill="none" stroke={color} strokeWidth={1.25} strokeLinejoin="round" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="num inline-grid h-5 min-w-5 place-items-center rounded border border-line bg-control px-1 text-[10px] text-muted">{children}</kbd>;
}
