import { expect, test } from '@playwright/test';
import { importFixture, openBook, openOverlay, scrollFrameTo, settled } from './helpers';

test('바텀시트 파일 트리: 머리 요약, 상태, 현재 파일, 이동', async ({ page }) => {
  await page.goto('/');
  const id = await importFixture(page, '01-multipage.zip');
  const f = await openBook(page, id);
  await scrollFrameTo(f, 1);
  await openOverlay(page);
  await page.getByTestId('btn-panel').tap();
  const panel = page.getByTestId('panel');
  await expect(panel).toHaveAttribute('data-open', 'true');
  await settled(page, 'panel');
  const box = (await panel.boundingBox())!, vh = page.viewportSize()!.height;
  expect(box.height / vh).toBeGreaterThan(0.65); expect(box.height / vh).toBeLessThan(0.75);
  expect(Math.round(box.y + box.height)).toBe(vh);
  await expect(page.getByTestId('panel-head')).toContainText('01-multipage · HTML 5개 중 1개 읽음');
  await expect(page.getByTestId('panel-head')).toContainText('전체 20%');
  expect(await page.getByTestId('file-row').evaluateAll((els) => els.map((e) => e.getAttribute('data-path'))))
    .toEqual(['a b#c?.html', 'index.html', 'noref.html', 'page2.html', 'sub/page3.html']);
  await expect(panel).toContainText('sub/');
  const cur = page.locator('[data-testid=file-row][data-path="index.html"]');
  await expect(cur).toHaveAttribute('aria-current', 'page');
  await expect(cur).toHaveAttribute('data-status', 'read');
  await expect(cur).toContainText('여러 쪽 문서');                                        // <title> 보조 표시
  await expect(page.locator('[data-testid=file-row][data-path="page2.html"]')).toHaveAttribute('data-status', 'unread');
  await page.waitForTimeout(3300);
  await expect(panel).toHaveAttribute('data-open', 'true');                               // 패널 사용 중에는 자동으로 숨지 않는다
  await page.locator('[data-testid=file-row][data-path="sub/page3.html"]').tap();
  await expect(page.getByTestId('reader')).toHaveAttribute('data-path', 'sub/page3.html');
  await expect(panel).toHaveAttribute('data-open', 'false');
});

test('북마크 탭 빈 상태, 뒤 배경을 누르면 닫힌다', async ({ page }) => {
  await page.goto('/');
  const id = await importFixture(page, '10-single.html');
  await openBook(page, id); await openOverlay(page);
  await page.getByTestId('btn-panel').tap();
  await page.getByTestId('panel-tab-bookmarks').tap();
  await expect(page.getByTestId('panel-tab-bookmarks')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('panel')).toContainText('북마크가 없습니다');
  await settled(page, 'panel');
  const vp = page.viewportSize()!;
  await page.touchscreen.tap(20, Math.round(vp.height * 0.2));                            // 시트 위쪽 배경(상단 바 아래)
  await expect(page.getByTestId('panel')).toHaveAttribute('data-open', 'false');
});

test('포커스: 열면 시트 안으로, 배경은 inert, Escape로 닫히고 ☰로 돌아온다', async ({ page }) => {
  await page.goto('/');
  const id = await importFixture(page, '01-multipage.zip');
  await openBook(page, id); await openOverlay(page);
  await page.getByTestId('btn-panel').tap();
  await expect(page.getByTestId('panel')).toHaveAttribute('data-open', 'true');
  await expect(page.locator('[data-testid=file-row][data-path="index.html"]')).toBeFocused();
  for (const t of ['reader-frame', 'overlay-top', 'overlay-bottom'])
    expect(await page.getByTestId(t).evaluate((e) => !!e.closest('[inert]'))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('panel')).toHaveAttribute('data-open', 'false');
  await expect(page.getByTestId('btn-panel')).toBeFocused();
  expect(await page.getByTestId('reader-frame').evaluate((e) => !!e.closest('[inert]'))).toBe(false);
});

test('파일이 많아도 현재 파일이 보이는 위치로 열린다 (Review Focus 5)', async ({ page }) => {
  await page.goto('/');
  const id = await importFixture(page, 'many-pages.zip', { entry: 'p250.html' });
  await openBook(page, id); await openOverlay(page);
  await page.getByTestId('btn-panel').tap();
  await settled(page, 'panel');
  await expect(page.locator('[data-testid=file-row][data-path="p250.html"]')).toBeInViewport();
});
