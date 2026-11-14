import { expect, test } from '@playwright/test';
import { backToLibrary, idbAll, idbGet, importFixture, openBook, openOverlay, scrollFrameTo, startImport } from './helpers';

async function seed(page: any) {
  await page.goto('/');
  const id = await importFixture(page, 'reimport/v1/report.zip');
  const f = await openBook(page, id);
  await scrollFrameTo(f, 0.3);                                                                     // index.html also gets progress
  for (const p of ['keep.html', 'gone.html']) {
    await f.evaluate((p: string) => { location.href = p; }, p);
    await expect(page.getByTestId('reader')).toHaveAttribute('data-path', p);
    await scrollFrameTo(f, 0.5); await openOverlay(page); await page.getByTestId('btn-bookmark').click();
  }
  await expect.poll(async () => (await idbAll(page, 'bookmarks')).length).toBe(2);
  await backToLibrary(page);
  await expect.poll(async () => (await idbAll(page, 'progress')).map((p: any) => p.path).sort()).toEqual(['gone.html', 'index.html', 'keep.html']);
  return id;
}

const bookCaches = (page: any) => page.evaluate(() => caches.keys().then((k) => k.filter((n) => n.startsWith('book-')).sort()));

test('교체: 남은 경로의 진행률·북마크 유지, 사라진 경로 기록 삭제, 구 캐시 삭제', async ({ page }) => {
  const id = await seed(page);
  const again = await importFixture(page, 'reimport/v2/report.zip', { dup: 'replace' });
  expect(again).toBe(id);
  await expect(page.getByTestId('book-card')).toHaveCount(1);
  const book = await idbGet(page, 'books', id);
  expect(book).toMatchObject({ cacheName: `book-${id}-v2`, lastPath: 'index.html', title: '보고서' });        // lastPath(gone.html)가 사라져 entryPath로
  expect(book.pagePaths).toEqual(['index.html', 'keep.html', 'new.html']);
  expect((await idbAll(page, 'progress')).map((p: any) => p.path).sort()).toEqual(['index.html', 'keep.html']);
  expect((await idbAll(page, 'bookmarks')).map((b: any) => b.path)).toEqual(['keep.html']);
  expect((await idbAll(page, 'texts')).map((t: any) => t.path).sort()).toEqual(['index.html', 'keep.html', 'new.html']);
  await expect.poll(() => bookCaches(page)).toEqual([`book-${id}-v2`]);
  const f = await openBook(page, id);
  await f.evaluate(() => { location.href = 'keep.html'; });
  await expect(f.locator('body')).toContainText('개정판 문장');                                              // SW가 새 캐시를 서빙
});

test('"새 문서로 추가"를 고르면 별도 문서가 된다', async ({ page }) => {
  const id = await seed(page);
  const other = await importFixture(page, 'reimport/v2/report.zip', { dup: 'add' });
  expect(other).not.toBe(id);
  await expect(page.getByTestId('book-card')).toHaveCount(2);
  await expect(page.locator(`[data-book-id="${other}"]`)).toHaveAttribute('data-title', '보고서 (2)');
  expect((await idbGet(page, 'books', id)).cacheName).toBe(`book-${id}-v1`);
});

test('취소하면 아무것도 가져오지 않는다', async ({ page }) => {
  await page.goto('/');
  const id = await importFixture(page, 'reimport/v1/report.zip');
  await startImport(page, 'reimport/v2/report.zip');
  await page.getByTestId('confirm-cancel').click();
  await expect(page.getByTestId('import-progress')).toHaveCount(0);
  await expect(page.getByTestId('book-card')).toHaveCount(1);
  expect((await idbGet(page, 'books', id)).cacheName).toBe(`book-${id}-v1`);
});

test('교체 실패 시 기존 문서는 그대로다 (Review Focus 3)', async ({ page }) => {
  const id = await seed(page);
  const before = await idbAll(page, 'progress');
  await startImport(page, 'reimport/bad/report.zip');
  await page.getByTestId('dup-replace').click();
  await expect(page.getByTestId('import-error')).toHaveAttribute('data-code', 'crc-mismatch');
  await page.getByTestId('confirm-ok').click();
  expect((await idbGet(page, 'books', id)).cacheName).toBe(`book-${id}-v1`);
  expect((await idbAll(page, 'bookmarks')).length).toBe(2);
  expect(await idbAll(page, 'progress')).toEqual(before);
  expect(await bookCaches(page)).toEqual([`book-${id}-v1`]);
  const f = await openBook(page, id);
  await expect(f.locator('#h')).toBeVisible();
});

test('같은 sourceName 문서가 둘이면 최근 것을 교체 대상으로 보여준다 (Review Focus 5)', async ({ page }) => {
  await page.goto('/');
  const first = await importFixture(page, 'reimport/v1/report.zip');
  const second = await importFixture(page, 'reimport/v2/report.zip', { dup: 'add' });
  await startImport(page, 'reimport/v2/report.zip');
  await expect(page.getByText('"보고서 (2)" 문서가 이미 있습니다.')).toBeVisible();
  await page.getByTestId('dup-replace').click();
  await expect.poll(async () => (await idbGet(page, 'books', second)).cacheName).toBe(`book-${second}-v2`);
  expect((await idbGet(page, 'books', first)).cacheName).toBe(`book-${first}-v1`);
});
