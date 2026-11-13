import { expect, test } from '@playwright/test';
import { idbAll, idbGet, importFixture, startImport } from './helpers';

test('ZIP 가져오기 → 서재에 나타나고 캐시·메타가 커밋된다', async ({ page }) => {
  await page.goto('/');
  const id = await importFixture(page, '01-multipage.zip');
  expect(id).toMatch(/^[a-z0-9]{12}$/);
  await expect(page.locator(`[data-book-id="${id}"] [data-testid=book-title]`)).toHaveText('여러 쪽 문서');
  const book = await idbGet(page, 'books', id);
  expect(book).toMatchObject({ sourceName: '01-multipage', entryPath: 'index.html', cacheName: `book-${id}-v1`, textScale: 1, fileCount: 7 });
  expect(book.pagePaths).toEqual(['a b#c?.html', 'index.html', 'noref.html', 'page2.html', 'sub/page3.html']);
  const keys = await page.evaluate(async (n) => (await (await caches.open(n)).keys()).map((r) => new URL(r.url).pathname), book.cacheName);
  expect(keys).toContain(`/book/${id}/a%20b%23c%3F.html`);
  expect(keys.length).toBe(7);
  const texts = await idbAll(page, 'texts');
  expect(texts.find((t: any) => t.path === 'page2.html').text).toContain('두 번째 쪽에만 있는 문장 알파카');
});

test('조각 HTML은 pagePaths에서 빠진다', async ({ page }) => {
  await page.goto('/');
  const id = await importFixture(page, '02-fetch-module.zip');
  expect((await idbGet(page, 'books', id)).pagePaths).toEqual(['index.html']);
});

test('CP949·NFD 파일명 ZIP', async ({ page }) => {
  await page.goto('/');
  const a = await importFixture(page, '05-cp949-name.zip');
  expect((await idbGet(page, 'bookFiles', a)).paths.sort()).toEqual(['index.html', '한글.html']);
  const b = await importFixture(page, '05-nfd-macos.zip');
  expect((await idbGet(page, 'bookFiles', b)).paths.sort()).toEqual(['index.html', '한글 페이지.html']);
});

test('단일 HTML: 무의미 제목이면 파일명을 문서명으로', async ({ page }) => {
  await page.goto('/');
  const id = await importFixture(page, '10-single.html');
  await expect(page.locator(`[data-book-id="${id}"]`)).toHaveAttribute('data-title', '10-single');
  expect((await idbGet(page, 'books', id)).entryPath).toBe('10-single.html');
});

test('EUC-KR 문서: 제목과 색인이 깨지지 않고, meta 없는 파일만 charset이 붙는다', async ({ page }) => {
  await page.goto('/');
  const id = await importFixture(page, '06-euckr.zip');
  await expect(page.locator(`[data-book-id="${id}"]`)).toHaveAttribute('data-title', '한글 문서');
  const types = await page.evaluate(async (id) => {
    const c = await caches.open(`book-${id}-v1`);
    const t = async (p: string) => (await c.match(`/book/${id}/${p}`))!.headers.get('Content-Type');
    return [await t('index.html'), await t('nometa.html')];
  }, id);
  expect(types).toEqual(['text/html', 'text/html; charset=euc-kr']);
});

test('시작 페이지를 고를 수 없으면 사용자에게 묻는다', async ({ page }) => {
  await page.goto('/');
  const id = await importFixture(page, 'pick-entry.zip', { entry: 'b.html' });
  expect((await idbGet(page, 'books', id)).entryPath).toBe('b.html');
});

for (const [file, code] of [['err-encrypted.zip', 'encrypted'], ['err-nohtml.zip', 'no-html'], ['err-crc.zip', 'crc-mismatch'],
  ['err-truncated.zip', 'not-zip'], ['err-deflate64.zip', 'unsupported-method']] as const) {
  test(`오류: ${file} → ${code}, 캐시가 남지 않는다`, async ({ page }) => {
    await page.goto('/');
    await startImport(page, file);
    await expect(page.getByTestId('import-error')).toHaveAttribute('data-code', code);
    expect(await page.evaluate(async () => (await caches.keys()).filter((k) => k.startsWith('book-')))).toEqual([]);
    await expect(page.getByTestId('book-card')).toHaveCount(0);
  });
}
