import { useEffect, useRef } from 'react';
import { bounds } from '../core/graph';
import { Simulation } from '../sim/engine';
import { publish } from '../state/live';
import { download } from '../state/persistence';
import { useStore } from '../state/store';
import { viewport } from './api';
import { Camera } from './camera';
import { Interaction } from './interaction';
import { Renderer } from './renderer';
import { PALETTES } from './theme';

const PUBLISH_MS = 200;
/** Space reserved by floating chrome when framing the graph. */
const INSETS = { top: 72, right: 320, bottom: 96, left: 88 };

export function Viewport({ onZoom }: { onZoom: (scale: number) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const zoomCb = useRef(onZoom);
  useEffect(() => {
    zoomCb.current = onZoom;
  }, [onZoom]);

  useEffect(() => {
    const canvas = ref.current!;
    const store = useStore;
    const sim = new Simulation(1);
    sim.sync(store.getState().graph);
    const camera = new Camera();
    const renderer = new Renderer(canvas);

    let raf = 0;
    let running = false;
    let last = 0;
    let lastPublish = -Infinity;
    let lastZoom = 0;
    let needsPublish = true;

    const invalidate = () => {
      if (running) return;
      running = true;
      last = 0;
      raf = requestAnimationFrame(frame);
    };
    const interaction = new Interaction(canvas, camera, invalidate);

    function frame(now: number) {
      const dt = last ? Math.min(100, now - last) : 16.7;
      last = now;
      const s = store.getState();
      if (s.playing) sim.advance(dt * s.speed, 96);

      const camMoving = camera.update(dt);
      const animating = renderer.draw({
        graph: s.graph,
        selection: s.selection,
        sim,
        camera,
        palette: PALETTES[s.theme],
        overlay: interaction.overlay,
        dt,
      });

      if ((s.playing || needsPublish) && now - lastPublish >= PUBLISH_MS) {
        lastPublish = now;
        needsPublish = false;
        publish(sim, s.selection?.type === 'node' ? s.selection.id : null);
      }
      if (Math.abs(camera.zoomTarget - lastZoom) > 1e-3) {
        lastZoom = camera.zoomTarget;
        zoomCb.current(lastZoom);
      }

      if (s.playing || camMoving || animating || interaction.active || needsPublish) {
        raf = requestAnimationFrame(frame);
      } else {
        running = false;
      }
    }

    const fit = (instant = false) => {
      const b = bounds(store.getState().graph);
      const w = renderer.width;
      const h = renderer.height;
      if (!w || !h) return;
      const narrow = w < 720;
      const ins = narrow ? { top: 64, right: 24, bottom: 120, left: 24 } : INSETS;
      const availW = Math.max(100, w - ins.left - ins.right);
      const availH = Math.max(100, h - ins.top - ins.bottom);
      if (!b) {
        camera.flyTo(ins.left + availW / 2, ins.top + availH / 2, 1, instant);
      } else {
        const pad = 80;
        const scale = Math.min(1.25, availW / (b.maxX - b.minX + pad * 2), availH / (b.maxY - b.minY + pad * 2));
        const cx = (b.minX + b.maxX) / 2;
        const cy = (b.minY + b.maxY) / 2;
        camera.flyTo(ins.left + availW / 2 - cx * scale, ins.top + availH / 2 - cy * scale, scale, instant);
      }
      invalidate();
    };

    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      const first = renderer.width === 0;
      renderer.resize(width, height, Math.min(window.devicePixelRatio || 1, 2));
      if (first) fit(true);
      invalidate();
    });
    ro.observe(canvas);

    const unsub = store.subscribe((s, prev) => {
      if (s.graph !== prev.graph) {
        sim.sync(s.graph);
        needsPublish = true;
      }
      if (s.resetToken !== prev.resetToken) {
        sim.sync(s.graph);
        sim.reset(); // same seed: a reset replays the exact same run
        needsPublish = true;
      }
      if (s.fitToken !== prev.fitToken) fit();
      if (s.selection !== prev.selection || s.playing !== prev.playing) needsPublish = true;
      invalidate();
    });

    const dprQuery = matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    const onDpr = () => {
      renderer.resize(renderer.width, renderer.height, Math.min(window.devicePixelRatio || 1, 2));
      invalidate();
    };
    dprQuery.addEventListener('change', onDpr);

    viewport.beginPlace = (kind, e) => interaction.beginPlace(kind, e);
    viewport.addAtCenter = (kind) => interaction.addAtCenter(kind);
    viewport.zoomBy = (factor) => {
      camera.zoomAt(renderer.width / 2, renderer.height / 2, factor);
      invalidate();
    };
    viewport.exportPng = async () => {
      const blob = await renderer.toBlob();
      if (blob) download(`conduit-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.png`, blob);
    };

    invalidate();
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      unsub();
      dprQuery.removeEventListener('change', onDpr);
      interaction.dispose();
    };
  }, []);

  return <canvas ref={ref} className="absolute inset-0 h-full w-full touch-none select-none" aria-label="System design canvas" />;
}
