import { useState } from 'react';
import { Viewport } from './canvas/Viewport';
import { EmptyState, Help, Metrics, Toast, ZoomControls } from './ui/Hud';
import { Inspector } from './ui/Inspector';
import { Palette } from './ui/Palette';
import { TopBar } from './ui/TopBar';
import { useShortcuts } from './ui/useShortcuts';

export function App() {
  const [zoom, setZoom] = useState(1);
  useShortcuts();
  return (
    <main className="relative h-full w-full overflow-hidden bg-bg text-ink select-none">
      <Viewport onZoom={setZoom} />
      <EmptyState />
      <div className="pointer-events-none absolute inset-0">
        <TopBar />
        <Palette />
        <Inspector />
        <ZoomControls zoom={zoom} />
        <Metrics />
        <Toast />
      </div>
      <Help />
    </main>
  );
}
