import { expect, test } from '@playwright/test';
import { importFixture, openBook, openOverlay, overlaySettled, settled } from './helpers';

test('320px 상단 바: 뒤로 + 제목 + 쪽 정보 + 배지가 넘치지 않고 컨트롤은 44px 이상', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto('/');
  const id = await importFixture(page, '08-missing.zip');
  await openBook(page, id);
  await page.waitForTimeout(1000);
  await openOverlay(page);
  await overlaySettled(page);
  await settled(page, 'overlay-top');
  await expect(page.getByTestId('issue-badge')).toBeVisible();
  const r = await page.getByTestId('overlay-top').evaluate((el) => {
    const bar = el.getBoundingClientRect();
    const box = (t: string) => el.querySelector(`[data-testid=${t}]`)!.getBoundingClientRect();
    return {
      overflow: el.scrollWidth > el.clientWidth,
      right: Math.max(...['issue-badge', 'btn-panel'].map((t) => box(t).right)),
      barRight: bar.right,
      hBadge: box('issue-badge').height, wBadge: box('issue-badge').width, wPanel: box('btn-panel').width, wBack: box('reader-back').width,
    };
  });
  expect(r.overflow).toBe(false);
  expect(r.right).toBeLessThanOrEqual(r.barRight);
  expect(r.hBadge).toBeGreaterThanOrEqual(44);
  expect(r.wBadge).toBeGreaterThanOrEqual(44);
  expect(r.wPanel).toBeGreaterThanOrEqual(44);
  expect(r.wBack).toBeGreaterThanOrEqual(44);
});
