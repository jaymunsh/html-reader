/**
 * Ask the browser not to evict our storage (books in Cache Storage + IndexedDB) under storage pressure.
 * Called after a successful import, when there is something worth keeping. Never throws; asks at most once per page load.
 * Browsers decide on their own (installed PWAs are usually granted); a refusal just leaves the default best-effort storage.
 */
let asked = false;

export async function requestPersistentStorage(storage: StorageManager | undefined = globalThis.navigator?.storage): Promise<boolean> {
  if (asked || !storage?.persist) return false;
  asked = true;
  try {
    if (await storage.persisted?.()) return true;
    return await storage.persist();
  } catch {
    return false;
  }
}

/** Test-only: reset the once-per-load guard. */
export function resetPersistRequest(): void { asked = false; }
