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

  await f.evaluate(() => location.replace('index.html'));
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
  await expect(page.getByTestId('undo-toast')).toContainText('북마크를 삭제했습니다');     // 되돌리기
  await page.getByTestId('undo-delete').tap();
  await expect(page.getByTestId('undo-toast')).toHaveCount(0);
  await expect(page.getByTestId('bookmark-row')).toHaveCount(1);
  await expect.poll(async () => (await idbAll(page, 'bookmarks')).length).toBe(1);
  await expect(page.getByTestId('panel')).toHaveAttribute('data-open', 'true');
});

test('× 삭제 뒤 되돌리기 안내는 5초 뒤 사라지고 삭제는 그대로', async ({ page, isMobile }) => {
  await page.goto('/');
  const id = await importFixture(page, '10-single.html');
  await openBook(page, id); await openOverlay(page);
  await page.getByTestId('btn-bookmark').click();
  await openBookmarks(page, isMobile);
  await page.getByTestId('bookmark-delete').click();
  await expect(page.getByTestId('bookmark-row')).toHaveCount(0);
  await expect(page.getByTestId('undo-toast')).toBeVisible();
  await expect(page.getByTestId('undo-toast')).toHaveCount(0, { timeout: 7000 });
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

// Shell messages straight into the frame, then the page grows while the restore loop still re-applies (spec §6.7-3, I2).
const postLate = (page: any, init: object) => page.evaluate((i: object) => {
  const w = (document.querySelector('[data-testid=reader-frame]') as HTMLIFrameElement).contentWindow as Window & typeof globalThis;
  const post = (m: object) => w.postMessage({ app: 'html-reader', protocolVersion: 1, ...m }, location.origin);
  post({ type: 'init', textScale: 1, ...i });
  post({ type: 'scroll-to', ratio: 0.2 }); // a same-page bookmark jump from the shell
  w.setTimeout(() => w.document.body.insertAdjacentHTML('beforeend', '<div style="height:3000px"></div><p>로드 뒤 생긴 문장</p>'), 200);
}, init);

for (const [name, init] of [
  ['진행률 복원 재적용을', { restore: { scrollRatio: 0.9 } }],
  ['restore.find 재시도를', { restore: { find: { query: '로드 뒤 생긴 문장', snippet: '로드 뒤 생긴 문장' } } }],
] as const) {
  test(`같은 페이지 북마크 이동(scroll-to)이 진행 중인 ${name} 멈춘다`, async ({ page }) => {
    await page.goto('/');
    const f = await openBook(page, await importFixture(page, '10-single.html'));
    await postLate(page, init);
    await page.waitForTimeout(3500); // past the 3 s restore window
    expect(await ratio(f)).toBeLessThan(0.3); // still at the jump (0.2 of the pre-growth range), not 0.9 / the late text at the bottom
  });
}

// Makes the bookmarks store's put throw for matching records until window.__putRestore() (mirrors rename.spec).
const failPut = (page: any, label: string | null) => page.evaluate((l: string | null) => {
  const put = IDBObjectStore.prototype.put;
  (window as any).__putRestore = () => { IDBObjectStore.prototype.put = put; };
  IDBObjectStore.prototype.put = function (v: any, k?: any) {
    if (this.name === 'bookmarks' && (l === null || v?.label === l)) throw new DOMException('forced', 'DataError');
    return put.call(this, v, k);
  };
}, label);

test('북마크 추가 저장이 실패하면 버튼이 되돌아간다', async ({ page, isMobile }) => {
  await page.goto('/');
  const id = await importFixture(page, '10-single.html');
  const f = await openBook(page, id);
  await scrollFrameTo(f, 0.3); await openOverlay(page);
  await failPut(page, null);
  await page.getByTestId('btn-bookmark').click();
  await expect(page.getByTestId('btn-bookmark')).toHaveAttribute('aria-pressed', 'false');
  await openBookmarks(page, isMobile);
  await expect(page.getByTestId('panel')).toContainText('북마크가 없습니다');
  expect(await idbAll(page, 'bookmarks')).toEqual([]);
});

test('북마크 이름 저장이 실패하면 대화상자가 열린 채 오류를 보이고, 다시 저장할 수 있다', async ({ page, isMobile }) => {
  await page.goto('/');
  const id = await importFixture(page, '10-single.html');
  await openBook(page, id); await openOverlay(page);
  await page.getByTestId('btn-bookmark').click();
  await expect.poll(async () => (await idbAll(page, 'bookmarks')).length).toBe(1);
  await openBookmarks(page, isMobile);
  await failPut(page, '실패 이름');
  await page.getByTestId('bookmark-menu').click();
  await page.getByTestId('bookmark-rename').click();
  await page.getByTestId('rename-input').fill('실패 이름');
  await page.getByTestId('rename-save').click();
  await expect(page.getByTestId('rename-save-error')).toHaveText('이름을 저장하지 못했습니다.');
  await expect(page.getByTestId('rename-dialog')).toBeVisible();
  await expect(page.getByTestId('rename-save')).toBeEnabled();
  await page.getByTestId('rename-input').fill('실패 이름 2');
  await expect(page.getByTestId('rename-save-error')).toHaveCount(0);
  await page.getByTestId('rename-input').fill('실패 이름');
  await page.evaluate(() => (window as any).__putRestore());
  await page.getByTestId('rename-save').click();
  await expect(page.getByTestId('rename-dialog')).toHaveCount(0);
  await expect(page.getByTestId('bookmark-row')).toContainText('실패 이름');
  await expect.poll(async () => (await idbAll(page, 'bookmarks'))[0].label).toBe('실패 이름');
});
