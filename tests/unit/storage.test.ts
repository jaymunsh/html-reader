import 'fake-indexeddb/auto';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import * as S from '../../src/lib/storage';

beforeEach(() => { S.closeDb(); (globalThis as any).indexedDB = new IDBFactory(); });
afterEach(() => vi.unstubAllGlobals());

const book = (id: string, over: Partial<S.Book> = {}): S.Book => ({
  id, title: 'T', sourceName: 's', cacheName: S.cacheNameFor(id, 1), entryPath: 'index.html', pagePaths: ['index.html'],
  fileCount: 1, totalBytes: 10, importedAt: 1, lastOpenedAt: 0, lastPath: '', textScale: 1, ...over });

test('스키마 v1', async () => {
  const db = await S.openDb();
  expect([...db.objectStoreNames].sort()).toEqual(['bookFiles', 'bookmarks', 'books', 'issues', 'progress', 'settings', 'texts']);
  expect(db.name).toBe('html-reader');
});
test('newBookId', () => expect(S.newBookId()).toMatch(/^[a-z0-9]{12}$/));
test('commitNewBook은 books·bookFiles·texts를 함께 쓴다', async () => {
  await S.commitNewBook(book('aaaaaaaaaaaa'), { bookId: 'aaaaaaaaaaaa', paths: ['index.html', 'a.css'], titles: { 'index.html': 'T' } },
    [{ bookId: 'aaaaaaaaaaaa', path: 'index.html', text: '본문' }]);
  expect((await S.listBooks()).map((b) => b.id)).toEqual(['aaaaaaaaaaaa']);
  expect((await S.getBookFiles('aaaaaaaaaaaa'))!.paths).toEqual(['index.html', 'a.css']);
  expect((await S.getTexts('aaaaaaaaaaaa'))[0].text).toBe('본문');
});
test('commitNewBook 실패 시 아무것도 남지 않는다', async () => {
  const bad = [{ bookId: 'bbbbbbbbbbbb', path: 'x', text: 't' }, { bookId: 'bbbbbbbbbbbb' } as any];   // keyPath 누락 → 트랜잭션 abort
  await expect(S.commitNewBook(book('bbbbbbbbbbbb'), { bookId: 'bbbbbbbbbbbb', paths: [], titles: {} }, bad)).rejects.toBeTruthy();
  expect(await S.listBooks()).toEqual([]);
  expect(await S.getBookFiles('bbbbbbbbbbbb')).toBeUndefined();
});
test('recordIssue는 동시 기록에도 유실이 없다', async () => {
  await Promise.all(Array.from({ length: 10 }, () => S.recordIssue('aaaaaaaaaaaa', 'img/x.png', 'missing')));
  expect(await S.listIssues('aaaaaaaaaaaa')).toMatchObject([{ path: 'img/x.png', kind: 'missing', count: 10 }]);
});
test('deleteBook은 딸린 기록을 모두 지운다', async () => {
  vi.stubGlobal('caches', { delete: async () => true });
  await S.commitNewBook(book('aaaaaaaaaaaa'), { bookId: 'aaaaaaaaaaaa', paths: [], titles: {} }, [{ bookId: 'aaaaaaaaaaaa', path: 'p', text: 't' }]);
  await S.putProgress({ bookId: 'aaaaaaaaaaaa', path: 'p', maxPct: 50, lastScrollRatio: 0.4, read: false, updatedAt: 1 });
  await S.recordIssue('aaaaaaaaaaaa', 'x', 'missing');
  await S.deleteBook('aaaaaaaaaaaa');
  expect(await S.listBooks()).toEqual([]);
  expect((await S.getProgress('aaaaaaaaaaaa')).size).toBe(0);
  expect(await S.getTexts('aaaaaaaaaaaa')).toEqual([]);
  expect(await S.listIssues('aaaaaaaaaaaa')).toEqual([]);
});
test('settings 기본값과 저장', async () => {
  expect(await S.getSetting('librarySort')).toBe('recent');
  expect(await S.getSetting('progressLine')).toBe(true);
  expect(await S.getSetting('activeBookId')).toBeNull();
  await S.setSetting('activeBookId', 'aaaaaaaaaaaa');
  expect(await S.getSetting('activeBookId')).toBe('aaaaaaaaaaaa');
});
test('캐시 이름', () => {
  expect(S.cacheNameFor('aaaaaaaaaaaa', 3)).toBe('book-aaaaaaaaaaaa-v3');
  expect(S.parseCacheName('book-aaaaaaaaaaaa-v3')).toEqual({ bookId: 'aaaaaaaaaaaa', n: 3 });
  expect(S.parseCacheName('workbox-precache-v2-x')).toBeNull();
});
test('findOrphanCaches는 book-*만 대상으로 한다', () => {
  expect(S.findOrphanCaches(['book-a-v1', 'book-a-v2', 'book-z-v1', 'workbox-precache-v2-http://x/', 'share-inbox'], [{ cacheName: 'book-a-v2' }]))
    .toEqual(['book-a-v1', 'book-z-v1']);
});
test('cleanupOrphans는 가져오기 잠금이 잡혀 있으면 건너뛴다 (Review Focus 3)', async () => {
  const deleted: string[] = [];
  vi.stubGlobal('caches', { keys: async () => ['book-x-v1'], delete: async (n: string) => { deleted.push(n); return true; } });
  const locks = (lock: unknown) => ({ locks: { request: async (_n: string, o: any, cb: any) => (typeof o === 'function' ? o({}) : cb(lock)) } });
  vi.stubGlobal('navigator', locks(null));                                     // ifAvailable인데 잠금이 잡혀 있음 → null
  expect(await S.cleanupOrphans()).toEqual({ skipped: true, caches: [] });
  expect(deleted).toEqual([]);
  vi.stubGlobal('navigator', locks({}));
  expect(await S.cleanupOrphans()).toEqual({ skipped: false, caches: ['book-x-v1'] });
  expect(deleted).toEqual(['book-x-v1']);
});
