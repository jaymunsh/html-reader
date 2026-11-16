import { expect, test } from 'vitest';
import { cssRgbToHex } from '../../src/lib/color';

test('불투명 rgb()/rgba()만 #rrggbb로', () => {
  expect(cssRgbToHex('rgb(30, 32, 40)')).toBe('#1e2028');
  expect(cssRgbToHex('rgba(255, 255, 255, 1)')).toBe('#ffffff');
  expect(cssRgbToHex('rgb(0 0 0 / 100%)')).toBe('#000000');
  expect(cssRgbToHex('  RGB(1,2,3) ')).toBe('#010203');
  expect(cssRgbToHex('rgb(12.6, 0, 255)')).toBe('#0d00ff');
});

test('투명·반투명·다른 문법·주입 시도는 null', () => {
  for (const v of ['rgba(0, 0, 0, 0)', 'rgba(10, 10, 10, 0.5)', 'rgb(0 0 0 / 50%)', 'transparent', '#000000', 'black',
    'oklch(0.2 0 0)', 'color(srgb 0 0 0)', 'rgb(256, 0, 0)', 'rgb(0, 0)', 'rgb(0,0,0); background: url(x)', 'rgb(0,0,0)}body{x:y',
    'linear-gradient(red, blue)', '', 'rgb(' + '1'.repeat(80) + ')', null, undefined, 42, {}])
    expect(cssRgbToHex(v)).toBeNull();
});
