import { beforeEach, expect, test, vi } from 'vitest';

const getTexts = vi.fn();
const getBook = vi.fn();
vi.mock('../../src/lib/storage/records', () => ({ getTexts: (id: string) => getTexts(id) }));
vi.mock('../../src/lib/storage/books', () => ({ getBook: (id: string) => getBook(id) }));

import { capGroups, foldCase, resetSearchCache, searchBook, searchTexts, type SearchGroup } from '../../src/lib/search';

const book = { pagePaths: ['a.html', 'b.html'], cacheName: 'book-x-v1' };
beforeEach(() => {
  resetSearchCache(); getTexts.mockReset(); getBook.mockReset();
  getBook.mockResolvedValue(book);
  getTexts.mockResolvedValue([{ path: 'a.html', text: '한글 Alpaca' }, { path: 'b.html', text: 'İstanbul alpaca' }]);
});

test('texts are read and normalized once per book across queries', async () => {
  const norm = vi.spyOn(String.prototype, 'normalize');
  await searchBook('x', 'alp');
  const after1 = norm.mock.calls.length;
  await searchBook('x', 'alpa'); await searchBook('x', '한글');
  expect(getTexts).toHaveBeenCalledTimes(1);
  // later queries only normalize the (short) query, never the book text again
  expect(norm.mock.calls.length - after1).toBeLessThanOrEqual(2 * 2 + 2);
  norm.mockRestore();
});
test('a replace (new cache name) re-reads; a failed read is retried', async () => {
  await searchBook('x', 'alp');
  getBook.mockResolvedValue({ ...book, cacheName: 'book-x-v2' });
  await searchBook('x', 'alp');
  expect(getTexts).toHaveBeenCalledTimes(2);
  resetSearchCache(); getTexts.mockReset(); getTexts.mockRejectedValueOnce(new Error('io')).mockResolvedValue([]);
  await expect(searchBook('x', 'alp')).rejects.toThrow('io');
  await expect(searchBook('x', 'alp')).resolves.toEqual([]);
});
test('fast path keeps the foldCase semantics (NFD, length-changing, sigma)', () => {
  const order = ['a.html'];
  expect(searchTexts([{ path: 'a.html', text: '한글 문서' }], '한글'.normalize('NFD'), order)[0].total).toBe(1);
  expect(searchTexts([{ path: 'a.html', text: 'İİİ target' }], 'TARGET', order)[0].hits[0].before).toBe('İİİ ');
  expect(searchTexts([{ path: 'a.html', text: 'ΟΔΟΣ' }], 'σ', order)[0].total).toBe(1);
  expect(foldCase('ΟΔΟΣ')).toBe('οδοσ');
});
test('capGroups limits total hits across groups', () => {
  const h = { before: '', match: 'x', after: '' };
  const g = (path: string, n: number): SearchGroup => ({ path, total: n, hits: Array(n).fill(h) });
  const r = capGroups([g('a', 20), g('b', 20), g('c', 20)], 30);
  expect(r.groups.map((x) => x.hits.length)).toEqual([20, 10]);
  expect(r.shown).toBe(30); expect(r.all).toBe(60);
  expect(capGroups([g('a', 5)], 30)).toMatchObject({ shown: 5, all: 5 });
});
