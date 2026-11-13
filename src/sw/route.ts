import { splitBookUrl } from '../lib/path';

export interface RouteInput {
  url: URL;
  selfOrigin: string;
  method: string;
  isNavigation: boolean;
  destination: string;
  ctxBookId: string | null;
}

export type Route =
  | { kind: 'reader-asset' }
  | { kind: 'top-redirect'; to: string }
  | { kind: 'book-redirect'; to: string }
  | { kind: 'book-file'; bookId: string; rest: string; ctxBookId: string | null }
  | { kind: 'external'; bookId: string }
  | { kind: 'app-asset' }
  | { kind: 'app-shell' }
  | { kind: 'passthrough' };

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** §5.2 — decides how to serve a request. */
export function decideRoute(i: RouteInput): Route {
  // i.method is intentionally ignored: there is no server, and book context always maps into the book.
  const { url, ctxBookId } = i;
  if (url.origin !== i.selfOrigin) {
    return ctxBookId ? { kind: 'external', bookId: ctxBookId } : { kind: 'passthrough' };
  }
  const p = url.pathname;
  if (p.startsWith('/__reader/')) return { kind: 'reader-asset' };

  const book = splitBookUrl(p);
  if (book && i.isNavigation && i.destination === 'document') {
    const qs = new URLSearchParams({ open: book.bookId, path: safeDecode(book.rest) });
    return { kind: 'top-redirect', to: `/?${qs.toString()}` };
  }
  // /book/<id> without a slash would resolve relative links against /book/.
  if (i.isNavigation && /^\/book\/[^/]+$/.test(p)) return { kind: 'book-redirect', to: `${p}/${url.search}` };
  if (!book && ctxBookId) {
    if (i.isNavigation) return { kind: 'book-redirect', to: `/book/${ctxBookId}${p}${url.search}` };
    return { kind: 'book-file', bookId: ctxBookId, rest: p.slice(1), ctxBookId };
  }
  if (book) return { kind: 'book-file', bookId: book.bookId, rest: book.rest, ctxBookId };

  if (p === '/' || p === '/index.html') return { kind: 'app-shell' };
  if (p.startsWith('/__app/')) return { kind: 'app-asset' };
  if (i.isNavigation) return { kind: 'app-shell' };
  return { kind: 'passthrough' };
}
