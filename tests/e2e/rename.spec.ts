import { expect, test } from '@playwright/test';
import { idbGet, importFixture } from './helpers';

async function rename(page: any, id: string, value: string) {
  await page.locator(`[data-book-id="${id}"] [data-testid=book-menu]`).click();
  await page.getByTestId('menu-rename').click();
  await page.getByTestId('rename-input').fill(value);
}

test('같은 제목 → 접미사 자동 부여 → 이름 바꾸기 → 교체 재가져오기 후에도 유지', async ({ page }) => {
  await page.goto('/');
  const a = await importFixture(page, 'title-a.zip'), b = await importFixture(page, 'title-b.zip');
  await expect(page.locator(`[data-book-id="${a}"]`)).toHaveAttribute('data-title', '보고서');
  await expect(page.locator(`[data-book-id="${b}"]`)).toHaveAttribute('data-title', '보고서 (2)');
  await expect(page.locator(`[data-book-id="${b}"]`)).toContainText('title-b');
  await rename(page, b, '  2분기 최종본  ');
  await page.getByTestId('rename-save').click();
  await expect(page.locator(`[data-book-id="${b}"]`)).toHaveAttribute('data-title', '2분기 최종본');
  expect(await idbGet(page, 'books', b)).toMatchObject({ title: '2분기 최종본', sourceName: 'title-b' });
  expect(await importFixture(page, 'title-b.zip', { dup: 'replace' })).toBe(b);
  expect((await idbGet(page, 'books', b)).cacheName).toMatch(/-v2$/);
  expect((await idbGet(page, 'books', b)).title).toBe('2분기 최종본');
});

test('빈 이름·101자는 저장 불가, 중복 이름은 경고만', async ({ page }) => {
  await page.goto('/');
  const a = await importFixture(page, 'title-a.zip'), b = await importFixture(page, 'title-b.zip');
  await rename(page, b, '   ');
  await expect(page.getByTestId('rename-save')).toBeDisabled();
  await page.getByTestId('rename-input').fill('가'.repeat(101));
  await expect(page.getByTestId('rename-save')).toBeDisabled();
  await page.getByTestId('rename-input').fill('보고서');
  await expect(page.getByTestId('dup-name-warning')).toBeVisible();
  await page.getByTestId('rename-save').click();
  await expect(page.locator(`[data-book-id="${b}"]`)).toHaveAttribute('data-title', '보고서');
  await expect(page.locator(`[data-book-id="${a}"]`)).toHaveAttribute('data-title', '보고서');
});
