import { ImportError, type ImportErrorCode } from './errors';
import { isHtmlPath, pickEntryPath, planEntries, precheck, sourceNameOf } from './plan';
import { dedupeTitle, defaultTitle } from '../title';
import { decodeHtml, detectEncoding, extractTitle, isFullDocument } from '../html-meta';
import { extractText } from '../text-extract';
import { mimeFor } from '../mime';
import { cacheKey, naturalComparePaths } from '../path';
import { readCentralDirectory, readEntry, ZipError } from '../zip';
import { cacheNameFor, commitNewBook, listBooks, newBookId, withImportLock } from '../storage';
import type { Book, TextRecord } from '../storage';
import type { ImportMode } from './client';

type In = { type: 'start'; file: File; mode: ImportMode } | { type: 'entry'; path: string | null };
const post = (m: unknown) => (self as unknown as Worker).postMessage(m);

interface Item { path: string; size: number; read(onBytes: (n: number) => void): Promise<Blob> }

let entryResolver: ((p: string | null) => void) | null = null;
const askEntry = (pagePaths: string[]) => new Promise<string | null>((res) => {
  entryResolver = res;
  post({ type: 'need-entry', pagePaths });
});

async function loadItems(file: File): Promise<Item[]> {
  if (/\.html?$/i.test(file.name)) {
    return [{ path: file.name.normalize('NFC'), size: file.size, read: async (onBytes) => { onBytes(file.size); return file.slice(); } }];
  }
  const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  const sig = head.length === 4 && head[0] === 0x50 && head[1] === 0x4b
    && ((head[2] === 3 && head[3] === 4) || (head[2] === 5 && head[3] === 6));
  if (!sig) throw new ImportError('unsupported-file');
  const { files } = planEntries(await readCentralDirectory(file));
  precheck(files, (await navigator.storage?.estimate?.()) ?? null);
  return files.map((f) => ({ path: f.path, size: f.entry.uncompressedSize, read: (onBytes) => readEntry(file, f.entry, onBytes) }));
}

function toImportError(e: unknown): ImportError {
  if (e instanceof ImportError) return e;
  if (e instanceof ZipError) return new ImportError(e.code as ImportErrorCode, e.message);
  if (e instanceof DOMException && e.name === 'QuotaExceededError') return new ImportError('quota', e.message);
  return new ImportError('failed', e instanceof Error ? e.message : String(e));
}

async function run(file: File, mode: ImportMode): Promise<string> {
  if (mode.kind !== 'new') throw new ImportError('failed', 'replace mode is not implemented');
  const items = await loadItems(file);
  if (!items.some((i) => isHtmlPath(i.path))) throw new ImportError('no-html');
  const total = items.reduce((s, i) => s + i.size, 0);
  // The lock spans both the cache writes and the IDB commit, so cleanupOrphans never sees a half-done import.
  return withImportLock(async () => {
    const bookId = newBookId();
    const cacheName = cacheNameFor(bookId, 1);
    try {
      const cache = await caches.open(cacheName);
      const pagePaths: string[] = [];
      const titles: Record<string, string> = {};
      const texts: TextRecord[] = [];
      let done = 0;
      let lastPost = 0;
      const onBytes = (n: number) => {
        done += n;
        const now = Date.now();
        if (now - lastPost > 50 || done >= total) { lastPost = now; post({ type: 'progress', done, total }); }
      };
      for (const item of items) {
        const blob = await item.read(onBytes);
        let type = mimeFor(item.path);
        if (isHtmlPath(item.path)) {
          const bytes = new Uint8Array(await blob.arrayBuffer());
          if (isFullDocument(bytes)) pagePaths.push(item.path);
          titles[item.path] = extractTitle(decodeHtml(bytes).html);
          texts.push({ bookId, path: item.path, text: extractText(bytes) });
          const src = detectEncoding(bytes);
          if (src.source === 'utf8' || src.source === 'fallback') type += `; charset=${src.encoding}`;
        }
        await cache.put(cacheKey(bookId, item.path), new Response(blob, {
          headers: { 'Content-Type': type, 'Content-Length': String(blob.size) },
        }));
      }
      pagePaths.sort(naturalComparePaths);
      if (!pagePaths.length) throw new ImportError('no-html');
      let entryPath = pickEntryPath(pagePaths);
      if (entryPath === null) {
        entryPath = await askEntry(pagePaths);
        if (entryPath === null) throw new ImportError('cancelled');
      }
      const sourceName = sourceNameOf(file.name).normalize('NFC');
      const existing = (await listBooks()).map((b) => b.title);
      const title = dedupeTitle(defaultTitle(titles[entryPath] ?? '', sourceName), existing);
      const now = Date.now();
      const book: Book = {
        id: bookId, title, sourceName, cacheName, entryPath, pagePaths, fileCount: items.length, totalBytes: total,
        importedAt: now, lastOpenedAt: 0, lastPath: entryPath, textScale: 1,
      };
      await commitNewBook(book, { bookId, paths: items.map((i) => i.path), titles }, texts);
      return bookId;
    } catch (e) {
      await caches.delete(cacheName).catch(() => {});
      throw e;
    }
  });
}

self.onmessage = (ev: MessageEvent<In>) => {
  const m = ev.data;
  if (m.type === 'entry') { entryResolver?.(m.path); entryResolver = null; return; }
  run(m.file, m.mode).then(
    (bookId) => post({ type: 'done', bookId }),
    (e) => { const err = toImportError(e); post({ type: 'error', code: err.code, detail: err.detail }); },
  );
};
