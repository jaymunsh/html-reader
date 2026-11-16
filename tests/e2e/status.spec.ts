import { expect, test } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { importFixture } from './helpers';

test('느린 페이지: 300ms가 지나면 여는 중 안내와 불확정 진행선, 준비되면 사라진다', async ({ page, context, browserName }, info) => {
  // Playwright's WebKit does not route requests made by a service-worker-controlled frame; the hold needs routing.
  test.skip(browserName === 'webkit', 'needs request routing from a SW-controlled frame (Chromium only)');
  // An external script in <head> holds DOMContentLoaded (and the agent's ready) until the test releases it.
  let release = () => {};
  const held = new Promise<void>((r) => { release = r; });
  await context.route('https://example.com/slow.js', async (r) => { await held; await r.fulfill({ body: '', contentType: 'text/javascript' }); });
  const file = info.outputPath('slow-page.html');
  writeFileSync(file, '<!doctype html><html><head><title>slow</title><script src="https://example.com/slow.js"></script></head><body><p id="h">본문</p></body></html>');
  await page.goto('/');
  const id = await importFixture(page, file);
  await page.locator(`[data-testid=book-card][data-book-id="${id}"]`).click();
  const reader = page.getByTestId('reader');
  await expect(reader).toHaveAttribute('data-agent', 'pending');
  await expect(page.getByTestId('progress-busy')).toBeVisible();
  await expect(page.getByTestId('reader-loading')).toBeVisible();
  await expect(page.getByTestId('reader-loading')).toContainText('문서를 여는 중');
  release();
  await expect(reader).toHaveAttribute('data-agent', 'ready');
  await expect(page.getByTestId('progress-busy')).toHaveCount(0);
  await expect(page.getByTestId('reader-loading')).toHaveCount(0);
});

test('빠르게 열리면 안내도 진행선도 나타나지 않는다', async ({ page }) => {
  await page.goto('/');
  const id = await importFixture(page, '10-single.html');
  await page.evaluate(() => {
    const w = window as any;
    w.__seen = [];
    new MutationObserver(() => {
      for (const t of ['reader-loading', 'progress-busy']) if (document.querySelector(`[data-testid=${t}]`) && !w.__seen.includes(t)) w.__seen.push(t);
    }).observe(document.body, { childList: true, subtree: true });
  });
  await page.locator(`[data-testid=book-card][data-book-id="${id}"]`).click();
  await expect(page.getByTestId('reader')).toHaveAttribute('data-agent', 'ready');
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => (window as any).__seen)).toEqual([]);
});

test('오류 안내는 화면 가운데, 안전 영역 아래에서 누를 수 있다', async ({ page }) => {
  await page.goto('/?open=zzzzzzzzzzzz&path=index.html');
  const notice = page.getByTestId('book-missing-notice');
  await expect(notice).toBeVisible();
  const vp = page.viewportSize()!, box = (await notice.boundingBox())!;
  expect([Math.round(box.width), Math.round(box.height)]).toEqual([vp.width, vp.height]);
  const btn = (await page.getByTestId('confirm-ok').boundingBox())!;
  expect(Math.abs(btn.x + btn.width / 2 - vp.width / 2)).toBeLessThan(2);
  expect(await notice.evaluate((e) => +getComputedStyle(e).zIndex > +getComputedStyle(document.querySelector("[data-testid=top-inset]")!).zIndex)).toBe(true);
  await page.getByTestId('confirm-ok').click();
  await expect(page.getByTestId('library')).toBeVisible();
});
