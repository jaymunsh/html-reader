import { expect, test } from '@playwright/test';
import { backToLibrary, bookFrame, idbGet, importFixture, openBook } from './helpers';

test('문서를 열면 iframe에 시작 페이지가 뜨고 activeBookId가 기록된다', async ({ page }) => {
  await page.goto('/');
  const id = await importFixture(page, '01-multipage.zip');
  const frame = await openBook(page, id);
  await expect(frame.locator('#h')).toBeVisible();
  await expect(page.getByTestId('reader')).toHaveAttribute('data-path', 'index.html');
  await expect(page.getByTestId('reader-frame')).not.toHaveAttribute('sandbox', /.*/);
  expect(await idbGet(page, 'settings', 'activeBookId')).toBe(id);
  await expect(page.locator('html')).toHaveAttribute('data-screen', 'reader');
});

test('iframe 안 페이지 이동을 셸이 따라간다(제한 모드에서도) — lastPath 갱신', async ({ page }) => {
  await page.goto('/');
  const id = await importFixture(page, '01-multipage.zip');
  const frame = await openBook(page, id);
  await frame.locator('#abs').click();
  await expect(page.getByTestId('reader')).toHaveAttribute('data-path', 'page2.html');
  await expect.poll(async () => (await idbGet(page, 'books', id)).lastPath).toBe('page2.html');
  await backToLibrary(page);
  expect(await idbGet(page, 'settings', 'activeBookId')).toBeNull();
  await openBook(page, id);
  await expect(page.getByTestId('reader')).toHaveAttribute('data-path', 'page2.html');
});

test('agent가 응답하지 않으면 3초 안에 제한 모드가 된다', async ({ page }) => {
  await page.goto('/');
  const id = await importFixture(page, '13-csp.zip');
  await page.locator(`[data-book-id="${id}"]`).click();
  await expect(page.getByTestId('reader')).toHaveAttribute('data-agent', 'limited', { timeout: 5000 });
  await expect(bookFrame(page).locator('#h')).toBeVisible();
});

test('?open=<id>&path= 로 열기, 주소는 /로 정리', async ({ page }) => {
  await page.goto('/');
  const id = await importFixture(page, '01-multipage.zip');
  await page.goto(`/?open=${id}&path=sub%2Fpage3.html`);
  await expect(page.getByTestId('reader')).toHaveAttribute('data-path', 'sub/page3.html');
  expect(new URL(page.url()).search).toBe('');
});

test('없는 문서·사라진 lastPath (Review Focus 5)', async ({ page }) => {
  await page.goto('/?open=zzzzzzzzzzzz&path=index.html');
  await expect(page.getByTestId('book-missing-notice')).toBeVisible();
  await page.getByTestId('confirm-ok').click();
  await expect(page.getByTestId('library')).toBeVisible();
  const id = await importFixture(page, '01-multipage.zip');
  await page.evaluate((id) => new Promise<void>((res) => { const r = indexedDB.open('html-reader'); r.onsuccess = () => {
    const tx = r.result.transaction('books', 'readwrite'); const s = tx.objectStore('books');
    s.get(id).onsuccess = (e: any) => s.put({ ...e.target.result, lastPath: 'gone.html' }); tx.oncomplete = () => res(); }; }), id);
  await openBook(page, id);
  await expect(page.getByTestId('reader')).toHaveAttribute('data-path', 'index.html');
});
