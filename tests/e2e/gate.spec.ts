import { expect, test, type Page } from '@playwright/test';
import { importFixture, mountRawFrame } from './helpers';

async function seed(page: Page) {
  await page.goto('/');
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  const id = await importFixture(page, '01-multipage.zip');
  await page.evaluate((id) => navigator.serviceWorker.controller!.postMessage({ type: 'active-book', id }), id);
  const f = await mountRawFrame(page, id, 'index.html');
  await expect.poll(() => f.url()).toContain(`/book/${id}/index.html`);
  const frame = () => f;
  return Object.assign(frame, { id });
}
const color = (f: any) => f.locator('#h').evaluate((e: Element) => getComputedStyle(e).color);

test('G1 SW가 iframe 문서를 제어한다', async ({ page }) => {
  const frame = await seed(page);
  await expect(frame().locator('#h')).toHaveText('index');
  expect(await frame().evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
});

test('G2 상대 링크로 iframe 안에서 페이지 이동', async ({ page }) => {
  const frame = await seed(page);
  await frame().locator('#rel').click();
  await expect(frame().locator('#h')).toHaveText('page2');
  expect(new URL(frame().url()).pathname).toBe(`/book/${frame.id}/page2.html`);
});

test('G3 루트 절대경로 네비게이션은 302로 /book/<id>/ 아래에 남는다', async ({ page }) => {
  const frame = await seed(page);
  await frame().locator('#abs').click();
  await expect(frame().locator('#h')).toHaveText('page2');
  expect(new URL(frame().url()).pathname).toBe(`/book/${frame.id}/page2.html`);
  expect(await color(frame())).toBe('rgb(4, 5, 6)');           // G5: 리다이렉트된 페이지의 상대경로 CSS
});

test('G4 서브리소스 매핑: 루트 절대 CSS·이미지·module, 상대 fetch', async ({ page }) => {
  const frame = await seed(page);
  expect(await color(frame())).toBe('rgb(1, 2, 3)');
});

test('G6 no-referrer 문서에서도 루트 절대 CSS·링크가 동작한다(activeBookId 폴백)', async ({ page }) => {
  const frame = await seed(page);
  await frame().locator('#noref').click();
  await expect(frame().locator('#h')).toHaveText('noref');
  expect(await color(frame())).toBe('rgb(1, 2, 3)');
  await frame().locator('#abs').click();
  await expect(frame().locator('#h')).toHaveText('page2');
  expect(new URL(frame().url()).pathname).toBe(`/book/${frame.id}/page2.html`);
});

test('G7 SW가 iframe 네비게이션과 최상위 네비게이션을 구분한다', async ({ page }) => {
  const frame = await seed(page);
  await page.goto(`/book/${frame.id}/index.html`);                     // 최상위 창으로 열기
  await expect(page).toHaveURL(new RegExp(`/\\?open=${frame.id}&path=index\\.html$`));
});
