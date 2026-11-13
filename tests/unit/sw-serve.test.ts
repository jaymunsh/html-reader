import { expect, test } from 'vitest';
import { dirRedirectLocation, NOT_IN_BUNDLE_HTML } from '../../src/sw/serve';

test('dir redirect Location always stays inside the book', () => {
  expect(dirRedirectLocation('ab', 'sub/')).toBe('/book/ab/sub/');
  expect(dirRedirectLocation('ab', 'a b/c#/', '?v=1')).toBe('/book/ab/a%20b/c%23/?v=1');
  expect(dirRedirectLocation('ab', '')).toBe('/book/ab/');
  expect(dirRedirectLocation('ab', '/')).toBe('/book/ab/');
});

test('not-in-bundle html', () => {
  expect(NOT_IN_BUNDLE_HTML).toContain('이 페이지는 묶음에 없습니다');
  expect(NOT_IN_BUNDLE_HTML).toContain('<meta charset="utf-8">');
});
