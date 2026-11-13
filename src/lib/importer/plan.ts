import { isJunk, sanitizeEntryPath } from '../filename';
import type { ZipEntry } from '../zip';
import { ImportError } from './errors';

export interface PlannedFile { entry: ZipEntry; path: string }

const MAX_TOTAL = 4 * 2 ** 30;
const MAX_RATIO = 1000;

export function planEntries(entries: ZipEntry[]): { root: string; files: PlannedFile[] } {
  let items: PlannedFile[] = [];
  for (const entry of entries) {
    if (entry.isDirectory) continue;
    const path = sanitizeEntryPath(entry.name);
    if (path === null || isJunk(path)) continue;
    items.push({ entry, path: path.normalize('NFC') });
  }
  let root = '';
  if (items.length && items.every((f) => f.path.includes('/'))) {
    const first = items[0].path.split('/')[0];
    if (items.every((f) => f.path.split('/')[0] === first)) {
      root = first + '/';
      items = items.map((f) => ({ entry: f.entry, path: f.path.slice(root.length) }));
    }
  }
  const seen = new Set<string>();
  const files: PlannedFile[] = [];
  for (const f of items) {
    if (seen.has(f.path)) continue;
    seen.add(f.path);
    files.push(f);
  }
  return { root, files };
}

export function isHtmlPath(path: string): boolean {
  return /\.(html?|xhtml)$/i.test(path);
}

export function precheck(files: PlannedFile[], estimate: { quota?: number; usage?: number } | null): { totalBytes: number } {
  if (files.some((f) => f.entry.encrypted)) throw new ImportError('encrypted');
  if (files.some((f) => f.entry.method !== 0 && f.entry.method !== 8)) throw new ImportError('unsupported-method');
  if (!files.some((f) => isHtmlPath(f.path))) throw new ImportError('no-html');
  let totalBytes = 0;
  for (const f of files) totalBytes += f.entry.uncompressedSize;
  if (totalBytes > MAX_TOTAL) throw new ImportError('too-large');
  for (const { entry } of files) {
    if (entry.compressedSize > 0 && entry.uncompressedSize / entry.compressedSize > MAX_RATIO) throw new ImportError('bomb');
  }
  if (estimate && estimate.quota !== undefined && estimate.usage !== undefined
      && estimate.quota - estimate.usage < totalBytes * 1.2) throw new ImportError('quota');
  return { totalBytes };
}

export function pickEntryPath(pagePaths: string[]): string | null {
  if (pagePaths.length === 1) return pagePaths[0];
  for (const name of ['index.html', 'index.htm']) {
    const hit = pagePaths.find((p) => p.toLowerCase() === name);
    if (hit) return hit;
  }
  return null;
}

export function sourceNameOf(fileName: string): string {
  const i = fileName.lastIndexOf('.');
  return i > 0 ? fileName.slice(0, i) : fileName;
}
