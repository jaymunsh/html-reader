import { listBooks } from './books';
import { findOrphanCaches } from './cache';
import { deleteBookRecords, req, withTx } from './db';

export const IMPORT_LOCK = 'html-reader-import';

const hasLocks = () => typeof navigator !== 'undefined' && !!navigator.locks;

export function withImportLock<T>(fn: () => Promise<T>): Promise<T> {
  return hasLocks() ? navigator.locks.request(IMPORT_LOCK, fn) : fn();
}

/** True while any tab holds the import lock. */
export async function importRunning(): Promise<boolean> {
  if (!hasLocks()) return false;
  try { return !!(await navigator.locks.query()).held?.some((l) => l.name === IMPORT_LOCK); } catch { return false; }
}

async function removeOrphanRecords(): Promise<void> {
  await withTx(['books', 'bookFiles', 'texts', 'progress', 'bookmarks', 'issues'], 'readwrite', async (tx) => {
    const live = new Set((await req(tx.objectStore('books').getAllKeys())) as string[]);
    const ids = new Set<string>();
    for (const name of ['bookFiles', 'texts', 'progress', 'bookmarks', 'issues']) {
      // Read the record's bookId (primary keys of `bookmarks` are bookmark ids, not book ids).
      for (const rec of (await req(tx.objectStore(name).getAll())) as { bookId: string }[]) {
        if (!live.has(rec.bookId)) ids.add(rec.bookId);
      }
    }
    for (const id of ids) await deleteBookRecords(tx, id);
  });
}

async function runCleanup(): Promise<string[]> {
  const books = await listBooks();
  let orphans: string[] = [];
  if (typeof caches !== 'undefined') {
    orphans = findOrphanCaches(await caches.keys(), books);
    for (const n of orphans) await caches.delete(n);
  }
  await removeOrphanRecords();
  return orphans;
}

export async function cleanupOrphans(): Promise<{ skipped: boolean; caches: string[] }> {
  if (!hasLocks()) return { skipped: false, caches: await runCleanup() };
  return navigator.locks.request(IMPORT_LOCK, { ifAvailable: true }, async (lock) => {
    if (!lock) return { skipped: true, caches: [] };
    return { skipped: false, caches: await runCleanup() };
  });
}
