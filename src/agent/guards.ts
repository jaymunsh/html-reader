// Protects the app's own SW/storage/caches/IDB from book scripts (spec §9.4).
// Must stay synchronous and dependency-free: it runs before any book script.

const APP_CACHE = /^(book-|workbox-)|^share-inbox$/;
const DB = 'html-reader';
const STORAGE_METHODS = ['getItem', 'setItem', 'removeItem', 'clear', 'key'];

function patch(proto: object | undefined, name: string, fn: (...a: any[]) => unknown): void {
  if (!proto) return;
  try {
    Object.defineProperty(proto, name, { configurable: true, writable: true, value: fn });
  } catch { /* ignore */ }
}

function wrapStorage(real: Storage, prefix: string): Storage {
  const own = () => {
    const out: string[] = [];
    for (let i = 0; i < real.length; i++) {
      const k = real.key(i)!;
      if (k.startsWith(prefix)) out.push(k.slice(prefix.length));
    }
    return out;
  };
  const api: Record<string, unknown> = {
    getItem: (k: string) => real.getItem(prefix + k),
    setItem: (k: string, v: string) => real.setItem(prefix + k, v),
    removeItem: (k: string) => real.removeItem(prefix + k),
    clear: () => own().forEach((k) => real.removeItem(prefix + k)),
    key: (i: number) => own()[i] ?? null,
  };
  return new Proxy({} as Storage, {
    get(_t, k) {
      if (k === 'length') return own().length;
      if (typeof k === 'symbol') return k === Symbol.toStringTag ? 'Storage' : undefined;
      if (k in api) return api[k];
      return real.getItem(prefix + k) ?? undefined;
    },
    set(_t, k, v) {
      if (typeof k === 'string') real.setItem(prefix + k, String(v));
      return true;
    },
    deleteProperty(_t, k) {
      if (typeof k === 'string') real.removeItem(prefix + k);
      return true;
    },
    has: (_t, k) => typeof k === 'string' && (STORAGE_METHODS.includes(k) || k === 'length' || real.getItem(prefix + k) !== null),
    ownKeys: () => own(),
    getOwnPropertyDescriptor(_t, k) {
      if (typeof k !== 'string') return undefined;
      const v = real.getItem(prefix + k);
      return v === null ? undefined : { value: v, writable: true, enumerable: true, configurable: true };
    },
  });
}

export function installGuards(bookId: string): void {
  const prefix = `book:${bookId}:`;

  // Service worker
  const SWC = (window as any).ServiceWorkerContainer?.prototype;
  patch(SWC, 'register', () => Promise.reject(new DOMException('blocked by reader', 'SecurityError')));
  patch(SWC, 'getRegistrations', () => Promise.resolve([]));
  patch(SWC, 'getRegistration', () => Promise.resolve(undefined));

  // Web storage
  for (const name of ['localStorage', 'sessionStorage'] as const) {
    try {
      const real = window[name];
      const wrapped = wrapStorage(real, prefix);
      Object.defineProperty(window, name, { configurable: true, get: () => wrapped });
    } catch { /* storage unavailable */ }
  }

  // Cache Storage
  const CS = (window as any).CacheStorage?.prototype;
  if (CS) {
    const { delete: del, open, has, keys } = CS;
    patch(CS, 'delete', function (this: unknown, n: string) {
      return APP_CACHE.test(String(n)) ? Promise.resolve(false) : del.call(this, n);
    });
    patch(CS, 'open', function (this: unknown, n: string) {
      return APP_CACHE.test(String(n)) ? Promise.reject(new DOMException('blocked by reader', 'SecurityError')) : open.call(this, n);
    });
    patch(CS, 'has', function (this: unknown, n: string) {
      return APP_CACHE.test(String(n)) ? Promise.resolve(false) : has.call(this, n);
    });
    patch(CS, 'keys', function (this: unknown) {
      return keys.call(this).then((l: string[]) => l.filter((n) => !APP_CACHE.test(n)));
    });
  }

  // IndexedDB
  const IDF = (window as any).IDBFactory?.prototype;
  if (IDF) {
    const { open, deleteDatabase, databases } = IDF;
    const block = (orig: Function) => function (this: unknown, n: string, ...r: unknown[]) {
      if (String(n) === DB) throw new DOMException('blocked by reader', 'SecurityError');
      return orig.call(this, n, ...r);
    };
    patch(IDF, 'open', block(open));
    patch(IDF, 'deleteDatabase', block(deleteDatabase));
    if (databases) {
      patch(IDF, 'databases', function (this: unknown) {
        return databases.call(this).then((l: { name?: string }[]) => l.filter((d) => d.name !== DB));
      });
    }
  }
}
