// Shell <-> agent message protocol. Hand-written validators (agent size budget).
export const PROTOCOL_VERSION = 1;
export const APP_TAG = 'html-reader';
export type Mods = { ctrl: boolean; meta: boolean; alt: boolean; shift: boolean };
export type AgentMsg =
  | { type: 'ready'; path: string; title: string }
  | { type: 'scroll'; pct: number; ratio: number }
  | { type: 'tap' }
  | { type: 'key'; key: string; mods: Mods }
  | { type: 'open-external'; url: string }
  | { type: 'bg'; color: string | null }; // computed background of the page (raw CSS string; the shell sanitizes it)
export type Restore = { scrollRatio: number } | { find: { query: string; snippet: string } } | { bookmark: { scrollRatio: number } };
export type ShellMsg =
  | { type: 'init'; textScale: number; restore?: Restore }
  | { type: 'scroll-to'; ratio: number }
  | { type: 'set-scale'; textScale: number }
  | { type: 'find'; query: string; snippet: string };
export type Envelope<T> = T & { app: typeof APP_TAG; protocolVersion: number };
export type Parsed<T> = { ok: true; msg: T } | { ok: false; reason: 'foreign' | 'version' | 'invalid' };

export function wrap<T extends AgentMsg | ShellMsg>(msg: T): Envelope<T> {
  return { app: APP_TAG, protocolVersion: PROTOCOL_VERSION, ...msg };
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null;
const str = (v: unknown): v is string => typeof v === 'string';
const num = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const SAFE_URL = /^(https?|mailto|tel):/i;

function envelope(data: unknown): { ok: false; reason: 'foreign' | 'version' } | { ok: true; o: Obj } {
  // A missing protocolVersion is not a mismatch: such a message is simply not ours to handle (foreign/ignored).
  if (!isObj(data) || data.app !== APP_TAG || typeof data.protocolVersion !== 'number') return { ok: false, reason: 'foreign' };
  if (data.protocolVersion !== PROTOCOL_VERSION) return { ok: false, reason: 'version' };
  return { ok: true, o: data };
}

function agent(o: Obj): AgentMsg | null {
  switch (o.type) {
    case 'ready': return str(o.path) && str(o.title) ? { type: 'ready', path: o.path, title: o.title } : null;
    case 'scroll': return num(o.pct, 0, 100) && num(o.ratio, 0, 1) ? { type: 'scroll', pct: o.pct, ratio: o.ratio } : null;
    case 'tap': return { type: 'tap' };
    case 'key': {
      const m = o.mods;
      if (!str(o.key) || !isObj(m)) return null;
      const { ctrl, meta, alt, shift } = m;
      if (typeof ctrl !== 'boolean' || typeof meta !== 'boolean' || typeof alt !== 'boolean' || typeof shift !== 'boolean') return null;
      return { type: 'key', key: o.key, mods: { ctrl, meta, alt, shift } };
    }
    case 'open-external': return str(o.url) && SAFE_URL.test(o.url) ? { type: 'open-external', url: o.url } : null;
    case 'bg': return o.color === null || (str(o.color) && o.color.length <= 64) ? { type: 'bg', color: o.color } : null;
  }
  return null;
}

function restore(r: unknown): Restore | null {
  if (!isObj(r)) return null;
  if ('scrollRatio' in r) return num(r.scrollRatio, 0, 1) ? { scrollRatio: r.scrollRatio } : null;
  if (isObj(r.find)) return str(r.find.query) && str(r.find.snippet) ? { find: { query: r.find.query, snippet: r.find.snippet } } : null;
  if (isObj(r.bookmark)) return num(r.bookmark.scrollRatio, 0, 1) ? { bookmark: { scrollRatio: r.bookmark.scrollRatio } } : null;
  return null;
}

function shell(o: Obj): ShellMsg | null {
  switch (o.type) {
    case 'init': {
      if (!num(o.textScale, 0.5, 3)) return null;
      if (o.restore === undefined) return { type: 'init', textScale: o.textScale };
      const r = restore(o.restore);
      return r ? { type: 'init', textScale: o.textScale, restore: r } : null;
    }
    case 'scroll-to': return num(o.ratio, 0, 1) ? { type: 'scroll-to', ratio: o.ratio } : null;
    case 'set-scale': return num(o.textScale, 0.5, 3) ? { type: 'set-scale', textScale: o.textScale } : null;
    case 'find': return str(o.query) && str(o.snippet) ? { type: 'find', query: o.query, snippet: o.snippet } : null;
  }
  return null;
}

export function parseAgentMessage(data: unknown): Parsed<AgentMsg> {
  const e = envelope(data);
  if (!e.ok) return e;
  const msg = agent(e.o);
  return msg ? { ok: true, msg } : { ok: false, reason: 'invalid' };
}

export function parseShellMessage(data: unknown): Parsed<ShellMsg> {
  const e = envelope(data);
  if (!e.ok) return e;
  const msg = shell(e.o);
  return msg ? { ok: true, msg } : { ok: false, reason: 'invalid' };
}
