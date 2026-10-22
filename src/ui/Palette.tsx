import { viewport } from '../canvas/api';
import { KINDS, SPECS } from '../core/specs';
import { KindIcon } from './icons';

/** Drag a component onto the canvas, or click to drop it in the middle. */
export function Palette() {
  return (
    <nav
      aria-label="Components"
      className="panel pointer-events-auto absolute top-1/2 left-3 z-20 flex -translate-y-1/2 flex-col gap-0.5 rounded-xl p-1 max-sm:top-auto max-sm:bottom-[88px] max-sm:translate-y-0"
    >
      {KINDS.map((kind) => {
        const spec = SPECS[kind];
        return (
          <button
            key={kind}
            type="button"
            aria-label={`Add ${spec.name}`}
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              e.preventDefault();
              viewport.beginPlace(kind, e.nativeEvent);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                viewport.addAtCenter(kind);
              }
            }}
            className="press group relative grid h-10 w-10 cursor-grab touch-none place-items-center rounded-lg text-muted hover:bg-control-hover hover:text-ink active:cursor-grabbing"
          >
            <KindIcon kind={kind} size={18} />
            <span className="pointer-events-none absolute top-1/2 left-[calc(100%+10px)] flex -translate-x-1 -translate-y-1/2 items-center gap-2 rounded-lg bg-ink px-2 py-1 text-xs font-medium whitespace-nowrap text-bg opacity-0 transition-[opacity,translate] duration-150 ease-soft group-hover:translate-x-0 group-hover:opacity-100 max-sm:hidden">
              {spec.name}
              <span className="num text-[10px] opacity-60">{spec.shortcut}</span>
            </span>
          </button>
        );
      })}
    </nav>
  );
}
