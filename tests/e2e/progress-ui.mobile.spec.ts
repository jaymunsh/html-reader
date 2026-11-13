import { expect, test } from '@playwright/test';
import { backToLibrary, importFixture, openBook, openOverlay, scrollFrameTo } from './helpers';

test('진행선이 스크롤을 따라가고 설정에서 끌 수 있다', async ({ page }) => {
  await page.goto('/');
  const id = await importFixture(page, '01-multipage.zip');
  const f = await openBook(page, id);
  const line = page.getByTestId('progress-line');
  await expect(line).toBeVisible();
  expect((await line.boundingBox())!.height).toBe(2);
  expect(Math.round((await line.boundingBox())!.y + 2)).toBe(page.viewportSize()!.height);
  await scrollFrameTo(f, 0.5);
  await expect.poll(async () => Number(await line.getAttribute('data-pct'))).toBeGreaterThan(40);
  await openOverlay(page);
  await expect(line).toHaveCSS('opacity', '0');
  await page.getByTestId('overlay-top').dispatchEvent('pointerdown');
  await page.touchscreen.tap(page.viewportSize()!.width / 2, page.viewportSize()!.height / 2);
  await expect(page.getByTestId('reader')).toHaveAttribute('data-overlay', 'closed');
  await expect(line).toHaveCSS('opacity', '1');
  await backToLibrary(page);
  await page.getByTestId('settings-button').click();
  await page.getByTestId('setting-progress-line').uncheck();
  await page.getByTestId('settings-back').click();
  await openBook(page, id);
  await expect(page.getByTestId('progress-line')).toHaveCount(0);
});

test('쪽 정보와 진행 바, 페이지 이동 시 갱신 (Review Focus 1)', async ({ page }) => {
  await page.goto('/');
  const id = await importFixture(page, '01-multipage.zip');
  const f = await openBook(page, id);
  await scrollFrameTo(f, 1);
  await openOverlay(page);
  await expect(page.getByTestId('page-info')).toHaveText('2 / 5쪽 · 20%');
  await expect.poll(async () => Number(await page.getByTestId('progress-bar').getAttribute('data-pct'))).toBeGreaterThanOrEqual(98);
  await f.locator('#rel').evaluate((a: HTMLAnchorElement) => a.click());
  await expect(page.getByTestId('page-info')).toHaveText(/^4 \/ 5쪽 · \d+%$/);
  await expect.poll(async () => Number(await page.getByTestId('progress-bar').getAttribute('data-pct'))).toBeLessThan(50);
});

test('목록에 없는 페이지에서는 – / N쪽', async ({ page }) => {
  await page.goto('/');
  const id = await importFixture(page, '02-fetch-module.zip');
  const f = await openBook(page, id);
  await f.evaluate(() => { location.href = 'frag.html'; });
  await expect(page.getByTestId('reader')).toHaveAttribute('data-path', 'frag.html');
  await openOverlay(page);
  await expect(page.getByTestId('page-info')).toHaveText(/^– \/ 1쪽/);
});
