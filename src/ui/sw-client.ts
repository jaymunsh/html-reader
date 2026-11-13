let reg$: Promise<ServiceWorkerRegistration | null> | null = null;

/** Registers lazily on first use, so call order (registerSw / ensureController / watchForUpdate) does not matter. */
function registration(): Promise<ServiceWorkerRegistration | null> {
  return (reg$ ??= 'serviceWorker' in navigator
    ? navigator.serviceWorker.register('/sw.js').catch(() => null)
    : Promise.resolve(null));
}

export function registerSw(): void { void registration(); }

const READY_WAIT_MS = 10_000;

/** Waits for the SW to control this page. Reloads once if it does not (first install); else reports 'unsupported'. */
export async function ensureController(): Promise<'ok' | 'unsupported'> {
  if (!('serviceWorker' in navigator)) return 'unsupported';
  // Rejected register, or a blocked one that resolves with no worker at all: nothing will ever control this page.
  if (navigator.serviceWorker.controller) {
    try { sessionStorage.removeItem('sw-reload'); } catch { /* ignore */ }
    return 'ok';
  }
  const reg = await registration();
  if (!reg || (!reg.installing && !reg.waiting && !reg.active)) return 'unsupported';
  await Promise.race([
    navigator.serviceWorker.ready.catch(() => undefined),
    new Promise((r) => setTimeout(r, READY_WAIT_MS)),
  ]);
  if (navigator.serviceWorker.controller) {
    try { sessionStorage.removeItem('sw-reload'); } catch { /* ignore */ }
    return 'ok';
  }
  let reloaded = false;
  try { reloaded = sessionStorage.getItem('sw-reload') === '1'; } catch { /* ignore */ }
  if (!reloaded) {
    try { sessionStorage.setItem('sw-reload', '1'); } catch { return 'unsupported'; }
    location.reload();
    return new Promise<never>(() => { /* page is reloading */ });
  }
  return 'unsupported';
}

export function tellSw(msg: { type: 'active-book'; id: string | null } | { type: 'book-changed'; id: string } | { type: 'skip-waiting' }): void {
  try { navigator.serviceWorker?.controller?.postMessage(msg); } catch { /* ignore */ }
}

let waiting = false;

/** Calls onWaiting when a new SW is installed and waiting (never activates it). Re-checks on every return to the tab. */
export function watchForUpdate(onWaiting: () => void): void {
  if (!('serviceWorker' in navigator)) return;
  const found = () => { waiting = true; onWaiting(); };
  void registration().then((reg) => {
    if (!reg) return;
    if (reg.waiting) found();
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller) found();
      });
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void reg.update().catch(() => {});
    });
  });
}

export function hasWaitingUpdate(): boolean { return waiting; }

/** Activates the waiting SW, then reloads once when it takes control. With nothing waiting, just reloads. */
export function applyUpdate(): void {
  try { sessionStorage.removeItem('update-wanted'); } catch { /* ignore */ }
  const sw = navigator.serviceWorker;
  const reload = () => location.reload();
  void sw?.getRegistration().then((reg) => {
    if (!reg?.waiting) { reload(); return; }
    let done = false;
    const once = () => { if (!done) { done = true; reload(); } };
    sw.addEventListener('controllerchange', once, { once: true });
    setTimeout(once, 3000); // controllerchange may never fire (e.g. waiting worker went redundant)
    reg.waiting.postMessage({ type: 'skip-waiting' });
  }, reload);
}
