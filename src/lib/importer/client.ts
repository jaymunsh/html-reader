import { commitNewBook, commitReplace, listBooks, withImportLock } from '../storage';
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
 * The page holds ONE import lock for the whole import (worker write -> entry choice -> verify -> terminate -> commit),
 * so a concurrent cleanupOrphans (any tab) can never delete the in-flight cache. The page outlives the worker.
 * The worker stays alive while the page verifies: on WebKit (with a controlling service worker) Cache API
 * writes made by a worker are dropped if it is terminated right after finishing.
 */
async function commitReady(p: ReadyPayload, terminate: () => void): Promise<string> {
  try {
    // e2e-only: lets a test hold an import in its in-flight window (cache written, not committed); stripped in prod builds.
    if (import.meta.env.VITE_E2E) await (globalThis as any).__hrTest?.beforeCommit?.();
    const ok = await verifyCacheReady(caches, p);
    terminate();
    if (!ok) throw new ImportError('failed', 'cache verification timed out');
    if (p.replace) {
      const prev = await commitReplace(p.book.id, p.book, p.bookFiles, p.texts, p.replace);
      // Tell the SW before the old cache goes away: its memoized record still names it.
      try { navigator.serviceWorker?.controller?.postMessage({ type: 'book-changed', id: p.book.id }); } catch { /* ignore */ }
      await caches.delete(prev).catch(() => {}); // only after the commit (spec §7.2-4); a leftover is an orphan for cleanup
      return p.book.id;
    }
    // Titles may have changed since the worker planned this book (concurrent imports).
    const title = dedupeTitle(p.baseTitle, (await listBooks()).map((b) => b.title));
    await commitNewBook({ ...p.book, title }, p.bookFiles, p.texts);
    return p.book.id;
  } catch (e) {
    terminate();
    await caches.delete(p.cacheName).catch(() => {});
    throw toImportError(e);
  }
}

/** Settles only after the cache is committed or deleted; chooseEntry must settle too, or the lock is held. */
export function importFile(file: File, mode: ImportMode, hooks: ImportHooks): Promise<string> {
  return withImportLock(() => new Promise<string>((resolve, reject) => {
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
  }));
}

export async function findBySourceName(sourceName: string): Promise<Book | undefined> {
  const n = sourceName.normalize('NFC');
  return (await listBooks())
    .filter((b) => b.sourceName === n)
    .sort((a, b) => b.importedAt - a.importedAt)[0];
}
