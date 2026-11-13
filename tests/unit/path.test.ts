import { expect, test } from 'vitest';
import * as P from '../../src/lib/path';

test('splitBookUrl', () => {
  expect(P.splitBookUrl('/book/abc123def456/sub/a%20b.html')).toEqual({ bookId: 'abc123def456', rest: 'sub/a%20b.html' });
  expect(P.splitBookUrl('/book/abc123def456/')).toEqual({ bookId: 'abc123def456', rest: '' });
  expect(P.splitBookUrl('/book/abc123def456')).toEqual({ bookId: 'abc123def456', rest: '' });
  expect(P.splitBookUrl('/books/x/y')).toBeNull();
  expect(P.splitBookUrl('/')).toBeNull();
});

test('normalizeBookPath', () => {
  const ok = (rest: string) => P.normalizeBookPath(rest);
  expect(ok('css/a.css?v=3#top')).toEqual({ ok: true, path: 'css/a.css', dir: false });
  expect(ok('css/a%20b.css')).toEqual({ ok: true, path: 'css/a b.css', dir: false });
  expect(ok(encodeURI('한글'.normalize('NFD') + '.html'))).toEqual({ ok: true, path: '한글.html', dir: false });
  expect(ok('a%5Cb.css')).toEqual({ ok: true, path: 'a/b.css', dir: false });
  expect(ok('x/./y/../z.html')).toEqual({ ok: true, path: 'x/z.html', dir: false });
  expect(ok('sub/')).toEqual({ ok: true, path: 'sub', dir: true });
  expect(ok('')).toEqual({ ok: true, path: '', dir: true });
  expect(ok('../x.css')).toEqual({ ok: false, reason: 'outside-root' });
  expect(ok('a/../../x.css')).toEqual({ ok: false, reason: 'outside-root' });
  expect(ok('bad%E0%A4%Aname.css')).toEqual({ ok: true, path: 'bad%E0%A4%Aname.css', dir: false });   // 잘못된 인코딩은 원문 유지, throw 금지
});

test('cacheKey는 특수문자 파일명과 왕복한다 (Review Focus 1)', () => {
  expect(P.cacheKey('abc123def456', 'a b#c?d%.html')).toBe('/book/abc123def456/a%20b%23c%3Fd%25.html');
  for (const name of ['a b#c?d%.html', '한글 문서/1장.html', 'x+y&z.css', "it's.js"]) {
    const url = new URL(P.cacheKey('abc123def456', name), 'http://h');
    const n = P.normalizeBookPath(P.splitBookUrl(url.pathname)!.rest);
    expect(n).toEqual({ ok: true, path: name, dir: false });
  }
});

test('resolveInBook', () => {
  const idx = P.buildPathIndex(['index.html', 'img/Logo.PNG', 'sub/index.htm', 'deep/a/b.html', 'docs/index.html', 'docs/index.htm']);
  expect(P.resolveInBook(idx, 'index.html', false)).toEqual({ kind: 'file', path: 'index.html' });
  expect(P.resolveInBook(idx, 'img/logo.png', false)).toEqual({ kind: 'file', path: 'img/Logo.PNG' });
  expect(P.resolveInBook(idx, '', true)).toEqual({ kind: 'file', path: 'index.html' });
  expect(P.resolveInBook(idx, 'sub', true)).toEqual({ kind: 'file', path: 'sub/index.htm' });
  expect(P.resolveInBook(idx, 'docs', true)).toEqual({ kind: 'file', path: 'docs/index.html' });   // index.html 우선
  expect(P.resolveInBook(idx, 'sub', false)).toEqual({ kind: 'redirect-dir', to: 'sub/' });
  expect(P.resolveInBook(idx, 'deep', true)).toEqual({ kind: 'missing' });                          // 인덱스 파일 없는 디렉터리
  expect(P.resolveInBook(idx, 'nope.css', false)).toEqual({ kind: 'missing' });
});

test('isIgnoredMissing', () => {
  for (const p of ['favicon.ico', 'js/app.js.map', 'apple-touch-icon.png', 'apple-touch-icon-precomposed.png', 'robots.txt'])
    expect(P.isIgnoredMissing(p)).toBe(true);
  expect(P.isIgnoredMissing('img/none.png')).toBe(false);
});

test('naturalComparePaths', () => {
  expect(['ch10.html', 'ch2.html', 'a/1.html', 'Ch1.html'].sort(P.naturalComparePaths))
    .toEqual(['a/1.html', 'Ch1.html', 'ch2.html', 'ch10.html']);
});
