import { putProgress } from './storage/records';
import type { PageProgress } from './storage/types';

export const READ_THRESHOLD = 98;

export function pagePct(scrollTop: number, clientHeight: number, scrollHeight: number): number {
  if (!(scrollHeight > 0)) return 100;
  const v = ((scrollTop + clientHeight) / scrollHeight) * 100;
  return Math.min(100, Math.max(0, v));
}

export function applyScroll(prev: PageProgress | undefined, bookId: string, path: string, pct: number, ratio: number, now: number): PageProgress {
  const maxPct = Math.max(prev?.maxPct ?? 0, pct);
  return { bookId, path, maxPct, lastScrollRatio: ratio, read: (prev?.read ?? false) || maxPct >= READ_THRESHOLD, updatedAt: now };
}

export function bookProgress(pagePaths: string[], byPath: ReadonlyMap<string, Pick<PageProgress, 'maxPct' | 'read'>> | ReadonlyMap<unknown, unknown>): { pct: number; readCount: number; total: number } {
  const total = pagePaths.length;
  if (total === 0) return { pct: 0, readCount: 0, total: 0 };
  let sum = 0;
  let readCount = 0;
  for (const p of pagePaths) {
    const pr = (byPath as ReadonlyMap<string, Pick<PageProgress, 'maxPct' | 'read'>>).get(p);
    if (!pr) continue;
    sum += pr.maxPct;
    if (pr.read) readCount++;
  }
  return { pct: sum / total, readCount, total };
}

export class ProgressTracker {
  private map: Map<string, PageProgress>;
  private dirty = new Set<string>();
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private bookId: string,
    initial: Map<string, PageProgress>,
    private save: (p: PageProgress) => Promise<void> = putProgress,
    private debounceMs = 1000,
  ) {
    this.map = new Map(initial);
  }

  update(path: string, pct: number, ratio: number): PageProgress {
    const next = applyScroll(this.map.get(path), this.bookId, path, pct, ratio, Date.now());
    this.map.set(path, next);
    this.dirty.add(path);
    // Fires once, debounceMs after the first dirty update (not reset by later ones).
    if (this.timer === null) this.timer = setTimeout(() => { this.timer = null; void this.flush(); }, this.debounceMs);
    return next;
  }

  get(path: string): PageProgress | undefined { return this.map.get(path); }
  all(): Map<string, PageProgress> { return new Map(this.map); }

  async flush(): Promise<void> {
    if (this.timer !== null) { clearTimeout(this.timer); this.timer = null; }
    const paths = [...this.dirty];
    this.dirty.clear();
    for (const path of paths) {
      const p = this.map.get(path);
      if (!p) continue;
      try { await this.save({ ...p }); } catch (e) { this.dirty.add(path); throw e; }
    }
  }
}
