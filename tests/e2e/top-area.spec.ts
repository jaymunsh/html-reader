import { expect, test } from '@playwright/test';
import { backToLibrary, importFixture, openBook } from './helpers';

const chrome = (page: any) => page.evaluate(() => ({
  html: getComputedStyle(document.documentElement).backgroundColor,
  body: getComputedStyle(document.body).backgroundColor,
  meta: document.querySelector('meta[name=theme-color]')!.getAttribute('content')!.toLowerCase(),
  inset: getComputedStyle(document.querySelector('[data-testid=top-inset]')!).backgroundColor,
}));
const LIB_L = { html: 'rgb(238, 240, 244)', body: 'rgb(238, 240, 244)', meta: '#eef0f4', inset: 'rgb(238, 240, 244)' };
const READ_L = { html: 'rgb(255, 255, 255)', body: 'rgb(255, 255, 255)', meta: '#ffffff', inset: 'rgb(255, 255, 255)' };
const LIB_D = { html: 'rgb(16, 18, 22)', body: 'rgb(16, 18, 22)', meta: '#101216', inset: 'rgb(16, 18, 22)' };
const READ_D = { html: 'rgb(0, 0, 0)', body: 'rgb(0, 0, 0)', meta: '#000000', inset: 'rgb(0, 0, 0)' };

test('화면 전환에 따라 상단 영역 색이 바뀐다 (라이트)', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  expect(await chrome(page)).toEqual(LIB_L);
  const id = await importFixture(page, '10-single.html');
  await openBook(page, id);
  expect(await chrome(page)).toEqual(READ_L);
  await backToLibrary(page);
  expect(await chrome(page)).toEqual(LIB_L);
});

test('다크', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  expect(await chrome(page)).toEqual(LIB_D);
  const id = await importFixture(page, '10-single.html');
  await openBook(page, id);
  expect(await chrome(page)).toEqual(READ_D);
});

const isDesktop = (page: any) => page.viewportSize()!.width >= 768;

test('safe-area: 상단 띠 높이만큼 iframe이 내려가고 화면 맨 아래까지 닿는다', async ({ page }) => {
  test.skip(isDesktop(page), '모바일 레이아웃 전용 (PC는 상단 바 아래에서 시작한다)');
  await page.goto('/');
  const id = await importFixture(page, '10-single.html');
  await openBook(page, id);
  await page.addStyleTag({ content: ':root{--sat:47px;--sab:34px}' });
  const vh = page.viewportSize()!.height;
  const inset = await page.getByTestId('top-inset').boundingBox();
  const frame = await page.getByTestId('reader-frame').boundingBox();
  expect(inset).toMatchObject({ y: 0, height: 47 });
  expect(await page.getByTestId('top-inset').evaluate((e) => getComputedStyle(e).position)).toBe('fixed');
  expect(frame!.y).toBe(47);
  expect(Math.round(frame!.y + frame!.height)).toBe(vh);                       // 하단 여백 띠 없음
});

test('safe-area(PC): iframe은 상단 띠 + 48px 상단 바 아래에서 시작해 화면 맨 아래까지 닿는다', async ({ page }) => {
  test.skip(!isDesktop(page), 'PC 레이아웃 전용');
  await page.goto('/');
  const id = await importFixture(page, '10-single.html');
  await openBook(page, id);
  await page.addStyleTag({ content: ':root{--sat:47px;--sab:34px}' });
  const vh = page.viewportSize()!.height;
  const frame = (await page.getByTestId('reader-frame').boundingBox())!;
  expect(frame.y).toBe(47 + 48);
  expect(Math.round(frame.y + frame.height)).toBe(vh);
});

test('문서 내용은 원본 색 그대로(앱 테마가 iframe에 새지 않는다)', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  const id = await importFixture(page, '10-single.html');
  const f = await openBook(page, id);
  expect(await f.evaluate(() => document.documentElement.hasAttribute('data-theme'))).toBe(false);
});

test('CSS가 늦게 도착해도 theme-color가 #000000으로 칠해지지 않고 결국 올바른 값이 된다', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.route('**/__app/*.css', async (route) => { await new Promise((r) => setTimeout(r, 1500)); await route.continue(); });
  await page.goto('/', { waitUntil: 'commit' });
  const meta = () => page.evaluate(() => document.querySelector('meta[name=theme-color]')?.getAttribute('content')?.toLowerCase());
  await page.waitForTimeout(500);
  expect(await meta()).not.toBe('#000000');
  await expect.poll(meta, { timeout: 10_000 }).toBe('#eef0f4');
});
