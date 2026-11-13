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

test('applyScroll: 비유한 값은 무시, 범위는 자른다', () => {
  const p = applyScroll(undefined, 'b', 'a.html', 50, 0.5, 1);
  expect(applyScroll(p, 'b', 'a.html', NaN, 0.9, 2)).toBe(p);
  expect(applyScroll(p, 'b', 'a.html', 60, Infinity, 2)).toBe(p);
  expect(applyScroll(p, 'b', 'a.html', 150, -1, 2)).toMatchObject({ maxPct: 100, lastScrollRatio: 0 });
});

test('ProgressTracker: 3개 중 1번째 저장 실패 → 나머지는 저장, 실패분은 재예약 재시도, 타이머 경로는 unhandled rejection 없음', async () => {
  vi.useFakeTimers();
  const unhandled: unknown[] = [];
  const onUnhandled = (e: unknown) => unhandled.push(e);
  process.on('unhandledRejection', onUnhandled);
  const saved: string[] = [];
  let fail = true;
  const save = vi.fn(async (p: any) => { if (fail && p.path === 'p1') throw new Error('idb'); saved.push(p.path); });
  const t = new ProgressTracker('b', new Map(), save);
  t.update('p1', 10, 0.1); t.update('p2', 20, 0.2); t.update('p3', 30, 0.3);
  await vi.advanceTimersByTimeAsync(1000);          // 타이머 경로: 실패해도 던지지 않는다
  expect(saved).toEqual(['p2', 'p3']);
  expect(save).toHaveBeenCalledTimes(3);
  fail = false;
  await vi.advanceTimersByTimeAsync(999); expect(saved).toEqual(['p2', 'p3']);
  await vi.advanceTimersByTimeAsync(1);              // 재예약된 재시도
  expect(saved).toEqual(['p2', 'p3', 'p1']);
  await t.flush(); expect(save).toHaveBeenCalledTimes(4);
  await vi.advanceTimersByTimeAsync(5000); expect(save).toHaveBeenCalledTimes(4);
  expect(unhandled).toEqual([]);
  process.off('unhandledRejection', onUnhandled);
  vi.useRealTimers();
});

test('ProgressTracker: 명시적 flush는 첫 오류를 던지고 실패한 페이지들을 더러운 채 둔다', async () => {
  vi.useFakeTimers();
  let fail = true;
  const saved: string[] = [];
  const t = new ProgressTracker('b', new Map(), async (p) => { if (fail) throw new Error('boom'); saved.push(p.path); });
  t.update('p1', 10, 0.1); t.update('p2', 20, 0.2); t.update('p3', 30, 0.3);
  await expect(t.flush()).rejects.toThrow('boom');
  fail = false;
  await t.flush();
  expect(saved).toEqual(['p1', 'p2', 'p3']);
  vi.useRealTimers();
});

test('ProgressTracker: 동시 flush는 진행 중인 flush를 기다린다', async () => {
  const order: string[] = [];
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  const t = new ProgressTracker('b', new Map(), async (p) => { order.push('start:' + p.path); await gate; order.push('end:' + p.path); });
  t.update('a', 10, 0.1);
  const f1 = t.flush();
  await Promise.resolve();
  const f2 = t.flush().then(() => order.push('f2'));
  release(); await f1; await f2;
  expect(order).toEqual(['start:a', 'end:a', 'f2']);
});
