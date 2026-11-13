export const DB_NAME = 'html-reader';
export const DB_VERSION = 1;

export const MIGRATIONS: ((db: IDBDatabase, tx: IDBTransaction) => void)[] = [
  // v0 -> v1
  (db) => {
    db.createObjectStore('books', { keyPath: 'id' });
    db.createObjectStore('bookFiles', { keyPath: 'bookId' });
    for (const name of ['progress', 'texts', 'issues']) {
      db.createObjectStore(name, { keyPath: ['bookId', 'path'] }).createIndex('bookId', 'bookId');
    }
    db.createObjectStore('bookmarks', { keyPath: 'id' }).createIndex('bookId', 'bookId');
    db.createObjectStore('settings');
  },
];

let conn: Promise<IDBDatabase> | null = null;

export function openDb(): Promise<IDBDatabase> {
  if (conn) return conn;
  const p = new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, DB_VERSION);
    r.onupgradeneeded = (e) => {
      const tx = r.transaction!;
      for (let v = e.oldVersion; v < DB_VERSION; v++) MIGRATIONS[v](r.result, tx);
    };
    r.onsuccess = () => {
      const db = r.result;
      const reset = () => { if (conn === p) conn = null; };
      db.onversionchange = () => { db.close(); reset(); };
      db.onclose = reset;
      resolve(db);
    };
    r.onerror = () => reject(r.error);
  });
  conn = p;
  p.catch(() => { if (conn === p) conn = null; });
  return p;
}

export function closeDb(): void {
  const p = conn;
  conn = null;
  p?.then((db) => db.close(), () => {});
}

export function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new DOMException('Transaction aborted', 'AbortError'));
  });
}

/** Run `fn` in a transaction; any sync or async error aborts the transaction and rejects with the original error. */
export async function withTx<T = void>(
  stores: string | string[], mode: IDBTransactionMode, fn: (tx: IDBTransaction) => Promise<T> | T,
): Promise<T> {
  const db = await openDb();
  const tx = db.transaction(stores, mode);
  const finished = done(tx);
  finished.catch(() => {});
  let result: T;
  try {
    result = await fn(tx);
  } catch (err) {
    try { tx.abort(); } catch { /* already finished */ }
    throw err;
  }
  await finished;
  return result;
}

/** Primary keys of `store` records with the given bookId (via the bookId index). */
export function keysByBook(tx: IDBTransaction, store: string, bookId: string): Promise<IDBValidKey[]> {
  return req(tx.objectStore(store).index('bookId').getAllKeys(IDBKeyRange.only(bookId)));
}

/** Delete every record belonging to `bookId` from all book-scoped stores. Must run inside a tx covering them. */
export async function deleteBookRecords(tx: IDBTransaction, bookId: string): Promise<void> {
  tx.objectStore('bookFiles').delete(bookId);
  for (const name of ['texts', 'progress', 'bookmarks', 'issues']) {
    const s = tx.objectStore(name);
    for (const k of await keysByBook(tx, name, bookId)) s.delete(k);
  }
}
