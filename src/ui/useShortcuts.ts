import { useEffect } from 'react';
import { viewport } from '../canvas/api';
import { KINDS } from '../core/specs';
import { selectedNode, useStore } from '../state/store';

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || (t.tagName === 'INPUT' && (t as HTMLInputElement).type !== 'range') || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT');

export function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.defaultPrevented) return;
      const s = useStore.getState();
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();

      if (mod && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) s.redo();
        else s.undo();
        return;
      }
      if (mod && key === 'y') {
        e.preventDefault();
        s.redo();
        return;
      }
      if (mod && key === 'd') {
        e.preventDefault();
        s.duplicateSelection();
        return;
      }
      if (mod || e.altKey) return;

      switch (e.key) {
        case ' ':
          e.preventDefault();
          s.togglePlaying();
          return;
        case 'Backspace':
        case 'Delete':
          if (s.selection) {
            e.preventDefault();
            s.deleteSelection();
          }
          return;
        case 'Escape':
          if (s.helpOpen) s.setHelpOpen(false);
          else s.select(null);
          return;
        case '?':
          s.setHelpOpen(!s.helpOpen);
          return;
        case '+':
        case '=':
          viewport.zoomBy(1.25);
          return;
        case '-':
        case '_':
          viewport.zoomBy(1 / 1.25);
          return;
      }
      switch (key) {
        case 'f':
          s.fit();
          return;
        case 'r':
          s.resetSim();
          return;
        case 'x': {
          const n = selectedNode(s);
          if (n) s.updateNode(n.id, { down: !n.down });
          return;
        }
      }
      const index = Number(e.key) - 1;
      if (Number.isInteger(index) && KINDS[index]) viewport.addAtCenter(KINDS[index]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
