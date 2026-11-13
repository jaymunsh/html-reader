import { expect, test, type Page } from '@playwright/test';
import { backToLibrary, fixture, idbAll, importFixture, openBook, scrollFrameTo, startImport } from './helpers';

// Awaited (not racy) pass through the iOS notices, which appear only under an iPhone UA.
async function passIosNotices(page: Page) {
  if (!(await page.evaluate(() => /iPhone|iPad|iPod/.test(navigator.userAgent)))) return;
  await page.getByTestId('ios-continue-tab').click();
  await page.getByTestId('ios-temp-ok').click();
}

test('카드에 문서 진행률·읽은 쪽수·마지막으로 연 시각이 보인다', async ({ page }) => {
  await page.goto('/');
  const id = await importFixture(page, '01-multipage.zip');
  const card = page.locator(`[data-book-id="${id}"]`);
  await expect(card.getByTestId('book-progress')).toHaveText('0%');
  await expect(card.getByTestId('book-pages')).toHaveText('0/5쪽');
  await expect(card).toContainText('안 읽음');
  const f = await openBook(page, id);
  await scrollFrameTo(f, 1);
  await backToLibrary(page);
  await expect(card.getByTestId('book-pages')).toHaveText('1/5쪽');
  await expect(card.getByTestId('book-progress')).toHaveText('20%');
  await expect(card).toContainText('방금');
});

test('삭제: 메타·캐시·진행률이 모두 사라진다', async ({ page }) => {
  await page.goto('/');
  const id = await importFixture(page, '10-single.html');
  const f = await openBook(page, id); await scrollFrameTo(f, 0.5); await backToLibrary(page);
  await page.locator(`[data-book-id="${id}"] [data-testid=book-menu]`).click();
  await page.getByTestId('menu-delete').click();
  await page.getByTestId('confirm-ok').click();
  await expect(page.getByTestId('book-card')).toHaveCount(0);
  expect(await page.evaluate(async () => (await caches.keys()).filter((k) => k.startsWith('book-')))).toEqual([]);
  for (const s of ['books', 'bookFiles', 'texts', 'progress']) expect(await idbAll(page, s)).toEqual([]);
});

test('첫 가져오기에 한 줄 고지가 한 번만 뜬다', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('import-input').setInputFiles(fixture('10-single.html'));
  await passIosNotices(page);
  await expect(page.getByTestId('safety-notice')).toBeVisible();
  await page.getByTestId('confirm-ok').click();
  await expect(page.getByTestId('book-card')).toHaveCount(1);
  await page.getByTestId('import-input').setInputFiles(fixture('pick-entry.zip'));
  await passIosNotices(page);
  await expect(page.getByTestId('entry-choice').first()).toBeVisible();
  await expect(page.getByTestId('safety-notice')).toHaveCount(0);
});

test('시작 시 고아 캐시·고아 레코드를 정리하고 book이 가리키는 캐시는 남긴다', async ({ page }) => {
  await page.goto('/');
  const id = await importFixture(page, '10-single.html');
  await page.evaluate(async () => {
    await (await caches.open('book-orphanorphan-v1')).put('/book/orphanorphan/x.html', new Response('x'));
    await new Promise<void>((res) => { const r = indexedDB.open('html-reader'); r.onsuccess = () => {
      const tx = r.result.transaction(['texts', 'bookFiles'], 'readwrite');
      tx.objectStore('texts').put({ bookId: 'orphanorphan', path: 'x.html', text: 't' });
      tx.objectStore('bookFiles').put({ bookId: 'orphanorphan', paths: [], titles: {} }); tx.oncomplete = () => res(); }; });
  });
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-cleanup', 'done', { timeout: 10_000 });
  expect(await page.evaluate(() => caches.keys().then((k) => k.filter((n) => n.startsWith('book-'))))).toEqual([`book-${id}-v1`]);
  expect((await idbAll(page, 'texts')).every((t: any) => t.bookId === id)).toBe(true);
  expect((await idbAll(page, 'bookFiles')).map((b: any) => b.bookId)).toEqual([id]);
});

test('가져오기 도중 새로고침해도 가리키는 곳 없는 캐시가 남지 않는다', async ({ page }) => {
  await page.goto('/');
  await importFixture(page, '10-single.html');                              // 고지를 미리 통과
  await startImport(page, 'big.zip');
  await expect(page.getByTestId('import-progress')).toBeVisible();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-cleanup', 'done', { timeout: 15_000 });
  const { names, pointed } = await page.evaluate(async () => {
    const names = (await caches.keys()).filter((k) => k.startsWith('book-'));
    const pointed = await new Promise<string[]>((res) => { const r = indexedDB.open('html-reader'); r.onsuccess = () => {
      const q = r.result.transaction('books').objectStore('books').getAll(); q.onsuccess = () => res(q.result.map((b: any) => b.cacheName)); }; });
    return { names, pointed };
  });
  expect(names.sort()).toEqual(pointed.sort());
});

test('가져오기가 진행 중이면 정리를 건너뛴다 (Review Focus 3)', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-cleanup', 'done', { timeout: 10_000 });
  const r = await page.evaluate(async () => {
    await (await caches.open('book-inprogress00-v1')).put('/book/inprogress00/x', new Response('x'));
    let release!: () => void; const held = new Promise<void>((r) => { release = r; });
    navigator.locks.request('html-reader-import', () => held);              // 다른 탭의 가져오기를 흉내
    await new Promise((r) => setTimeout(r, 50));
    const mod = (window as any).__hrTest;                                    // 아래 참고
    const first = await mod.cleanupOrphans(); const kept = (await caches.keys()).includes('book-inprogress00-v1');
    release(); await new Promise((r) => setTimeout(r, 50));
    const second = await mod.cleanupOrphans();
    return { first: first.skipped, kept, second: second.caches };
  });
  expect(r).toEqual({ first: true, kept: true, second: ['book-inprogress00-v1'] });
});
