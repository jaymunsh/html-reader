import { expect, test } from '@playwright/test';
import { importFixture, openBook } from './helpers';

test('target=_top·_blank 링크는 리더 안에 머문다', async ({ page, context }) => {
  await page.goto('/');
  const id = await importFixture(page, '12-frame-escape.zip');
  const f = await openBook(page, id);
  await f.locator('#top').click();
  await expect(page.getByTestId('reader')).toHaveAttribute('data-path', 'page2.html');
  expect(new URL(page.url()).pathname).toBe('/');
  await f.evaluate(() => history.back());
  await expect(page.getByTestId('reader')).toHaveAttribute('data-path', 'index.html');
  await f.locator('#blank').click();
  await expect(page.getByTestId('reader')).toHaveAttribute('data-path', 'page2.html');
  expect(context.pages().length).toBe(1);
});

test('top.location 변경은 SW가 리더로 되돌린다', async ({ page }) => {
  await page.goto('/');
  const id = await importFixture(page, '12-frame-escape.zip');
  const f = await openBook(page, id);
  await f.locator('#toploc').click();
  await expect(page.getByTestId('reader')).toHaveAttribute('data-path', 'page2.html', { timeout: 10_000 });
  await expect(page.getByTestId('reader')).toHaveAttribute('data-book-id', id);
  expect(new URL(page.url()).pathname + new URL(page.url()).search).toBe('/');
});

test('외부 링크는 새 탭으로 열리고 iframe은 그대로다', async ({ page, context }) => {
  await context.route('https://example.com/**', (r) => r.fulfill({ body: 'ext' }));
  await page.goto('/');
  const id = await importFixture(page, '12-frame-escape.zip');
  const f = await openBook(page, id);
  const [popup] = await Promise.all([context.waitForEvent('page'), f.locator('#ext').click()]);
  await popup.waitForURL('https://example.com/x');
  expect(popup.url()).toBe('https://example.com/x');
  await expect(page.getByTestId('reader')).toHaveAttribute('data-path', 'index.html');
});
