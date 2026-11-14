import { expect, test } from '@playwright/test';
import { idbAll, importFixture, openBook, openOverlay, scrollFrameTo, settled } from './helpers';
const ratio = (f: any) => f.evaluate(() => { const e = document.scrollingElement!; return e.scrollTop / (e.scrollHeight - e.clientHeight); });
async function openBookmarks(page: any, isMobile: boolean) {
  await openOverlay(page);
  if (isMobile) await page.getByTestId('btn-panel').tap();
  else if ((await page.getByTestId('panel').getAttribute('data-open')) !== 'true') await page.getByTestId('panel-toggle').click();
  await page.getByTestId('panel-tab-bookmarks').click();
}

test('북마크 추가 → 다른 페이지로 이동 → 북마크 탭에서 복귀', async ({ page, isMobile }) => {
  await page.goto('/');
  const id = await importFixture(page, '01-multipage.zip');
  const f = await openBook(page, id);
  await f.locator('#rel').evaluate((a: HTMLAnchorElement) => a.click());
  await expect(page.getByTestId('reader')).toHaveAttribute('data-path', 'page2.html');
  await scrollFrameTo(f, 0.5);
  await openOverlay(page);
  await page.getByTestId('btn-bookmark').click();
  await expect(page.getByTestId('btn-bookmark')).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => idbAll(page, 'bookmarks')).toMatchObject([{ bookId: id, path: 'page2.html', label: 'page2.html · 50%' }]);

  await f.evaluate(() => history.back());
  await expect(page.getByTestId('reader')).toHaveAttribute('data-path', 'index.html');
  await openOverlay(page);
  await expect(page.getByTestId('btn-bookmark')).toHaveAttribute('aria-pressed', 'false');
  await openBookmarks(page, isMobile);
  await expect(page.getByTestId('bookmark-row')).toHaveCount(1);
  await expect(page.getByTestId('bookmark-row')).toContainText('page2.html · 50%');
  await page.getByTestId('bookmark-row').click();
  await expect(page.getByTestId('reader')).toHaveAttribute('data-path', 'page2.html');
  await expect.poll(() => ratio(f), { timeout: 6000 }).toBeCloseTo(0.5, 1);
  if (isMobile) await expect(page.getByTestId('panel')).toHaveAttribute('data-open', 'false');
});

test('같은 위치(2% 이내)에서 다시 누르면 해제, 이름 바꾸기, 삭제', async ({ page, isMobile }) => {
  await page.goto('/');
  const id = await importFixture(page, '10-single.html');
  const f = await openBook(page, id);
  await scrollFrameTo(f, 0.3); await openOverlay(page);
  await page.getByTestId('btn-bookmark').click();
  await expect.poll(async () => (await idbAll(page, 'bookmarks')).length).toBe(1);
  await scrollFrameTo(f, 0.31); await openOverlay(page);
  await page.getByTestId('btn-bookmark').click();
  await expect.poll(async () => (await idbAll(page, 'bookmarks')).length).toBe(0);
  await scrollFrameTo(f, 0.7); await openOverlay(page);
  await page.getByTestId('btn-bookmark').click();
  await openBookmarks(page, isMobile);
  await page.getByTestId('bookmark-menu').click();
  await page.getByTestId('bookmark-rename').click();
  await page.getByTestId('rename-input').fill('  중요한 곳  ');
  await page.getByTestId('rename-save').click();
  await expect(page.getByTestId('bookmark-row')).toContainText('중요한 곳');
  await expect.poll(async () => (await idbAll(page, 'bookmarks'))[0].label).toBe('중요한 곳');
  await page.getByTestId('bookmark-delete').click();
  await expect(page.getByTestId('bookmark-row')).toHaveCount(0);
  await expect(page.getByTestId('panel')).toContainText('북마크가 없습니다');
});

test('B 단축키', async ({ page, isMobile }) => {
  test.skip(isMobile, 'PC 단축키');
  await page.goto('/');
  const id = await importFixture(page, '10-single.html');
  const f = await openBook(page, id);
  await f.locator('#h').click();
  await page.keyboard.press('b');
  await expect.poll(async () => (await idbAll(page, 'bookmarks')).length).toBe(1);
  await page.keyboard.press('b');
  await expect.poll(async () => (await idbAll(page, 'bookmarks')).length).toBe(0);
});

test('밀어서 삭제', async ({ page, isMobile }) => {
  test.skip(!isMobile, '터치 전용');
  await page.goto('/');
  const id = await importFixture(page, '10-single.html');
  await openBook(page, id); await openOverlay(page);
  await page.getByTestId('btn-bookmark').tap();
  await openBookmarks(page, true);
  await settled(page, 'panel');
  const row = page.getByTestId('bookmark-row'), b = (await row.boundingBox())!;
  const ev = (t: string, x: number) => row.dispatchEvent(t, { clientX: x, clientY: b.y + b.height / 2, pointerId: 5, pointerType: 'touch', isPrimary: true, bubbles: true });
  await ev('pointerdown', b.x + b.width - 30); await ev('pointermove', b.x + b.width - 90); await ev('pointermove', b.x + b.width - 150); await ev('pointerup', b.x + b.width - 150);
  await expect(page.getByTestId('bookmark-row')).toHaveCount(0);
  await expect.poll(async () => (await idbAll(page, 'bookmarks')).length).toBe(0);
});

test('이름 바꾸기 대화상자: 패널·문서는 inert, Esc로 닫히고 포커스는 ⋯ 버튼으로', async ({ page, isMobile }) => {
  await page.goto('/');
  const id = await importFixture(page, '10-single.html');
  await openBook(page, id); await openOverlay(page);
  await page.getByTestId('btn-bookmark').click();
  await openBookmarks(page, isMobile);
  await page.getByTestId('bookmark-menu').click();
  await expect(page.getByTestId('bookmark-rename')).toBeFocused();
  await page.getByTestId('bookmark-rename').click();
  const dlg = page.getByRole('dialog', { name: '북마크 이름' });
  await expect(dlg).toBeVisible();
  await expect(page.getByTestId('rename-input')).toBeFocused();
  for (const t of ['panel', 'reader-frame']) expect(await page.getByTestId(t).evaluate((e) => (e as HTMLElement).inert), t).toBe(true);
  // the dialog is on top of the panel (sheet or dock): its centre hits the dialog
  await settled(page, 'rename-dialog');
  expect(await dlg.evaluate((d) => { const r = d.getBoundingClientRect(); return d.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)); })).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dlg).toHaveCount(0);
  await expect(page.getByTestId('bookmark-menu')).toBeFocused();
  expect(await page.getByTestId('panel').evaluate((e) => (e as HTMLElement).inert)).toBe(false);
});
