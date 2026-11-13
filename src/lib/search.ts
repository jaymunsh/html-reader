import { orderedPages } from './file-tree';
import { getBook } from './storage/books';
import { getTexts } from './storage/records';

export const SNIPPET_CONTEXT = 40;
export const MAX_HITS_PER_PAGE = 20;
export const SEARCH_DEBOUNCE_MS = 200;

export interface SearchHit { before: string; match: string; after: string }
export interface SearchGroup { path: string; total: number; hits: SearchHit[] }

/** NFC + per-code-unit lowercase; units whose lowercase changes length (e.g. İ) stay as-is, so length is preserved. */
export function foldCase(s: string): string {
  let out = '';
  for (const c of s.normalize('NFC')) out += c.length > 1 ? c : (c.toLowerCase().length === 1 ? c.toLowerCase() : c);
  return out;
}

const isHigh = (c: number) => c >= 0xd800 && c <= 0xdbff;
const isLow = (c: number) => c >= 0xdc00 && c <= 0xdfff;

export function searchTexts(texts: { path: string; text: string }[], query: string, pageOrder: string[]): SearchGroup[] {
  const q = foldCase(query.trim());
  if (!q) return [];
  const byPath = new Map(texts.map((t) => [t.path, t.text]));
  const groups: SearchGroup[] = [];
  for (const path of pageOrder) {
    const raw = byPath.get(path);
    if (raw === undefined) continue;
    const text = raw.normalize('NFC');
    const folded = foldCase(text);
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

export const hitSnippet = (h: SearchHit): string => h.before + h.match + h.after;

export async function searchBook(bookId: string, query: string): Promise<SearchGroup[]> {
  const [texts, book] = await Promise.all([getTexts(bookId), getBook(bookId)]);
  return book ? searchTexts(texts, query, orderedPages(book.pagePaths)) : [];
}
