import { splitBookUrl } from '../lib/path';

export interface ContextInput {
  isNavigation: boolean;
  destination: string;
  targetPathname: string;
  targetSameOrigin: boolean;
  referrerPathname: string | null;
  client: { pathname: string | null; frameType: string | null; type: string } | null;
}

export interface PickedContext {
  bookId: string | null;
  useFallback: boolean;
}

const NONE: PickedContext = { bookId: null, useFallback: false };
const FALLBACK: PickedContext = { bookId: null, useFallback: true };

function isAppPath(p: string): boolean {
  return p === '/' || p.startsWith('/__app/') || p.startsWith('/__reader/');
}

/** §5.1 — decides which book a request belongs to. useFallback: caller uses settings.activeBookId. */
export function pickContext(i: ContextInput): PickedContext {
  if (i.isNavigation) {
    if (i.destination !== 'iframe' && i.destination !== 'frame') return NONE;
    const t = i.targetSameOrigin ? splitBookUrl(i.targetPathname) : null;
    if (t) return { bookId: t.bookId, useFallback: false };
    const r = i.referrerPathname !== null ? splitBookUrl(i.referrerPathname) : null;
    if (r) return { bookId: r.bookId, useFallback: false };
    return FALLBACK;
  }
  const p = i.client?.pathname;
  if (p == null) return FALLBACK;
  const b = splitBookUrl(p);
  if (b) return { bookId: b.bookId, useFallback: false };
  // The app shell and the app's own workers (e.g. Import Worker) are not book contexts.
  if (isAppPath(p)) return NONE;
  return FALLBACK;
}
