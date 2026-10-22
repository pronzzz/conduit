import { applyTheme } from '../canvas/theme';
import { TEMPLATES } from '../core/templates';
import { clearShareHash, decodeShare, loadLocal, saveLocal, shareCodeFromUrl } from './persistence';
import { useStore, type Theme } from './store';

const DEFAULT_TEMPLATE = 'cache-aside';
export const SPEED_STEPS = [0.1, 0.25, 0.5, 1, 3];

/** Restores the last session (or a share link), then keeps theme and autosave in sync. */
export function boot() {
  const saved = loadLocal();
  const theme: Theme = saved.theme ?? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
  const graph = saved.graph ?? TEMPLATES.find((t) => t.id === DEFAULT_TEMPLATE)!.build();
  const speed = saved.speed !== undefined && SPEED_STEPS.includes(saved.speed) ? saved.speed : 0.25;
  useStore.setState({ graph, theme, speed });
  applyTheme(theme);

  const code = shareCodeFromUrl();
  if (code) {
    decodeShare(code).then((shared) => {
      clearShareHash();
      const s = useStore.getState();
      if (shared) {
        s.loadGraph(shared);
        s.notify('Opened shared design');
      } else s.notify('That share link is broken', 'danger');
    });
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  useStore.subscribe((s, prev) => {
    if (s.theme !== prev.theme) applyTheme(s.theme);
    if (s.graph === prev.graph && s.theme === prev.theme && s.speed === prev.speed) return;
    clearTimeout(timer);
    timer = setTimeout(() => saveLocal({ graph: s.graph, theme: s.theme, speed: s.speed }), 400);
  });
}
