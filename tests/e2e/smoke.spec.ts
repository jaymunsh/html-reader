import { expect, test } from '@playwright/test';

test('앱 셸이 뜨고 자산은 전부 /__app/ 아래다', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('library')).toBeVisible();
  const urls = await page.evaluate(() =>
    [...document.querySelectorAll('script[src],link[href]')].map((e) => new URL((e as any).src || (e as any).href).pathname));
  expect(urls.length).toBeGreaterThan(0);
  for (const u of urls) expect(u).toMatch(/^\/__app\//);
});

test('매니페스트와 메타', async ({ page, request }) => {
  const m = await (await request.get('/__app/manifest.webmanifest')).json();
  expect(m).toMatchObject({ display: 'standalone', start_url: '/', scope: '/', theme_color: '#EEF0F4', background_color: '#EEF0F4' });
  await page.goto('/');
  await expect(page.locator('meta[name=viewport]')).toHaveAttribute('content', 'width=device-width, initial-scale=1, viewport-fit=cover');
  await expect(page.locator('meta[name=apple-mobile-web-app-status-bar-style]')).toHaveAttribute('content', 'default');
  await expect(page.locator('meta[name=mobile-web-app-capable]')).toHaveAttribute('content', 'yes');
});

test('SW가 등록되어 페이지를 제어한다', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
});

test('알 수 없는 경로는 앱으로 rewrite된다', async ({ request }) => {
  const r = await request.get('/no/such/path');
  expect(r.status()).toBe(200);
  expect(await r.text()).toContain('<div id="app">');
});
