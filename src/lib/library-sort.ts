import type { Book } from './storage';
import { naturalComparePaths } from './path';
import { foldCase } from './search';

export type SortKey = 'recent' | 'imported' | 'name' | 'progress';

const byName = (a: Book, b: Book) => naturalComparePaths(a.title, b.title);

export function sortBooks(books: Book[], key: SortKey, pctById: Map<string, number>): Book[] {
  const cmp: Record<SortKey, (a: Book, b: Book) => number> = {
    recent: (a, b) => (b.lastOpenedAt || b.importedAt) - (a.lastOpenedAt || a.importedAt),
    imported: (a, b) => b.importedAt - a.importedAt,
    name: byName,
    progress: (a, b) => (pctById.get(b.id) ?? 0) - (pctById.get(a.id) ?? 0) || byName(a, b),
  };
  return [...books].sort(cmp[key]);
}

export function filterBooks(books: Book[], query: string): Book[] {
  const q = foldCase(query.trim());
  if (!q) return books;
  return books.filter((b) => foldCase(b.title).includes(q) || foldCase(b.sourceName).includes(q));
}
