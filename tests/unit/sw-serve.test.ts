import 'fake-indexeddb/auto';
import { expect, test, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import * as S from '../../src/lib/storage';
import { dirRedirectLocation, invalidateBook, NOT_IN_BUNDLE_HTML, serveBookFile } from '../../src/sw/serve';

test('SW memoizes the book record until invalidated', async () => {
  S.closeDb(); (globalThis as any).indexedDB = new IDBFactory();
  const id = 'mmmmmmmmmmmm';
  const store = new Map<string, Response>();
  vi.stubGlobal('caches', { open: async () => ({ match: async (k: string) => store.get(k)?.clone() }) });
  await S.commitNewBook(
    { id, title: 'T', sourceName: 's', cacheName: S.cacheNameFor(id, 1), entryPath: 'a.html', pagePaths: ['a.html'],
      fileCount: 1, totalBytes: 1, importedAt: 1, lastOpenedAt: 0, lastPath: '', textScale: 1 },
    { bookId: id, paths: ['a.html'], titles: {} }, []);
  const spy = vi.spyOn(IDBObjectStore.prototype, 'get');
  const n = () => spy.mock.contexts.filter((c) => (c as IDBObjectStore).name === 'books').length;
  const serve = () => serveBookFile({ kind: 'book-file', bookId: id, rest: 'a.html', ctxBookId: null }, new Request(`https://x/book/${id}/a.html`));
  await serve();
  const first = n();
  expect(first).toBe(1);
  await serve(); await serve();
  expect(n()).toBe(first);
  invalidateBook(id);
  await serve();
  expect(n()).toBe(first + 1);
  // An invalidation that lands while a read is in flight must not let the stale record be memoized.
  invalidateBook(id);
  const before = n();
  const inflight = serve();
  invalidateBook(id);
  await inflight;
  await serve();
  expect(n()).toBe(before + 2);
  spy.mockRestore(); vi.unstubAllGlobals();
});

test('dir redirect Location always stays inside the book', () => {
  expect(dirRedirectLocation('ab', 'sub/')).toBe('/book/ab/sub/');
  expect(dirRedirectLocation('ab', 'a b/c#/', '?v=1')).toBe('/book/ab/a%20b/c%23/?v=1');
  expect(dirRedirectLocation('ab', '')).toBe('/book/ab/');
  expect(dirRedirectLocation('ab', '/')).toBe('/book/ab/');
});

test('not-in-bundle html', () => {
  expect(NOT_IN_BUNDLE_HTML).toContain('이 페이지는 묶음에 없습니다');
  expect(NOT_IN_BUNDLE_HTML).toContain('<meta charset="utf-8">');
});
