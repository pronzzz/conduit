import { useEffect, useRef, useState, type ReactNode } from 'react';
import { SPECS } from '../core/specs';
import type { GraphEdge, GraphNode } from '../core/types';
import { useLive, type NodeStats } from '../state/live';
import { selectedNode, useStore } from '../state/store';
import { IconButton, Segmented, SliderField, Sparkline } from './controls';
import { count, ms, pct } from './format';
import * as I from './icons';

/**
 * Keeps the last selection around while the panel animates out, so it
 * doesn't go blank mid-transition.
 */
function useLatch<T>(value: T | null): T | null {
  const [latched, setLatched] = useState(value);
  if (value && value !== latched) setLatched(value);
  return value ?? latched;
}

export function Inspector() {
  const node = useStore(selectedNode);
  const edge = useStore((s) => (s.selection?.type === 'edge' ? (s.graph.edges.find((e) => e.id === s.selection!.id) ?? null) : null));
  const open = Boolean(node || edge);
  const shownNode = useLatch(node);
  const shownEdge = useLatch(edge);
  const showNode = node ? true : edge ? false : Boolean(shownNode);

  return (
    <aside
      aria-label="Inspector"
      data-open={open}
      className={`reveal panel pointer-events-auto absolute top-[68px] right-3 z-20 flex max-h-[calc(100%-68px-84px)] w-[288px] flex-col overflow-hidden rounded-2xl max-sm:inset-x-3 max-sm:top-auto max-sm:bottom-[84px] max-sm:max-h-[50%] max-sm:w-auto ${
        open ? '' : 'translate-x-2 max-sm:translate-x-0 max-sm:translate-y-2'
      }`}
    >
      {showNode && shownNode ? <NodeInspector node={shownNode} /> : shownEdge ? <EdgeInspector edge={shownEdge} /> : null}
    </aside>
  );
}

function NodeInspector({ node }: { node: GraphNode }) {
  const spec = SPECS[node.kind];
  const { updateNode, updateConfig, deleteSelection, duplicateSelection } = useStore.getState();
  const labelRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onRename = (e: Event) => {
      if ((e as CustomEvent<string>).detail === node.id) labelRef.current?.select();
    };
    window.addEventListener('conduit:rename', onRename);
    return () => window.removeEventListener('conduit:rename', onRename);
  }, [node.id]);

  return (
    <>
      <div className="flex items-center gap-2.5 border-b border-line p-3 pr-2">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-control text-ink">
          <I.KindIcon kind={node.kind} size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <input
            ref={labelRef}
            value={node.label}
            maxLength={40}
            onChange={(e) => updateNode(node.id, { label: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            className="-ml-1 w-full truncate rounded-md bg-transparent px-1 text-[13px] font-semibold text-ink outline-none hover:bg-control focus:bg-control"
            aria-label="Name"
          />
          <div className="text-[11px] text-muted">{spec.name}</div>
        </div>
        <IconButton
          label={node.down ? 'Bring back up' : 'Take down'}
          shortcut="X"
          active={node.down}
          onClick={() => updateNode(node.id, { down: !node.down })}
          className={node.down ? 'text-danger hover:text-danger' : ''}
        >
          <I.Power />
        </IconButton>
        <IconButton label="Duplicate" shortcut="⌘D" onClick={duplicateSelection}>
          <I.Copy />
        </IconButton>
        <IconButton label="Delete" shortcut="⌫" onClick={deleteSelection} className="hover:text-danger">
          <I.Trash />
        </IconButton>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-3 pt-3">
        <p className="text-xs leading-[18px] text-muted">{spec.blurb}</p>
        {node.down && (
          <p className="rounded-lg bg-danger/10 px-2.5 py-2 text-xs leading-[18px] text-danger">
            This node is down and rejects everything it receives.
          </p>
        )}
        {spec.fields.map((f) =>
          f.type === 'number' ? (
            <SliderField
              key={f.key}
              label={f.label}
              value={node.config[f.key]}
              min={f.min}
              max={f.max}
              step={f.step}
              unit={f.unit === '%' ? undefined : f.unit}
              percent={f.unit === '%'}
              log={f.log}
              hint={f.hint}
              onChange={(v) => updateConfig(node.id, { [f.key]: v })}
            />
          ) : (
            <div key={f.key}>
              <div className="mb-1.5 text-xs text-muted">{f.label}</div>
              <Segmented
                label={f.label}
                value={node.config[f.key]}
                options={f.options}
                onChange={(v) => updateConfig(node.id, { [f.key]: v })}
              />
              {f.hint && <p className="mt-1.5 text-[11px] leading-4 text-muted">{f.hint}</p>}
            </div>
          ),
        )}
        <LiveStats id={node.id} />
      </div>
    </>
  );
}

function LiveStats({ id }: { id: string }) {
  const stats = useLive().node;
  if (!stats || stats.id !== id) return null;
  return (
    <section className="border-t border-line pt-3">
      <h3 className="mb-2 text-[11px] font-medium tracking-wide text-muted uppercase">Live</h3>
      <StatsFor s={stats} />
    </section>
  );
}

function StatsFor({ s }: { s: NodeStats }) {
  switch (s.kind) {
    case 'client': {
      const c = s.client;
      return (
        <Grid>
          <Stat label="Sent" value={count(s.sent)} />
          <Stat label="Success" value={pct(c?.success ?? NaN)} tone={tone(c?.success)} />
          <Stat label="p50" value={ms(c?.p50 ?? NaN)} />
          <Stat label="p95" value={ms(c?.p95 ?? NaN)} />
          <Stat label="Failed" value={count(s.failed)} tone={s.failed ? 'danger' : undefined} />
          <Stat label="Timeouts" value={count(s.timeouts)} tone={s.timeouts ? 'warn' : undefined} />
        </Grid>
      );
    }
    case 'cache': {
      const total = s.hits + s.misses;
      return (
        <Grid>
          <Stat label="Hits" value={count(s.hits)} />
          <Stat label="Misses" value={count(s.misses)} />
          <Stat label="Observed hit rate" value={total ? pct(s.hits / total) : '—'} wide />
        </Grid>
      );
    }
    case 'balancer':
      return <p className="text-xs text-muted">Balancers add no delay. Taking a target down makes the balancer skip it.</p>;
    default: {
      const color = s.utilization > 0.97 ? 'var(--danger)' : s.utilization > 0.75 ? 'var(--warn)' : 'var(--ok)';
      return (
        <>
          <div className="mb-3 flex items-end justify-between gap-3 rounded-lg bg-control p-2.5">
            <div>
              <div className="text-[11px] text-muted">Workers busy</div>
              <div className="num text-[15px] text-ink">
                {s.busy}
                <span className="text-muted"> / {s.workers}</span>
              </div>
            </div>
            <Sparkline values={s.util} max={1} color={color} width={120} height={28} />
          </div>
          <Grid>
            <Stat label="Queued" value={count(s.queue)} tone={s.queue ? 'warn' : undefined} />
            <Stat label="Served" value={count(s.served)} />
            <Stat label="Rejected" value={count(s.rejected)} tone={s.rejected ? 'danger' : undefined} wide />
          </Grid>
        </>
      );
    }
  }
}

const tone = (success: number | undefined) =>
  success === undefined || Number.isNaN(success) ? undefined : success < 0.9 ? 'danger' : success < 0.99 ? 'warn' : undefined;

function Grid({ children }: { children: ReactNode }) {
  return <dl className="grid grid-cols-2 gap-x-3 gap-y-2">{children}</dl>;
}

function Stat({ label, value, tone, wide }: { label: string; value: string; tone?: 'warn' | 'danger'; wide?: boolean }) {
  return (
    <div className={wide ? 'col-span-2' : ''}>
      <dt className="text-[11px] text-muted">{label}</dt>
      <dd className={`num text-[13px] ${tone === 'danger' ? 'text-danger' : tone === 'warn' ? 'text-warn' : 'text-ink'}`}>{value}</dd>
    </div>
  );
}

function EdgeInspector({ edge }: { edge: GraphEdge }) {
  const from = useStore((s) => s.graph.nodes.find((n) => n.id === edge.from));
  const to = useStore((s) => s.graph.nodes.find((n) => n.id === edge.to));
  const { deleteSelection } = useStore.getState();
  return (
    <>
      <div className="flex items-center gap-2 border-b border-line p-3 pr-2">
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold text-ink">Connection</div>
          <div className="text-[11px] text-muted">Requests flow one way; responses return along it.</div>
        </div>
        <IconButton label="Delete" shortcut="⌫" onClick={deleteSelection} className="hover:text-danger">
          <I.Trash />
        </IconButton>
      </div>
      <div className="flex items-center gap-2 p-3 text-xs">
        <span className="truncate rounded-md bg-control px-2 py-1 text-ink">{from?.label}</span>
        <I.Arrow size={14} className="shrink-0 text-muted" />
        <span className="truncate rounded-md bg-control px-2 py-1 text-ink">{to?.label}</span>
      </div>
    </>
  );
}
