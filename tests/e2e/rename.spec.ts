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
  await expect.poll(() => idbGet(page, 'books', b)).toMatchObject({ title: '2분기 최종본', sourceName: 'title-b' });
  await expect(page.getByTestId('rename-dialog')).toHaveCount(0);
  await expect(page.locator(`[data-book-id="${b}"] [data-testid=book-menu]`)).toBeFocused();        // 저장 뒤 포커스: 카드의 ⋯ 버튼
  expect(await importFixture(page, 'title-b.zip', { dup: 'replace' })).toBe(b);
  await expect.poll(async () => (await idbGet(page, 'books', b)).cacheName).toMatch(/-v2$/);
  await expect.poll(async () => (await idbGet(page, 'books', b)).title).toBe('2분기 최종본');
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

test('Escape로 닫으면 카드의 ⋯ 버튼으로 포커스가 돌아온다', async ({ page }) => {
  await page.goto('/');
  const a = await importFixture(page, 'title-a.zip');
  await rename(page, a, '바뀐 이름');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('rename-dialog')).toHaveCount(0);
  await expect(page.locator(`[data-book-id="${a}"] [data-testid=book-menu]`)).toBeFocused();
  await expect(page.locator(`[data-book-id="${a}"]`)).toHaveAttribute('data-title', '보고서');
});

test('저장이 실패하면 대화상자가 열린 채 오류를 보이고, 다시 저장할 수 있다', async ({ page }) => {
  await page.goto('/');
  const a = await importFixture(page, 'title-a.zip');
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    (window as any).__putRestore = () => { IDBObjectStore.prototype.put = put; };
    IDBObjectStore.prototype.put = function (v: any, k?: any) {
      if (v && v.title === '실패 이름') throw new DOMException('forced', 'DataError');
      return put.call(this, v, k);
    };
  });
  await rename(page, a, '실패 이름');
  await page.getByTestId('rename-save').click();
  await expect(page.getByTestId('rename-save-error')).toHaveText('이름을 저장하지 못했습니다.');
  await expect(page.getByTestId('rename-dialog')).toBeVisible();
  await expect(page.getByTestId('rename-save')).toBeEnabled();
  await page.evaluate(() => (window as any).__putRestore());
  await page.getByTestId('rename-save').click();
  await expect(page.getByTestId('rename-dialog')).toHaveCount(0);
  await expect(page.locator(`[data-book-id="${a}"]`)).toHaveAttribute('data-title', '실패 이름');
});
