// Finds and measures the element that scrolls the book (spec §6.4).

const root = () => document.scrollingElement ?? document.documentElement;
const range = (el: Element) => el.scrollHeight - el.clientHeight;
// The root scrolls only if neither html nor body clips it (spec §6.4).
const rootLocked = () => [document.documentElement, document.body].some((e) => e && /hidden|clip/.test(getComputedStyle(e).overflowY));

// Root, unless it cannot scroll or the inner scroller with the largest visible area has a larger scroll range.
export function findScroller(): Element {
  const r = root();
  const rootRange = rootLocked() ? 0 : range(r);
  let best: Element | null = null;
  let bestArea = 0;
  for (const el of document.body?.querySelectorAll('*') ?? []) {
    if (range(el) <= 0) continue;
    const oy = getComputedStyle(el).overflowY;
    if (oy !== 'auto' && oy !== 'scroll') continue;
    const b = el.getBoundingClientRect();
    const w = Math.min(b.right, innerWidth) - Math.max(b.left, 0);
    const h = Math.min(b.bottom, innerHeight) - Math.max(b.top, 0);
    const area = Math.max(0, w) * Math.max(0, h);
    if (area > bestArea) { best = el; bestArea = area; }
  }
  return best && range(best) > rootRange ? best : r;
}

export function metrics(el: Element): { pct: number; ratio: number; scrollable: boolean } {
  const rg = el === root() && rootLocked() ? 0 : range(el);
  if (!(rg > 0)) return { pct: 100, ratio: 0, scrollable: false };
  const clamp = (v: number, max: number) => Math.min(max, Math.max(0, v));
  return {
    pct: clamp(((el.scrollTop + el.clientHeight) / el.scrollHeight) * 100, 100),
    ratio: clamp(el.scrollTop / rg, 1),
    scrollable: true,
  };
}

export function scrollToRatio(el: Element, ratio: number): void {
  el.scrollTop = ratio * (el.scrollHeight - el.clientHeight);
}

export function watchScroller(onChange: (el: Element) => void): void {
  let t: ReturnType<typeof setTimeout> | undefined;
  const ro = new ResizeObserver(() => {
    clearTimeout(t);
    t = setTimeout(() => onChange(findScroller()), 300);
  });
  ro.observe(document.documentElement);
  if (document.body) ro.observe(document.body);
}
