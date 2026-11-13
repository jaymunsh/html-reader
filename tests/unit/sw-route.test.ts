import { expect, test } from 'vitest';
import { pickContext } from '../../src/sw/context';
import { decideRoute } from '../../src/sw/route';

const O = 'https://app.test';
const r = (path: string, o: Partial<{ nav: boolean; dest: string; ctx: string | null; method: string }> = {}) =>
  decideRoute({ url: new URL(path, O), selfOrigin: O, method: o.method ?? 'GET', isNavigation: o.nav ?? false, destination: o.dest ?? '', ctxBookId: o.ctx ?? null });

test('1. /__reader/*는 맥락과 무관하게 프리캐시', () => {
  expect(r('/__reader/agent.js', { ctx: 'ab', dest: 'script' })).toEqual({ kind: 'reader-asset' });
});
test('2. 최상위 창이 /book/<id>/…로 가면 리더로 되돌린다', () => {
  expect(r('/book/ab/x/y z.html?q=1', { nav: true, dest: 'document' })).toEqual({ kind: 'top-redirect', to: '/?open=ab&path=x%2Fy+z.html' });
  expect(r('/book/ab/', { nav: true, dest: 'document' })).toEqual({ kind: 'top-redirect', to: '/?open=ab&path=' });
});
test('3. book 맥락의 루트 절대경로', () => {
  expect(r('/page2.html?x=1', { nav: true, dest: 'iframe', ctx: 'ab' })).toEqual({ kind: 'book-redirect', to: '/book/ab/page2.html?x=1' });
  expect(r('/', { nav: true, dest: 'iframe', ctx: 'ab' })).toEqual({ kind: 'book-redirect', to: '/book/ab/' });
  expect(r('/css/a.css?v=3', { dest: 'style', ctx: 'ab' })).toEqual({ kind: 'book-file', bookId: 'ab', rest: 'css/a.css', ctxBookId: 'ab' });
  expect(r('/__app/x.js', { dest: 'script', ctx: 'ab' })).toEqual({ kind: 'book-file', bookId: 'ab', rest: '__app/x.js', ctxBookId: 'ab' });
  expect(r('/sw.js', { dest: 'script', ctx: 'ab' })).toEqual({ kind: 'book-file', bookId: 'ab', rest: 'sw.js', ctxBookId: 'ab' });
});
test('4. /book/<id>/<path>', () => {
  expect(r('/book/ab/sub/a%20b.html', { nav: true, dest: 'iframe', ctx: 'ab' })).toEqual({ kind: 'book-file', bookId: 'ab', rest: 'sub/a%20b.html', ctxBookId: 'ab' });
  expect(r('/book/ab/img/x.png', { dest: 'image', ctx: null })).toEqual({ kind: 'book-file', bookId: 'ab', rest: 'img/x.png', ctxBookId: null });
  expect(r('/book/zz/a.css', { dest: 'style', ctx: 'ab' })).toEqual({ kind: 'book-file', bookId: 'zz', rest: 'a.css', ctxBookId: 'ab' });   // 핸들러가 outside-root로 기록
});
test('5. book 맥락의 다른 출처', () => {
  expect(decideRoute({ url: new URL('https://cdn.example/x.js'), selfOrigin: O, method: 'GET', isNavigation: false, destination: 'script', ctxBookId: 'ab' }))
    .toEqual({ kind: 'external', bookId: 'ab' });
  expect(decideRoute({ url: new URL('https://cdn.example/x.js'), selfOrigin: O, method: 'GET', isNavigation: false, destination: 'script', ctxBookId: null }))
    .toEqual({ kind: 'passthrough' });
});
test('6. 앱 자신의 요청', () => {
  expect(r('/', { nav: true, dest: 'document' })).toEqual({ kind: 'app-shell' });
  expect(r('/index.html', { nav: true, dest: 'document' })).toEqual({ kind: 'app-shell' });
  expect(r('/anything/else', { nav: true, dest: 'document' })).toEqual({ kind: 'app-shell' });
  expect(r('/__app/main-abc.js', { dest: 'script' })).toEqual({ kind: 'app-asset' });
  expect(r('/unknown.json', {})).toEqual({ kind: 'passthrough' });
});

const c = (o: Partial<Parameters<typeof pickContext>[0]>) => pickContext({ isNavigation: false, destination: '', targetPathname: '/x', targetSameOrigin: true, referrerPathname: null, client: null, ...o });
test('맥락: 서브리소스는 client URL', () => {
  expect(c({ client: { pathname: '/book/ab/sub/p.html', frameType: 'nested', type: 'window' } })).toEqual({ bookId: 'ab', useFallback: false });
  expect(c({ client: { pathname: '/', frameType: 'top-level', type: 'window' } })).toEqual({ bookId: null, useFallback: false });      // 셸 자신
});
test('맥락: 판별 불가 클라이언트는 폴백', () => {
  expect(c({ client: { pathname: null, frameType: 'nested', type: 'window' } })).toEqual({ bookId: null, useFallback: true });         // blob:/about:srcdoc
  expect(c({ client: { pathname: '/js/worker.js', frameType: null, type: 'worker' } })).toEqual({ bookId: null, useFallback: true });
  expect(c({ client: { pathname: '/page.html', frameType: 'nested', type: 'window' } })).toEqual({ bookId: null, useFallback: true });
  expect(c({ client: null })).toEqual({ bookId: null, useFallback: true });
});
test('맥락: iframe 네비게이션은 대상 URL → referrer → 폴백', () => {
  const nav = { isNavigation: true, destination: 'iframe' };
  expect(c({ ...nav, targetPathname: '/book/ab/p.html' })).toEqual({ bookId: 'ab', useFallback: false });
  expect(c({ ...nav, targetPathname: '/p.html', referrerPathname: '/book/ab/index.html' })).toEqual({ bookId: 'ab', useFallback: false });
  expect(c({ ...nav, targetPathname: '/p.html', referrerPathname: null })).toEqual({ bookId: null, useFallback: true });
  expect(c({ ...nav, destination: 'frame', targetPathname: '/p.html', referrerPathname: '/' })).toEqual({ bookId: null, useFallback: true });
});
test('맥락: 최상위 네비게이션은 맥락 없음', () => {
  expect(c({ isNavigation: true, destination: 'document', targetPathname: '/book/ab/p.html' })).toEqual({ bookId: null, useFallback: false });
});
test('맥락: 앱 자신의 클라이언트(셸·앱 워커)는 폴백 없음', () => {
  expect(c({ client: { pathname: '/__app/importer.worker-abc.js', frameType: null, type: 'worker' } })).toEqual({ bookId: null, useFallback: false });
  expect(c({ client: { pathname: '/__app/x.js', frameType: null, type: 'sharedworker' } })).toEqual({ bookId: null, useFallback: false });
  expect(c({ client: { pathname: '/__reader/agent.js', frameType: null, type: 'worker' } })).toEqual({ bookId: null, useFallback: false });
});
