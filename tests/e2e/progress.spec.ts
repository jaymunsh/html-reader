import { expect, test } from '@playwright/test';
import { backToLibrary, idbGet, importFixture, openBook, scrollFrameTo } from './helpers';

const prog = (page: any, id: string, path: string) => idbGet(page, 'progress', [id, path]);

test('핸드셰이크: ready 상태가 되고 제목·경로가 전달된다', async ({ page }) => {
  await page.goto('/');
  const id = await importFixture(page, '01-multipage.zip');
  // Record every data-agent value so we can assert it never passes through 'limited'.
  await page.evaluate(() => {
    const w = window as any;
    w.__agentStates = [];
    new MutationObserver(() => {
      const el = document.querySelector('[data-testid=reader]');
      const v = el?.getAttribute('data-agent');
      if (v && w.__agentStates[w.__agentStates.length - 1] !== v) w.__agentStates.push(v);
    }).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-agent'] });
  });
  await openBook(page, id);
  await expect(page.getByTestId('reader')).toHaveAttribute('data-agent', 'ready');
  await expect(page.getByTestId('reader')).toHaveAttribute('data-path', 'index.html');
  const states: string[] = await page.evaluate(() => (window as any).__agentStates);
  expect(states).not.toContain('limited');
  expect(states[states.length - 1]).toBe('ready');
});

test('스크롤 → 진행률(최댓값) 저장 → 재실행 후 같은 페이지·같은 위치로 이어 읽기', async ({ page }) => {
  await page.goto('/');
  const id = await importFixture(page, '01-multipage.zip');
  let f = await openBook(page, id);
  await f.locator('#rel').click();
  await expect(page.getByTestId('reader')).toHaveAttribute('data-path', 'page2.html');
  await scrollFrameTo(f, 0.6);
  await scrollFrameTo(f, 0.4);                                                   // 되돌아가도 maxPct는 유지
  await expect.poll(async () => (await prog(page, id, 'page2.html'))?.lastScrollRatio, { timeout: 5000 }).toBeCloseTo(0.4, 1);
  const p = await prog(page, id, 'page2.html');
  expect(p.maxPct).toBeGreaterThan(60); expect(p.read).toBe(false);

  await page.reload();                                                           // 재실행
  f = await openBook(page, id);
  await expect(page.getByTestId('reader')).toHaveAttribute('data-path', 'page2.html');
  await expect.poll(() => f.evaluate(() => { const e = document.scrollingElement!; return e.scrollTop / (e.scrollHeight - e.clientHeight); }), { timeout: 6000 }).toBeCloseTo(0.4, 1);
});

test('끝까지 읽으면 read=true', async ({ page }) => {
  await page.goto('/');
  const id = await importFixture(page, '10-single.html');
  const f = await openBook(page, id);
  await scrollFrameTo(f, 1);
  await expect.poll(async () => (await prog(page, id, '10-single.html'))?.read, { timeout: 5000 }).toBe(true);
});

test('스크롤 없는 페이지는 안정화 후 100%', async ({ page }) => {
  await page.goto('/');
  const id = await importFixture(page, '12-frame-escape.zip');                   // 짧은 페이지
  await openBook(page, id);
  await expect.poll(async () => (await prog(page, id, 'index.html'))?.maxPct, { timeout: 8000 }).toBe(100);
});

test('내부 div 스크롤 컨테이너 문서', async ({ page }) => {
  await page.goto('/');
  const id = await importFixture(page, '04-inner-scroll.zip');
  let f = await openBook(page, id);
  await f.locator('#scroller').evaluate((e) => { e.scrollTop = (e.scrollHeight - e.clientHeight) * 0.5; });
  await expect.poll(async () => (await prog(page, id, 'index.html'))?.lastScrollRatio, { timeout: 5000 }).toBeCloseTo(0.5, 1);
  await backToLibrary(page);
  f = await openBook(page, id);
  await expect.poll(() => f.locator('#scroller').evaluate((e) => e.scrollTop / (e.scrollHeight - e.clientHeight)), { timeout: 6000 }).toBeCloseTo(0.5, 1);
});

test('서재로 나갈 때·탭이 숨겨질 때 즉시 저장', async ({ page }) => {
  await page.goto('/');
  const id = await importFixture(page, '10-single.html');
  const f = await openBook(page, id);
  await scrollFrameTo(f, 0.3);
  await backToLibrary(page);                                                     // 디바운스 1초를 기다리지 않는다
  expect((await prog(page, id, '10-single.html')).lastScrollRatio).toBeCloseTo(0.3, 1);
});

test('문서 안 링크 이동과 뒤로 가기를 셸이 따라간다', async ({ page }) => {
  await page.goto('/');
  const id = await importFixture(page, '01-multipage.zip');
  const f = await openBook(page, id);
  await scrollFrameTo(f, 0.5);
  await f.locator('#rel').evaluate((a: HTMLAnchorElement) => a.click());
  await expect(page.getByTestId('reader')).toHaveAttribute('data-path', 'page2.html');
  await f.evaluate(() => history.back());
  await expect(page.getByTestId('reader')).toHaveAttribute('data-path', 'index.html');   // 셸이 뒤로 가기도 따라간다
});
