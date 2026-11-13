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

test('320px: 두 배지가 함께 보여도 모든 컨트롤이 화면 안·44px 이상, 제목은 말줄임', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto('/');
  const id = await importFixture(page, '13-csp-missing.zip');
  await page.locator(`[data-book-id="${id}"]`).click();
  await expect(page.getByTestId('reader')).toHaveAttribute('data-agent', 'limited', { timeout: 5000 });
  await page.waitForTimeout(1000);
  await openOverlay(page);
  await overlaySettled(page);
  await expect(page.getByTestId('issue-badge')).toHaveAccessibleName('누락 1');
  await expect(page.getByTestId('limited-badge')).toHaveAccessibleName('제한 모드');
  const r = await page.getByTestId('overlay-top').evaluate((el) => {
    const vw = document.documentElement.clientWidth;
    const out: Record<string, { l: number; r: number; w: number; h: number }> = {};
    for (const t of ['reader-back', 'issue-badge', 'limited-badge', 'btn-panel']) {
      const b = el.querySelector(`[data-testid=${t}]`)!.getBoundingClientRect();
      out[t] = { l: b.left, r: b.right, w: b.width, h: b.height };
    }
    const ti = el.querySelector('[data-testid=overlay-title]') as HTMLElement;
    return { vw, out, titleW: ti.getBoundingClientRect().width, ellipsis: getComputedStyle(ti).textOverflow };
  });
  for (const [t, b] of Object.entries(r.out)) {
    expect(b.l, t).toBeGreaterThanOrEqual(0);
    expect(b.r, t).toBeLessThanOrEqual(r.vw);
    expect(b.w, t).toBeGreaterThanOrEqual(44);
    expect(b.h, t).toBeGreaterThanOrEqual(44);
  }
  expect(r.ellipsis).toBe('ellipsis');
});
