export function splitBookUrl(pathname: string): { bookId: string; rest: string } | null {
  const m = /^\/book\/([^/]+)(?:\/(.*))?$/s.exec(pathname);
  if (!m) return null;
  return { bookId: m[1], rest: m[2] ?? '' };
}

export type NormalizeResult =
  | { ok: true; path: string; dir: boolean }
  | { ok: false; reason: 'outside-root' };

export function normalizeBookPath(rest: string): NormalizeResult {
  let s = rest;
  const cut = s.search(/[?#]/);
  if (cut >= 0) s = s.slice(0, cut);
  try {
    s = decodeURIComponent(s);
  } catch {
    /* 잘못된 인코딩은 원문 유지 */
  }
  s = s.replace(/\\/g, '/').normalize('NFC');
  const dir = s === '' || s.endsWith('/');
  const out: string[] = [];
  for (const seg of s.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') {
      if (out.length === 0) return { ok: false, reason: 'outside-root' };
      out.pop();
    } else out.push(seg);
  }
  return { ok: true, path: out.join('/'), dir };
}

export function cacheKey(bookId: string, path: string): string {
  const enc = path.split('/').map((seg) => encodeURIComponent(seg)).join('/');
  return `/book/${bookId}/${enc}`;
}

export interface PathIndex {
  exact: Set<string>;
  lower: Map<string, string>;
  dirs: Set<string>;
}

export function buildPathIndex(paths: readonly string[]): PathIndex {
  const exact = new Set<string>();
  const lower = new Map<string, string>();
  const dirs = new Set<string>();
  for (const p of paths) {
    exact.add(p);
    const l = p.toLowerCase();
    if (!lower.has(l)) lower.set(l, p);
    let i = p.indexOf('/');
    while (i >= 0) {
      dirs.add(p.slice(0, i).toLowerCase());
      i = p.indexOf('/', i + 1);
    }
  }
  return { exact, lower, dirs };
}

function lookup(index: PathIndex, path: string): string | undefined {
  if (index.exact.has(path)) return path;
  return index.lower.get(path.toLowerCase());
}

export type Resolved =
  | { kind: 'file'; path: string }
  | { kind: 'redirect-dir'; to: string }
  | { kind: 'missing' };

export function resolveInBook(index: PathIndex, path: string, dir: boolean): Resolved {
  const isDir = path === '' || index.dirs.has(path.toLowerCase());
  if (dir) {
    if (!isDir) return { kind: 'missing' };
    const prefix = path === '' ? '' : path + '/';
    for (const name of ['index.html', 'index.htm']) {
      const hit = lookup(index, prefix + name);
      if (hit) return { kind: 'file', path: hit };
    }
    return { kind: 'missing' };
  }
  const hit = lookup(index, path);
  if (hit) return { kind: 'file', path: hit };
  if (isDir) return { kind: 'redirect-dir', to: path + '/' };
  return { kind: 'missing' };
}

export function isIgnoredMissing(path: string): boolean {
  const name = path.slice(path.lastIndexOf('/') + 1).toLowerCase();
  return (
    name === 'favicon.ico' ||
    name === 'robots.txt' ||
    name.endsWith('.map') ||
    name.startsWith('apple-touch-icon')
  );
}

const collator = new Intl.Collator('ko', { numeric: true, sensitivity: 'base' });
export function naturalComparePaths(a: string, b: string): number {
  return collator.compare(a, b);
}
