import { expect, test } from '@playwright/test';
import { idbAll, importFixture, mountRawFrame } from './helpers';

const setup = async (page: any, name: string, path = 'index.html') => {
  await page.goto('/');
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  const id = await importFixture(page, name);
  await page.evaluate((id: string) => navigator.serviceWorker.controller!.postMessage({ type: 'active-book', id }), id);
  return { id, frame: await mountRawFrame(page, id, path) };
};

test('fetch·ES module·조각 HTML: 조각에는 주입하지 않는다', async ({ page }) => {
  const { frame } = await setup(page, '02-fetch-module.zip');
  await expect.poll(() => frame.evaluate(() => (window as any).__json)).toBeTruthy();
  await expect.poll(() => frame.evaluate(() => (window as any).__mod)).toBeTruthy();
  await expect(frame.locator('#slot .frag')).toHaveText('조각');
  expect(await frame.evaluate(() => (window as any).__frag)).not.toContain('__reader/agent.js');
  // K3: 루트 절대경로 이미지(G4에서 이관)
  await expect.poll(() => frame.evaluate(() => (document.getElementById('img') as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
});

test('네비게이션 HTML에는 agent 태그가 주입된다', async ({ page }) => {
  const { id, frame } = await setup(page, '01-multipage.zip');
  const s = frame.locator('script[src="/__reader/agent.js"]');
  await expect(s).toHaveCount(1);
  await expect(s).toHaveAttribute('data-book', id);
  await expect(s).toHaveAttribute('data-scale', '1');
  expect(await frame.evaluate(() => document.compatMode)).toBe('CSS1Compat'); // quirks mode 아님
});

test('@font-face 상대경로 폰트', async ({ page }) => {
  const { frame } = await setup(page, '03-font.zip');
  await expect.poll(() => frame.evaluate(async () => { await document.fonts.ready; return [...document.fonts].some((f) => f.family.includes('TestFont') && f.status === 'loaded'); })).toBe(true);
});

test('EUC-KR: 주입 후에도 한글이 깨지지 않는다 (meta 있음/없음)', async ({ page }) => {
  const { id, frame } = await setup(page, '06-euckr.zip');
  await expect(frame.locator('#h')).toHaveText('가나다라 한글');
  const f2 = await mountRawFrame(page, id, 'nometa.html');
  await expect(f2.locator('#h')).toHaveText('메타 없는 한글');
});

test('CP949 파일명 페이지로 이동', async ({ page }) => {
  const { frame } = await setup(page, '05-cp949-name.zip');
  await frame.locator('#ko').click();
  await expect.poll(() => decodeURIComponent(new URL(frame.url()).pathname)).toMatch(/\/한글\.html$/);
});

test('특수문자 파일명 (Review Focus 1)', async ({ page }) => {
  const { frame } = await setup(page, '01-multipage.zip');
  await frame.locator('#odd').click();
  await expect.poll(() => new URL(frame.url()).pathname).toMatch(/a%20b%23c%3F\.html$/);
  await expect(frame.locator('#h')).toBeVisible();
});

test('디렉터리·대소문자·쿼리', async ({ page }) => {
  const { id, frame } = await setup(page, '01-multipage.zip');
  const st = (p: string) => frame.evaluate(async (u) => { const r = await fetch(u); return [r.status, new URL(r.url).pathname]; }, p);
  expect(await st(`/book/${id}/CSS/A.CSS?v=3`)).toEqual([200, `/book/${id}/CSS/A.CSS`]);
  expect(await st(`/book/${id}/sub`)).toEqual([404, `/book/${id}/sub/`]); // 301 → sub/ (index 없음 → 404)
  expect((await st(`/book/${id}/`))[0]).toBe(200);
  await frame.locator('#sub').click();
  await frame.locator('#home').click(); // href="/"
  await expect.poll(() => new URL(frame.url()).pathname).toBe(`/book/${id}/`);
  await expect(frame.locator('#h')).toBeVisible();
});

test('정규화 결과가 빈 경로면 책 루트로 리다이렉트한다(원점 루트가 아님)', async ({ page }) => {
  const { id, frame } = await setup(page, '01-multipage.zip');
  // %2F는 URL 정규화를 건너뛰어 SW에서 a/.. → '' 로 정규화된다.
  const r = await frame.evaluate(async (u) => { const r = await fetch(u); return [r.status, new URL(r.url).pathname]; }, `/book/${id}/a%2F..`);
  expect(r).toEqual([200, `/book/${id}/`]);
});

test('Range: 206·suffix·416, 오디오 메타데이터 로드', async ({ page }) => {
  const { frame } = await setup(page, '07-video.zip');
  const rng = (h: string) => frame.evaluate(async (h) => {
    const r = await fetch('clip.mp4', { headers: { Range: h } }); const b = new Uint8Array(await r.arrayBuffer());
    return { status: r.status, cr: r.headers.get('Content-Range'), type: r.headers.get('Content-Type'), len: b.length, first: b[0] };
  }, h);
  expect(await rng('bytes=100-199')).toEqual({ status: 206, cr: 'bytes 100-199/300000', type: 'video/mp4', len: 100, first: 100 });
  expect(await rng('bytes=-10')).toMatchObject({ status: 206, cr: 'bytes 299990-299999/300000', len: 10 });
  expect(await rng('bytes=299000-')).toMatchObject({ status: 206, cr: 'bytes 299000-299999/300000', len: 1000 });
  expect(await rng('bytes=300000-')).toMatchObject({ status: 416, cr: 'bytes */300000' });
  expect(await frame.evaluate(async () => (await fetch('clip.mp4')).headers.get('Accept-Ranges'))).toBe('bytes');
  await expect.poll(() => frame.evaluate(() => (document.getElementById('a') as HTMLAudioElement).duration), { timeout: 10_000 }).toBeCloseTo(1, 0);
});

test('누락·바깥 경로·외부 요청이 issues에 기록되고 무시 목록은 빠진다', async ({ page }) => {
  const { id } = await setup(page, '08-missing.zip');
  await expect.poll(async () => (await idbAll(page, 'issues')).filter((i: any) => i.bookId === id).map((i: any) => `${i.kind}:${i.path}`).sort())
    .toEqual(['external:https://example.invalid/x.png', 'missing:img/none.png', 'outside-root:../outside.css']);
});

test('묶음에 없는 페이지로 이동하면 안내 HTML', async ({ page }) => {
  const { id } = await setup(page, '01-multipage.zip');
  const f = await mountRawFrame(page, id, 'nope.html');
  await expect(f.locator('body')).toContainText('이 페이지는 묶음에 없습니다');
});

test('최상위 창으로 /book/…을 열면 리더로 되돌아온다', async ({ page }) => {
  const { id } = await setup(page, '01-multipage.zip');
  await page.goto(`/book/${id}/sub/page3.html`);
  await expect(page).toHaveURL(new RegExp(`/\\?open=${id}&path=sub%2Fpage3\\.html$`));
});
