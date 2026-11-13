// Finds and measures the element that scrolls the book (spec §6.4).

export function findScroller(): Element {
  const root = document.scrollingElement ?? document.documentElement;
  if (root.scrollHeight > root.clientHeight) return root;
  let best: Element = root;
  let bestArea = 0;
  for (const el of document.body?.querySelectorAll('*') ?? []) {
    if (el.scrollHeight <= el.clientHeight) continue;
    const oy = getComputedStyle(el).overflowY;
    if (oy !== 'auto' && oy !== 'scroll') continue;
    const r = el.getBoundingClientRect();
    const w = Math.min(r.right, innerWidth) - Math.max(r.left, 0);
    const h = Math.min(r.bottom, innerHeight) - Math.max(r.top, 0);
    const area = Math.max(0, w) * Math.max(0, h);
    if (area > bestArea) { best = el; bestArea = area; }
  }
  return best;
}

export function metrics(el: Element): { pct: number; ratio: number; scrollable: boolean } {
  const range = el.scrollHeight - el.clientHeight;
  if (!(range > 0)) return { pct: 100, ratio: 0, scrollable: false };
  const clamp = (v: number, max: number) => Math.min(max, Math.max(0, v));
  return {
    pct: clamp(((el.scrollTop + el.clientHeight) / el.scrollHeight) * 100, 100),
    ratio: clamp(el.scrollTop / range, 1),
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
