export function registerSw(): void {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('/sw.js').catch(() => { /* surfaced later by ensureController */ });
}

const READY_WAIT_MS = 10_000;

/** Waits for the SW to control this page. Reloads once if it does not (first install); else reports 'unsupported'. */
export async function ensureController(): Promise<'ok' | 'unsupported'> {
  if (!('serviceWorker' in navigator)) return 'unsupported';
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
