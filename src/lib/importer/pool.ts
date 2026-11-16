/** Runs async tasks with bounded concurrency. `drain()` resolves only after every task settled and rethrows the first failure. */
export function createPool(limit: number) {
  const inflight = new Set<Promise<void>>();
  let failure: { e: unknown } | null = null;
  return {
    /** Waits for a free slot, then starts `task`. Throws if an earlier task already failed. */
    async add(task: () => Promise<unknown>): Promise<void> {
      while (inflight.size >= limit && !failure) await Promise.race(inflight);
      if (failure) throw failure.e;
      const t: Promise<void> = task().then(() => {}, (e) => { failure ??= { e }; }).finally(() => { inflight.delete(t); });
      inflight.add(t);
    },
    async drain(): Promise<void> {
      await Promise.all(inflight);
      if (failure) throw failure.e;
    },
  };
}
