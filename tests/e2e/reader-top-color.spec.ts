import { expect, test, type Page } from '@playwright/test';
import { backToLibrary, idbGet, importFixture, openBook } from './helpers';

// Reader top color (spec §6.6): html/body, theme-color metas and the top strip all carry one value.
const chrome = (page: Page) => page.evaluate(() => {
  const hex = (rgb: string) => '#' + (rgb.match(/\d+/g) ?? []).slice(0, 3).map((n) => (+n).toString(16).padStart(2, '0')).join('');
  const metas = [...new Set([...document.querySelectorAll('meta[name=theme-color]')].map((m) => m.getAttribute('content')!.toLowerCase()))];
  return {
    html: hex(getComputedStyle(document.documentElement).backgroundColor),
    body: hex(getComputedStyle(document.body).backgroundColor),
    meta: metas.join(','),
    inset: hex(getComputedStyle(document.querySelector('[data-testid=top-inset]')!).backgroundColor),
  };
});
const all = (c: string) => ({ html: c, body: c, meta: c, inset: c });

test('기본(책 배경 따라가기): 어두운 문서는 그 배경색, 바뀌면 따라가고 그라데이션·투명은 기본색', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  const id = await importFixture(page, '14-dark-bg.html');
  const f = await openBook(page, id);
  await expect.poll(() => chrome(page)).toEqual(all('#1e2028'));
  await f.evaluate(() => { document.body.style.background = 'rgb(200, 0, 0)'; });                 // 문서가 스스로 바꿈
  await expect.poll(() => chrome(page)).toEqual(all('#c80000'));
  await f.evaluate(() => { document.body.style.background = 'linear-gradient(red, blue)'; });      // 단색이 아님 -> 알 수 없음
  await expect.poll(() => chrome(page)).toEqual(all('#ffffff'));
  await f.evaluate(() => { document.body.style.background = 'rgba(0, 0, 0, 0.5)'; });              // 반투명 -> 알 수 없음
  await expect.poll(() => chrome(page)).toEqual(all('#ffffff'));
  await backToLibrary(page);
  expect(await chrome(page)).toEqual(all('#eef0f4'));
});

test('배경이 투명한 문서는 문서 영역 색(다크 #000000)으로 대체된다', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  const dark = await importFixture(page, '14-dark-bg.html');
  const plain = await importFixture(page, '10-single.html');
  await openBook(page, dark);
  await expect.poll(() => chrome(page)).toEqual(all('#1e2028'));
  await backToLibrary(page);
  await openBook(page, plain);                                                                       // 이전 책의 색이 남지 않는다
  await expect.poll(() => chrome(page)).toEqual(all('#000000'));
});

test('agent가 없는 제한 모드 문서는 기본색', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  const id = await importFixture(page, '13-csp.zip');
  await page.locator(`[data-book-id="${id}"]`).click();
  await expect(page.getByTestId('reader')).toHaveAttribute('data-agent', 'limited', { timeout: 5000 });
  expect(await chrome(page)).toEqual(all('#ffffff'));
});

test('앱 색: 리더도 서재와 같은 색이고, 설정은 재실행 후에도 유지된다', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  const id = await importFixture(page, '14-dark-bg.html');
  await page.getByTestId('settings-button').click();
  await expect(page.getByTestId('reader-chrome-book')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('reader-chrome-app').click();
  await expect(page.getByTestId('reader-chrome-app')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('reader-chrome-book')).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(() => idbGet(page, 'settings', 'readerChrome')).toBe('app');
  await page.reload();
  await expect(page.getByTestId('library')).toBeVisible();
  await page.getByTestId('settings-button').click();
  await expect(page.getByTestId('reader-chrome-app')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('settings-back').click();
  await openBook(page, id);
  await page.waitForTimeout(300);                                                                     // agent의 보고가 와도 바뀌지 않는다
  expect(await chrome(page)).toEqual(all('#eef0f4'));
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect.poll(() => chrome(page)).toEqual(all('#101216'));
});
