import { expect, test } from '@playwright/test';
import { idbGet, importFixture, openBook, scrollFrameTo } from './helpers';

test('공통 시나리오: 가져오기 → 읽기 → 진행률 저장 → 재실행 후 이어 읽기 → 오프라인 재실행', async ({ page, context }) => {
  await page.goto('/');
  const id = await importFixture(page, '01-multipage.zip');
  let f = await openBook(page, id);
  await f.locator('#abs').click();                                              // 루트 절대경로 이동
  await expect(page.getByTestId('reader')).toHaveAttribute('data-path', 'page2.html');
  await scrollFrameTo(f, 0.5);
  await expect.poll(async () => (await idbGet(page, 'progress', [id, 'page2.html']))?.lastScrollRatio, { timeout: 5000 }).toBeCloseTo(0.5, 1);

  await context.setOffline(true);
  await page.reload();                                                          // 오프라인 재실행
  await expect(page.locator(`[data-book-id="${id}"]`)).toBeVisible();
  f = await openBook(page, id);
  await expect(page.getByTestId('reader')).toHaveAttribute('data-path', 'page2.html');
  await expect(page.getByTestId('reader')).toHaveAttribute('data-agent', 'ready');
  expect(await f.locator('#h').evaluate((e) => getComputedStyle(e).color)).toBe('rgb(4, 5, 6)');
  await expect.poll(() => f.evaluate(() => { const e = document.scrollingElement!; return e.scrollTop / (e.scrollHeight - e.clientHeight); }), { timeout: 6000 }).toBeCloseTo(0.5, 1);
  await context.setOffline(false);
});

test('오프라인에서도 새 문서를 가져와 읽을 수 있다', async ({ page, context }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await page.reload();                                                          // 프리캐시가 채워진 뒤
  await context.setOffline(true);
  const id = await importFixture(page, '02-fetch-module.zip');
  const f = await openBook(page, id);
  await expect.poll(() => f.evaluate(() => (window as any).__mod)).toBeTruthy();
  await context.setOffline(false);
});
