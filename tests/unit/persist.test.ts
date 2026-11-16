import { beforeEach, describe, expect, it, vi } from 'vitest';
import { requestPersistentStorage, resetPersistRequest } from '../../src/lib/persist';

const sm = (o: Partial<StorageManager>) => o as StorageManager;

describe('requestPersistentStorage', () => {
  beforeEach(() => resetPersistRequest());

  it('asks once when not yet persisted', async () => {
    const persist = vi.fn().mockResolvedValue(true);
    const s = sm({ persist, persisted: vi.fn().mockResolvedValue(false) });
    expect(await requestPersistentStorage(s)).toBe(true);
    expect(await requestPersistentStorage(s)).toBe(false); // second call in the same load does nothing
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it('does not ask again when already persisted', async () => {
    const persist = vi.fn();
    expect(await requestPersistentStorage(sm({ persist, persisted: vi.fn().mockResolvedValue(true) }))).toBe(true);
    expect(persist).not.toHaveBeenCalled();
  });

  it('is a no-op without the API and never throws', async () => {
    expect(await requestPersistentStorage(undefined)).toBe(false);
    resetPersistRequest();
    expect(await requestPersistentStorage(sm({ persist: vi.fn().mockRejectedValue(new Error('x')) }))).toBe(false);
  });
});
