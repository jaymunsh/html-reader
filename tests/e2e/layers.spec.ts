import { expect, test } from '@playwright/test';
import { backToLibrary, importFixture, openBook } from './helpers';

// Spec §13 / P3-K12: a Dialog opened from a panel or sheet must stack above both.
test('Dialog의 z-index는 패널·시트보다 높다', async ({ page }) => {
  await page.goto('/');
  const id = await importFixture(page, '08-missing.zip');
  await openBook(page, id);
  const z = (testId: string) => page.getByTestId(testId).evaluate((e) => Number(getComputedStyle(e).zIndex));
  const panel = await z('panel'), sheet = await z('issue-sheet');
  await backToLibrary(page);
  await page.locator(`[data-book-id="${id}"] [data-testid=book-menu]`).click();
  await page.getByTestId('menu-delete').click();
  const dialog = await page.getByRole('dialog').evaluate((e) => Number(getComputedStyle(e.parentElement!).zIndex));
  expect(panel).toBeGreaterThan(0);
  expect(dialog).toBeGreaterThan(panel);
  expect(dialog).toBeGreaterThan(sheet);
});
