import { expect, test, type Page } from '@playwright/test';
import { importFixture, openBook, openOverlay } from './helpers';

const inView = (f: any, sel: string) => f.locator(sel).evaluate((e: Element) => { const r = e.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; });
async function openSearch(page: any, isMobile: boolean) { if (isMobile) { await openOverlay(page); await page.getByTestId('btn-search').tap(); } else await page.getByTestId('search-input').click(); }

// Full shell path (P3-K15): pick → pendingRestore bound to page2.html → navigate → init.restore.find in the new page.
test('검색어 입력 → 다른 페이지의 결과 클릭 → 해당 위치로 스크롤되고 강조된다', async ({ page, isMobile }) => {
  await page.goto('/');
  const id = await importFixture(page, '01-multipage.zip');
  const f = await openBook(page, id);
  await openSearch(page, isMobile);
  await page.getByTestId('search-input').fill('알파카');
  const group = page.locator('[data-testid=search-group][data-path="page2.html"]');
  await expect(group).toBeVisible();
  await expect(group.locator('mark')).toHaveText('알파카');
  await expect(page.getByTestId('search-group')).toHaveCount(1);
  await expect(page.getByTestId('search-limit-note')).toContainText('스크립트가 실행된 뒤에 만들어지는 텍스트는 검색되지 않습니다.');
  await group.getByTestId('search-result').first().click();
  await expect(page.getByTestId('reader')).toHaveAttribute('data-path', 'page2.html');
  await expect.poll(() => inView(f, '#p150'), { timeout: 6000 }).toBe(true);
  const h = await f.evaluate(() => ('highlights' in CSS ? (CSS as any).highlights.has('hr-find') : null));
  if (h !== null) expect(h).toBe(true);
});

test('같은 페이지 결과, 20건 제한 표시, 결과 없음', async ({ page, isMobile }) => {
  await page.goto('/');
  const id = await importFixture(page, 'search.zip');
  const f = await openBook(page, id);
  await openSearch(page, isMobile);
  await page.getByTestId('search-input').fill('문단');                           // 모든 문단에 있는 단어
  const g = page.locator('[data-testid=search-group][data-path="index.html"]');
  await expect(g.getByTestId('search-result')).toHaveCount(20);
  await expect(g).toContainText('건 중 20건 표시');
  await page.getByTestId('search-input').fill('zzz없는말');
  await expect(page.getByTestId('search-group')).toHaveCount(0);
  await expect(page.getByText('일치하는 내용이 없습니다')).toBeVisible();
  await page.getByTestId('search-input').fill('두 번째 고래');
  await page.getByTestId('search-result').first().click();
  await expect(page.getByTestId('reader')).toHaveAttribute('data-path', 'index.html');
  await expect.poll(() => inView(f, '#p170')).toBe(true);
});

test('200ms 디바운스, 스니펫은 HTML로 해석되지 않는다 (Review Focus 4)', async ({ page, isMobile }) => {
  await page.goto('/');
  const id = await importFixture(page, 'search.zip');
  await openBook(page, id);
  await openSearch(page, isMobile);
  await page.getByTestId('search-input').pressSequentially('고래', { delay: 20 });
  await expect(page.getByTestId('search-group')).toHaveCount(0);                 // 아직 디바운스 중
  await expect(page.getByTestId('search-group').first()).toBeVisible({ timeout: 1500 });
  // P3-K8: other.html holds the literal text "<b>굵게</b>" (entity-escaped in the source).
  await page.getByTestId('search-input').fill('<b>');
  const r = page.locator('[data-testid=search-group][data-path="other.html"]').getByTestId('search-result');
  await expect(r).toHaveCount(1);
  await expect(r).toContainText('<b>굵게</b>');
  await expect(r.locator('mark')).toHaveText('<b>');
  expect(await page.locator('[data-testid=search-result] b').count()).toBe(0);
  // Regex metacharacters are literal: no match, no error.
  await page.getByTestId('search-input').fill('.*(');
  await expect(page.getByText('일치하는 내용이 없습니다')).toBeVisible();
});

test('/ 단축키로 검색에 포커스', async ({ page, isMobile }) => {
  test.skip(isMobile, 'PC 단축키');
  await page.goto('/');
  const id = await importFixture(page, 'search.zip');
  const f = await openBook(page, id);
  await f.locator('#h').click();
  await page.keyboard.press('/');
  await expect(page.getByTestId('search-input')).toBeFocused();
  await expect(page.getByTestId('search-input')).toHaveValue('');
});

// Records, after every other window listener, whether each keydown's default was prevented.
const recordPrevented = (page: Page) => page.evaluate(() => {
  const w = window as any;
  w.__prevented = [];
  addEventListener('keydown', (e: KeyboardEvent) => /^(Control|Meta)$/.test(e.key) || w.__prevented.push(`${e.ctrlKey || e.metaKey ? 'mod+' : ''}${e.key}:${e.defaultPrevented}`));
});

test('셸 컨트롤에 포커스가 있을 때 / → 검색 입력에 포커스, / 는 입력되지 않는다; Ctrl/⌘+F는 막지 않는다 (P3-K16)', async ({ page, isMobile }) => {
  test.skip(isMobile, 'PC 단축키');
  await page.goto('/');
  const id = await importFixture(page, 'search.zip');
  await openBook(page, id);
  await recordPrevented(page);
  await page.getByTestId('reader-back').focus();
  await page.keyboard.press('/');
  await expect(page.getByTestId('search-input')).toBeFocused();
  await expect(page.getByTestId('search-input')).toHaveValue('');
  await page.getByTestId('reader-back').focus();
  await page.keyboard.press('ControlOrMeta+f');
  await expect.poll(() => page.evaluate(() => (window as any).__prevented)).toEqual(['/:true', 'mod+f:false']);
});

test('PC 드롭다운: Escape로 닫히고 포커스는 입력에 남는다, 바깥 클릭으로 닫힌다', async ({ page, isMobile }) => {
  test.skip(isMobile, 'PC 드롭다운');
  await page.goto('/');
  const id = await importFixture(page, 'search.zip');
  await openBook(page, id);
  await page.getByTestId('search-input').click();
  await page.getByTestId('search-input').fill('고래');
  await expect(page.getByTestId('search-group').first()).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('search-group')).toHaveCount(0);
  await expect(page.getByTestId('search-input')).toBeFocused();
  await page.getByTestId('search-input').press('Space');                        // typing reopens
  await page.getByTestId('search-input').press('Backspace');
  await expect(page.getByTestId('search-group').first()).toBeVisible();
  await page.getByTestId('reader-frame').click({ position: { x: 300, y: 300 } });
  await expect(page.getByTestId('search-group')).toHaveCount(0);
});

test('좁은 PC 상단 바: 검색은 44px 토글로 접히고, 토글이나 / 로 입력이 펼쳐진다 (P3-K10)', async ({ page, isMobile }) => {
  test.skip(isMobile, 'PC 상단 바');
  await page.setViewportSize({ width: 900, height: 700 });
  await page.goto('/');
  const id = await importFixture(page, 'search.zip');
  await openBook(page, id);
  await page.getByTestId('panel-toggle').click();                                // 900 − 340 = 560px bar
  await expect(page.getByTestId('panel')).toHaveAttribute('data-open', 'true');
  const toggle = page.getByTestId('search-toggle');
  await expect(toggle).toBeVisible();
  await expect(page.getByTestId('search-input')).toBeHidden();
  const tb = (await toggle.boundingBox())!;
  expect(Math.min(tb.width, tb.height)).toBeGreaterThanOrEqual(44);
  await toggle.click();
  await expect(page.getByTestId('search-input')).toBeFocused();
  await page.getByTestId('search-input').fill('고래');
  await expect(page.getByTestId('search-group').first()).toBeVisible();
  const px = (await page.getByTestId('panel').boundingBox())!.x;
  for (const t of ['search-input', 'search-group']) {
    const b = (await page.getByTestId(t).first().boundingBox())!;
    expect(b.x, t).toBeGreaterThanOrEqual(0);
    expect(b.x + b.width, t).toBeLessThanOrEqual(px);
  }
  await page.keyboard.press('Escape');
  await page.getByTestId('reader-back').focus();                                // focus leaves: collapses again
  await expect(page.getByTestId('search-input')).toBeHidden();
  await page.keyboard.press('/');
  await expect(page.getByTestId('search-input')).toBeFocused();  await page.getByTestId('search-input').fill('두 번째 고래');                     // a pick hands focus back to the document
  await page.getByTestId('search-result').first().click();
  await expect(page.getByTestId('search-input')).toBeHidden();
  await page.keyboard.press(']');
  await expect(page.getByTestId('reader')).toHaveAttribute('data-path', 'other.html');
});

test('PC: 결과를 고르면 포커스가 문서로 돌아가 단축키가 동작한다, 입력 안의 / 는 그대로 입력된다', async ({ page, isMobile }) => {
  test.skip(isMobile, 'PC 단축키');
  await page.goto('/');
  const id = await importFixture(page, 'search.zip');
  await openBook(page, id);
  await page.getByTestId('search-input').click();
  await page.keyboard.type('a/b');
  await expect(page.getByTestId('search-input')).toHaveValue('a/b');
  await page.getByTestId('search-input').fill('두 번째 고래');
  await page.getByTestId('search-result').first().click();
  await expect(page.getByTestId('search-input')).not.toBeFocused();
  await expect(page.getByTestId('search-group')).toHaveCount(0);
  await page.keyboard.press(']');
  await expect(page.getByTestId('reader')).toHaveAttribute('data-path', 'other.html');
  await expect(page.getByTestId('search-input')).toHaveValue('두 번째 고래');
});
