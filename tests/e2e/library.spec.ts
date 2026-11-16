import { expect, test, type Page } from '@playwright/test';
import { backToLibrary, fixture, holdImports, idbAll, importFixture, openBook, scrollFrameTo, startImport } from './helpers';

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
  await holdImports(page);                                                  // 캐시는 썼고 커밋은 안 된 순간에 멈춘다
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

test('안내 대화상자가 열린 동안 고른 두 번째 파일도 순서대로 가져온다', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('import-input').setInputFiles(fixture('10-single.html'));
  await passIosNotices(page);
  await expect(page.getByTestId('safety-notice')).toBeVisible();
  await page.getByTestId('import-input').setInputFiles(fixture('01-multipage.zip'));   // 대화상자 뒤에서 두 번째 선택
  await page.getByTestId('safety-notice').getByTestId('confirm-ok').click();
  await passIosNotices(page);                                                        // 두 번째 묶음의 iOS 안내 (iOS UA에서만)
  await expect(page.getByTestId('book-card')).toHaveCount(2);
  const books = (await idbAll(page, 'books')).sort((a, b) => a.importedAt - b.importedAt);
  expect(books.map((b) => b.sourceName)).toEqual(['10-single', '01-multipage']);
  await expect(page.getByTestId('safety-notice')).toHaveCount(0);
});

test('워커가 쓰기를 끝낸 뒤 페이지가 커밋하기 전까지도 가져오기 잠금이 유지되어 정리가 캐시를 지우지 않는다', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-cleanup', 'done', { timeout: 10_000 });
  await importFixture(page, '10-single.html');                              // 고지를 미리 통과
  // At the worker's `ready` (cache written, nothing verified or committed yet), run a cleanup as another tab would.
  // This listener runs before client.ts's onmessage, so it sees exactly the old worker→page lock gap.
  await page.evaluate(() => {
    const w = window as any;
    const Base = window.Worker;
    w.Worker = class extends Base {
      constructor(u: string | URL, o?: WorkerOptions) {
        super(u, o);
        this.addEventListener('message', (e: MessageEvent) => {
          if (e.data?.type !== 'ready') return;
          w.__atReady = Promise.all([navigator.locks.query(), w.__hrTest.cleanupOrphans()]).then(([q, c]) => ({
            held: !!q.held?.some((l) => l.name === 'html-reader-import'), skipped: c.skipped, cacheName: e.data.cacheName,
          }));
        });
      }
    };
  });
  const id = await importFixture(page, '01-multipage.zip');
  const r = await page.evaluate(() => (window as any).__atReady);
  expect(r).toEqual({ held: true, skipped: true, cacheName: `book-${id}-v1` });
  expect(await page.evaluate((n) => caches.has(n), r.cacheName)).toBe(true);
  const f = await openBook(page, id);
  await expect(f.locator('#h')).toHaveText('index');
});

test('시작 페이지를 고르는 동안에는 책이 열리지 않고, 고른 뒤 가져오기가 끝나며 다음 가져오기도 된다', async ({ page }) => {
  await page.goto('/');
  const first = await importFixture(page, '10-single.html');
  await startImport(page, 'pick-entry.zip');
  await expect(page.getByTestId('entry-choice').first()).toBeVisible();
  const card = page.locator(`[data-book-id="${first}"]`);
  await card.click({ force: true });                                         // 화면 위 클릭은 scrim이 받는다
  await card.dispatchEvent('click');                                         // scrim을 건너뛰어도 가드가 막는다
  await page.waitForTimeout(300);
  await expect(page.getByTestId('reader')).toHaveCount(0);
  await expect(page.getByTestId('entry-choice').first()).toBeVisible();
  await page.locator('[data-testid=entry-choice][data-path="a.html"]').click();
  await expect(page.getByTestId('book-card')).toHaveCount(2);
  await importFixture(page, '01-multipage.zip');
  await expect(page.getByTestId('book-card')).toHaveCount(3);
});

test('삭제 뒤 포커스: 다음 카드의 메뉴 → 없으면 이전 카드 → 카드가 없으면 가져오기 버튼', async ({ page }) => {
  await page.goto('/');
  const s = await importFixture(page, '10-single.html');
  const m = await importFixture(page, '01-multipage.zip');
  const x = await importFixture(page, '04-body-scroll.zip');                // 순서: x, m, s
  const focused = () => page.evaluate(() => {
    const a = document.activeElement;
    return `${a?.closest('[data-book-id]')?.getAttribute('data-book-id') ?? ''}:${a?.getAttribute('data-testid')}`;
  });
  const del = async (id: string) => {
    await page.locator(`[data-book-id="${id}"] [data-testid=book-menu]`).click();
    await page.getByTestId('menu-delete').click();
    await page.getByTestId('confirm-ok').click();
    await expect(page.locator(`[data-testid=book-card][data-book-id="${id}"]`)).toHaveCount(0);
  };
  await del(m); await expect.poll(focused).toBe(`${s}:book-menu`);         // 다음 카드
  await del(s); await expect.poll(focused).toBe(`${x}:book-menu`);         // 이전 카드
  await del(x); await expect.poll(focused).toBe(':import-button');         // 남은 카드 없음
});

test('삭제 대화상자가 열린 동안 가져오기가 시작 페이지를 물으면, 그 선택은 대화상자가 닫힌 뒤에 뜬다', async ({ page }) => {
  await page.goto('/');
  const first = await importFixture(page, '10-single.html');
  await page.locator(`[data-book-id="${first}"] [data-testid=book-menu]`).click();
  await page.getByTestId('menu-delete').click();
  await page.getByTestId('import-input').setInputFiles(fixture('pick-entry.zip'));
  await page.waitForTimeout(1500);                                         // 그 사이 가져오기가 시작 페이지 선택에 이른다
  const dialogs = page.locator('[role=dialog]');
  await expect(dialogs).toHaveCount(1);
  await expect(dialogs).toContainText('문서 삭제');
  await page.keyboard.press('Escape');                                     // 보이는 대화상자(삭제)가 닫힌다
  await passIosNotices(page);
  await expect(page.getByTestId('entry-choice').first()).toBeVisible();
  await expect(dialogs).toHaveCount(1);
  await expect(page.getByTestId('book-card')).toHaveCount(1);              // 삭제는 취소됐다
  await page.keyboard.press('Escape');
  await expect(dialogs).toHaveCount(0);
});

test('가져오기가 끝나면 저장 공간 유지(persist)를 한 번 요청한다', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    const w = window as any; w.__persistCalls = 0;
    // On the prototype: WebKit may hand out a fresh StorageManager per `navigator.storage` access.
    const p = StorageManager.prototype as any;
    p.persist = () => { w.__persistCalls++; return Promise.resolve(true); };
    p.persisted = () => Promise.resolve(false);
  });
  await importFixture(page, '10-single.html');
  await importFixture(page, '01-multipage.zip');
  await expect.poll(() => page.evaluate(() => (window as any).__persistCalls)).toBe(1);
});
