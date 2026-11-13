import { expect, test } from '@playwright/test';
import { backToLibrary, importFixture, openBook, openOverlay } from './helpers';

test('누락 리소스: 읽는 중 배지 → 경로·원인 → 서재 카드 배지·온라인 필요', async ({ page }) => {
  await page.goto('/');
  const id = await importFixture(page, '08-missing.zip');
  const card = page.locator(`[data-book-id="${id}"]`);
  await expect(card.getByTestId('issue-badge')).toHaveCount(0); // 가져오기 시점에는 검사하지 않는다
  await openBook(page, id);
  await page.waitForTimeout(1000);
  await openOverlay(page);
  const badge = page.getByTestId('overlay-top').getByTestId('issue-badge');
  await expect(badge).toHaveText(/누락 2/);
  await badge.click();
  const sheet = page.getByTestId('issue-sheet');
  await expect(page.getByTestId('issue-row')).toHaveCount(2);
  await expect(sheet).toContainText('img/none.png');
  await expect(sheet).toContainText('묶음에 없음');
  await expect(sheet).toContainText('../outside.css');
  await expect(sheet).toContainText('묶음 바깥 경로 참조 — 상위 폴더째로 압축하세요');
  // focus management: focus in, background inert, Escape closes and returns focus to the badge
  await expect.poll(() => page.evaluate(() => !!document.activeElement?.closest('[data-testid=issue-sheet]'))).toBe(true);
  await expect(page.getByTestId('reader-frame')).toHaveJSProperty('inert', true);
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  await expect(badge).toBeFocused();
  await expect(page.getByTestId('reader-frame')).toHaveJSProperty('inert', false);
  await backToLibrary(page);
  await expect(card.getByTestId('issue-badge')).toHaveText(/누락 2/);
  await expect(card.getByTestId('online-badge')).toBeVisible();
  await expect(card.getByTestId('online-badge')).toHaveAttribute('aria-label', '온라인 필요');
});

test('시트는 바깥(스크림) 클릭으로도 닫힌다', async ({ page }) => {
  await page.goto('/');
  const id = await importFixture(page, '08-missing.zip');
  await openBook(page, id);
  await page.waitForTimeout(1000);
  await openOverlay(page);
  const badge = page.getByTestId('overlay-top').getByTestId('issue-badge');
  await badge.click();
  await expect(page.getByTestId('issue-sheet')).toBeVisible();
  await page.getByTestId('issue-scrim').click({ position: { x: 5, y: 5 } });
  await expect(page.getByTestId('issue-sheet')).toBeHidden();
});

test('문제가 없는 문서에는 배지가 없다', async ({ page }) => {
  await page.goto('/');
  const id = await importFixture(page, '10-single.html');
  await openBook(page, id); await openOverlay(page);
  await expect(page.getByTestId('issue-badge')).toHaveCount(0);
  await expect(page.getByTestId('limited-badge')).toHaveCount(0);
});

test('CSP로 agent가 막힌 문서는 "제한 모드"로 열리고 셸 소유 기능은 유지된다', async ({ page }) => {
  await page.goto('/');
  const id = await importFixture(page, '13-csp.zip');
  await page.locator(`[data-book-id="${id}"]`).click();
  await expect(page.getByTestId('reader')).toHaveAttribute('data-agent', 'limited', { timeout: 5000 });
  await openOverlay(page);
  await expect(page.getByTestId('limited-badge')).toHaveText('제한 모드');
  await expect(page.getByTestId('zoom-in')).toBeDisabled();
  await expect(page.getByTestId('page-info')).toHaveText(/^1 \/ 1쪽/);
});
