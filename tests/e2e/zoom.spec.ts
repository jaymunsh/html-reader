import { expect, test } from '@playwright/test';
import { backToLibrary, idbGet, importFixture, openBook, openOverlay, scrollFrameTo, bookFrame } from './helpers';
const ratio = (f: any) => f.evaluate(() => { const e = document.scrollingElement!; return e.scrollTop / (e.scrollHeight - e.clientHeight); });
const zoom = (f: any) => f.evaluate(() => document.documentElement.style.zoom);

test('글자 크기 변경 → 위치 유지 → 재실행 후 크기 유지(첫 페인트 전 적용)', async ({ page }) => {
  await page.goto('/');
  const id = await importFixture(page, '10-single.html');
  const other = await importFixture(page, '01-multipage.zip');
  let f = await openBook(page, id);
  await scrollFrameTo(f, 0.5);
  await openOverlay(page);
  await expect(page.getByTestId('zoom-value')).toHaveText('100%');
  await page.getByTestId('zoom-in').click(); await page.getByTestId('zoom-in').click();
  await expect(page.getByTestId('zoom-value')).toHaveText('125%');
  await expect.poll(() => zoom(f)).toBe('1.25');
  await expect.poll(() => ratio(f)).toBeCloseTo(0.5, 1);
  await expect.poll(async () => (await idbGet(page, 'books', id)).textScale).toBe(1.25);

  await page.reload();
  f = await openBook(page, id);
  await expect(f.locator('script[src="/__reader/agent.js"]')).toHaveAttribute('data-scale', '1.25');
  await expect.poll(() => zoom(f)).toBe('1.25');
  await openOverlay(page);
  await expect(page.getByTestId('zoom-value')).toHaveText('125%');
  await backToLibrary(page);
  f = await openBook(page, other);                                              // 문서별 저장
  await expect.poll(() => zoom(f)).toBe('');
});

test('다음 쪽으로 가도 확대가 유지된다', async ({ page }) => {
  await page.goto('/');
  const id = await importFixture(page, '01-multipage.zip');
  let f = await openBook(page, id);
  await openOverlay(page);
  await page.getByTestId('zoom-in').click();
  await expect(page.getByTestId('zoom-value')).toHaveText('110%');
  await expect.poll(() => zoom(f)).toBe('1.1');
  const before = await page.getByTestId('reader').getAttribute('data-path');
  await openOverlay(page);
  await page.getByTestId('btn-next').click();
  await expect(page.getByTestId('reader')).not.toHaveAttribute('data-path', before!);
  await expect(page.getByTestId('reader')).not.toHaveAttribute('data-agent', 'pending');
  f = bookFrame(page);
  await expect.poll(() => zoom(f)).toBe('1.1');
  await expect(f.locator('script[src="/__reader/agent.js"]')).toHaveAttribute('data-scale', '1.1');
  await openOverlay(page);
  await expect(page.getByTestId('zoom-value')).toHaveText('110%');
});

test('양 끝 단계에서 버튼이 비활성', async ({ page }) => {
  await page.goto('/');
  const id = await importFixture(page, '10-single.html');
  await openBook(page, id); await openOverlay(page);
  for (let i = 0; i < 2; i++) await page.getByTestId('zoom-out').click();
  await expect(page.getByTestId('zoom-value')).toHaveText('80%');
  await expect(page.getByTestId('zoom-out')).toBeDisabled();
  for (let i = 0; i < 7; i++) await page.getByTestId('zoom-in').click();
  await expect(page.getByTestId('zoom-value')).toHaveText('200%');
  await expect(page.getByTestId('zoom-in')).toBeDisabled();
});

test('limited에서는 확대 버튼이 비활성', async ({ page }) => {
  await page.goto('/');
  const id = await importFixture(page, '13-csp.zip');
  await page.locator(`[data-testid=book-card][data-book-id="${id}"]`).click();
  await expect(page.getByTestId('reader')).toHaveAttribute('data-agent', 'limited', { timeout: 15_000 });
  await openOverlay(page);
  await expect(page.getByTestId('zoom-in')).toBeDisabled();
  await expect(page.getByTestId('zoom-out')).toBeDisabled();
});

test('+/- 단축키는 동작하고 Ctrl/⌘ +는 가로채지 않는다', async ({ page, isMobile }) => {
  test.skip(isMobile, '키보드 단축키는 PC 프로젝트에서 검증');
  await page.goto('/');
  const id = await importFixture(page, '10-single.html');
  await openBook(page, id);
  await page.keyboard.press('+');
  await expect(page.getByTestId('zoom-value')).toHaveText('110%');
  await page.keyboard.press('Control+Equal'); await page.keyboard.press('Meta+Equal');
  await expect(page.getByTestId('zoom-value')).toHaveText('110%');
  await page.keyboard.press('-');
  await expect(page.getByTestId('zoom-value')).toHaveText('100%');
});
