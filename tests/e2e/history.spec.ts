import { expect, test, type Page } from '@playwright/test';
import { writeFileSync } from 'node:fs';
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

test('문서 자신의 history.back()은 이전 쪽으로 가고 리더를 닫지 않는다; 첫 쪽에서는 아무 일도 없다', async ({ page }) => {
  const id = await start(page);
  const f = await openBook(page, id);
  const reader = page.getByTestId('reader');
  const at = async (p: string) => { await expect(reader).toHaveAttribute('data-path', p); await expect(reader).toHaveAttribute('data-agent', 'ready'); };
  await f.locator('#rel').click();
  await at('page2.html');
  await f.evaluate(() => { location.href = 'sub/page3.html'; });                         // 스크립트 이동도 문서 기록에 들어간다
  await at('sub/page3.html');
  await f.evaluate(() => history.back());
  await at('page2.html');
  await f.evaluate(() => history.go(-1));
  await at('index.html');
  await f.evaluate(() => history.forward());
  await at('page2.html');
  await f.evaluate(() => history.back());
  await at('index.html');
  await f.evaluate(() => history.back());                                               // 첫 쪽: 셸의 항목을 건드리지 않는다
  await page.waitForTimeout(400);
  await at('index.html');
  await back(page);                                                                      // 기기 뒤로 가기는 한 번에 서재
  await expect(page.getByTestId('library')).toBeVisible();
  await back(page);
  await leftApp(page);
});

test('해시 라우터·pushState 문서: 문서 안 뒤로 가기는 그 안에서, 오버레이 뒤로는 한 번에 서재, 다음 뒤로는 앱을 떠난다', async ({ page }, info) => {
  const file = info.outputPath('hash-router.html');
  writeFileSync(file, `<!doctype html><html><head><title>router</title></head><body><h1 id="view">home</h1><p id="pop"></p>
<script>
  const show = () => { document.getElementById('view').textContent = location.hash.slice(2) || 'home'; };
  addEventListener('hashchange', show);
  addEventListener('popstate', (e) => { document.getElementById('pop').textContent = location.search + '|' + JSON.stringify(e.state); });
</script></body></html>`);
  await page.goto(START);
  await page.goto('/');
  const id = await importFixture(page, file);
  const f = await openBook(page, id);
  await expect(page.getByTestId('reader')).toHaveAttribute('data-agent', 'ready');
  const view = f.locator('#view');
  await f.evaluate(() => { location.hash = '#/a'; });
  await expect(view).toHaveText('a');
  await f.evaluate(() => { location.hash = '#/b'; });
  await expect(view).toHaveText('b');
  await f.evaluate(() => history.back());                                               // 라우터의 뒤로 가기
  await expect(view).toHaveText('a');
  await f.evaluate(() => { history.pushState({ n: 1 }, '', '?r=1#/a'); });
  await f.evaluate(() => history.back());
  await expect(f.locator('#pop')).toHaveText('|null');                                  // 같은 문서 popstate
  await f.evaluate(() => history.forward());
  await expect(f.locator('#pop')).toHaveText('?r=1|{"n":1}');
  await openOverlay(page);
  await page.getByTestId('reader-back').click();                                        // 오버레이 뒤로 → 한 번에 서재
  await expect(page.getByTestId('library')).toBeVisible();
  await expect.poll(() => page.evaluate(() => history.state)).toBeNull();
  await back(page);
  await leftApp(page);
});

test('모바일: 시트가 열려 있으면 뒤로 가기는 시트부터 닫는다', async ({ page, isMobile }) => {
  test.skip(!isMobile, '모바일 시트');
  const id = await start(page);
  await openBook(page, id);
  const panel = page.getByTestId('panel');
  await openOverlay(page);
  await page.getByTestId('btn-panel').tap();
  await expect(panel).toHaveAttribute('data-open', 'true');
  await back(page);
  await expect(panel).toHaveAttribute('data-open', 'false');
  await expect(page.getByTestId('reader')).toBeVisible();
  await openOverlay(page);
  await page.getByTestId('btn-search').tap();
  await expect(page.getByTestId('search-input')).toBeVisible();
  await back(page);
  await expect(page.getByTestId('search-input')).toBeHidden();
  await expect(page.getByTestId('reader')).toBeVisible();
  await openOverlay(page);
  await page.getByTestId('btn-panel').tap();                                             // UI로 닫으면 그 항목도 사라진다
  await expect(panel).toHaveAttribute('data-open', 'true');
  await page.keyboard.press('Escape');
  await expect(panel).toHaveAttribute('data-open', 'false');
  await back(page);
  await expect(page.getByTestId('library')).toBeVisible();
  await back(page);
  await leftApp(page);
});

test('문서가 탭 전체를 자기 쪽으로 보내도 기록이 쌓이지 않는다 (top.location)', async ({ page }) => {
  await page.goto(START);
  await page.goto('/');
  const id = await importFixture(page, '12-frame-escape.zip');
  const f = await openBook(page, id);
  await f.locator('#toploc').click();
  await expect(page.getByTestId('reader')).toHaveAttribute('data-path', 'page2.html', { timeout: 10_000 });
  await back(page);
  await expect(page.getByTestId('library')).toBeVisible();
  await back(page);
  await leftApp(page);
});
