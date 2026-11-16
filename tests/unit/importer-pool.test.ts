import { expect, test } from 'vitest';
import { createPool } from '../../src/lib/importer/pool';

const tick = () => new Promise((r) => setTimeout(r, 1));

test('bounds concurrency and drain waits for every task', async () => {
  const pool = createPool(3);
  let running = 0, peak = 0, done = 0;
  for (let i = 0; i < 10; i++) {
    await pool.add(async () => { running++; peak = Math.max(peak, running); await tick(); running--; done++; });
  }
  await pool.drain();
  expect(peak).toBe(3);
  expect(done).toBe(10);
});
test('a failure surfaces from add or drain, never silently', async () => {
  const pool = createPool(2);
  await pool.add(async () => { throw new Error('boom'); });
  await expect((async () => { for (let i = 0; i < 5; i++) await pool.add(() => tick()); await pool.drain(); })()).rejects.toThrow('boom');
});
test('drain after a failure still waits for in-flight tasks (before the cache is deleted)', async () => {
  const pool = createPool(3);
  let slowDone = false;
  await pool.add(async () => { await tick(); await tick(); slowDone = true; });
  await pool.add(async () => { throw new Error('boom'); });
  await pool.drain().catch(() => {});
  expect(slowDone).toBe(true);
});
