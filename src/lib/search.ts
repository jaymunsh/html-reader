import { orderedPages } from './file-tree';
import { getBook } from './storage/books';
import { getTexts } from './storage/records';

export const SNIPPET_CONTEXT = 40;
export const MAX_HITS_PER_PAGE = 20;
export const SEARCH_DEBOUNCE_MS = 200;
/** Rendered hits per "more" step in the search panel (all groups together). */
export const RENDER_HIT_STEP = 200;

export interface SearchHit { before: string; match: string; after: string }
export interface SearchGroup { path: string; total: number; hits: SearchHit[] }

/** NFC + per-code-unit lowercase; units whose lowercase changes length (e.g. İ) stay as-is, so length is preserved. */
export function foldCase(s: string): string {
  let out = '';
  for (const c of s.normalize('NFC')) out += c.length > 1 ? c : (c.toLowerCase().length === 1 ? c.toLowerCase() : c);
  return out;
}

/**
 * Same result as foldCase for NFC input, but one native toLowerCase when that provably keeps offsets: the length must
 * not change and there must be no capital sigma (its lowercase depends on context; per-unit folding does not).
 */
function fold(nfc: string): string {
  const lower = nfc.toLowerCase();
  return lower.length === nfc.length && !nfc.includes('Σ') ? lower : foldCase(nfc);
}

const isHigh = (c: number) => c >= 0xd800 && c <= 0xdbff;
const isLow = (c: number) => c >= 0xdc00 && c <= 0xdfff;

/** A book's texts, NFC-normalized and folded once; reuse it for every query. */
export interface PreparedPage { text: string; folded: string }
export type PreparedTexts = Map<string, PreparedPage>;

export function prepareTexts(texts: { path: string; text: string }[]): PreparedTexts {
  const m: PreparedTexts = new Map();
  for (const t of texts) {
    const text = t.text.normalize('NFC');
    m.set(t.path, { text, folded: fold(text) });
  }
  return m;
}

export function searchPrepared(prepared: PreparedTexts, query: string, pageOrder: string[]): SearchGroup[] {
  const q = fold(query.trim().normalize('NFC'));
  if (!q) return [];
  const groups: SearchGroup[] = [];
  for (const path of pageOrder) {
    const page = prepared.get(path);
    if (!page) continue;
    const { text, folded } = page;
    const hits: SearchHit[] = [];
    let total = 0;
    for (let i = folded.indexOf(q); i !== -1; i = folded.indexOf(q, i + q.length)) {
      total++;
      if (hits.length >= MAX_HITS_PER_PAGE) continue;
      const end = i + q.length;
      let b = Math.max(0, i - SNIPPET_CONTEXT), e = Math.min(text.length, end + SNIPPET_CONTEXT);
      if (b > 0 && isLow(text.charCodeAt(b))) b++;
      if (e < text.length && isHigh(text.charCodeAt(e - 1))) e--;
      hits.push({ before: text.slice(b, i), match: text.slice(i, end), after: text.slice(end, e) });
    }
    if (total) groups.push({ path, total, hits });
  }
  return groups;
}

export function searchTexts(texts: { path: string; text: string }[], query: string, pageOrder: string[]): SearchGroup[] {
  return searchPrepared(prepareTexts(texts), query, pageOrder);
}

export const hitSnippet = (h: SearchHit): string => h.before + h.match + h.after;

/** The groups trimmed to `limit` hits in total (page order), for rendering. */
export function capGroups(groups: SearchGroup[], limit: number): { groups: SearchGroup[]; shown: number; all: number } {
  let left = limit, all = 0;
  const out: SearchGroup[] = [];
  for (const g of groups) {
    all += g.hits.length;
    if (left <= 0) continue;
    const hits = g.hits.length <= left ? g.hits : g.hits.slice(0, left);
    left -= hits.length;
    out.push(hits === g.hits ? g : { ...g, hits });
  }
  return { groups: out, shown: limit - Math.max(left, 0), all };
}

// One book at a time: prepared texts keyed by book id + cache name (a replace import changes the cache name).
let memo: { key: string; prepared: Promise<PreparedTexts> } | null = null;

export async function searchBook(bookId: string, query: string): Promise<SearchGroup[]> {
  const book = await getBook(bookId);
  if (!book) return [];
  const key = `${bookId}\0${book.cacheName}`;
  let cur = memo;
  if (cur?.key !== key) {
    const prepared = getTexts(bookId).then(prepareTexts);
    cur = memo = { key, prepared };
    prepared.catch(() => { if (memo?.prepared === prepared) memo = null; }); // a failed read is retried by the next query
  }
  return searchPrepared(await cur.prepared, query, orderedPages(book.pagePaths));
}

export function resetSearchCache(): void { memo = null; }
