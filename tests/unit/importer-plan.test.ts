import { expect, test } from 'vitest';
import type { ZipEntry } from '../../src/lib/zip';
import { ImportError, importErrorMessage } from '../../src/lib/importer/errors';
import * as P from '../../src/lib/importer/plan';

const e = (name: string, over: Partial<ZipEntry> = {}): ZipEntry => ({ name, method: 8, flags: 0, encrypted: false,
  isDirectory: name.endsWith('/'), crc32: 0, compressedSize: 100, uncompressedSize: 200, localHeaderOffset: 0, ...over });
const paths = (names: string[]) => P.planEntries(names.map((n) => e(n))).files.map((f) => f.path);
const code = (fn: () => unknown) => { try { fn(); return 'no-error'; } catch (x) { return (x as ImportError).code; } };
const GB = 2 ** 30;

test('정크·디렉터리 제외, 단일 최상위 폴더 제거', () => {
  const r = P.planEntries(['doc/', 'doc/index.html', 'doc/css/a.css', '__MACOSX/doc/._index.html', 'doc/.DS_Store'].map((n) => e(n)));
  expect(r.root).toBe('doc/');
  expect(r.files.map((f) => f.path)).toEqual(['index.html', 'css/a.css']);
});
test('최상위에 파일이 있으면 루트를 벗기지 않는다', () => expect(paths(['index.html', 'doc/a.html'])).toEqual(['index.html', 'doc/a.html']));
test('최상위 폴더가 둘이면 벗기지 않는다', () => expect(paths(['a/x.html', 'b/y.html'])).toEqual(['a/x.html', 'b/y.html']));
test('정규화 후 겹치는 경로는 첫 엔트리 유지, `..` 엔트리는 버림 (Review Focus 2)', () => {
  expect(paths(['a.html', '/a.html', './a.html', '../evil.html', 'x/../../evil2.html', 'b.html'])).toEqual(['a.html', 'b.html']);
});
test('NFC/NFD 표기만 다른 경로는 중복, 첫 엔트리 유지. 대소문자 차이는 별개', () => {
  const nfc = e('한글.html'.normalize('NFC'), { crc32: 1 });
  const nfd = e('한글.html'.normalize('NFD'), { crc32: 2 });
  const r = P.planEntries([nfc, nfd]);
  expect(r.files).toHaveLength(1);
  expect(r.files[0].entry).toBe(nfc);
  expect(r.files[0].path).toBe('한글.html'.normalize('NFC'));
  expect(paths(['A.html', 'a.html'])).toEqual(['A.html', 'a.html']);
});
test('precheck: 암호화·미지원 압축', () => {
  expect(code(() => P.precheck([{ entry: e('a.html', { encrypted: true }), path: 'a.html' }], null))).toBe('encrypted');
  expect(code(() => P.precheck([{ entry: e('a.html', { method: 9 }), path: 'a.html' }], null))).toBe('unsupported-method');
});
test('precheck: HTML 없음', () => expect(code(() => P.precheck([{ entry: e('a.css'), path: 'a.css' }], null))).toBe('no-html'));
test('precheck: 4GB 초과·압축률 1000:1 초과', () => {
  const f = (over: Partial<ZipEntry>) => [{ entry: e('a.html'), path: 'a.html' }, { entry: e('b.bin', over), path: 'b.bin' }];
  expect(code(() => P.precheck(f({ uncompressedSize: 4 * GB + 1, compressedSize: GB }), null))).toBe('too-large');
  expect(code(() => P.precheck(f({ uncompressedSize: 1_000_001, compressedSize: 1000 }), null))).toBe('bomb');
  expect(code(() => P.precheck(f({ uncompressedSize: 1_000_000, compressedSize: 1000 }), null))).toBe('no-error');
  expect(code(() => P.precheck(f({ uncompressedSize: 0, compressedSize: 0 }), null))).toBe('no-error');
});
test('precheck: 여유 공간 < 해제 총량 × 1.2', () => {
  const files = [{ entry: e('a.html', { uncompressedSize: 1000 }), path: 'a.html' }];
  expect(code(() => P.precheck(files, { quota: 2000, usage: 801 }))).toBe('quota');
  expect(P.precheck(files, { quota: 2000, usage: 800 })).toEqual({ totalBytes: 1000 });
  expect(P.precheck(files, null)).toEqual({ totalBytes: 1000 });          // estimate 미지원 환경은 통과
});
test('pickEntryPath', () => {
  expect(P.pickEntryPath(['a.html', 'index.html'])).toBe('index.html');
  expect(P.pickEntryPath(['a.html', 'INDEX.HTM'])).toBe('INDEX.HTM');
  expect(P.pickEntryPath(['index.htm', 'index.html'])).toBe('index.html');
  expect(P.pickEntryPath(['only.html'])).toBe('only.html');
  expect(P.pickEntryPath(['a.html', 'b.html'])).toBeNull();
  expect(P.pickEntryPath(['sub/index.html', 'a.html'])).toBeNull();        // 루트의 index만
});
test('sourceNameOf·isHtmlPath', () => {
  expect(P.sourceNameOf('q3-report.zip')).toBe('q3-report');
  expect(P.sourceNameOf('a.b.html')).toBe('a.b');
  expect(P.sourceNameOf('noext')).toBe('noext');
  expect(['a.HTML', 'b.htm', 'c.xhtml', 'd.css'].map(P.isHtmlPath)).toEqual([true, true, true, false]);
});
test('importErrorMessage', () => {
  expect(importErrorMessage('cancelled')).toBe('가져오기를 취소했습니다.');
  expect(importErrorMessage('not-zip')).toBe(importErrorMessage('crc-mismatch'));
  expect(importErrorMessage('bomb')).toBe(importErrorMessage('too-large'));
  expect(importErrorMessage('quota')).toBe('저장 공간이 부족합니다. 서재에서 문서를 지우고 다시 시도해 주세요.');
  expect(new ImportError('quota', 'x').code).toBe('quota');
});
