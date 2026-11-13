import { expect, test, type Page } from '@playwright/test';

const PNG_1PX = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const FILES: Record<string, [string, string]> = {
  'index.html': ['text/html', `<!doctype html><html><head><title>G</title>
    <link rel="stylesheet" href="/css/a.css"><script type="module" src="/js/mod.js"></script></head>
    <body><h1 id="h">index</h1><img id="img" src="/img/dot.png">
    <a id="rel" href="page2.html">rel</a><a id="abs" href="/page2.html">abs</a><a id="noref" href="noref.html">noref</a>
    <script>fetch('./data.json').then(r=>r.json()).then(j=>{window.__json=j.ok})</script></body></html>`],
  'page2.html': ['text/html', `<!doctype html><html><head><link rel="stylesheet" href="css/b.css"></head>
    <body><h1 id="h">page2</h1></body></html>`],
  'noref.html': ['text/html', `<!doctype html><html><head><meta name="referrer" content="no-referrer">
    <link rel="stylesheet" href="/css/a.css"></head><body><h1 id="h">noref</h1><a id="abs" href="/page2.html">abs</a></body></html>`],
  'css/a.css': ['text/css', '#h{color:rgb(1,2,3)}'],
  'css/b.css': ['text/css', '#h{color:rgb(4,5,6)}'],
  'js/mod.js': ['text/javascript', 'window.__mod="ok";'],
  'data.json': ['application/json', '{"ok":true}'],
  'img/dot.png': ['image/png', PNG_1PX],
};

async function seed(page: Page) {
  await page.goto('/');
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await page.evaluate(async (files) => {
    const cache = await caches.open('book-gate-v1');
    for (const [path, [type, body]] of Object.entries(files)) {
      const data = type === 'image/png' ? Uint8Array.from(atob(body), (c) => c.charCodeAt(0)) : body;
      await cache.put('/book/gate/' + path, new Response(data, { headers: { 'Content-Type': type } }));
    }
    navigator.serviceWorker.controller!.postMessage({ type: 'active-book', id: 'gate' });
    const f = document.createElement('iframe');
    f.id = 'gate'; f.src = '/book/gate/index.html'; f.style.cssText = 'width:600px;height:400px';
    document.body.append(f);
  }, FILES);
  const frame = () => page.frames().find((f) => f.url().includes('/book/'))!;
  await expect.poll(() => frame()?.url()).toContain('/book/gate/index.html');
  return frame;
}
const color = (f: any) => f.locator('#h').evaluate((e: Element) => getComputedStyle(e).color);

test('G1 SW가 iframe 문서를 제어한다', async ({ page }) => {
  const frame = await seed(page);
  await expect(frame().locator('#h')).toHaveText('index');
  expect(await frame().evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
});

test('G2 상대 링크로 iframe 안에서 페이지 이동', async ({ page }) => {
  const frame = await seed(page);
  await frame().locator('#rel').click();
  await expect(frame().locator('#h')).toHaveText('page2');
  expect(new URL(frame().url()).pathname).toBe('/book/gate/page2.html');
});

test('G3 루트 절대경로 네비게이션은 302로 /book/<id>/ 아래에 남는다', async ({ page }) => {
  const frame = await seed(page);
  await frame().locator('#abs').click();
  await expect(frame().locator('#h')).toHaveText('page2');
  expect(new URL(frame().url()).pathname).toBe('/book/gate/page2.html');
  expect(await color(frame())).toBe('rgb(4, 5, 6)');           // G5: 리다이렉트된 페이지의 상대경로 CSS
});

test('G4 서브리소스 매핑: 루트 절대 CSS·이미지·module, 상대 fetch', async ({ page }) => {
  const frame = await seed(page);
  expect(await color(frame())).toBe('rgb(1, 2, 3)');
  await expect.poll(() => frame().evaluate(() => (document.getElementById('img') as HTMLImageElement).naturalWidth)).toBe(1);
  await expect.poll(() => frame().evaluate(() => (window as any).__mod)).toBe('ok');
  await expect.poll(() => frame().evaluate(() => (window as any).__json)).toBe(true);
});

test('G6 no-referrer 문서에서도 루트 절대 CSS·링크가 동작한다(activeBookId 폴백)', async ({ page }) => {
  const frame = await seed(page);
  await frame().locator('#noref').click();
  await expect(frame().locator('#h')).toHaveText('noref');
  expect(await color(frame())).toBe('rgb(1, 2, 3)');
  await frame().locator('#abs').click();
  await expect(frame().locator('#h')).toHaveText('page2');
  expect(new URL(frame().url()).pathname).toBe('/book/gate/page2.html');
});

test('G7 SW가 iframe 네비게이션과 최상위 네비게이션을 구분한다', async ({ page }) => {
  await seed(page);
  const log = await page.evaluate(() => new Promise<any[]>((res) => {
    const ch = new MessageChannel(); ch.port1.onmessage = (e) => res(e.data);
    navigator.serviceWorker.controller!.postMessage({ type: 'gate-log' }, [ch.port2]);
  }));
  const first = log.find((e) => e.url.endsWith('/book/gate/index.html'));
  expect(first).toMatchObject({ mode: 'navigate', destination: 'iframe' });
  await page.goto('/book/gate/index.html');                     // 최상위 창으로 열기
  await expect(page).toHaveURL(/\/\?open=gate&path=index\.html$/);
});
