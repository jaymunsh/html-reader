import { expect, test } from 'vitest';
import { resolveTheme } from '../../src/ui/chrome';
test('resolveTheme', () => {
  expect(resolveTheme('system', true)).toBe('dark');
  expect(resolveTheme('system', false)).toBe('light');
  expect(resolveTheme('light', true)).toBe('light');
  expect(resolveTheme('dark', false)).toBe('dark');
});
