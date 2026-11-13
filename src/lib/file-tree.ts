import { naturalComparePaths } from './path';

/** Pages in reading order: natural path sort (not folders-first). */
export function orderedPages(pagePaths: string[]): string[] {
  return [...pagePaths].sort(naturalComparePaths);
}

export type TreeRow =
  | { kind: 'folder'; dir: string; label: string }
  | { kind: 'file'; path: string; name: string; indent: boolean };

export function buildTree(pagePaths: string[]): TreeRow[] {
  const rows: TreeRow[] = [];
  let prev = '';
  for (const path of orderedPages(pagePaths)) {
    const i = path.lastIndexOf('/');
    const dir = i < 0 ? '' : path.slice(0, i);
    if (dir && dir !== prev) rows.push({ kind: 'folder', dir, label: `${dir}/` });
    prev = dir;
    rows.push({ kind: 'file', path, name: path.slice(i + 1), indent: !!dir });
  }
  return rows;
}

/** Prev/next page; a current path outside the list has no prev, and next is the first page. */
export function neighbor(pages: string[], current: string, dir: -1 | 1): string | null {
  const i = pages.indexOf(current);
  if (i < 0) return dir < 0 ? null : pages[0] ?? null;
  return pages[i + dir] ?? null;
}
