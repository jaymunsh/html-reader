import { deleteBookRecords, openDb, req, withTx } from './db';
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
  if (book && typeof caches !== 'undefined') await caches.delete(book.cacheName);
}
