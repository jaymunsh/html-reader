import { existsSync, readFileSync } from 'node:fs';
import { beforeAll, expect, test } from 'vitest';
import { readCentralDirectory, readEntry } from '../../src/lib/zip';
import { planEntries } from '../../src/lib/importer/plan';
import { makeBigZip } from '../../scripts/make-fixtures';

const dir = new URL('../fixtures/', import.meta.url);
const load = (n: string) => new Blob([readFileSync(new URL(n, dir))]);
const paths = async (n: string) => planEntries(await readCentralDirectory(load(n))).files.map((f) => f.path).sort();
const text = async (n: string, p: string) => {
  const f = load(n);
  return (await readEntry(f, (await readCentralDirectory(f)).find((e) => e.name === p)!)).text();
};

// big.zip is gitignored (~20MB); generate it when `npm run fixtures` has not been run on this checkout.
beforeAll(() => { if (!existsSync(new URL('big.zip', dir))) makeBigZip(dir.pathname); }, 60_000);

test('01', async () => expect(await paths('01-multipage.zip')).toEqual(['a b#c?.html', 'css/a.css', 'css/b.css', 'index.html', 'noref.html', 'page2.html', 'sub/page3.html']));
test('01 h1 texts and stylesheet rel', async () => {
  expect(await text('01-multipage.zip', 'index.html')).toMatch(/^<!doctype html>[\s\S]*<h1 id="h">index<\/h1>/);
  expect(await text('01-multipage.zip', 'page2.html')).toContain('<h1 id="h">page2</h1>');
  expect(await text('01-multipage.zip', 'noref.html')).toContain('<h1 id="h">noref</h1>');
  expect(await text('01-multipage.zip', 'index.html')).toContain('rel="stylesheet" href="/css/a.css"');
});
test('02 has root-absolute image', async () => {
  expect(await text('02-fetch-module.zip', 'index.html')).toContain('<img id="img" src="/img/x.png">');
  expect(await paths('02-fetch-module.zip')).toContain('img/x.png');
});
test('05 CP949', async () => expect(await paths('05-cp949-name.zip')).toEqual(['index.html', '한글.html']));
test('05 NFD macOS: 정크 제거·루트 벗김·NFC', async () => expect(await paths('05-nfd-macos.zip')).toEqual(['index.html', '한글 페이지.html']));
test('06 EUC-KR 바이트', async () => {
  const f = load('06-euckr.zip'); const es = await readCentralDirectory(f);
  const bytes = new Uint8Array(await (await readEntry(f, es.find((e) => e.name === 'index.html')!)).arrayBuffer());
  expect(() => new TextDecoder('utf-8', { fatal: true }).decode(bytes)).toThrow();
  expect(new TextDecoder('euc-kr').decode(bytes)).toContain('가나다라 한글');
});
test('11 sw-killer idb form', async () => {
  expect(await text('11-sw-killer.zip', 'index.html')).toContain(
    "try { const r = indexedDB.deleteDatabase('html-reader'); r.onsuccess = () => __idbDelete='success'; r.onerror = () => __idbDelete='error' } catch { __idbDelete = 'error' }");
});
test('13 CSP 픽스처의 meta charset 끝은 1000–1024 사이', async () => {
  const f = load('13-csp.zip');
  const html = await (await readEntry(f, (await readCentralDirectory(f))[0])).text();
  const end = html.indexOf('<meta charset="utf-8">') + '<meta charset="utf-8">'.length;
  expect(end).toBeGreaterThanOrEqual(1000); expect(end).toBeLessThanOrEqual(1024);
  expect(html.indexOf('Content-Security-Policy')).toBeLessThan(end);
});
test('big.zip: 401 entries', async () => expect((await readCentralDirectory(load('big.zip'))).length).toBe(401));
test('오류 픽스처와 나머지 파일이 존재한다', () => {
  for (const n of ['02-fetch-module.zip', '03-font.zip', '04-inner-scroll.zip', '07-video.zip', '08-missing.zip', '09-click-handlers.zip',
    '10-single.html', '11-sw-killer.zip', '11-storage-peer.zip', '12-frame-escape.zip', 'err-encrypted.zip', 'err-nohtml.zip',
    'err-crc.zip', 'err-truncated.zip', 'err-deflate64.zip', 'pick-entry.zip', 'big.zip']) expect(load(n).size).toBeGreaterThan(0);
});
