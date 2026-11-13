import { expect, test } from '@playwright/test';
import { backToLibrary, importFixture, openBook, startImport } from './helpers';

const use = (request: any, dir: string) => request.post(`/__test/use?dir=${dir}`);
test.beforeEach(async ({ request }) => { await use(request, 'dist'); });
test.afterEach(async ({ request }) => { await use(request, 'dist'); });

const swUrlHash = (page: any) => page.evaluate(async () => {
  const r = await navigator.serviceWorker.getRegistration();
  return { waiting: !!r?.waiting, active: r?.active?.state };
});

test('새 버전은 대기 → 리더가 열려 있는 동안 적용 안 됨 → 서재에서 적용, book 캐시는 그대로', async ({ page, request }) => {
  await page.goto('/');
  const id = await importFixture(page, '10-single.html');
  const before = await page.evaluate(() => caches.keys());
  await openBook(page, id);

  await use(request, 'dist-v2');
  await page.evaluate(async () => { await (await navigator.serviceWorker.getRegistration())!.update(); });
  await expect.poll(async () => (await swUrlHash(page)).waiting, { timeout: 15_000 }).toBe(true);
  await expect(page.getByTestId('update-banner')).toHaveCount(0);            // 리더에서는 알림 없음
  await page.waitForTimeout(1000);
  expect((await swUrlHash(page)).waiting).toBe(true);                        // skipWaiting 자동 호출 없음
  await expect(page.getByTestId('reader')).toBeVisible();

  const reloaded = page.waitForEvent('load');
  await backToLibrary(page);                                                 // 서재로 돌아오면 적용 + 새로고침
  await reloaded;
  await expect.poll(async () => (await swUrlHash(page)).waiting).toBe(false);
  await expect(page.locator(`[data-book-id="${id}"]`)).toBeVisible();
  const after = await page.evaluate(() => caches.keys());
  expect(after.filter((k: string) => k.startsWith('book-'))).toEqual(before.filter((k: string) => k.startsWith('book-')));
});

test('서재에 머무는 중이면 "업데이트 준비됨 — 적용" 알림으로 적용한다', async ({ page, request }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await use(request, 'dist-v2');
  await page.evaluate(async () => { await (await navigator.serviceWorker.getRegistration())!.update(); });
  await expect(page.getByTestId('update-banner')).toContainText('업데이트 준비됨');
  const reloaded = page.waitForEvent('load');
  await page.getByTestId('update-apply').click();
  await reloaded;
  await expect(page.getByTestId('update-banner')).toHaveCount(0);
  expect((await swUrlHash(page)).waiting).toBe(false);
});

test('가져오는 중에는 업데이트 적용 버튼이 비활성이다', async ({ page, request }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await importFixture(page, '10-single.html');                              // 고지를 미리 통과
  await use(request, 'dist-v2');
  await page.evaluate(async () => { await (await navigator.serviceWorker.getRegistration())!.update(); });
  await expect(page.getByTestId('update-apply')).toBeEnabled({ timeout: 15_000 });
  await startImport(page, 'big.zip');
  await expect(page.getByTestId('import-progress')).toBeVisible();
  await expect(page.getByTestId('update-apply')).toBeDisabled();
  await expect(page.getByTestId('book-card')).toHaveCount(2, { timeout: 30_000 });
  await expect(page.getByTestId('update-apply')).toBeEnabled();
});
