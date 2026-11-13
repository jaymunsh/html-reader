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
