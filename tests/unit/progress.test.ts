import { expect, test, vi } from 'vitest';
import { applyScroll, bookProgress, pagePct, ProgressTracker } from '../../src/lib/progress';

test('pagePct', () => {
  expect(pagePct(0, 500, 2000)).toBe(25);
  expect(pagePct(1500, 500, 2000)).toBe(100);
  expect(pagePct(0, 500, 500)).toBe(100);
  expect(pagePct(0, 0, 0)).toBe(100);
  expect(pagePct(1600, 500, 2000)).toBe(100);          // 오버스크롤은 100으로 자른다
});
test('applyScroll: 최댓값 유지, 98% 이상이면 읽음, 위치는 마지막 값', () => {
  let p = applyScroll(undefined, 'b', 'a.html', 40, 0.3, 1);
  expect(p).toEqual({ bookId: 'b', path: 'a.html', maxPct: 40, lastScrollRatio: 0.3, read: false, updatedAt: 1 });
  p = applyScroll(p, 'b', 'a.html', 98, 0.97, 2); expect(p).toMatchObject({ maxPct: 98, read: true });
  p = applyScroll(p, 'b', 'a.html', 10, 0.05, 3); expect(p).toMatchObject({ maxPct: 98, read: true, lastScrollRatio: 0.05, updatedAt: 3 });
  expect(applyScroll(undefined, 'b', 'a.html', 97.9, 0.9, 1).read).toBe(false);
});
test('bookProgress: pagePaths 평균, 미방문은 0, 목록 밖 경로는 무시', () => {
  const m = new Map([['a.html', { maxPct: 100, read: true }], ['b.html', { maxPct: 50, read: false }], ['frag.html', { maxPct: 100, read: true }]] as any);
  expect(bookProgress(['a.html', 'b.html', 'c.html', 'd.html'], m)).toEqual({ pct: 37.5, readCount: 1, total: 4 });
  expect(bookProgress([], new Map())).toEqual({ pct: 0, readCount: 0, total: 0 });
});
test('ProgressTracker: 1초 디바운스, flush는 즉시', async () => {
  vi.useFakeTimers();
  const saved: any[] = [];
  const t = new ProgressTracker('b', new Map(), async (p) => { saved.push({ ...p }); });
  t.update('a.html', 10, 0.1); t.update('a.html', 30, 0.3); t.update('b.html', 5, 0.05);
  expect(t.get('a.html')!.maxPct).toBe(30);
  expect(saved).toEqual([]);
  await vi.advanceTimersByTimeAsync(999); expect(saved).toEqual([]);
  await vi.advanceTimersByTimeAsync(1);
  expect(saved.map((p) => [p.path, p.maxPct])).toEqual([['a.html', 30], ['b.html', 5]]);
  t.update('a.html', 60, 0.6); await t.flush();
  expect(saved.at(-1)).toMatchObject({ path: 'a.html', maxPct: 60 });
  await t.flush(); expect(saved.length).toBe(3);        // 더러운 페이지가 없으면 저장 안 함
  vi.useRealTimers();
});
