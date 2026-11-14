import 'fake-indexeddb/auto';
import { expect, test } from 'vitest';
import { defaultBookmarkLabel, findNearBookmark, newBookmark, normalizeLabel } from '../../src/lib/bookmarks';
import { deleteBookmark, listBookmarks, putBookmark } from '../../src/lib/storage';

const bm = (id: string, path: string, scrollRatio: number) => ({ id, bookId: 'b', path, scrollRatio, label: 'x', createdAt: 1 });
test('2% 이내면 같은 북마크', () => {
  const list = [bm('1', 'a.html', 0.5), bm('2', 'a.html', 0.515), bm('3', 'b.html', 0.5)];
  expect(findNearBookmark(list, 'a.html', 0.52)?.id).toBe('2');
  expect(findNearBookmark(list, 'a.html', 0.48)?.id).toBe('1');
  expect(findNearBookmark(list, 'a.html', 0.5401)).toBeUndefined();
  expect(findNearBookmark(list, 'c.html', 0.5)).toBeUndefined();
});
test('임계값 바로 밖은 다른 북마크 (epsilon이 임계값을 넓히지 않음)', () => {
  expect(findNearBookmark([bm('1', 'a.html', 0.5)], 'a.html', 0.5201)).toBeUndefined();
});
test('기본 이름·이름 정리', () => {
  expect(defaultBookmarkLabel('chapters/3장.html', 0.616)).toBe('3장.html · 62%');
  expect(normalizeLabel('  내 표시  ', 'f')).toBe('내 표시');
  expect(normalizeLabel('   ', 'a.html · 10%')).toBe('a.html · 10%');
  expect(normalizeLabel('가'.repeat(150), 'f')).toHaveLength(100);
});
test('newBookmark', () => expect(newBookmark('b', 'a.html', 0.25, 9)).toMatchObject({ bookId: 'b', path: 'a.html', scrollRatio: 0.25, label: 'a.html · 25%', createdAt: 9 }));
test('저장소', async () => {
  await putBookmark({ ...bm('1', 'a.html', 0.1), createdAt: 1 }); await putBookmark({ ...bm('2', 'a.html', 0.9), createdAt: 2 });
  await putBookmark({ ...bm('3', 'a.html', 0.5), bookId: 'other' });
  expect((await listBookmarks('b')).map((x) => x.id)).toEqual(['2', '1']);
  await deleteBookmark('2');
  expect((await listBookmarks('b')).map((x) => x.id)).toEqual(['1']);
});
