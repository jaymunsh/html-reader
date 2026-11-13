import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
const walk = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));
test('src/ui에 이모지가 없다', () => {
  const bad = walk('src/ui').filter((f) => /\.(svelte|ts|css)$/.test(f)).filter((f) => /\p{Extended_Pictographic}/u.test(readFileSync(f, 'utf8')));
  expect(bad).toEqual([]);
});
