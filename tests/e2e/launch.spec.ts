import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { fixture, importFixture, openBook, scrollFrameTo, idbGet } from './helpers';

test.skip(({ browserName, isMobile }) => browserName !== 'chromium' || isMobile, 'launchQueue는 Chromium 데스크톱 설치 앱 전용');

const b64 = (name: string) => readFileSync(fixture(name)).toString('base64');
async function installFakeQueue(page: any) {
  await page.addInitScript(() => {
    let consumer: any; const pending: any[] = [];
    // A plain assignment is ignored in Chromium (launchQueue is an own getter-only property).
    Object.defineProperty(window, 'launchQueue', { value: { setConsumer(cb: any) { consumer = cb; pending.splice(0).forEach(cb); } }, configurable: true });
    (window as any).__launch = (files: { name: string; b64: string }[]) => {
      const params = { files: files.map((f) => ({ getFile: async () => new File([Uint8Array.from(atob(f.b64), (c) => c.charCodeAt(0))], f.name) })) };
      consumer ? consumer(params) : pending.push(params);
    };
  });
}
const launch = (page: any, names: string[]) => page.evaluate((fs: any) => (window as any).__launch(fs), names.map((n) => ({ name: n.split('/').pop()!, b64: b64(n) })));

test('매니페스트에 file_handlers가 등록되어 있다', async ({ request }) => {
  const m = await (await request.get('/__app/manifest.webmanifest')).json();
  expect(m.file_handlers).toEqual([{ action: '/', accept: { 'application/zip': ['.zip'], 'text/html': ['.html', '.htm'] } }]);
  expect(m.launch_handler).toEqual({ client_mode: ['focus-existing', 'auto'] });
});

test('launchQueue로 파일이 전달되면 가져오기가 진행된다', async ({ page }) => {
  await installFakeQueue(page);
  await page.goto('/');
  await importFixture(page, '10-single.html');                       // 고지를 미리 통과
  await launch(page, ['01-multipage.zip']);
  await expect(page.locator('[data-title="여러 쪽 문서"]')).toBeVisible();
});

test('여러 파일·지원하지 않는 파일·중복 이름 (Review Focus 1, 5)', async ({ page }) => {
  await installFakeQueue(page);
  await page.goto('/');
  await importFixture(page, '10-single.html');
  await page.evaluate(() => (window as any).__launch([{ name: 'memo.pdf', b64: btoa('%PDF-1.4') }]));
  await expect(page.getByTestId('import-error')).toHaveAttribute('data-code', 'unsupported-file');
  await page.getByTestId('confirm-ok').click();
  await launch(page, ['02-fetch-module.zip', '10-single.html', '06-euckr.zip']);
  await expect(page.getByTestId('dup-add')).toBeVisible();           // 두 번째 파일에서 멈춰 묻는다
  await expect(page.getByTestId('book-card')).toHaveCount(2);        // 첫 파일은 이미 들어옴
  await page.getByTestId('dup-add').click();
  await expect(page.getByTestId('book-card')).toHaveCount(4);
});

test('리더가 열려 있을 때 전달되면 진행률을 저장하고 서재에서 가져온다 (Review Focus 2)', async ({ page }) => {
  await installFakeQueue(page);
  await page.goto('/');
  const id = await importFixture(page, '10-single.html');
  const f = await openBook(page, id);
  await scrollFrameTo(f, 0.6);
  await launch(page, ['01-multipage.zip']);
  await expect(page.getByTestId('library')).toBeVisible();
  await expect(page.locator('[data-title="여러 쪽 문서"]')).toBeVisible();
  expect((await idbGet(page, 'progress', [id, '10-single.html'])).lastScrollRatio).toBeCloseTo(0.6, 1);
  await expect.poll(() => idbGet(page, 'settings', 'activeBookId')).toBeNull();
});
