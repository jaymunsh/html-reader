import { expect, test } from 'vitest';
import { crc32 } from '../../src/lib/crc32';
import { decodeEntryName, isJunk, sanitizeEntryPath } from '../../src/lib/filename';

const utf8 = (s: string) => new TextEncoder().encode(s);
const none = new Uint8Array(0);
const CP949_HANGUL = new Uint8Array([0xc7, 0xd1, 0xb1, 0xdb, ...utf8('.html')]);   // "한글.html"

function unicodeExtra(raw: Uint8Array, name: string, crc = crc32(raw)) {
  const n = utf8(name), b = new Uint8Array(4 + 5 + n.length), v = new DataView(b.buffer);
  v.setUint16(0, 0x7075, true); v.setUint16(2, 5 + n.length, true); v.setUint8(4, 1); v.setUint32(5, crc, true); b.set(n, 9);
  return b;
}

test('crc32', () => expect(crc32(utf8('123456789'))).toBe(0xcbf43926));
test('UTF-8 플래그', () => expect(decodeEntryName(utf8('한글.html'), 0x800, none)).toBe('한글.html'));
test('플래그 없지만 유효한 UTF-8', () => expect(decodeEntryName(utf8('한글.html'), 0, none)).toBe('한글.html'));
test('CP949', () => expect(decodeEntryName(CP949_HANGUL, 0, none)).toBe('한글.html'));
test('Unicode extra field 우선', () => expect(decodeEntryName(CP949_HANGUL, 0, unicodeExtra(CP949_HANGUL, '진짜이름.html'))).toBe('진짜이름.html'));
test('CRC가 다른 Unicode extra field는 무시', () => expect(decodeEntryName(CP949_HANGUL, 0, unicodeExtra(CP949_HANGUL, 'x.html', 1))).toBe('한글.html'));
test('NFD → NFC', () => expect(decodeEntryName(utf8('한글.html'.normalize('NFD')), 0x800, none)).toBe('한글.html'.normalize('NFC')));
test('백슬래시', () => expect(decodeEntryName(utf8('a\\b.html'), 0, none)).toBe('a/b.html'));

test('sanitizeEntryPath (Review Focus 2)', () => {
  expect(sanitizeEntryPath('/a//b/./c.html')).toBe('a/b/c.html');
  expect(sanitizeEntryPath('a/../../etc/passwd')).toBeNull();
  expect(sanitizeEntryPath('')).toBeNull();
});

test('isJunk', () => {
  for (const p of ['__MACOSX/x.html', 'a/__MACOSX/._b', 'a/.DS_Store', 'Thumbs.db', 'sub/desktop.ini', 'a/._b.html']) expect(isJunk(p)).toBe(true);
  for (const p of ['a/b.html', 'my__MACOSX.html', 'a/.well-known/x']) expect(isJunk(p)).toBe(false);
});
