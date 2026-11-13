import { expect, test } from '@playwright/test';
import { importFixture, openBook, overlaySettled } from './helpers';

const state = (page: any) => page.getByTestId('reader').getAttribute('data-overlay');
async function open9(page: any) { await page.goto('/'); const id = await importFixture(page, '09-click-handlers.zip'); return openBook(page, id); }

test('빈 곳을 탭하면 열리고 다시 탭하면 닫힌다', async ({ page }) => {
  const f = await open9(page);
  expect(await state(page)).toBe('closed');
  await f.locator('#plain').tap();
  await expect(page.getByTestId('reader')).toHaveAttribute('data-overlay', 'open');
  await expect(page.getByTestId('overlay-top')).toBeVisible();
  await expect(page.getByTestId('overlay-bottom')).toBeVisible();
  await f.locator('#plain').tap();
  await expect(page.getByTestId('reader')).toHaveAttribute('data-overlay', 'closed');
});

for (const sel of ['#onclick', '[role=tab] >> nth=1', '#pointer', '#prevent', '#link', '#inp'])
  test(`문서의 상호작용 요소(${sel})를 탭해도 오버레이는 열리지 않는다`, async ({ page }) => {
    const f = await open9(page);
    await f.locator(sel).tap();
    await page.waitForTimeout(400);
    expect(await state(page)).toBe('closed');
  });

test('문서 자체의 핸들러는 그대로 동작한다', async ({ page }) => {
  const f = await open9(page);
  await f.locator('#handler').tap();
  await expect(f.locator('#handler')).toHaveAttribute('data-clicked', '1');
  await f.locator('[role=tab] >> nth=1').tap();
  await expect(f.locator('[role=tab] >> nth=1')).toHaveAttribute('aria-selected', 'true');
});

test('텍스트가 선택되어 있으면·길게 누르면·끌면 탭이 아니다', async ({ page }) => {
  const f = await open9(page);
  await f.evaluate(() => { const r = document.createRange(); r.selectNodeContents(document.getElementById('plain')!); getSelection()!.addRange(r); });
  await f.locator('#plain').tap();
  await page.waitForTimeout(400); expect(await state(page)).toBe('closed');
  await f.evaluate(() => getSelection()!.removeAllRanges());
  const send = (type: string, y: number) => f.locator('#plain').dispatchEvent(type, { clientX: 20, clientY: y, pointerId: 1, pointerType: 'touch', isPrimary: true, button: 0, bubbles: true });
  await send('pointerdown', 20); await page.waitForTimeout(450); await send('pointerup', 20); await f.locator('#plain').dispatchEvent('click');
  await page.waitForTimeout(300); expect(await state(page)).toBe('closed');                                   // 300ms 초과
  await send('pointerdown', 20); await send('pointerup', 60); await f.locator('#plain').dispatchEvent('click');
  await page.waitForTimeout(300); expect(await state(page)).toBe('closed');                                   // 10px 초과
  await send('pointerdown', 20); await send('pointerup', 22); await f.locator('#plain').dispatchEvent('click');
  await expect(page.getByTestId('reader')).toHaveAttribute('data-overlay', 'open');                           // 대조: 정상 탭은 열린다
});

test('3초 동안 조작이 없으면 숨는다', async ({ page }) => {
  const f = await open9(page);
  await f.locator('#plain').tap();
  await expect(page.getByTestId('reader')).toHaveAttribute('data-overlay', 'open');
  await page.waitForTimeout(2000); expect(await state(page)).toBe('open');
  await expect(page.getByTestId('reader')).toHaveAttribute('data-overlay', 'closed', { timeout: 2500 });
});

test('오버레이는 문서 공간을 밀지 않고 화면 끝에 붙는다', async ({ page }) => {
  const f = await open9(page);
  const before = await page.getByTestId('reader-frame').boundingBox();
  await f.locator('#plain').tap();
  await expect(page.getByTestId('reader')).toHaveAttribute('data-overlay', 'open');
  await overlaySettled(page);
  expect(await page.getByTestId('reader-frame').boundingBox()).toEqual(before);
  const vp = page.viewportSize()!;
  const top = (await page.getByTestId('overlay-top').boundingBox())!, bottom = (await page.getByTestId('overlay-bottom').boundingBox())!;
  expect([top.x, top.y, top.width]).toEqual([0, 0, vp.width]);
  expect([bottom.x, Math.round(bottom.y + bottom.height), bottom.width]).toEqual([0, vp.height, vp.width]);
  const css = await page.getByTestId('overlay-top').evaluate((e) => { const s = getComputedStyle(e); return { bf: s.backdropFilter || (s as any).webkitBackdropFilter, tp: s.transitionProperty }; });
  expect(css.bf).toContain('blur(22px)');
  expect(css.tp.split(',').map((s) => s.trim()).every((p) => ['transform', 'opacity'].includes(p))).toBe(true);
});

test('닫힌 오버레이는 문서 탭을 가로채지 않는다', async ({ page }) => {
  await open9(page);
  const top = page.getByTestId('overlay-top');
  expect(await top.evaluate((e) => getComputedStyle(e).pointerEvents)).toBe('none');
  expect(await top.evaluate((e) => e.hasAttribute('inert') || !!e.closest('[inert]'))).toBe(true);
  const hit = await page.evaluate(() => document.elementFromPoint(30, 20)?.getAttribute('data-testid'));
  expect(hit).toBe('reader-frame');
});
