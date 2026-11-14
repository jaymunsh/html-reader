import { expect, test } from 'vitest';
import { pickReplaceEntry, planReplace } from '../../src/lib/reimport';

test('남은 경로의 기록은 유지, 사라진 경로는 삭제', () => {
  expect(planReplace({ newPaths: ['index.html', 'keep.html', 'new.html', 'a.css'], progressPaths: ['index.html', 'keep.html', 'gone.html'],
    bookmarks: [{ id: '1', path: 'keep.html' }, { id: '2', path: 'gone.html' }], lastPath: 'keep.html', newEntryPath: 'index.html' }))
    .toEqual({ dropProgress: ['gone.html'], dropBookmarkIds: ['2'], lastPath: 'keep.html' });
});
test('lastPath가 사라졌으면 entryPath로', () => {
  expect(planReplace({ newPaths: ['index.html'], progressPaths: [], bookmarks: [], lastPath: 'gone.html', newEntryPath: 'index.html' }).lastPath).toBe('index.html');
  expect(planReplace({ newPaths: ['index.html'], progressPaths: [], bookmarks: [], lastPath: '', newEntryPath: 'index.html' }).lastPath).toBe('');
});
test('pickReplaceEntry', () => {
  expect(pickReplaceEntry(['a.html', 'index.html'], 'a.html')).toBe('index.html');
  expect(pickReplaceEntry(['a.html', 'b.html'], 'b.html')).toBe('b.html');
  expect(pickReplaceEntry(['a.html', 'b.html'], 'gone.html')).toBeNull();
});
