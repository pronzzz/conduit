import { useCallback, useState } from 'react';
import { viewport } from '../canvas/api';
import { TEMPLATES } from '../core/templates';
import { useLive } from '../state/live';
import { exportJson, pickJsonFile, shareUrl } from '../state/persistence';
import { useStore } from '../state/store';
import { Divider, IconButton, MenuItem, Popover, Segmented } from './controls';
import { clock } from './format';
import * as I from './icons';

const SPEEDS = [
  { value: 0.1, label: '⅒×', title: 'One tenth of real time' },
  { value: 0.25, label: '¼×', title: 'Quarter speed (default)' },
  { value: 0.5, label: '½×', title: 'Half speed' },
  { value: 1, label: '1×', title: 'Real time' },
  { value: 3, label: '3×', title: 'Fast forward' },
];

export function TopBar() {
  const playing = useStore((s) => s.playing);
  const speed = useStore((s) => s.speed);
  const theme = useStore((s) => s.theme);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const { togglePlaying, setSpeed, resetSim, setTheme, undo, redo, setHelpOpen } = useStore.getState();

  return (
    <header className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start justify-between gap-2 p-3">
      <div className="panel pointer-events-auto flex h-11 items-center gap-1 rounded-xl pr-1 pl-3 max-sm:pr-3">
        <span className="flex items-center gap-2 pr-1 text-ink">
          <I.Logo />
          <span className="hidden text-[13px] font-semibold tracking-tight sm:inline">Conduit</span>
        </span>
        <div className="flex items-center gap-1 max-sm:hidden">
          <Divider />
          <IconButton label="Undo" shortcut="⌘Z" onClick={undo} disabled={!canUndo}>
            <I.Undo />
          </IconButton>
          <IconButton label="Redo" shortcut="⇧⌘Z" onClick={redo} disabled={!canRedo}>
            <I.Redo />
          </IconButton>
        </div>
      </div>

      <div className="panel pointer-events-auto flex h-11 items-center gap-1.5 rounded-xl px-1.5">
        <button
          type="button"
          onClick={togglePlaying}
          title={playing ? 'Pause  (Space)' : 'Run  (Space)'}
          className={`press flex h-8 items-center gap-1.5 rounded-lg pr-3 pl-2.5 text-xs font-semibold ${
            playing ? 'bg-control-hover text-ink hover:bg-control' : 'bg-ink text-bg hover:opacity-90'
          }`}
        >
          {playing ? <I.Pause size={14} /> : <I.Play size={14} />}
          <span className="w-9 text-left">{playing ? 'Pause' : 'Run'}</span>
        </button>
        <div className="hidden md:block">
          <Segmented label="Simulation speed" size="sm" value={speed} options={SPEEDS} onChange={setSpeed} />
        </div>
        <Clock />
        <IconButton label="Reset traffic" shortcut="R" onClick={resetSim}>
          <I.Reset />
        </IconButton>
      </div>

      <div className="panel pointer-events-auto flex h-11 items-center gap-0.5 rounded-xl px-1">
        <TemplatesMenu />
        <ShareMenu />
        <Divider />
        <IconButton label={theme === 'dark' ? 'Light theme' : 'Dark theme'} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
          {theme === 'dark' ? <I.Sun /> : <I.Moon />}
        </IconButton>
        <IconButton label="Shortcuts and help" shortcut="?" onClick={() => setHelpOpen(true)} className="hidden sm:grid">
          <I.Help />
        </IconButton>
      </div>
    </header>
  );
}

function Clock() {
  const time = useLive().summary.time;
  return <span className="num hidden w-14 text-center text-xs text-muted lg:inline">{clock(time)}</span>;
}

function TemplatesMenu() {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <div className="relative">
      <IconButton label="Templates" active={open} onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}>
        <I.Layers />
      </IconButton>
      <Popover open={open} onClose={close} className="w-72">
        <div className="px-2.5 pt-1.5 pb-1 text-[11px] font-medium tracking-wide text-muted uppercase">Templates</div>
        {TEMPLATES.map((t) => (
          <MenuItem
            key={t.id}
            hint={t.description}
            onSelect={() => {
              useStore.getState().loadGraph(t.build());
              close();
            }}
          >
            {t.name}
          </MenuItem>
        ))}
      </Popover>
    </div>
  );
}

function ShareMenu() {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const run = (fn: () => void | Promise<void>) => async () => {
    close();
    await fn();
  };
  const { notify } = useStore.getState();

  return (
    <div className="relative">
      <IconButton label="Share and export" active={open} onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}>
        <I.Share />
      </IconButton>
      <Popover open={open} onClose={close}>
        <MenuItem
          icon={<I.Link />}
          hint="The design lives in the link; nothing is uploaded"
          onSelect={run(async () => {
            const url = await shareUrl(useStore.getState().graph);
            try {
              await navigator.clipboard.writeText(url);
              notify('Link copied');
            } catch {
              window.prompt('Copy this link', url);
            }
          })}
        >
          Copy share link
        </MenuItem>
        <MenuItem icon={<I.Image />} onSelect={run(() => viewport.exportPng())}>
          Export PNG
        </MenuItem>
        <MenuItem icon={<I.Download />} onSelect={run(() => exportJson(useStore.getState().graph))}>
          Export JSON
        </MenuItem>
        <MenuItem
          icon={<I.Upload />}
          onSelect={run(async () => {
            const g = await pickJsonFile();
            if (g) {
              useStore.getState().loadGraph(g);
              notify(`Imported ${g.nodes.length} nodes`);
            } else notify('That file is not a valid design', 'danger');
          })}
        >
          Import JSON
        </MenuItem>
      </Popover>
    </div>
  );
}
