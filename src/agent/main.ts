import { installGuards } from './guards';
import { installLinkHandling } from './links';
import { applyRestore, whenStable } from './restore';
import { findScroller, metrics, watchScroller } from './scroller';
import { parseShellMessage, wrap, type AgentMsg } from '../lib/protocol';

const script = document.currentScript as HTMLScriptElement | null;
const bookId = script?.dataset.book ?? '';
const scale = Number(script?.dataset.scale) || 1;
let currentScale = scale;

installGuards(bookId);

if (scale !== 1) document.documentElement.style.zoom = String(scale);

function isActive(): boolean {
  try {
    return window.parent !== window && window.parent === window.top
      && parent.location.origin === location.origin && parent.location.pathname === '/';
  } catch { return false; }
}

function bookPath(): string {
  let p = location.pathname.replace(/^\/book\/[^/]+\//, '');
  try { p = decodeURIComponent(p); } catch { /* keep raw */ }
  return p.normalize('NFC');
}

const send = (msg: AgentMsg) => parent.postMessage(wrap(msg), location.origin);

function start(): void {
  installLinkHandling(send);
  let el = findScroller();
  let queued = false;
  const target = () => (el === document.scrollingElement ? window : el);
  const report = () => {
    queued = false;
    const m = metrics(el);
    send({ type: 'scroll', pct: m.pct, ratio: m.ratio });
  };
  const onScroll = () => { if (!queued) { queued = true; requestAnimationFrame(report); } };
  const track = (next: Element) => {
    if (next === el) return;
    target().removeEventListener('scroll', onScroll);
    el = next;
    target().addEventListener('scroll', onScroll, { passive: true });
  };
  target().addEventListener('scroll', onScroll, { passive: true });
  watchScroller(track);

  send({ type: 'ready', path: bookPath(), title: document.title });

  addEventListener('message', (e) => {
    if (e.source !== parent || e.origin !== location.origin) return;
    const p = parseShellMessage(e.data);
    if (!p.ok || p.msg.type !== 'init') return;
    const { textScale, restore } = p.msg;
    if (textScale !== currentScale) {
      currentScale = textScale;
      document.documentElement.style.zoom = String(textScale);
    }
    const r = restore && ('scrollRatio' in restore ? restore.scrollRatio : 'bookmark' in restore ? restore.bookmark.scrollRatio : undefined);
    if (r !== undefined) applyRestore(() => el, r);
  });

  // First-screen progress even without scrolling; non-scrolling pages count as fully read.
  whenStable(() => { track(findScroller()); const m = metrics(el); send({ type: 'scroll', pct: m.pct, ratio: m.ratio }); });
}

if (isActive()) {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
}
