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

export function applyRestore(getScroller: () => Element, ratio: number): void {
  const apply = () => scrollToRatio(getScroller(), ratio);
  apply();
  const abort = () => stop();
  const stop = settle(apply, () => { for (const t of INPUTS) removeEventListener(t, abort, true); });
  for (const t of INPUTS) addEventListener(t, abort, { capture: true, passive: true });
}
