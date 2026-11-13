import { expect, test } from '@playwright/test';
import { backToLibrary, importFixture, openBook } from './helpers';

test('SW 해제 코드·localStorage.clear()가 있어도 리더가 계속 동작하고 다른 문서 값이 남는다', async ({ page }) => {
  await page.goto('/');
  const peer = await importFixture(page, '11-storage-peer.zip');
  const killer = await importFixture(page, '11-sw-killer.zip');

  let f = await openBook(page, peer);
  expect(await f.evaluate(() => (window as any).__before)).toBeNull();
  await backToLibrary(page);

  f = await openBook(page, killer);
  await expect.poll(() => f.evaluate(() => (window as any).__regs)).toBe(0);
  await expect.poll(() => f.evaluate(() => (window as any).__regRejected)).toBe(true);
  expect(await f.evaluate(() => (window as any).__cacheKeys)).toEqual([]);
  expect(await f.evaluate(() => (window as any).__idbDelete)).toBe('error');
  expect(await f.evaluate(() => localStorage.getItem('theme'))).toBe('killer');
  await backToLibrary(page);

  expect(await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length)).toBe(1);
  expect(await page.evaluate(() => Object.keys(localStorage).sort())).toEqual(expect.arrayContaining([`book:${peer}:theme`, `book:${killer}:theme`]));

  f = await openBook(page, peer);                                 // 다른 문서의 값은 그대로
  expect(await f.evaluate(() => (window as any).__before)).toBe('peer');
  expect(await f.evaluate(() => (window as any).__len)).toBe(1);
  await expect(f.locator('#h')).toBeVisible();                    // SW가 여전히 서빙
});

test('래퍼의 프로퍼티 접근·key()·clear() 범위', async ({ page }) => {
  await page.goto('/');
  const id = await importFixture(page, '11-storage-peer.zip');
  await page.evaluate(() => localStorage.setItem('app-own', '1'));
  const f = await openBook(page, id);
  const r = await f.evaluate(() => { (localStorage as any).foo = 'x'; const keys = Object.keys(localStorage).sort();
    const k0 = localStorage.key(0); localStorage.clear(); return { keys, k0: typeof k0, len: localStorage.length, ss: typeof sessionStorage.setItem }; });
  expect(r).toEqual({ keys: ['foo', 'theme'], k0: 'string', len: 0, ss: 'function' });
  expect(await page.evaluate(() => localStorage.getItem('app-own'))).toBe('1');
});
