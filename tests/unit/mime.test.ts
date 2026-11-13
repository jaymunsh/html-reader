import { expect, test } from 'vitest';
import { isHtmlMime, isMediaMime, mimeFor } from '../../src/lib/mime';

test.each([
  ['a/b.HTML', 'text/html'], ['x.htm', 'text/html'], ['x.xhtml', 'application/xhtml+xml'],
  ['x.css', 'text/css'], ['x.js', 'text/javascript'], ['x.mjs', 'text/javascript'],
  ['x.json', 'application/json'], ['x.svg', 'image/svg+xml'], ['x.wasm', 'application/wasm'],
  ['x.woff2', 'font/woff2'], ['x.woff', 'font/woff'], ['x.ttf', 'font/ttf'], ['x.otf', 'font/otf'],
  ['x.png', 'image/png'], ['x.jpg', 'image/jpeg'], ['x.jpeg', 'image/jpeg'], ['x.gif', 'image/gif'],
  ['x.webp', 'image/webp'], ['x.avif', 'image/avif'], ['x.ico', 'image/x-icon'], ['x.bmp', 'image/bmp'],
  ['x.mp4', 'video/mp4'], ['x.m4v', 'video/mp4'], ['x.webm', 'video/webm'], ['x.mov', 'video/quicktime'],
  ['x.mp3', 'audio/mpeg'], ['x.m4a', 'audio/mp4'], ['x.wav', 'audio/wav'], ['x.ogg', 'audio/ogg'],
  ['x.txt', 'text/plain'], ['x.xml', 'application/xml'], ['x.pdf', 'application/pdf'], ['x.vtt', 'text/vtt'],
  ['x.unknownext', 'application/octet-stream'], ['noext', 'application/octet-stream'], ['dir.v2/file', 'application/octet-stream'],
])('%s → %s', (p, t) => expect(mimeFor(p)).toBe(t));

test('분류', () => {
  expect(isHtmlMime('text/html; charset=euc-kr')).toBe(true);
  expect(isHtmlMime('application/xhtml+xml')).toBe(true);
  expect(isHtmlMime('text/plain')).toBe(false);
  expect(isMediaMime('video/mp4')).toBe(true);
  expect(isMediaMime('image/png')).toBe(false);
});
