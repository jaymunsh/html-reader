import { expect, test, type Page } from '@playwright/test';
import { backToLibrary, importFixture, openBook, openOverlay } from './helpers';

// A page before the app, so "back leaves the app" is observable.
const START = 'data:text/html,<title>before</title>start';
const back = (page: Page) => page.evaluate(() => history.back());
const forward = (page: Page) => page.evaluate(() => history.forward());
const leftApp = (page: Page) => expect.poll(() => page.url()).toMatch(/^data:/);

async function start(page: Page): Promise<string> {
  await page.goto(START);
  await page.goto('/');
  return importFixture(page, '01-multipage.zip');
}

test('리더에서 뒤로 가기 → 서재, 한 번 더 → 앱을 떠난다', async ({ page }) => {
  const id = await start(page);
  await openBook(page, id);
  await back(page);
  await expect(page.getByTestId('library')).toBeVisible();
  await expect(page.getByTestId('reader')).toHaveCount(0);
  await back(page);
  await leftApp(page);
});

test('쪽을 여러 번 옮긴 뒤에도 뒤로 가기 한 번이면 서재', async ({ page }) => {
  const id = await start(page);
  const f = await openBook(page, id);
  const reader = page.getByTestId('reader');
  await f.locator('#rel').click();                                                      // 문서 안 링크
  await expect(reader).toHaveAttribute('data-path', 'page2.html');
  await expect(reader).toHaveAttribute('data-agent', 'ready');
  await openOverlay(page);
  await page.getByTestId('btn-next').click();                                          // 셸의 다음 쪽
  await expect(reader).not.toHaveAttribute('data-path', 'page2.html');
  await expect(reader).toHaveAttribute('data-agent', 'ready');
  await openOverlay(page);
  await page.getByTestId('btn-prev').click();
  await expect(reader).toHaveAttribute('data-path', 'page2.html');
  await expect(reader).toHaveAttribute('data-agent', 'ready');
  await f.evaluate(() => { history.pushState({}, '', '#x'); });                         // 문서 스크립트의 pushState도 쌓이지 않는다
  await back(page);
  await expect(page.getByTestId('library')).toBeVisible();
  await back(page);
  await leftApp(page);
});

test('서재 버튼으로 나가고 다시 열기를 반복해도 기록이 쌓이지 않는다; 서재에서 뒤로 가기는 바로 앱을 떠난다', async ({ page }) => {
  const id = await start(page);
  const base = await page.evaluate(() => history.length);
  for (let i = 0; i < 3; i++) {
    await openBook(page, id);
    await backToLibrary(page);
    await expect.poll(() => page.evaluate(() => history.state)).toBeNull();
  }
  expect(await page.evaluate(() => history.length)).toBeLessThanOrEqual(base + 1);       // 앞으로 가기 한 칸만 남는다
  await back(page);
  await leftApp(page);
});

test('앞으로 가기는 방금 닫은 문서를 다시 연다', async ({ page }) => {
  const id = await start(page);
  await openBook(page, id);
  await back(page);
  await expect(page.getByTestId('library')).toBeVisible();
  await forward(page);
  await expect(page.getByTestId('reader')).toHaveAttribute('data-book-id', id);
  await expect(page.getByTestId('reader')).toHaveAttribute('data-agent', 'ready');
  await back(page);
  await expect(page.getByTestId('library')).toBeVisible();
});

test('?open= 딥 링크: 뒤로 가기는 서재로, 그다음 앱을 떠난다', async ({ page }) => {
  const id = await start(page);
  await page.goto(`/?open=${id}&path=sub%2Fpage3.html`);
  await expect(page.getByTestId('reader')).toHaveAttribute('data-path', 'sub/page3.html');
  expect(new URL(page.url()).search).toBe('');
  await back(page);
  await expect(page.getByTestId('library')).toBeVisible();
  expect(new URL(page.url()).pathname + new URL(page.url()).search).toBe('/');
});

test('설정에서 뒤로 가기 → 서재', async ({ page }) => {
  await page.goto(START);
  await page.goto('/');
  await page.getByTestId('settings-button').click();
  await expect(page.getByTestId('settings')).toBeVisible();
  await back(page);
  await expect(page.getByTestId('library')).toBeVisible();
  await back(page);
  await leftApp(page);
});
