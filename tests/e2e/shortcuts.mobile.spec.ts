import { expect, test } from '@playwright/test';
import { importFixture, openBook, openOverlay } from './helpers';
test('모바일 레이아웃에서 Space는 오버레이를 토글한다', async ({ page }) => {
  await page.goto('/');
  const id = await importFixture(page, '10-single.html');
  await openBook(page, id);
  await page.keyboard.press('Space');
  await expect(page.getByTestId('reader')).toHaveAttribute('data-overlay', 'open');
  await page.keyboard.press('Space');
  await expect(page.getByTestId('reader')).toHaveAttribute('data-overlay', 'closed');
});

test('셸 버튼에 포커스가 있으면 Space는 버튼을 누르고 오버레이를 토글하지 않는다', async ({ page }) => {
  await page.goto('/');
  const id = await importFixture(page, '10-single.html');
  await openBook(page, id);
  await openOverlay(page);
  await page.getByTestId('btn-panel').focus();
  await page.keyboard.press('Space');
  await expect(page.getByTestId('panel')).toHaveAttribute('data-open', 'true');
  await expect(page.getByTestId('reader')).toHaveAttribute('data-overlay', 'open');
});
