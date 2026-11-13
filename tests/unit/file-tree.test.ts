import { expect, test } from 'vitest';
import { buildTree, neighbor, orderedPages } from '../../src/lib/file-tree';

test('buildTree', () => {
  expect(buildTree(['index.html', 'chapters/2.html', 'chapters/10.html', 'chapters/sub/a.html', 'about.html'])).toEqual([
    { kind: 'file', path: 'about.html', name: 'about.html', indent: false },
    { kind: 'folder', dir: 'chapters', label: 'chapters/' },
    { kind: 'file', path: 'chapters/2.html', name: '2.html', indent: true },
    { kind: 'file', path: 'chapters/10.html', name: '10.html', indent: true },
    { kind: 'folder', dir: 'chapters/sub', label: 'chapters/sub/' },
    { kind: 'file', path: 'chapters/sub/a.html', name: 'a.html', indent: true },
    { kind: 'file', path: 'index.html', name: 'index.html', indent: false },
  ]);
  expect(buildTree([])).toEqual([]);
});
test('neighbor', () => {
  const p = orderedPages(['b.html', 'a.html', 'c.html']);
  expect(neighbor(p, 'a.html', -1)).toBeNull();
  expect(neighbor(p, 'a.html', 1)).toBe('b.html');
  expect(neighbor(p, 'c.html', 1)).toBeNull();
  expect(neighbor(p, 'frag.html', -1)).toBeNull();
  expect(neighbor(p, 'frag.html', 1)).toBe('a.html');
  expect(neighbor([], 'x.html', 1)).toBeNull();
});
