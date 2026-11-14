import type { Bookmark } from './storage';

export const BOOKMARK_NEAR = 0.02;
export const LABEL_MAX = 100;

export function findNearBookmark(list: Bookmark[], path: string, ratio: number): Bookmark | undefined {
  let best: Bookmark | undefined;
  let bestD = Infinity;
  for (const b of list) {
    if (b.path !== path) continue;
    const d = Math.abs(b.scrollRatio - ratio);
    // 1e-9: float noise (|0.48-0.5| = 0.02000000000000002) must not exclude an exact 2% hit
    if (d <= BOOKMARK_NEAR + 1e-9 && d < bestD) { best = b; bestD = d; }
  }
  return best;
}

export const defaultBookmarkLabel = (path: string, ratio: number): string =>
  `${path.split('/').pop()} · ${Math.round(ratio * 100)}%`;

export const normalizeLabel = (input: string, fallback: string): string =>
  (input.trim() || fallback).slice(0, LABEL_MAX);

export const newBookmark = (bookId: string, path: string, ratio: number, now: number): Bookmark => ({
  id: crypto.randomUUID(), bookId, path, scrollRatio: ratio, label: defaultBookmarkLabel(path, ratio), createdAt: now,
});
