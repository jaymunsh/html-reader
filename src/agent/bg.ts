// Reports the page's effective background so the shell can paint the reader top strip with it (spec §6.6).
import type { AgentMsg } from '../lib/protocol';

const CLEAR = /^transparent$|^rgba\(.*,\s*0\)$|\/\s*0%?\)$/; // alpha 0 (an rgb() ending in ', 0)' is blue 0, not clear)

// html, then body, then the scroller: the first solid color wins; an image or gradient first means unknown (null).
function pageBg(scroller: Element): string | null {
  for (const el of [document.documentElement, document.body, scroller]) {
    if (!el) continue;
    const s = getComputedStyle(el);
    if (s.backgroundImage !== 'none') return null;
    if (!CLEAR.test(s.backgroundColor)) return s.backgroundColor;
  }
  return null;
}

/** Sends the color now and whenever it changes; the returned check is for the caller's own re-check points. */
export function watchBg(send: (m: AgentMsg) => void, scroller: () => Element): () => void {
  let last: string | null | undefined;
  let t: ReturnType<typeof setTimeout> | undefined;
  const check = () => {
    const c = pageBg(scroller());
    if (c !== last) send({ type: 'bg', color: (last = c) });
  };
  const soon = () => { clearTimeout(t); t = setTimeout(check, 100); };
  const mo = new MutationObserver(soon);
  for (const el of [document.documentElement, document.body]) if (el) mo.observe(el, { attributes: true, attributeFilter: ['class', 'style', 'data-theme'] });
  addEventListener('load', check);
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', soon);
  check();
  return check;
}
