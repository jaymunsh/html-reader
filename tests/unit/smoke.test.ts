import { expect, test } from 'vitest';
test('vitest runs', () => { expect('한글'.normalize('NFC')).toBe('한글'); });
