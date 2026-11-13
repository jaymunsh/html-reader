import { putProgress } from './storage/records';
import type { PageProgress } from './storage/types';

export const READ_THRESHOLD = 98;

export function pagePct(scrollTop: number, clientHeight: number, scrollHeight: number): number {
  if (!(scrollHeight > 0)) return 100;
  const v = ((scrollTop + clientHeight) / scrollHeight) * 100;
  return Math.min(100, Math.max(0, v));
}

export function applyScroll(prev: PageProgress | undefined, bookId: string, path: string, pct: number, ratio: number, now: number): PageProgress {
  if (!Number.isFinite(pct) || !Number.isFinite(ratio)) {
    // Invalid input is ignored; with no history, an empty (unread) record is returned.
    return prev ?? { bookId, path, maxPct: 0, lastScrollRatio: 0, read: false, updatedAt: now };
  }
  pct = Math.min(100, Math.max(0, pct));
  ratio = Math.min(1, Math.max(0, ratio));
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
  private chain: Promise<void> = Promise.resolve();

  constructor(
    private bookId: string,
    initial: Map<string, PageProgress>,
    private save: (p: PageProgress) => Promise<void> = putProgress,
    private debounceMs = 1000,
  ) {
    this.map = new Map(initial);
  }

  update(path: string, pct: number, ratio: number): PageProgress {
    const prev = this.map.get(path);
    const next = applyScroll(prev, this.bookId, path, pct, ratio, Date.now());
    if (next === prev) return next; // ignored (invalid input)
    this.map.set(path, next);
    this.dirty.add(path);
    this.schedule();
    return next;
  }

  get(path: string): PageProgress | undefined { return this.map.get(path); }
  all(): Map<string, PageProgress> { return new Map(this.map); }

  // Fires once, debounceMs after the first dirty update (not reset by later ones).
  private schedule(): void {
    if (this.timer !== null) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.flush().catch(() => { /* doFlush already rescheduled a retry */ });
    }, this.debounceMs);
  }

  // Flushes are serialized: a call made while one is running waits for it, then runs.
  flush(): Promise<void> {
    const run = this.chain.then(() => this.doFlush());
    this.chain = run.catch(() => {});
    return run;
  }

  private async doFlush(): Promise<void> {
    if (this.timer !== null) { clearTimeout(this.timer); this.timer = null; }
    let firstError: unknown;
    let failed = false;
    for (const path of [...this.dirty]) {
      const p = this.map.get(path);
      if (!p) { this.dirty.delete(path); continue; }
      try {
        await this.save({ ...p });
        if (this.map.get(path) === p) this.dirty.delete(path); // a newer update during the save stays dirty
      } catch (e) {
        if (!failed) { failed = true; firstError = e; }
      }
    }
    if (this.dirty.size > 0) this.schedule();
    if (failed) throw firstError;
  }
}

/** "2 / 5쪽 · 62%"; a current path outside the list shows "–" for the index. */
export function formatPageInfo(pages: string[], current: string, bookPct: number): string {
  const i = pages.indexOf(current);
  return `${i < 0 ? '–' : i + 1} / ${pages.length}쪽 · ${Math.floor(bookPct)}%`;
}
