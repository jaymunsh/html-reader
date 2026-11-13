import { expect, test } from '@playwright/test';
import { backToLibrary, idbGet, importFixture, openBook } from './helpers';

test('책갈피 탭: 모양·위치·터치 영역, 누르면 오버레이가 열린다', async ({ page }) => {
  await page.goto('/');
  const id = await importFixture(page, '10-single.html');
  await openBook(page, id);
  const hit = (await page.getByTestId('ribbon-tab').boundingBox())!, shape = (await page.getByTestId('ribbon-shape').boundingBox())!;
  expect(hit.width).toBeGreaterThanOrEqual(44); expect(hit.height).toBeGreaterThanOrEqual(44);
  expect([shape.width, shape.height]).toEqual([14, 26]);
  expect(Math.round(shape.x + shape.width)).toBe(page.viewportSize()!.width);
  expect(shape.y).toBeGreaterThan(130); expect(shape.y).toBeLessThan(190);
  expect(await page.getByTestId('ribbon-shape').evaluate((e) => getComputedStyle(e).opacity)).toBe('0.35');
  await page.getByTestId('ribbon-tab').tap();
  await expect(page.getByTestId('reader')).toHaveAttribute('data-overlay', 'open');
});

test('agent 없는 모드에서도 책갈피 탭으로 열 수 있다', async ({ page }) => {
  await page.goto('/');
  const id = await importFixture(page, '13-csp.zip');
  await page.locator(`[data-book-id="${id}"]`).click();
  await expect(page.getByTestId('reader')).toHaveAttribute('data-agent', 'limited', { timeout: 5000 });
  await page.getByTestId('ribbon-tab').tap();
  await expect(page.getByTestId('overlay-top')).toBeVisible();
  await page.getByTestId('reader-back').tap();
  await expect(page.getByTestId('library')).toBeVisible();
});

test('첫 실행 안내는 한 번만', async ({ page }) => {
  await page.goto('/');
  const id = await importFixture(page, '10-single.html');
  await openBook(page, id);
  await expect(page.getByTestId('hint-toast')).toContainText('빈 곳을 한 번 탭하면 메뉴가 열려요 — 링크·버튼은 그대로 동작해요. 오른쪽 가장자리 탭으로도 열 수 있어요.');
  await page.getByTestId('hint-ok').tap();
  await expect(page.getByTestId('hint-toast')).toHaveCount(0);
  await expect.poll(() => idbGet(page, 'settings', 'hintSeen')).toBe(true);
  await backToLibrary(page);
  await openBook(page, id);
  await expect(page.getByTestId('hint-toast')).toHaveCount(0);
});

test('오버레이를 한 번 열어도 안내가 사라진다', async ({ page }) => {
  await page.goto('/');
  const id = await importFixture(page, '10-single.html');
  await openBook(page, id);
  await expect(page.getByTestId('hint-toast')).toBeVisible();
  await page.getByTestId('ribbon-tab').tap();
  await expect(page.getByTestId('hint-toast')).toHaveCount(0);
  await expect.poll(() => idbGet(page, 'settings', 'hintSeen')).toBe(true);
});
