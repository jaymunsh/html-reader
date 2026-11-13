import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
const css = readFileSync('src/ui/theme/tokens.css', 'utf8');
const block = (dark: boolean) => (dark ? css.split(':root[data-theme="dark"]')[1] : css.split(':root[data-theme="dark"]')[0]);
const tok = (name: string, dark: boolean) => new RegExp(`--${name}:\\s*([^;]+);`).exec(block(dark))![1].trim();
const rgba = (v: string): [number, number, number, number] => v.startsWith('#')
  ? [parseInt(v.slice(1, 3), 16), parseInt(v.slice(3, 5), 16), parseInt(v.slice(5, 7), 16), 1]
  : (v.match(/[\d.]+/g)!.map(Number) as any).concat(1).slice(0, 4);
const over = (fg: number[], bg: number[]) => fg.slice(0, 3).map((c, i) => c * fg[3] + bg[i] * (1 - fg[3]));
const lum = (c: number[]) => { const [r, g, b] = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const ratio = (a: number[], b: number[]) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

test.each([false, true])('토큰 값과 대비 (dark=%s)', (dark) => {
  const surface = rgba(tok('surface', dark));
  for (const [fg, bg] of [['text', 'bg-app'], ['text-2', 'surface'], ['text-3', 'surface'], ['text-3', 'bg-app'], ['accent', 'surface'], ['ok', 'surface']])
    expect(ratio(rgba(tok(fg, dark)), rgba(tok(bg, dark))), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
  for (const k of ['warn', 'info']) expect(ratio(rgba(tok(`${k}-fg`, dark)), over(rgba(tok(`${k}-bg`, dark)), surface)), k).toBeGreaterThanOrEqual(4.5);
});
test('스펙 표의 값 그대로', () => {
  expect([tok('bg-app', false), tok('bg-reader', false), tok('accent', false), tok('bar', false)]).toEqual(['#EEF0F4', '#FFFFFF', '#2F6FEB', 'rgba(250,251,253,0.86)']);
  expect([tok('bg-app', true), tok('bg-reader', true), tok('accent', true), tok('surface', true)]).toEqual(['#101216', '#000000', '#6EA0FF', '#1A1D23']);
});
