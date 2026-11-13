import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { importFixture } from './helpers';

test('vercel.json rewrite 규칙', () => {
  const v = JSON.parse(readFileSync('vercel.json', 'utf8'));
  expect(v.rewrites).toEqual([{ source: '/book/:path*', destination: '/__app/no-sw.html' }, { source: '/(.*)', destination: '/index.html' }]);
});

test('SW가 없을 때 /book/*는 no-sw 페이지로 간다', async ({ request }) => {
  const r = await request.get('/book/abc/index.html');
  expect(await r.text()).toContain("type: 'no-sw'");
});

test('SW가 차단된 환경: 최상위 /book/* → /, 문서를 열면 안내', async ({ browser, browserName }) => {
  test.skip(browserName !== 'chromium', 'serviceWorkers: block은 Chromium에서만 검증');
  const ctx = await browser.newContext({ serviceWorkers: 'block' });
  const page = await ctx.newPage();
  await page.goto('/book/abc/index.html');
  await expect(page).toHaveURL(/\/$/);
  const id = await importFixture(page, '10-single.html');
  await page.locator(`[data-book-id="${id}"]`).click();
  await expect(page.getByTestId('unsupported-notice')).toContainText('이 환경에서는 문서를 열 수 없습니다');
  await ctx.close();
});
