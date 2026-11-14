import { expect, test } from 'vitest';
import { filterBooks, sortBooks } from '../../src/lib/library-sort';
const b = (id: string, title: string, importedAt: number, lastOpenedAt = 0, sourceName = id) => ({ id, title, sourceName, importedAt, lastOpenedAt } as any);
const books = [b('a', '문서 10', 1, 50), b('b', '문서 2', 3, 0), b('c', '가나 Alpha', 2, 40)];
const ids = (x: any[]) => x.map((v) => v.id).join('');
test('정렬', () => {
  const pct = new Map([['a', 10], ['b', 90], ['c', 90]]);
  expect(ids(sortBooks(books, 'recent', pct))).toBe('acb');
  expect(ids(sortBooks(books, 'imported', pct))).toBe('bca');
  expect(ids(sortBooks(books, 'name', pct))).toBe('cba');
  expect(ids(sortBooks(books, 'progress', pct))).toBe('cba');
  expect(ids(books)).toBe('abc');
});
test('필터', () => {
  expect(ids(filterBooks(books, '문서'))).toBe('ab');
  expect(ids(filterBooks(books, 'ALPH'))).toBe('c');
  expect(ids(filterBooks([b('x', '제목', 1, 0, 'q3-report')], 'Q3'))).toBe('x');
  expect(ids(filterBooks(books, '  '))).toBe('abc');
  expect(ids(filterBooks(books, '문서'.normalize('NFD')))).toBe('ab');
});
