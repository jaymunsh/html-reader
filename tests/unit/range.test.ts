import { expect, test } from 'vitest';
import { parseRange, rangeResponse } from '../../src/lib/range';

test.each([
  ['bytes=0-99', 1000, { start: 0, end: 99 }],
  ['bytes=500-', 1000, { start: 500, end: 999 }],
  ['bytes=-100', 1000, { start: 900, end: 999 }],
  ['bytes=-5000', 1000, { start: 0, end: 999 }],
  ['bytes=0-4999', 1000, { start: 0, end: 999 }],
  ['bytes=0-10,20-30', 1000, { start: 0, end: 10 }],     // 다중 범위는 첫 범위만
  ['bytes=1000-', 1000, 'unsatisfiable'],
  ['bytes=-0', 1000, 'unsatisfiable'],
  ['bytes=0-', 0, 'unsatisfiable'],
  ['bytes=5-2', 1000, null], ['items=0-1', 1000, null], ['bytes=abc', 1000, null], [null, 1000, null],
])('%s / %i', (h, total, want) => expect(parseRange(h as any, total as number)).toEqual(want));

const blob = new Blob([new Uint8Array(1000).map((_, i) => i % 256)]);

test('206', async () => {
  const r = rangeResponse(blob, 'video/mp4', 'bytes=10-19');
  expect(r.status).toBe(206);
  expect(r.headers.get('Content-Range')).toBe('bytes 10-19/1000');
  expect(r.headers.get('Content-Length')).toBe('10');
  expect(r.headers.get('Accept-Ranges')).toBe('bytes');
  expect(r.headers.get('Content-Type')).toBe('video/mp4');
  expect([...new Uint8Array(await r.arrayBuffer())]).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
});
test('416', () => {
  const r = rangeResponse(blob, 'video/mp4', 'bytes=2000-');
  expect(r.status).toBe(416);
  expect(r.headers.get('Content-Range')).toBe('bytes */1000');
});
test('Range 없음 → 200 + Accept-Ranges', () => {
  const r = rangeResponse(blob, 'audio/wav', null);
  expect(r.status).toBe(200);
  expect(r.headers.get('Accept-Ranges')).toBe('bytes');
  expect(r.headers.get('Content-Length')).toBe('1000');
});
