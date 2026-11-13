import { expect, test } from '@playwright/test';
import { importFixture, openBook, openOverlay } from './helpers';

test('평상시 리더 UI는 문서 공간을 차지하지 않는다 (성공 기준 4)', async ({ page }) => {
  await page.goto('/');
  const id = await importFixture(page, '10-single.html');
  await openBook(page, id);
  await page.getByTestId('hint-ok').tap();
  await page.addStyleTag({ content: ':root{--sat:47px;--sab:34px}' });
  const vp = page.viewportSize()!, fr = (await page.getByTestId('reader-frame').boundingBox())!;
  expect([fr.x, fr.y, fr.width, Math.round(fr.y + fr.height)]).toEqual([0, 47, vp.width, vp.height]);
  const visible = await page.evaluate(() => [...document.querySelectorAll('[data-testid]')].filter((e) => {
    const r = e.getBoundingClientRect(), s = getComputedStyle(e);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.opacity !== '0' && !e.closest('[inert]');   // 닫힌 오버레이·시트는 inert
  }).map((e) => e.getAttribute('data-testid')).sort());
  expect(visible).toEqual(['progress-line', 'reader', 'reader-frame', 'ribbon-shape', 'ribbon-tab', 'top-inset']);
});

test('safe-area: 오버레이 바가 상태바·홈 인디케이터 영역까지 덮는다', async ({ page }) => {
  await page.goto('/');
  const id = await importFixture(page, '10-single.html');
  await openBook(page, id);
  await page.addStyleTag({ content: ':root{--sat:47px;--sab:34px}' });
  await openOverlay(page);
  const pad = async (t: string, side: 'paddingTop' | 'paddingBottom') => parseFloat(await page.getByTestId(t).evaluate((e, s) => (getComputedStyle(e) as any)[s], side));
  expect(await pad('overlay-top', 'paddingTop')).toBeGreaterThanOrEqual(47);
  expect(await pad('overlay-bottom', 'paddingBottom')).toBeGreaterThanOrEqual(34);
  expect((await page.getByTestId('overlay-top').boundingBox())!.y).toBe(0);
});

test('긴 문서·여러 파일에서 위치 찾기: 패널 → 다른 파일 → 핸들 (성공 기준 3)', async ({ page }) => {
  await page.goto('/');
  const id = await importFixture(page, '01-multipage.zip');
  await openBook(page, id);
  await openOverlay(page);
  await page.getByTestId('btn-panel').tap();
  await page.locator('[data-testid=file-row][data-path="page2.html"]').tap();
  await expect(page.getByTestId('reader')).toHaveAttribute('data-path', 'page2.html');
  await openOverlay(page);
  await expect(page.getByTestId('scroll-handle')).toBeVisible();
  await expect(page.getByTestId('page-info')).toHaveText(/^4 \/ 5쪽/);
});
