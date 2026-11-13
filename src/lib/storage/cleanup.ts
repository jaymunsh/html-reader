import { listBooks } from './books';
import { findOrphanCaches } from './cache';
import { deleteBookRecords, req, withTx } from './db';

export const IMPORT_LOCK = 'html-reader-import';

const hasLocks = () => typeof navigator !== 'undefined' && !!navigator.locks;

export function withImportLock<T>(fn: () => Promise<T>): Promise<T> {
  return hasLocks() ? navigator.locks.request(IMPORT_LOCK, fn) : fn();
}

async function removeOrphanRecords(): Promise<void> {
  await withTx(['books', 'bookFiles', 'texts', 'progress', 'bookmarks', 'issues'], 'readwrite', async (tx) => {
    const live = new Set((await req(tx.objectStore('books').getAllKeys())) as string[]);
    const ids = new Set<string>();
    for (const name of ['bookFiles', 'texts', 'progress', 'bookmarks', 'issues']) {
      for (const k of await req(tx.objectStore(name).getAllKeys())) {
        const id = String(Array.isArray(k) ? k[0] : k);
        if (!live.has(id)) ids.add(id);
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
