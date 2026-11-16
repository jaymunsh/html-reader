import { expect, test } from '@playwright/test';
import { backToLibrary, idbGet, importFixture, openBook } from './helpers';

test('PC 패널: 도킹, 폭 조절 240–480 저장, 접기/펼치기 저장', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  const id = await importFixture(page, '01-multipage.zip');
  await openBook(page, id);
  const panel = page.getByTestId('panel');
  await expect(panel).toHaveAttribute('data-open', 'true');
  let pb = (await panel.boundingBox())!, fb = (await page.getByTestId('reader-frame').boundingBox())!;
  expect(pb.width).toBe(320);
  expect(Math.round(fb.x + fb.width)).toBe(Math.round(pb.x));                              // iframe이 패널만큼 줄어든다
  await expect(page.getByTestId('shortcut-help')).toHaveText('T 패널 · / 검색 · B 북마크 · [ ] 쪽 이동 · + − 확대');
  await expect(page.getByTestId('panel-toggle')).toHaveCount(1);                           // 토글은 한 번에 하나(패널 머리)
  const r = (await page.getByTestId('panel-resizer').boundingBox())!;
  await page.mouse.move(r.x + 2, r.y + 200); await page.mouse.down(); await page.mouse.move(r.x - 500, r.y + 200); await page.mouse.up();
  expect((await panel.boundingBox())!.width).toBe(480);
  await page.mouse.move(1280 - 480 + 2, 300); await page.mouse.down(); await page.mouse.move(1270, 300); await page.mouse.up();
  expect((await panel.boundingBox())!.width).toBe(240);
  await expect.poll(() => idbGet(page, 'settings', 'panelWidth')).toBe(240);
  await page.getByTestId('panel-toggle').click();
  await expect(panel).toHaveAttribute('data-open', 'false');
  await expect(page.getByTestId('panel-toggle')).toHaveCount(1);                           // 접히면 상단 바로
  expect(Math.round((await page.getByTestId('reader-frame').boundingBox())!.width)).toBe(1280);
  await expect.poll(() => idbGet(page, 'settings', 'panelOpen')).toBe(false);
  await backToLibrary(page); await openBook(page, id);
  await expect(page.getByTestId('panel')).toHaveAttribute('data-open', 'false');           // 상태 저장
  await page.getByTestId('panel-toggle').click();
  await expect(page.getByTestId('panel')).toHaveAttribute('data-open', 'true');
  expect((await page.getByTestId('panel').boundingBox())!.width).toBe(240);
});

test('창 폭이 1024px 미만이면 접힌 상태로 시작한다', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 700 });
  await page.goto('/');
  const id = await importFixture(page, '10-single.html');
  await openBook(page, id);
  await expect(page.getByTestId('panel')).toHaveAttribute('data-open', 'false');
});

test('PC 패널 폭 조절: 끄는 동안은 안내선만 움직이고 문서 폭은 놓을 때 바뀐다', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  const id = await importFixture(page, '01-multipage.zip');
  await openBook(page, id);
  const panel = page.getByTestId('panel'), frame = page.getByTestId('reader-frame');
  await expect(panel).toHaveAttribute('data-open', 'true');
  const r = (await page.getByTestId('panel-resizer').boundingBox())!;
  await page.mouse.move(r.x + 2, 300); await page.mouse.down(); await page.mouse.move(r.x - 98, 300);
  const g = (await page.getByTestId('panel-resize-guide').boundingBox())!;
  expect(Math.round(1280 - g.x - g.width / 2)).toBe(420);                                    // 안내선은 새 폭 위치
  expect((await panel.boundingBox())!.width).toBe(320);                                      // 패널·iframe은 그대로
  expect(Math.round((await frame.boundingBox())!.width)).toBe(960);
  await page.mouse.up();
  await expect(page.getByTestId('panel-resize-guide')).toHaveCount(0);
  expect((await panel.boundingBox())!.width).toBe(420);
  expect(Math.round((await frame.boundingBox())!.width)).toBe(860);
  await expect.poll(() => idbGet(page, 'settings', 'panelWidth')).toBe(420);
});
