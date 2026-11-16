import { deleteBookRecords, keysByBook, openDb, req, withTx } from './db';
import type { ReplacePlan } from '../reimport';
import type { Book, BookFiles, TextRecord } from './types';

export function newBookId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (b) => (b % 36).toString(36)).join('');
}

export async function listBooks(): Promise<Book[]> {
  const db = await openDb();
  return req(db.transaction('books').objectStore('books').getAll());
}

export async function getBook(id: string): Promise<Book | undefined> {
  const db = await openDb();
  return req(db.transaction('books').objectStore('books').get(id));
}

export async function getBookFiles(id: string): Promise<BookFiles | undefined> {
  const db = await openDb();
  return req(db.transaction('bookFiles').objectStore('bookFiles').get(id));
}

export function commitNewBook(book: Book, files: BookFiles, texts: TextRecord[]): Promise<void> {
  return withTx(['books', 'bookFiles', 'texts'], 'readwrite', (tx) => {
    tx.objectStore('books').put(book);
    tx.objectStore('bookFiles').put(files);
    const t = tx.objectStore('texts');
    for (const rec of texts) t.put(rec);
  });
}

/**
 * Replace import (spec §7.2-3), one transaction: point the book at the new cache, swap its files and texts, drop the
 * records the plan names and all issues. id, title, sourceName, textScale and lastOpenedAt are kept.
 * Returns the previous cacheName (the caller deletes that cache after this commits).
 */
export function commitReplace(
  bookId: string, next: Pick<Book, 'cacheName' | 'entryPath' | 'pagePaths' | 'fileCount' | 'totalBytes' | 'importedAt'>,
  files: BookFiles, texts: TextRecord[], plan: ReplacePlan,
): Promise<string> {
  return withTx(['books', 'bookFiles', 'texts', 'progress', 'bookmarks', 'issues'], 'readwrite', async (tx) => {
    const books = tx.objectStore('books');
    const cur = await req(books.get(bookId) as IDBRequest<Book | undefined>);
    if (!cur) throw new Error(`commitReplace: no book ${bookId}`);
    const { cacheName, entryPath, pagePaths, fileCount, totalBytes, importedAt } = next;
    books.put({ ...cur, cacheName, entryPath, pagePaths, fileCount, totalBytes, importedAt, lastPath: plan.lastPath });
    tx.objectStore('bookFiles').put(files);
    const t = tx.objectStore('texts');
    for (const k of await keysByBook(tx, 'texts', bookId)) t.delete(k);
    for (const rec of texts) t.put(rec);
    const pr = tx.objectStore('progress');
    for (const path of plan.dropProgress) pr.delete([bookId, path]);
    const bm = tx.objectStore('bookmarks');
    for (const id of plan.dropBookmarkIds) bm.delete(id);
    const is = tx.objectStore('issues');
    for (const k of await keysByBook(tx, 'issues', bookId)) is.delete(k);
    return cur.cacheName;
  });
}

export async function updateBook(id: string, patch: Partial<Omit<Book, 'id'>>): Promise<void> {
  await withTx('books', 'readwrite', async (tx) => {
    const s = tx.objectStore('books');
    const cur = await req(s.get(id) as IDBRequest<Book | undefined>);
    if (!cur) return;
    s.put({ ...cur, ...patch, id });
  });
}

export async function deleteBook(id: string): Promise<void> {
  const book = await getBook(id);
  await withTx(['books', 'bookFiles', 'texts', 'progress', 'bookmarks', 'issues'], 'readwrite', async (tx) => {
    tx.objectStore('books').delete(id);
    await deleteBookRecords(tx, id);
  });
  // The SW memoizes the book record and path index; tell it before the cache goes (no-op outside a controlled window).
  try { globalThis.navigator?.serviceWorker?.controller?.postMessage({ type: 'book-changed', id }); } catch { /* ignore */ }
  if (book && typeof caches !== 'undefined') await caches.delete(book.cacheName);
}
