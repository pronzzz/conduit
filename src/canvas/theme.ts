import type { Theme } from '../state/store';

/**
 * Single source of truth for colour. The canvas reads these directly and
 * `applyTheme` mirrors them into CSS custom properties for the DOM chrome.
 */
export interface Palette {
  bg: string;
  grid: string;
  panel: string;
  panelBorder: string;
  control: string;
  controlHover: string;
  ink: string;
  muted: string;
  faint: string;
  nodeFill: string;
  nodeStroke: string;
  edge: string;
  edgeHover: string;
  accent: string;
  accentInk: string;
  ok: string;
  warn: string;
  danger: string;
  shadow: string;
}

export const PALETTES: Record<Theme, Palette> = {
  dark: {
    bg: '#0c0c0d',
    grid: '#26262a',
    panel: 'rgba(22, 22, 24, 0.82)',
    panelBorder: 'rgba(255, 255, 255, 0.07)',
    control: 'rgba(255, 255, 255, 0.05)',
    controlHover: 'rgba(255, 255, 255, 0.09)',
    ink: '#ececee',
    muted: '#8b8b92',
    faint: '#4a4a50',
    nodeFill: '#161618',
    nodeStroke: '#2e2e33',
    edge: '#34343a',
    edgeHover: '#5c5c64',
    accent: '#a5b4fc',
    accentInk: '#0c0c0d',
    ok: '#5fd4a0',
    warn: '#f2b552',
    danger: '#ff6b6b',
    shadow: '0 8px 30px rgba(0, 0, 0, 0.35)',
  },
  light: {
    bg: '#f6f6f4',
    grid: '#d9d9d5',
    panel: 'rgba(255, 255, 255, 0.84)',
    panelBorder: 'rgba(0, 0, 0, 0.07)',
    control: 'rgba(0, 0, 0, 0.04)',
    controlHover: 'rgba(0, 0, 0, 0.07)',
    ink: '#18181b',
    muted: '#6e6e76',
    faint: '#b9b9bf',
    nodeFill: '#ffffff',
    nodeStroke: '#dcdcdf',
    edge: '#cfcfd4',
    edgeHover: '#9a9aa2',
    accent: '#4f46e5',
    accentInk: '#ffffff',
    ok: '#13945e',
    warn: '#c27c0e',
    danger: '#e5484d',
    shadow: '0 8px 30px rgba(0, 0, 0, 0.08)',
  },
};

export function applyTheme(theme: Theme) {
  const p = PALETTES[theme];
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
  for (const [k, v] of Object.entries(p)) root.style.setProperty(`--${k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())}`, v);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', p.bg);
}

export const FONT = 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
export const MONO = 'ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace';

/** Frame-rate independent exponential approach (no overshoot). */
export function approach(cur: number, target: number, dt: number, tau: number) {
  if (tau <= 0) return target;
  const next = target + (cur - target) * Math.exp(-dt / tau);
  return Math.abs(next - target) < 1e-3 ? target : next;
}

export const prefersReducedMotion = () =>
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
