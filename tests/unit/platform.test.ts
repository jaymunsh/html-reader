import { expect, test } from 'vitest';
import { isIos, needsIosTabNotice } from '../../src/lib/platform';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1';
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15';
test('iOS 판별', () => {
  expect(isIos(IPHONE, 5)).toBe(true);
  expect(isIos(MAC, 5)).toBe(true);        // iPadOS 데스크톱 UA
  expect(isIos(MAC, 0)).toBe(false);
  expect(isIos('Mozilla/5.0 (Linux; Android 15; Pixel 7) Chrome/130 Mobile Safari/537.36', 5)).toBe(false);
});
test('탭 안내는 iOS이면서 standalone이 아닐 때만', () => {
  expect(needsIosTabNotice(IPHONE, 5, false)).toBe(true);
  expect(needsIosTabNotice(IPHONE, 5, true)).toBe(false);
  expect(needsIosTabNotice(MAC, 0, false)).toBe(false);
});
