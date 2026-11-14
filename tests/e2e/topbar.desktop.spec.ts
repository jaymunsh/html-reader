import { expect, test, type Page } from '@playwright/test';
import { backToLibrary, importFixture, openBook, settled } from './helpers';

// Every visible top-bar control (search included) sits fully left of the docked panel; buttons stay ≥ 44px targets.
// The search is the input on a wide bar, a 44px toggle below a 640px bar (P3-K10).
async function controlsClear(page: Page, search: 'search-input' | 'search-toggle') {
  await settled(page, 'panel');
  const px = (await page.getByTestId('panel').boundingBox())!.x;
  const boxes = await page.getByTestId('overlay-top').locator('button, input, [data-testid=limited-badge]').evaluateAll((els) =>
    els.filter((e) => e.getClientRects().length).map((e) => {
      const r = e.getBoundingClientRect(); return { id: e.getAttribute('data-testid'), tag: e.tagName, left: r.left, right: r.right, w: r.width, h: r.height };
    }));
  expect(boxes.map((b) => b.id)).toEqual(expect.arrayContaining(['reader-back', 'issue-badge', search, 'btn-bookmark', 'btn-prev', 'zoom-out', 'zoom-in', 'btn-next']));
  for (const b of boxes) {
    expect(b.left, `${b.id} left`).toBeGreaterThanOrEqual(0);
    expect(b.right, `${b.id} right`).toBeLessThanOrEqual(px);
    if (b.tag !== 'INPUT') expect(Math.min(b.w, b.h), `${b.id} size`).toBeGreaterThanOrEqual(44);
  }
  // The search field's real hit target is ≥ 44px tall: its label (with the ::before strip) is hit at centre ± 21px.
  if (search === 'search-input') {
    const hits = await page.getByTestId('search-input').evaluate((i) => {
      const r = i.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
      return [-21, 0, 21].map((d) => !!document.elementFromPoint(x, y + d)?.closest('label')?.contains(i));
    });
    expect(hits).toEqual([true, true, true]);
  }
}

test('좁은 PC 창: 상단 바 컨트롤이 도킹 패널 밑으로 들어가지 않는다 (800px, 누락 배지)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  const id = await importFixture(page, '08-missing.zip');
  await openBook(page, id);
  await expect(page.getByTestId('overlay-top').getByTestId('issue-badge')).toBeVisible({ timeout: 5000 });
  const panel = page.getByTestId('panel');
  const r = (await page.getByTestId('panel-resizer').boundingBox())!;             // 선호 폭 480 저장
  await page.mouse.move(r.x + 2, r.y + 200); await page.mouse.down(); await page.mouse.move(r.x - 500, r.y + 200); await page.mouse.up();
  expect((await panel.boundingBox())!.width).toBe(480);
  await controlsClear(page, 'search-input');                                      // 800px bar: full search input
  await page.setViewportSize({ width: 1150, height: 800 });                       // 670px bar: input still fits
  await controlsClear(page, 'search-input');

  await page.setViewportSize({ width: 800, height: 700 });                        // 창 크기 변경: 적용 폭만 줄어든다 (vw − 560, 최소 240)
  await expect.poll(async () => (await panel.boundingBox())!.width).toBe(240);
  await controlsClear(page, 'search-toggle');

  await backToLibrary(page); await openBook(page, id);                            // 불러올 때도: 800px에선 접힌 채 시작 → 펼치기
  await page.getByTestId('panel-toggle').click();
  await expect(panel).toHaveAttribute('data-open', 'true');
  await expect(page.getByTestId('overlay-top').getByTestId('issue-badge')).toBeVisible({ timeout: 5000 });
  expect((await panel.boundingBox())!.width).toBe(240);
  await controlsClear(page, 'search-toggle');
  await expect(page.getByTestId('overlay-top').getByTestId('issue-badge')).toHaveAttribute('aria-label', /^누락 \d+$/);

  await page.setViewportSize({ width: 768, height: 700 });                        // 경계 폭: 최소 폭 240, 바 528px
  await expect.poll(async () => (await panel.boundingBox())!.width).toBe(240);
  await controlsClear(page, 'search-toggle');
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect.poll(async () => (await panel.boundingBox())!.width).toBe(480);    // 선호 폭은 그대로
});
