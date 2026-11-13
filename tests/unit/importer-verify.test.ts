import { expect, test } from 'vitest';
import { verifyCacheReady, type CacheStorageLike } from '../../src/lib/importer/verify';

const p = { book: { id: 'ab', entryPath: 'index.html', fileCount: 2 } as any, cacheName: 'book-ab-v1', entrySize: 3 };
const storage = (states: Array<{ keys: number; size?: number }>): CacheStorageLike => {
  let i = 0;
  return {
    async open() {
      const s = states[Math.min(i++, states.length - 1)];
      return {
        async keys() { return new Array(s.keys).fill(0); },
        async match() { return s.size === undefined ? undefined : { arrayBuffer: async () => new ArrayBuffer(s.size!) }; },
      };
    },
  };
};

test('ready once count matches and entry body has the expected size', async () => {
  expect(await verifyCacheReady(storage([{ keys: 2, size: 3 }]), p, { intervalMs: 1 })).toBe(true);
});
test('retries transient empty/short states', async () => {
  expect(await verifyCacheReady(storage([{ keys: 0 }, { keys: 2, size: 0 }, { keys: 2, size: 3 }]), p, { intervalMs: 1 })).toBe(true);
});
test('times out when the cache stays empty (dropped by the browser)', async () => {
  expect(await verifyCacheReady(storage([{ keys: 0 }]), p, { timeoutMs: 30, intervalMs: 5 })).toBe(false);
});
test('open() throwing is retried then times out', async () => {
  const bad: CacheStorageLike = { open: async () => { throw new Error('x'); } };
  expect(await verifyCacheReady(bad, p, { timeoutMs: 30, intervalMs: 5 })).toBe(false);
});
