import { expect, test } from 'vitest';
import { encodeEucKr } from '../../tools/zip-builder.ts';
import { decodeEntities, decodeHtml, detectEncoding, extractTitle, isFullDocument } from '../../src/lib/html-meta';

const u8 = (s: string) => new TextEncoder().encode(s);
const cat = (...p: Uint8Array[]) => Uint8Array.from(p.flatMap((x) => [...x]));

test('BOM', () => {
  expect(detectEncoding(cat(new Uint8Array([0xef, 0xbb, 0xbf]), u8('<p>')))).toEqual({ encoding: 'utf-8', source: 'bom' });
  expect(detectEncoding(new Uint8Array([0xff, 0xfe, 0x3c, 0x00]))).toEqual({ encoding: 'utf-16le', source: 'bom' });
  expect(detectEncoding(new Uint8Array([0xfe, 0xff, 0x00, 0x3c]))).toEqual({ encoding: 'utf-16be', source: 'bom' });
});
test('meta charset / http-equiv', () => {
  expect(detectEncoding(u8('<meta charset="EUC-KR">'))).toEqual({ encoding: 'euc-kr', source: 'meta' });
  expect(detectEncoding(u8(`<META HTTP-EQUIV='Content-Type' CONTENT='text/html; charset=ks_c_5601-1987'>`))).toEqual({ encoding: 'euc-kr', source: 'meta' });
  expect(detectEncoding(u8('<meta charset=utf-8>'))).toEqual({ encoding: 'utf-8', source: 'meta' });
});
test('모르는 charset 라벨·주석 안 meta·1024바이트 밖 meta는 무시', () => {
  expect(detectEncoding(u8('<meta charset="klingon"><p>x')).source).toBe('utf8');
  expect(detectEncoding(u8('<!-- <meta charset="euc-kr"> --><p>x')).source).toBe('utf8');
  expect(detectEncoding(u8('<!--' + 'x'.repeat(1100) + '--><meta charset="euc-kr">')).source).toBe('utf8');
});
test('meta 없음: 유효한 UTF-8 → utf-8, 아니면 EUC-KR', () => {
  expect(detectEncoding(u8('<p>한글</p>'))).toEqual({ encoding: 'utf-8', source: 'utf8' });
  expect(detectEncoding(cat(u8('<p>'), encodeEucKr('한글'), u8('</p>')))).toEqual({ encoding: 'euc-kr', source: 'fallback' });
});
test('decodeHtml', () => {
  const b = cat(u8('<meta charset="euc-kr"><title>'), encodeEucKr('한글 문서'), u8('</title>'));
  expect(extractTitle(decodeHtml(b).html)).toBe('한글 문서');
});
test('extractTitle', () => {
  expect(extractTitle('<html><head><TITLE>  A &amp; B\n  C </TITLE>')).toBe('A & B C');
  expect(extractTitle('<p>no title</p>')).toBe('');
  expect(extractTitle('<title></title>')).toBe('');
});
test('decodeEntities', () => expect(decodeEntities('&lt;&nbsp;&#54620;&#xAE00;&amp;&bogus;')).toBe('< 한글&&bogus;'));
test('isFullDocument', () => {
  expect(isFullDocument(u8('<!DOCTYPE html><p>'))).toBe(true);
  expect(isFullDocument(u8('  <HTML lang="ko">'))).toBe(true);
  expect(isFullDocument(u8('<body class="x">'))).toBe(true);
  expect(isFullDocument(u8('<div class="frag">조각</div>'))).toBe(false);
  expect(isFullDocument(u8('<div>' + 'x'.repeat(2100) + '</div><body>'))).toBe(false);
  expect(isFullDocument(new Uint8Array(0))).toBe(false);
});
