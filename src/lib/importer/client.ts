import { commitNewBook, listBooks, withImportLock } from '../storage';
import type { Book } from '../storage';
import { ImportError, toImportError, type ImportErrorCode } from './errors';
import { dedupeTitle } from '../title';
import { verifyCacheReady, type ReadyPayload } from './verify';

export type ImportMode = { kind: 'new' } | { kind: 'replace'; bookId: string };
export interface ImportHooks {
  onProgress?(done: number, total: number): void;
  chooseEntry(pagePaths: string[]): Promise<string | null>;
}

/**
 * The worker stays alive while the page verifies: on WebKit (with a controlling service worker) Cache API
 * writes made by a worker are dropped if it is terminated right after finishing. Verify, terminate and commit
 * run under ONE import lock so a concurrent cleanupOrphans cannot delete the cache between verify and commit.
 */
async function commitReady(p: ReadyPayload, terminate: () => void): Promise<string> {
  try {
    return await withImportLock(async () => {
      const ok = await verifyCacheReady(caches, p);
      terminate();
      if (!ok) throw new ImportError('failed', 'cache verification timed out');
      // Titles may have changed since the worker planned this book (concurrent imports).
      const title = dedupeTitle(p.baseTitle, (await listBooks()).map((b) => b.title));
      await commitNewBook({ ...p.book, title }, p.bookFiles, p.texts);
      return p.book.id;
    });
  } catch (e) {
    terminate();
    await caches.delete(p.cacheName).catch(() => {});
    throw toImportError(e);
  }
}

export function importFile(file: File, mode: ImportMode, hooks: ImportHooks): Promise<string> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./importer.worker.ts', import.meta.url), { type: 'module' });
    // Once the worker reported `ready`, only commitReady settles the promise; late worker events are ignored.
    let readySeen = false;
    const finish = (fn: () => void) => { worker.terminate(); fn(); };
    worker.onmessage = (ev: MessageEvent) => {
      if (readySeen) return;
      const m = ev.data;
      if (m.type === 'progress') hooks.onProgress?.(m.done, m.total);
      else if (m.type === 'need-entry') {
        hooks.chooseEntry(m.pagePaths).then(
          (path) => worker.postMessage({ type: 'entry', path }),
          () => worker.postMessage({ type: 'entry', path: null }),
        );
      } else if (m.type === 'ready') {
        readySeen = true;
        commitReady(m as ReadyPayload & { type: string }, () => worker.terminate()).then(resolve, reject);
      } else if (m.type === 'error') finish(() => reject(new ImportError(m.code as ImportErrorCode, m.detail)));
    };
    worker.onerror = (e) => {
      if (readySeen) return;
      finish(() => reject(new ImportError('failed', e.message)));
    };
    worker.postMessage({ type: 'start', file, mode });
  });
}

export async function findBySourceName(sourceName: string): Promise<Book | undefined> {
  const n = sourceName.normalize('NFC');
  return (await listBooks())
    .filter((b) => b.sourceName === n)
    .sort((a, b) => b.importedAt - a.importedAt)[0];
}
