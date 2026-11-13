import { expect, test, type Frame, type Page } from '@playwright/test';
import { importFixture, openBook, scrollFrameTo } from './helpers';

const send = (page: Page, msg: object) => page.evaluate((m: object) => {
  const w = (document.querySelector('[data-testid=reader-frame]') as HTMLIFrameElement).contentWindow!;
  w.postMessage({ app: 'html-reader', protocolVersion: 1, ...m }, location.origin);
}, msg);
const inView = (f: Frame, sel: string) => f.locator(sel).evaluate((e: Element) => { const r = e.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; });
const supported = (f: Frame) => f.evaluate(() => 'highlights' in CSS);
const highlighted = (f: Frame) => f.evaluate(() => (CSS as any).highlights.has('hr-find'));
const hlText = (f: Frame) => f.evaluate(() => {
  const h = (CSS as any).highlights.get('hr-find');
  return h ? ([...h][0] as Range).toString().normalize('NFC') : null;
});
const scrollTop = (f: Frame) => f.evaluate(() => document.scrollingElement!.scrollTop);
const errs = (f: Frame) => f.evaluate(() => (window as any).__errs as string[]);

// In-frame error collector: runs in every frame (the book iframe included) on every navigation.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as any;
    w.__errs = [];
    addEventListener('error', (e) => w.__errs.push(e.message));
    addEventListener('unhandledrejection', (e) => w.__errs.push(String(e.reason)));
  });
});

async function openOther(page: Page): Promise<Frame> {
  await page.goto('/');
  const id = await importFixture(page, 'search.zip');
  const f = await openBook(page, id);
  await f.evaluate(() => { location.href = 'other.html'; });
  await expect(page.getByTestId('reader')).toHaveAttribute('data-path', 'other.html');
  await expect(page.getByTestId('reader')).toHaveAttribute('data-agent', 'ready');
  return f;
}

test('스니펫 문맥과 가장 잘 맞는 일치로 스크롤하고 잠시 강조한다', async ({ page }) => {
  await page.goto('/');
  const id = await importFixture(page, 'search.zip');
  const f = await openBook(page, id);
  await send(page, { type: 'find', query: '고래', snippet: '두 번째 고래 이야기 끝' });
  await expect.poll(() => inView(f, '#p170')).toBe(true);
  if (await supported(f)) {
    await expect.poll(() => highlighted(f)).toBe(true);
    await expect.poll(() => highlighted(f), { timeout: 4000 }).toBe(false);
    expect(await f.locator('style').count()).toBe(1);
  }
  expect(await errs(f)).toEqual([]);
});

test('스니펫이 안 맞으면 첫 일치로 폴백', async ({ page }) => {
  await page.goto('/');
  const id = await importFixture(page, 'search.zip');
  const f = await openBook(page, id);
  await send(page, { type: 'find', query: '고래', snippet: '전혀 다른 문맥 고래 없음' });
  await expect.poll(() => inView(f, '#p30')).toBe(true);
});

test('요소 경계에 걸친 일치를 찾고, 없는 검색어는 조용히 무시한다 (Review Focus 2)', async ({ page }) => {
  const f = await openOther(page);
  await send(page, { type: 'find', query: '없는검색어zz', snippet: '없는검색어zz' });
  await page.waitForTimeout(300);
  expect(await scrollTop(f)).toBe(0);
  await send(page, { type: 'find', query: '알파카', snippet: '여기 알파카 가 있다' });
  await expect.poll(() => inView(f, '#split')).toBe(true);
  if (await supported(f)) await expect.poll(() => hlText(f)).toBe('알파카');
  expect(await errs(f)).toEqual([]);
});

test('색인 형태(태그→공백) 검색어 "알 파카"도 경계 너머 일치를 찾는다 (P3-K6)', async ({ page }) => {
  const f = await openOther(page);
  await send(page, { type: 'find', query: '알 파카', snippet: '여기 알 파카 가 있다' });
  await expect.poll(() => inView(f, '#split')).toBe(true);
  if (await supported(f)) await expect.poll(() => hlText(f)).toBe('알파카');
  expect(await errs(f)).toEqual([]);
});

test('스크립트가 늦게 넣은 문장도 찾는다 (P3-K7a)', async ({ page }) => {
  const f = await openOther(page);
  await send(page, { type: 'find', query: '늦게 생긴 문장', snippet: '늦게 생긴 문장' });
  await expect.poll(() => inView(f, '#late')).toBe(true);
  expect(await errs(f)).toEqual([]);
});

test('NFD로 분해된 DOM 텍스트도 찾고 강조 범위가 정확하다', async ({ page }) => {
  const f = await openOther(page);
  await f.evaluate(() => {
    const p = document.createElement('p');
    p.id = 'nfd';
    p.textContent = '바다의 해달 이야기'.normalize('NFD');
    document.getElementById('p60')!.after(p);
  });
  await send(page, { type: 'find', query: '해달', snippet: '바다의 해달 이야기' });
  await expect.poll(() => inView(f, '#nfd')).toBe(true);
  if (await supported(f)) await expect.poll(() => hlText(f)).toBe('해달');
  expect(await errs(f)).toEqual([]);
});

test('init.restore.find: 찾으면 그 위치로, 없으면 현재 위치 그대로 (P3-K7b)', async ({ page }) => {
  await page.goto('/');
  const id = await importFixture(page, 'search.zip');
  const f = await openBook(page, id);
  await send(page, { type: 'init', textScale: 1, restore: { find: { query: '고래', snippet: '두 번째 고래 이야기 끝' } } });
  await expect.poll(() => inView(f, '#p170')).toBe(true);

  await scrollFrameTo(f, 0.4);
  const mid = await scrollTop(f);
  expect(mid).toBeGreaterThan(0);
  await send(page, { type: 'init', textScale: 1, restore: { find: { query: '없는검색어zz', snippet: '없는검색어zz' } } });
  await page.waitForTimeout(1200); // past the whenStable retry (500ms quiet)
  expect(await scrollTop(f)).toBe(mid);
  expect(await errs(f)).toEqual([]);
});

// Posts init.restore.find and, in the same tick, schedules a post-load insertion of the target text inside the frame.
const restoreLate = (page: Page, opts: { wheel: boolean }) => page.evaluate((o) => {
  const w = (document.querySelector('[data-testid=reader-frame]') as HTMLIFrameElement).contentWindow as Window & typeof globalThis;
  w.postMessage({ app: 'html-reader', protocolVersion: 1, type: 'init', textScale: 1, restore: { find: { query: '로드 뒤 생긴 문장', snippet: '로드 뒤 생긴 문장' } } }, location.origin);
  w.setTimeout(() => w.document.body.insertAdjacentHTML('beforeend', '<p id="later">로드 뒤 생긴 문장</p>'), 200);
  if (o.wheel) w.setTimeout(() => w.document.body.dispatchEvent(new w.WheelEvent('wheel', { bubbles: true, deltaY: 10 })), 50);
}, opts);

test('init.restore.find: 로드 뒤 생긴 문장은 whenStable 재시도로 찾는다', async ({ page }) => {
  const f = await openOther(page);
  await restoreLate(page, { wheel: false });
  await expect.poll(() => inView(f, '#later')).toBe(true);
  expect(await errs(f)).toEqual([]);
});

test('init.restore.find: 재시도 전에 사용자가 스크롤하면 재시도하지 않는다 (§6.7-3)', async ({ page }) => {
  const f = await openOther(page);
  await restoreLate(page, { wheel: true });
  await expect(f.locator('#later')).toHaveCount(1);
  await page.waitForTimeout(1500); // past the whenStable retry
  expect(await scrollTop(f)).toBe(0);
  expect(await errs(f)).toEqual([]);
});

test('숨은 일치(닫힌 details, display:none)는 건너뛰고, 숨은 것뿐이면 무시한다', async ({ page }) => {
  const f = await openOther(page);
  await f.evaluate(() => {
    document.getElementById('p20')!.insertAdjacentHTML('afterend', '<details><summary>열기</summary><p id="hid1">숨은 수달 문장</p></details>');
    document.getElementById('p30')!.insertAdjacentHTML('afterend', '<p id="hid2" style="display:none">숨은 수달 문장</p>');
    document.getElementById('p150')!.insertAdjacentHTML('afterend', '<p id="vis">숨은 수달 문장</p>');
  });
  await send(page, { type: 'find', query: '숨은 수달', snippet: '숨은 수달 문장' });
  await expect.poll(() => inView(f, '#vis')).toBe(true);

  await f.evaluate(() => document.getElementById('vis')!.remove());
  await scrollFrameTo(f, 0.3);
  const at = await scrollTop(f);
  if (await supported(f)) await expect.poll(() => highlighted(f), { timeout: 4000 }).toBe(false);
  await send(page, { type: 'find', query: '숨은 수달', snippet: '숨은 수달 문장' });
  await page.waitForTimeout(300);
  expect(await scrollTop(f)).toBe(at);
  if (await supported(f)) expect(await highlighted(f)).toBe(false);
  expect(await errs(f)).toEqual([]);
});

test('내부 스크롤러 + textScale 1.5에서도 일치를 화면에 보인다', async ({ page }) => {
  await page.goto('/');
  const id = await importFixture(page, '04-inner-scroll.zip');
  const f = await openBook(page, id);
  await send(page, { type: 'init', textScale: 1.5 });
  await send(page, { type: 'find', query: '문단 150', snippet: '문단 150 이것은' });
  await expect.poll(() => inView(f, '#p150')).toBe(true);
});
