// Position restore for late-growing pages (spec §6.7-3).
import { scrollToRatio } from './scroller';

const QUIET_MS = 500;
const MAX_MS = 3000;

// Runs onChange on every size change after load; calls done after QUIET_MS without change or MAX_MS.
// Returns a stop function (calls done once).
function settle(onChange: () => void, done: () => void): () => void {
  let quiet: ReturnType<typeof setTimeout> | undefined;
  let cap: ReturnType<typeof setTimeout> | undefined;
  let ro: ResizeObserver | undefined;
  let over = false;
  const stop = () => {
    if (over) return;
    over = true;
    clearTimeout(quiet); clearTimeout(cap); ro?.disconnect();
    removeEventListener('load', begin);
    done();
  };
  const bump = () => { clearTimeout(quiet); quiet = setTimeout(stop, QUIET_MS); };
  function begin() {
    if (over) return;
    cap = setTimeout(stop, MAX_MS);
    ro = new ResizeObserver(() => { onChange(); bump(); });
    ro.observe(document.documentElement);
    if (document.body) ro.observe(document.body);
    bump();
  }
  if (document.readyState === 'complete') begin(); else addEventListener('load', begin, { once: true });
  return stop;
}

export function whenStable(cb: () => void): void {
  settle(() => {}, cb);
}

const INPUTS = ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const;

// Calls cb once on the first user input (spec §6.7-3: manual scrolling stops re-applying). Returns an unsubscribe.
export function onUserInput(cb: () => void): () => void {
  const off = () => { for (const t of INPUTS) removeEventListener(t, h, true); };
  const h = () => { off(); cb(); };
  for (const t of INPUTS) addEventListener(t, h, { capture: true, passive: true });
  return off;
}

export function applyRestore(getScroller: () => Element, ratio: number): void {
  const apply = () => scrollToRatio(getScroller(), ratio);
  apply();
  const stop = settle(apply, () => off());
  const off = onUserInput(stop);
}
