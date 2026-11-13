import { expect, test } from '@playwright/test';
import { idbGet, importFixture, openBook } from './helpers';

test('테마: 시스템 기본 → 다크 선택 → 재실행 후 유지, 문서에는 적용 안 됨', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByTestId('settings-button').click();
  await expect(page.locator('html')).toHaveAttribute('data-screen', 'settings');
  await expect(page.getByTestId('theme-system')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('theme-dark').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(16, 18, 22)');
  await expect.poll(() => idbGet(page, 'settings', 'theme')).toBe('dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const id = await importFixture(page, '10-single.html');
  const f = await openBook(page, id);
  expect(await f.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgba(0, 0, 0, 0)');   // 문서 원본 그대로
});

test('설정 화면에 저장소 영속 상태가 보인다', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('settings-button').click();
  await expect(page.getByTestId('persist-status')).toContainText('영구 저장:');
  await page.getByTestId('settings-back').click();
  await expect(page.getByTestId('library')).toBeVisible();
});

test('글꼴은 번들되어 오프라인에서도 로드된다', async ({ page, context }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await page.reload();
  await context.setOffline(true);
  await page.reload();
  expect(await page.evaluate(() => getComputedStyle(document.body).fontFamily)).toMatch(/Pretendard Variable/);
  expect(await page.evaluate(async () => { await document.fonts.load('16px "Pretendard Variable"', '서재'); return document.fonts.check('16px "Pretendard Variable"', '서재'); })).toBe(true);
  await context.setOffline(false);
});
