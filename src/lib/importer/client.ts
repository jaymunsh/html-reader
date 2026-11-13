import { listBooks } from '../storage';
import type { Book } from '../storage';
import { ImportError, type ImportErrorCode } from './errors';

export type ImportMode = { kind: 'new' } | { kind: 'replace'; bookId: string };
export interface ImportHooks {
  onProgress?(done: number, total: number): void;
  chooseEntry(pagePaths: string[]): Promise<string | null>;
}

export function importFile(file: File, mode: ImportMode, hooks: ImportHooks): Promise<string> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./importer.worker.ts', import.meta.url), { type: 'module' });
    const finish = (fn: () => void) => { worker.terminate(); fn(); };
    worker.onmessage = (ev: MessageEvent) => {
      const m = ev.data;
      if (m.type === 'progress') hooks.onProgress?.(m.done, m.total);
      else if (m.type === 'need-entry') {
        hooks.chooseEntry(m.pagePaths).then(
          (path) => worker.postMessage({ type: 'entry', path }),
          () => worker.postMessage({ type: 'entry', path: null }),
        );
      } else if (m.type === 'done') finish(() => resolve(m.bookId));
      else if (m.type === 'error') finish(() => reject(new ImportError(m.code as ImportErrorCode, m.detail)));
    };
    worker.onerror = (e) => finish(() => reject(new ImportError('failed', e.message)));
    worker.postMessage({ type: 'start', file, mode });
  });
}

export async function findBySourceName(sourceName: string): Promise<Book | undefined> {
  const n = sourceName.normalize('NFC');
  return (await listBooks())
    .filter((b) => b.sourceName === n)
    .sort((a, b) => b.importedAt - a.importedAt)[0];
}
