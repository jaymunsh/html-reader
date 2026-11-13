// Find a search hit in the live DOM, scroll it to the vertical centre and briefly highlight it (spec P3).
import { findScroller } from './scroller';

// One base char plus the marks / Hangul medial+final jamo NFC may fold into it: normalizing per cluster keeps an offset map.
const CLUSTER = /[^\p{M}\u1161-\u1175\u11a8-\u11c2][\p{M}\u1161-\u1175\u11a8-\u11c2]*|[\s\S]/gu;

// NFC + lowercase with ALL whitespace removed (the index turns tags into spaces, the DOM joins text nodes with nothing).
// `at(start, end)` is called once per output UTF-16 unit with the source cluster's offsets.
function fold(s: string, at: (start: number, end: number) => void = () => {}): string {
  let out = '';
  for (const m of s.matchAll(CLUSTER)) {
    const o = m.index!;
    for (const c of m[0].normalize('NFC').toLowerCase()) {
      if (/\s/.test(c)) continue;
      out += c;
      for (let k = 0; k < c.length; k++) at(o, o + m[0].length);
    }
  }
  return out;
}

let styled = false;
let timer: ReturnType<typeof setTimeout> | undefined;

export function findAndReveal(query: string, snippet: string): boolean {
  const q = fold(query);
  if (!q) return false;
  const nodes: Text[] = [], starts: number[] = [], ends: number[] = [];
  let text = '';
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.parentElement?.closest('script,style,template,noscript') ? 2 : 1),
  });
  for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
    const node = n;
    text += fold(node.data, (s, e) => { nodes.push(node); starts.push(s); ends.push(e); });
  }
  const sn = fold(snippet), si = sn.indexOf(q);
  const before = si < 0 ? '' : sn.slice(0, si), after = si < 0 ? '' : sn.slice(si + q.length);
  let best = -1, bestScore = -1;
  for (let i = text.indexOf(q); i !== -1; i = text.indexOf(q, i + 1)) {
    let a = 0, b = 0;
    while (a < before.length && a < i && before[before.length - 1 - a] === text[i - 1 - a]) a++;
    while (b < after.length && after[b] === text[i + q.length + b]) b++;
    if (a + b > bestScore) { best = i; bestScore = a + b; }
  }
  if (best < 0) return false;
  const j = best + q.length - 1;
  const range = document.createRange();
  range.setStart(nodes[best], starts[best]);
  range.setEnd(nodes[j], ends[j]);

  const el = findScroller();
  const r = range.getBoundingClientRect();
  const top = el === document.scrollingElement ? 0 : el.getBoundingClientRect().top;
  el.scrollTop += r.top + r.height / 2 - top - el.clientHeight / 2;

  if ('highlights' in CSS) {
    if (!styled) {
      styled = true;
      const st = document.createElement('style');
      st.textContent = '::highlight(hr-find){background:#ffe08a;color:#15181e}';
      (document.head ?? document.documentElement).append(st);
    }
    CSS.highlights.set('hr-find', new Highlight(range));
    clearTimeout(timer);
    timer = setTimeout(() => CSS.highlights.delete('hr-find'), 2500);
  }
  return true;
}
