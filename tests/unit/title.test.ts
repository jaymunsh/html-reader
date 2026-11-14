import { expect, test } from 'vitest';
import { dedupeTitle, defaultTitle, validateTitle } from '../../src/lib/title';

test('기본 이름', () => {
  expect(defaultTitle('3분기 보고서', 'q3')).toBe('3분기 보고서');
  expect(defaultTitle('', 'q3')).toBe('q3');
  expect(defaultTitle('   ', 'q3')).toBe('q3');
  for (const t of ['Document', 'INDEX', 'untitled', 'Home', '제목 없음', 'Untitled Document', '  index  ']) expect(defaultTitle(t, 'q3')).toBe('q3');
});
test('중복 접미사', () => {
  expect(dedupeTitle('보고서', [])).toBe('보고서');
  expect(dedupeTitle('보고서', ['보고서'])).toBe('보고서 (2)');
  expect(dedupeTitle('보고서', ['보고서', '보고서 (2)'])).toBe('보고서 (3)');
  expect(dedupeTitle('보고서', ['보고서', '보고서 (3)'])).toBe('보고서 (2)');
});

test('validateTitle', () => {
  expect(validateTitle('  새 이름  ')).toEqual({ ok: true, title: '새 이름' });
  expect(validateTitle('   ')).toEqual({ ok: false, reason: 'empty' });
  expect(validateTitle('가'.repeat(100))).toEqual({ ok: true, title: '가'.repeat(100) });
  expect(validateTitle('가'.repeat(101))).toEqual({ ok: false, reason: 'too-long' });
});
