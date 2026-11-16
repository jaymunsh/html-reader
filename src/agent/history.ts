// The frame's session history stays flat: the shell owns history (back leaves the reader in one step), so nothing inside
// the book may add an entry under the shell's reader entry. The document's own history API keeps working on a stack the
// agent keeps in the real sessionStorage (the shell clears it when a book opens): back / forward / go traverse it with
// location.replace, a pushState adds to it, and going back past the first page does nothing (never pops the shell's entry).

import { frameHistoryKey } from '../lib/frame-history';

type Entry = { u: string; d: string };               // url, id of the document that recorded it
type Stack = { e: Entry[]; i: number; t?: number };  // t: target of a cross-document traversal in flight

const MAX = 100;
const DOC = Math.random().toString(36).slice(2);
const states = new Map<string, unknown>(); // history.state of this document's same-document entries, by url
const noHash = (u: string) => u.replace(/#.*$/, '');

export function installHistory(store: Storage | null, bookId: string): void {
  const key = frameHistoryKey(bookId);
  const H = History.prototype;
  const realReplace = H.replaceState;
  const read = (): Stack => {
    try {
      const s = JSON.parse(store?.getItem(key) ?? '') as Stack;
      if (Array.isArray(s.e) && typeof s.i === 'number') return s;
    } catch { /* empty or foreign */ }
    return { e: [], i: -1 };
  };
  const write = (s: Stack) => { try { store?.setItem(key, JSON.stringify(s)); } catch { /* storage full or blocked */ } };

  /** The document is at a URL now: a traversal landing, a replace of the current entry, a reload, or a new entry. */
  const record = (replace = false) => {
    const s = read(), u = location.href, cur = s.e[s.i];
    if (s.t !== undefined && s.e[s.t]?.u === u) { s.i = s.t; s.e[s.i].d = DOC; }
    else if ((replace || cur?.u === u) && cur) { cur.u = u; cur.d = DOC; }
    else {
      s.e = s.e.slice(0, s.i + 1).concat({ u, d: DOC });
      const over = s.e.length - MAX;
      if (over > 0) s.e.splice(0, over);
      s.i = s.e.length - 1;
    }
    delete s.t;
    write(s);
  };

  const go = (n?: unknown) => {
    const k = Math.trunc(Number(n)) || 0;
    if (!k) { location.reload(); return; }
    const s = read(), t = s.i + k, to = s.e[t];
    if (!to) return;
    if (to.d === DOC) {                                    // same document: hash or pushState entries
      s.i = t; write(s);
      if (noHash(to.u) === noHash(location.href)) location.replace(to.u); // fragment navigation: hashchange as usual
      else {
        realReplace.call(history, states.get(to.u) ?? null, '', to.u);
        dispatchEvent(new PopStateEvent('popstate', { state: history.state }));
      }
      return;
    }
    s.t = t; write(s);
    location.replace(to.u);
  };

  const def = (name: string, value: unknown) => {
    try { Object.defineProperty(H, name, { configurable: true, writable: true, value }); } catch { /* ignore */ }
  };
  def('back', () => go(-1));
  def('forward', () => go(1));
  def('go', go);
  def('pushState', function (this: History, data: unknown, unused: string, url?: string | URL | null) {
    realReplace.call(this, data, unused, url);
    states.set(location.href, data);
    record();
  });
  def('replaceState', function (this: History, data: unknown, unused: string, url?: string | URL | null) {
    realReplace.call(this, data, unused, url);
    states.set(location.href, data);
    record(true);
  });
  addEventListener('hashchange', () => record());
  addEventListener('popstate', () => record()); // only real entries (browsers without the Navigation API)
  record();

  // Navigation API (Chromium, Safari 26+): every same-origin push (links, location.href / assign / hash, GET forms) becomes
  // a replace. Without it, links are replaced by links.ts and script navigations still add frame entries.
  const nav = (window as unknown as { navigation?: EventTarget }).navigation;
  nav?.addEventListener('navigate', (ev) => {
    const e = ev as Event & { navigationType: string; cancelable: boolean; formData: unknown; downloadRequest: unknown; destination: { url: string } };
    if (e.navigationType !== 'push' || !e.cancelable || e.formData || e.downloadRequest) return;
    let u: URL;
    try { u = new URL(e.destination.url); } catch { return; }
    if (u.origin !== location.origin) return;
    e.preventDefault();
    location.replace(u.href);
  });
}
