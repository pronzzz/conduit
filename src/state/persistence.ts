import { normalizeGraph } from '../core/graph';
import type { Graph } from '../core/types';

const KEY = 'conduit:v1';
const HASH = '#g=';

interface Saved {
  graph: Graph;
  theme?: 'light' | 'dark';
  speed?: number;
}

export function loadLocal(): Partial<Saved> {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const data = JSON.parse(raw) as Partial<Saved>;
    const graph = normalizeGraph(data.graph) ?? undefined;
    return {
      graph,
      theme: data.theme === 'light' || data.theme === 'dark' ? data.theme : undefined,
      speed: typeof data.speed === 'number' ? data.speed : undefined,
    };
  } catch {
    return {};
  }
}

export function saveLocal(data: Saved) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // Private mode or quota: autosave is a convenience, so ignore.
  }
}

// ─── Share links ────────────────────────────────────────────────────────────
// Graphs are deflated and base64url-encoded into the URL hash, so nothing
// leaves the browser.

const toB64 = (bytes: Uint8Array) => {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromB64 = (str: string) => {
  const s = atob(str.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
};

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream) {
  const res = new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream));
  return new Uint8Array(await res.arrayBuffer());
}

/** Compact positional form keeps links short. */
function pack(g: Graph) {
  const index = new Map(g.nodes.map((n, i) => [n.id, i]));
  return {
    v: 1,
    n: g.nodes.map((n) => [n.kind, Math.round(n.x), Math.round(n.y), n.label, n.down ? 1 : 0, n.config]),
    e: g.edges.map((e) => [index.get(e.from), index.get(e.to)]),
  };
}

function unpack(raw: unknown): Graph | null {
  const p = raw as { v?: number; n?: unknown[][]; e?: unknown[][] };
  if (p?.v !== 1 || !Array.isArray(p.n)) return null;
  const nodes = p.n.map((n, i) => ({ id: `n${i}`, kind: n[0], x: n[1], y: n[2], label: n[3], down: n[4] === 1, config: n[5] }));
  const edges = (Array.isArray(p.e) ? p.e : []).map((e) => ({ from: `n${e[0]}`, to: `n${e[1]}` }));
  return normalizeGraph({ nodes, edges });
}

export async function encodeShare(g: Graph): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(pack(g)));
  if (typeof CompressionStream === 'undefined') return 'j' + toB64(json);
  return 'z' + toB64(await pipe(json, new CompressionStream('deflate-raw')));
}

export async function decodeShare(code: string): Promise<Graph | null> {
  try {
    const bytes = fromB64(code.slice(1));
    const json = code[0] === 'z' ? await pipe(bytes, new DecompressionStream('deflate-raw')) : bytes;
    return unpack(JSON.parse(new TextDecoder().decode(json)));
  } catch {
    return null;
  }
}

export function shareCodeFromUrl(): string | null {
  return location.hash.startsWith(HASH) ? location.hash.slice(HASH.length) : null;
}

export async function shareUrl(g: Graph) {
  return `${location.origin}${location.pathname}${HASH}${await encodeShare(g)}`;
}

export function clearShareHash() {
  history.replaceState(null, '', location.pathname + location.search);
}

// ─── Files ──────────────────────────────────────────────────────────────────

export function download(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportJson(g: Graph) {
  download('conduit-design.json', new Blob([JSON.stringify({ app: 'conduit', version: 1, ...g }, null, 2)], { type: 'application/json' }));
}

export function pickJsonFile(): Promise<Graph | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      try {
        resolve(normalizeGraph(JSON.parse(await file.text())));
      } catch {
        resolve(null);
      }
    };
    input.click();
  });
}
