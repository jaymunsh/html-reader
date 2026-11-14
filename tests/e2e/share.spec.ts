import { expect, test } from '@playwright/test';
import { fixture, idbAll, importFixture } from './helpers';

test.skip(({ browserName }) => browserName !== 'chromium', 'share_target은 Chromium(Android) 전용 — iOS 프리셋에서는 탭 안내가 끼어든다');

const shareDone = (page: any) => expect(page.locator('html')).toHaveAttribute('data-share', 'done');
const inboxCount = (page: any) => page.evaluate(async () => (await caches.has('share-inbox')) ? (await (await caches.open('share-inbox')).keys()).length : 0);

async function share(page: any, files: string[]) {
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);   // 제어되지 않으면 POST가 정적 서버로 간다 (P4-K13)
  await page.evaluate(() => {
    const form = document.createElement('form');
    form.method = 'POST'; form.enctype = 'multipart/form-data'; form.action = '/__app/share-target'; form.id = 'share-form';
    const input = document.createElement('input'); input.type = 'file'; input.name = 'file'; input.multiple = true; input.id = 'share-file';
    form.append(input); document.body.append(form);
  });
  await page.locator('#share-file').setInputFiles(files.map(fixture));
  await Promise.all([page.waitForURL(/\?import=pending$/, { waitUntil: 'commit' }), page.evaluate(() => (document.getElementById('share-form') as HTMLFormElement).submit())]);
}

test('매니페스트 share_target', async ({ request }) => {
  const m = await (await request.get('/__app/manifest.webmanifest')).json();
  expect(m.share_target).toMatchObject({ action: '/__app/share-target', method: 'POST', enctype: 'multipart/form-data' });
  expect(m.share_target.params.files[0]).toEqual({ name: 'file', accept: ['application/zip', 'application/x-zip-compressed', 'application/octet-stream', '.zip', 'text/html', '.html'] });
});

test('공유 POST → 임시 캐시 → /?import=pending → 가져오기 → 임시 캐시 비움', async ({ page }) => {
  await page.goto('/');
  await importFixture(page, '10-single.html');                       // 고지 통과
  await share(page, ['01-multipage.zip']);
  await expect(page.locator('[data-title="여러 쪽 문서"]')).toBeVisible();
  await shareDone(page);
  await expect(page).toHaveURL(/\/$/);
  await expect.poll(() => inboxCount(page)).toBe(0);
  await page.reload();
  await shareDone(page);
  await expect.poll(async () => (await idbAll(page, 'books')).length).toBe(2);   // 새로고침해도 다시 가져오지 않는다
  await expect(page.getByTestId('book-card')).toHaveCount(2);
});

test('GET /__app/share-target은 앱으로 되돌린다', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await page.goto('/__app/share-target');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId('library')).toBeVisible();
});

test('앱이 처리하기 전에 닫혀도 다음 시작 때 가져온다 (Review Focus 3)', async ({ page }) => {
  await page.goto('/');
  await importFixture(page, '10-single.html');
  await page.evaluate(async () => {
    const c = await caches.open('share-inbox');
    await c.put('/__share/1-0', new Response('<!doctype html><title>공유된 문서</title><h1 id="h">x</h1>', { headers: { 'Content-Type': 'text/html', 'X-File-Name': encodeURIComponent('공유.html') } }));
  });
  await page.goto('/?open=nope&x=1');                                // ?import=pending 없이 시작, 다른 화면에서도
  await expect(page.locator('[data-title="공유된 문서"]')).toBeVisible();
  await shareDone(page);
  await expect.poll(() => inboxCount(page)).toBe(0);
});

test('실패 안내', async ({ page }) => {
  await page.goto('/?import=failed&x=1');
  await expect(page.getByTestId('share-failed-notice')).toContainText('공유받은 파일을 열지 못했습니다. 앱에서 직접 가져오기를 이용하세요.');
  await expect(page).toHaveURL(/\/\?x=1$/);                          // import만 지운다 (P4-K11)
  await page.getByTestId('confirm-ok').click();
  await expect(page.getByTestId('share-failed-notice')).toHaveCount(0);
});
