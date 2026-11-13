import { expect, test } from 'vitest';
import { stepZoom, zoomLabel, ZOOM_STEPS } from '../../src/lib/zoom';
test('단계', () => expect([...ZOOM_STEPS]).toEqual([0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2]));
test('stepZoom', () => {
  expect(stepZoom(1, 1)).toBe(1.1); expect(stepZoom(1.1, 1)).toBe(1.25); expect(stepZoom(1, -1)).toBe(0.9);
  expect(stepZoom(2, 1)).toBe(2); expect(stepZoom(0.8, -1)).toBe(0.8);
  expect(stepZoom(1.3, 1)).toBe(1.5); expect(stepZoom(1.3, -1)).toBe(1.1);      // 단계에 없는 저장값은 가까운 단계(1.25) 기준
});
test('zoomLabel', () => { expect(zoomLabel(1.25)).toBe('125%'); expect(zoomLabel(0.8)).toBe('80%'); });
