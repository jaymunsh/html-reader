import { expect, test } from '@playwright/test';
import { importFixture, openBook, openOverlay, overlaySettled } from './helpers';
const ratio = (f: any) => f.evaluate(() => { const e = document.scrollingElement!; return e.scrollTop / (e.scrollHeight - e.clientHeight); });

test('핸들을 끌면 문서가 따라 스크롤되고 말풍선에 파일명 · NN%가 뜬다', async ({ page }) => {
  await page.goto('/');
  const id = await importFixture(page, '10-single.html');
  const f = await openBook(page, id);
  await openOverlay(page);
  await overlaySettled(page);
  const b = (await page.getByTestId('scroll-handle').boundingBox())!;
  expect([b.width, b.height]).toEqual([30, 64]);
  const top = (await page.getByTestId('overlay-top').boundingBox())!, bottom = (await page.getByTestId('overlay-bottom').boundingBox())!;
  const trackTop = top.y + top.height, trackLen = bottom.y - trackTop - 64;
  const start = { x: b.x + 15, y: b.y + 32 };
  // Real input: the pointer leaves the handle (and the shell) over the iframe; only pointer capture keeps the drag alive (Review Focus 4).
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x - 120, trackTop + 32 + trackLen * 0.5, { steps: 12 });
  await page.waitForTimeout(3300); // longer than the overlay auto-hide
  await expect.poll(() => ratio(f)).toBeGreaterThan(0.4);
  expect(await ratio(f)).toBeLessThan(0.6);
  await expect(page.getByTestId('scroll-bubble')).toHaveText(/^10-single\.html · (4\d|5\d)%$/);
  await expect(page.getByTestId('reader')).toHaveAttribute('data-overlay', 'open'); // held while dragging
  await page.mouse.up();
  await expect(page.getByTestId('scroll-bubble')).toHaveCount(0);
});

test('스크롤이 없는 페이지에서는 핸들이 없다', async ({ page }) => {
  await page.goto('/');
  const id = await importFixture(page, '12-frame-escape.zip');
  await openBook(page, id);
  await openOverlay(page);
  await expect(page.getByTestId('scroll-handle')).toHaveCount(0);
});

test('제한 모드(에이전트 없음)에서는 핸들이 없다', async ({ page }) => {
  await page.goto('/');
  const id = await importFixture(page, '13-csp.zip');
  await openBook(page, id);
  await expect(page.getByTestId('reader')).toHaveAttribute('data-agent', 'limited');
  await openOverlay(page);
  await expect(page.getByTestId('scroll-handle')).toHaveCount(0);
});

test('문서를 스크롤하면 핸들 위치가 따라간다', async ({ page }) => {
  await page.goto('/');
  const id = await importFixture(page, '10-single.html');
  const f = await openBook(page, id);
  await openOverlay(page);
  await overlaySettled(page);
  const y0 = (await page.getByTestId('scroll-handle').boundingBox())!.y;
  await f.evaluate(() => { const e = document.scrollingElement!; e.scrollTop = e.scrollHeight; });
  await expect.poll(async () => (await page.getByTestId('scroll-handle').boundingBox())!.y).toBeGreaterThan(y0 + 100);
});
