import { expect, test } from 'vitest';
import { orderedPages } from '../../src/lib/file-tree';
import { formatPageInfo } from '../../src/lib/progress';
test('orderedPages는 경로 자연 정렬', () =>
  expect(orderedPages(['index.html', 'ch10.html', 'ch2.html', 'a/z.html', 'a/b.html'])).toEqual(['a/b.html', 'a/z.html', 'ch2.html', 'ch10.html', 'index.html']));
test('formatPageInfo', () => {
  const p = ['a.html', 'b.html', 'c.html'];
  expect(formatPageInfo(p, 'b.html', 62.9)).toBe('2 / 3쪽 · 62%');
  expect(formatPageInfo(p, 'frag.html', 0)).toBe('– / 3쪽 · 0%');
  expect(formatPageInfo(p, 'c.html', 100)).toBe('3 / 3쪽 · 100%');
});
