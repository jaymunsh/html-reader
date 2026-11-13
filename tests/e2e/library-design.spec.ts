import { expect, test } from '@playwright/test';
import { importFixture, startImport } from './helpers';

test('빈 서재와 하단 바', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('library')).toContainText('아직 문서가 없습니다');
  await expect(page.getByRole('heading', { level: 1, name: '서재' })).toBeVisible();
  const btn = (await page.getByTestId('import-button').boundingBox())!, vp = page.viewportSize()!;
  expect(btn.height).toBeGreaterThanOrEqual(44);
  expect(btn.y + btn.height).toBeGreaterThan(vp.height - 80);
  expect(await page.getByTestId('import-button').evaluate((e) => getComputedStyle(e.closest('[data-bar]')!).position)).toBe('fixed');
});

test('카드: 링·보조 정보·터치 크기', async ({ page }) => {
  await page.goto('/');
  const id = await importFixture(page, '01-multipage.zip');
  const card = page.locator(`[data-book-id="${id}"]`);
  await expect(card.getByRole('img', { name: '진행률 0%' })).toBeVisible();
  const d = new Date(); const date = `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
  await expect(card).toContainText(`01-multipage · ${date}`);
  await expect(card.getByTestId('book-pages')).toHaveText('0/5쪽');
  await expect(card).toContainText('안 읽음');                                // 마지막으로 연 시각 (P2-K13)
  const menu = (await card.getByTestId('book-menu').boundingBox())!;
  expect(Math.min(menu.width, menu.height)).toBeGreaterThanOrEqual(44);
  expect(await card.evaluate((e) => getComputedStyle(e).borderRadius)).toBe('22px');
});

test('카드 메뉴는 우클릭으로도 열린다', async ({ page, isMobile }) => {
  test.skip(isMobile, '우클릭은 PC');
  await page.goto('/');
  const id = await importFixture(page, '10-single.html');
  await page.locator(`[data-book-id="${id}"]`).click({ button: 'right' });
  await expect(page.getByTestId('menu-delete')).toBeVisible();
  await expect(page.getByTestId('reader')).toHaveCount(0);
});

test('카드 메뉴는 길게 눌러도 열리고, 뒤따르는 click으로 문서가 열리지 않는다 (P2-K18)', async ({ page, isMobile }) => {
  test.skip(!isMobile, '길게 누르기는 모바일');
  await page.goto('/');
  const id = await importFixture(page, '10-single.html');
  const card = page.locator(`[data-book-id="${id}"]`);
  const b = (await card.boundingBox())!;
  const at = { clientX: b.x + 40, clientY: b.y + 20 };
  const ev = (t: string) => card.dispatchEvent(t, { ...at, pointerId: 3, pointerType: 'touch', isPrimary: true, bubbles: true });
  await ev('pointerdown'); await page.waitForTimeout(650);
  await card.dispatchEvent('contextmenu', { ...at, bubbles: true, cancelable: true });   // 길게 누르기와 함께 오는 contextmenu
  await ev('pointerup');
  await card.dispatchEvent('click', { ...at, bubbles: true });                           // 길게 누른 뒤 따라오는 click
  await expect(page.getByTestId('menu-delete')).toBeVisible();
  await page.waitForTimeout(300);
  await expect(page.getByTestId('reader')).toHaveCount(0);
  await expect(page.getByTestId('menu-delete')).toBeVisible();
  // 짧은 탭(메뉴 밖)은 메뉴를 닫고, 다음 탭은 평소대로 문서를 연다
  await ev('pointerdown'); await ev('pointerup'); await card.dispatchEvent('click', { ...at, bubbles: true });
  await expect(page.getByTestId('menu-delete')).toHaveCount(0);
  await card.click();
  await expect(page.getByTestId('reader')).toBeVisible();
});

test('대화상자: 서재는 inert, 포커스가 안으로, Esc로 취소, 포커스가 돌아온다 (P2-K11)', async ({ page }) => {
  await page.goto('/');
  const id = await importFixture(page, '10-single.html');
  const menuBtn = page.locator(`[data-book-id="${id}"] [data-testid=book-menu]`);
  await menuBtn.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('menu-delete')).toBeVisible();
  await page.getByTestId('menu-delete').focus();
  await page.keyboard.press('Enter');
  const dlg = page.getByRole('dialog');
  await expect(dlg).toBeVisible();
  expect(await page.getByTestId('library').evaluate((e) => (e as HTMLElement).inert)).toBe(true);
  await expect.poll(() => dlg.evaluate((d) => d.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dlg).toHaveCount(0);
  await expect(page.getByTestId('book-card')).toHaveCount(1);
  expect(await page.getByTestId('library').evaluate((e) => (e as HTMLElement).inert)).toBe(false);
  await expect(menuBtn).toBeFocused();
});

test('시작 페이지 선택: 서재는 inert, Esc로 취소된다 (P2-K11)', async ({ page }) => {
  await page.goto('/');
  await importFixture(page, '10-single.html');                              // 고지를 미리 통과
  await page.getByTestId('import-button').focus();
  await startImport(page, 'pick-entry.zip');
  const dlg = page.getByRole('dialog', { name: '시작 페이지 선택' });
  await expect(dlg).toBeVisible();
  expect(await page.getByTestId('library').evaluate((e) => (e as HTMLElement).inert)).toBe(true);
  await expect.poll(() => dlg.evaluate((d) => d.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dlg).toHaveCount(0);
  await expect(page.getByTestId('import-progress')).toHaveCount(0);
  await expect(page.getByTestId('import-error')).toHaveCount(0);            // 직접 취소한 것은 오류로 띄우지 않는다
  await expect(page.getByTestId('book-card')).toHaveCount(1);
  await expect(page.getByTestId('import-button')).toBeFocused();
});

test('오류 대화상자: 서재는 inert, Esc로 닫힌다 (P2-K11)', async ({ page }) => {
  await page.goto('/');
  await startImport(page, 'err-crc.zip');
  const dlg = page.getByRole('dialog', { name: '가져오지 못했습니다' });
  await expect(dlg.getByTestId('import-error')).toHaveAttribute('data-code', 'crc-mismatch');
  expect(await page.getByTestId('library').evaluate((e) => (e as HTMLElement).inert)).toBe(true);
  await expect.poll(() => dlg.evaluate((d) => d.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dlg).toHaveCount(0);
  expect(await page.getByTestId('library').evaluate((e) => (e as HTMLElement).inert)).toBe(false);
});
