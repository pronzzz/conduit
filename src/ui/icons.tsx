import type { SVGProps } from 'react';
import { SPECS } from '../core/specs';
import type { NodeKind } from '../core/types';

type P = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 16, children, ...rest }: P) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

const icon = (d: string, extra?: (props: P) => React.ReactNode) =>
  function Icon(props: P) {
    return (
      <Svg {...props}>
        <path d={d} />
        {extra?.(props)}
      </Svg>
    );
  };

export const Play = (p: P) => (
  <Svg {...p}>
    <path d="M7 4.5v15l12.5-7.5z" fill="currentColor" stroke="none" />
  </Svg>
);
export const Pause = (p: P) => (
  <Svg {...p}>
    <path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" fill="currentColor" stroke="none" />
  </Svg>
);
export const Reset = icon('M4 12a8 8 0 1 0 2.4-5.7M4 4v4.5h4.5');
export const Plus = icon('M12 5v14M5 12h14');
export const Minus = icon('M5 12h14');
export const Fit = icon('M4 9V5a1 1 0 0 1 1-1h4M15 4h4a1 1 0 0 1 1 1v4M20 15v4a1 1 0 0 1-1 1h-4M9 20H5a1 1 0 0 1-1-1v-4');
export const Share = icon('M12 15V3M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6');
export const Sun = icon('M12 3v1.5M12 19.5V21M4.6 4.6l1.1 1.1M18.3 18.3l1.1 1.1M3 12h1.5M19.5 12H21M4.6 19.4l1.1-1.1M18.3 5.7l1.1-1.1', () => (
  <circle cx="12" cy="12" r="4" />
));
export const Moon = icon('M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z');
export const Help = icon('M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17.5h.01', () => <circle cx="12" cy="12" r="9" />);
export const Trash = icon('M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13');
export const Copy = icon('M8 8V5a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-3', () => (
  <rect x="4" y="8" width="12" height="12" rx="1" />
));
export const Power = icon('M12 3v8M6.4 6.4a8 8 0 1 0 11.2 0');
export const Undo = icon('M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3');
export const Redo = icon('M15 14l5-5-5-5M20 9H10a6 6 0 0 0 0 12h3');
export const Close = icon('M6 6l12 12M18 6 6 18');
export const Layers = icon('M12 3 3 8l9 5 9-5zM3 13l9 5 9-5');
export const Link = icon('M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1');
export const Image = icon('m4 17 5-5 4 4 2.5-2.5L20 18', () => (
  <>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <circle cx="15.5" cy="8.5" r="1.5" />
  </>
));
export const Download = icon('M12 4v11M7 10l5 5 5-5M5 20h14');
export const Upload = icon('M12 20V9M7 14l5-5 5 5M5 4h14');
export const Arrow = icon('M5 12h14M13 6l6 6-6 6');

export function KindIcon({ kind, ...p }: P & { kind: NodeKind }) {
  return (
    <Svg {...p}>
      <path d={SPECS[kind].glyph} />
    </Svg>
  );
}

export function Logo({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <path d="M5 16h7M20 16h7" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="16" cy="16" r="3.6" fill="var(--accent)" />
    </svg>
  );
}
