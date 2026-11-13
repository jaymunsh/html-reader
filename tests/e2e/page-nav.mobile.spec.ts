import { expect, test } from '@playwright/test';
import { importFixture, openBook, openOverlay, scrollFrameTo } from './helpers';
const ratio = (f: any) => f.evaluate(() => { const e = document.scrollingElement!; return e.scrollTop / (e.scrollHeight - e.clientHeight); });

test('이전/다음은 트리 표시 순서를 따르고 양 끝에서 비활성', async ({ page }) => {
  await page.goto('/');
  const id = await importFixture(page, '01-multipage.zip');
  await openBook(page, id);
  await openOverlay(page);
  await page.getByTestId('btn-prev').tap();
  await expect(page.getByTestId('reader')).toHaveAttribute('data-path', 'a b#c?.html');
  await expect(page.getByTestId('btn-prev')).toBeDisabled();
  for (const p of ['index.html', 'noref.html', 'page2.html', 'sub/page3.html']) {
    await page.getByTestId('btn-next').tap();
    await expect(page.getByTestId('reader')).toHaveAttribute('data-path', p);
  }
  await expect(page.getByTestId('btn-next')).toBeDisabled();
  await expect(page.getByTestId('reader')).toHaveAttribute('data-overlay', 'open');
});

test('맨 위·맨 아래', async ({ page }) => {
  await page.goto('/');
  const id = await importFixture(page, '10-single.html');
  const f = await openBook(page, id);
  await scrollFrameTo(f, 0.4);
  await openOverlay(page);
  await page.getByTestId('btn-bottom').tap();
  await expect.poll(() => ratio(f)).toBeGreaterThan(0.98);
  await page.getByTestId('btn-top').tap();
  await expect.poll(() => ratio(f)).toBeLessThan(0.02);
});
