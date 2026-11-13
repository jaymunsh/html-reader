import { expect, test } from '@playwright/test';
import { importFixture, openBook, overlaySettled, scrollFrameTo, settled } from './helpers';
const ratio = (f: any) => f.evaluate(() => { const e = document.scrollingElement!; return e.scrollTop / (e.scrollHeight - e.clientHeight); });

test('PC 상단 바는 항상 보이고 모바일 전용 요소는 없다', async ({ page }) => {
  await page.goto('/');
  const id = await importFixture(page, '01-multipage.zip');
  await openBook(page, id);
  await expect(page.getByTestId('overlay-top')).toBeVisible();
  for (const t of ['reader-back', 'page-info', 'btn-prev', 'btn-next']) await expect(page.getByTestId('overlay-top').getByTestId(t)).toBeVisible();
  await expect(page.getByTestId('panel-toggle')).toHaveCount(1);                           // P2-K2: 패널 머리 또는 상단 바, 한 곳에만
  await expect(page.getByTestId('panel-toggle')).toBeVisible();
  for (const t of ['overlay-bottom', 'ribbon-tab', 'hint-toast', 'scroll-handle', 'progress-line']) await expect(page.getByTestId(t)).toHaveCount(0);
  const bar = (await page.getByTestId('overlay-top').boundingBox())!, fr = (await page.getByTestId('reader-frame').boundingBox())!;
  expect(Math.round(fr.y)).toBe(Math.round(bar.y + bar.height));
  expect(Math.round(bar.height)).toBe(48);
  const pb = (await page.getByTestId('progress-bar').boundingBox())!;
  expect(Math.round(pb.y + pb.height)).toBe(Math.round(bar.y + bar.height));                // 상단 바 아래 경계
});

test('iframe에 포커스가 있어도 단축키가 동작한다', async ({ page }) => {
  await page.goto('/');
  const id = await importFixture(page, '01-multipage.zip');
  const f = await openBook(page, id);
  await f.locator('#h').click();                                            // iframe에 포커스
  await page.keyboard.press(']');
  await expect(page.getByTestId('reader')).toHaveAttribute('data-path', 'noref.html');
  await expect(page.getByTestId('reader')).toHaveAttribute('data-agent', 'ready');
  await page.keyboard.press('[');
  await expect(page.getByTestId('reader')).toHaveAttribute('data-path', 'index.html');
  await expect(page.getByTestId('reader')).toHaveAttribute('data-agent', 'ready');
  await f.locator('#h').click();
  await page.keyboard.press('End');
  await expect.poll(() => ratio(f)).toBeGreaterThan(0.98);
  await page.keyboard.press('Home');
  await expect.poll(() => ratio(f)).toBeLessThan(0.02);
  const open = await page.getByTestId('panel').getAttribute('data-open');
  await page.keyboard.press('t');
  await expect(page.getByTestId('panel')).not.toHaveAttribute('data-open', open!);
  await page.keyboard.press('Control+]');                                    // 수정자 키는 가로채지 않는다
  await page.waitForTimeout(300);
  await expect(page.getByTestId('reader')).toHaveAttribute('data-path', 'index.html');
  await page.keyboard.press('Space');                                        // PC에서 Space는 오버레이 토글이 아니다
  await expect(page.getByTestId('reader')).toHaveAttribute('data-overlay', 'open');
});

test('셸에 포커스가 있을 때도 단축키가 동작한다', async ({ page }) => {
  await page.goto('/');
  const id = await importFixture(page, '01-multipage.zip');
  await openBook(page, id);
  await page.getByTestId('overlay-title').click();
  await page.keyboard.press(']');
  await expect(page.getByTestId('reader')).toHaveAttribute('data-path', 'noref.html');
});

test('입력 요소에 포커스가 있거나 문서가 키를 처리했으면 무시한다', async ({ page }) => {
  await page.goto('/');
  const id = await importFixture(page, '09-click-handlers.zip');
  const f = await openBook(page, id);
  const open = await page.getByTestId('panel').getAttribute('data-open');
  await f.locator('#inp').click();
  await page.keyboard.type('t[]');
  await expect(f.locator('#inp')).toHaveValue('t[]');
  await expect(page.getByTestId('panel')).toHaveAttribute('data-open', open!);
  await f.locator('#plain').click();
  await page.keyboard.press(']');                                            // 문서가 preventDefault (다음 쪽 page2.html이 있다)
  await page.waitForTimeout(300);
  await expect(page.getByTestId('reader')).toHaveAttribute('data-path', 'index.html');
  await page.keyboard.press('t');                                            // 대조: 처리하지 않은 키는 동작한다
  await expect(page.getByTestId('panel')).not.toHaveAttribute('data-open', open!);
});

test('창을 768px 아래로 줄였다 늘려도 iframe이 다시 로드되지 않고 위치가 유지된다 (Review Focus 3)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  const id = await importFixture(page, '10-single.html');
  const f = await openBook(page, id);
  await scrollFrameTo(f, 0.5);
  await f.evaluate(() => { (window as any).__mark = 1; });
  // the sheet's inert: on the iframe and on the overlay wrapper (a closed bar is inert on its own, that is not the sheet's)
  const inert = () => page.evaluate(() => [document.querySelector('[data-testid=reader-frame]')!, document.querySelector('[data-testid=overlay-top]')!.parentElement!]
    .some((e) => !!e.closest('[inert]')));

  await page.setViewportSize({ width: 600, height: 800 });
  await expect(page.getByTestId('ribbon-tab')).toBeVisible();
  await page.getByTestId('ribbon-tab').click();
  await expect(page.getByTestId('reader')).toHaveAttribute('data-overlay', 'open');
  await overlaySettled(page);
  await page.getByTestId('btn-panel').click();                               // 모바일 시트를 연 채로 경계를 넘는다
  await expect(page.getByTestId('panel')).toHaveAttribute('data-open', 'true');
  await settled(page, 'panel');
  expect(await inert()).toBe(true);

  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(page.getByTestId('ribbon-tab')).toHaveCount(0);
  await expect(page.getByTestId('overlay-bottom')).toHaveCount(0);
  expect(await inert()).toBe(false);                                         // 시트의 inert가 남지 않는다
  expect(await f.evaluate(() => (window as any).__mark)).toBe(1);            // 다시 로드되지 않았다
  expect(await ratio(f)).toBeCloseTo(0.5, 1);

  await page.setViewportSize({ width: 600, height: 800 });
  await expect(page.getByTestId('panel')).toHaveAttribute('data-open', 'false');   // 시트가 다시 열리지 않는다
  await expect(page.getByTestId('reader')).toHaveAttribute('data-overlay', 'closed');
  expect(await inert()).toBe(false);
  expect(await f.evaluate(() => (window as any).__mark)).toBe(1);
  expect(await ratio(f)).toBeCloseTo(0.5, 1);
  await page.getByTestId('ribbon-tab').click();                              // 시트의 holdOverlay가 풀려 있어 3초 뒤 숨는다
  await expect(page.getByTestId('reader')).toHaveAttribute('data-overlay', 'open');
  await expect(page.getByTestId('reader')).toHaveAttribute('data-overlay', 'closed', { timeout: 4500 });
});

test('키 반복(e.repeat)은 무시한다 (셸·iframe 모두)', async ({ page }) => {
  await page.goto('/');
  const id = await importFixture(page, '01-multipage.zip');
  const f = await openBook(page, id);
  const press = "dispatchEvent(new KeyboardEvent('keydown', { key: ']', repeat: true, bubbles: true }))";
  await page.evaluate(press);
  await f.evaluate(press);
  await page.waitForTimeout(300);
  await expect(page.getByTestId('reader')).toHaveAttribute('data-path', 'index.html');
  await f.evaluate("dispatchEvent(new KeyboardEvent('keydown', { key: ']', bubbles: true }))");   // 대조: 반복이 아니면 이동한다
  await expect(page.getByTestId('reader')).toHaveAttribute('data-path', 'noref.html');
});
