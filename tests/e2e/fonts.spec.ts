import { expect, test } from '@playwright/test';

const SUBSETS = ['latin', 'hangul-common', 'hangul-2', 'hangul-3', 'hangul-4', 'extra'];

test('첫 방문: 화면의 한글에 필요한 글꼴 조각만 받고, 2MB 통짜 글꼴은 없다', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('library')).toContainText('아직 문서가 없습니다');
  await page.evaluate(() => document.fonts.ready);
  const names = await page.evaluate(() => performance.getEntriesByType('resource').map((e) => e.name).filter((n) => n.includes('/fonts/')));
  expect(names.some((n) => n.includes('pretendard-hangul-common.woff2'))).toBe(true);
  expect(names.some((n) => n.includes('pretendard-hangul-4.woff2'))).toBe(false);          // 쓰지 않는 조각은 받지 않는다
  expect(names.some((n) => n.includes('PretendardVariable'))).toBe(false);
  expect(await page.evaluate(() => document.fonts.check('16px "Pretendard Variable"', '서재'))).toBe(true);
});

test('모든 글꼴 조각이 프리캐시에 들어 있다 (오프라인)', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  const missing = await page.evaluate(async (subsets) => {
    const out: string[] = [];
    for (const s of subsets) if (!(await caches.match(`/__app/fonts/pretendard-${s}.woff2`))) out.push(s);
    return out;
  }, SUBSETS);
  expect(missing).toEqual([]);
});
