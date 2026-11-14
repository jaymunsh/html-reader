import { cacheKey } from '../path';
import type { Book, BookFiles, TextRecord } from '../storage';
import type { ReplacePlan } from '../reimport';

/** Worker -> page: everything is in the Cache API; the page verifies and commits to IndexedDB. */
export interface ReadyPayload {
  book: Book;
  bookFiles: BookFiles;
  texts: TextRecord[];
  cacheName: string;
  entrySize: number;
  /** Title before de-duplication; the page re-dedupes it against the current list inside the lock. */
  baseTitle: string;
  /** Set for a replace import: the page commits with commitReplace (title kept) instead of commitNewBook. */
  replace?: ReplacePlan;
}

export interface CacheStorageLike {
  open(name: string): Promise<{
    keys(): Promise<readonly unknown[]>;
    match(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer> } | undefined>;
  }>;
}

export const VERIFY_TIMEOUT_MS = 15_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Polls until the cache holds `fileCount` entries and the entry page's body is readable with the expected size.
 * Returns false on timeout. Never throws for missing data (transient WebKit states), only retries.
 */
export async function verifyCacheReady(
  storage: CacheStorageLike,
  p: Pick<ReadyPayload, 'book' | 'cacheName' | 'entrySize'>,
  opts: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<boolean> {
  const deadline = Date.now() + (opts.timeoutMs ?? VERIFY_TIMEOUT_MS);
  const interval = opts.intervalMs ?? 100;
  const key = cacheKey(p.book.id, p.book.entryPath);
  for (;;) {
    try {
      const cache = await storage.open(p.cacheName);
      if ((await cache.keys()).length === p.book.fileCount) {
        const res = await cache.match(key);
        if (res && (await res.arrayBuffer()).byteLength === p.entrySize) return true;
      }
    } catch {
      /* retry until the deadline */
    }
    if (Date.now() >= deadline) return false;
    await sleep(interval);
  }
}
