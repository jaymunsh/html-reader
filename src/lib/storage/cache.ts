import type { Book } from './types';

export function cacheNameFor(bookId: string, n: number): string { return `book-${bookId}-v${n}`; }

export function parseCacheName(name: string): { bookId: string; n: number } | null {
  const m = /^book-([A-Za-z0-9_-]+)-v(\d+)$/.exec(name);
  return m ? { bookId: m[1], n: Number(m[2]) } : null;
}

export function findOrphanCaches(cacheNames: string[], books: Pick<Book, 'cacheName'>[]): string[] {
  const live = new Set(books.map((b) => b.cacheName));
  return cacheNames.filter((n) => parseCacheName(n) !== null && !live.has(n));
}
