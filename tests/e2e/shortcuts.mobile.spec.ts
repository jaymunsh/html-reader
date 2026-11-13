import { expect, test } from '@playwright/test';
import { importFixture, openBook } from './helpers';
test('모바일 레이아웃에서 Space는 오버레이를 토글한다', async ({ page }) => {
  await page.goto('/');
  const id = await importFixture(page, '10-single.html');
  await openBook(page, id);
  await page.keyboard.press('Space');
  await expect(page.getByTestId('reader')).toHaveAttribute('data-overlay', 'open');
  await page.keyboard.press('Space');
  await expect(page.getByTestId('reader')).toHaveAttribute('data-overlay', 'closed');
});
