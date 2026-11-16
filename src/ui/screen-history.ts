// Session history for the shell's screens. The library is the base entry (state null); the reader and settings each own
// one entry above it, so the browser's / Android's back leaves them to the library in one step and the library's back
// leaves the app. A modal layer in the reader (sheet, dialog) adds one more entry, so back closes it first. In-book
// navigation never adds entries (session.ts replaces; the agent keeps the frame's history flat, src/agent/history.ts).

export type ScreenEntry = { hr: 'reader'; id: string; layer?: true } | { hr: 'settings' };

export function currentEntry(): ScreenEntry | null {
  const s = history.state as { hr?: unknown; id?: unknown; layer?: unknown } | null;
  if (!s || typeof s !== 'object') return null;
  if (s.hr === 'reader' && typeof s.id === 'string') return s.layer === true ? { hr: 'reader', id: s.id, layer: true } : { hr: 'reader', id: s.id };
  if (s.hr === 'settings') return { hr: 'settings' };
  return null;
}

const key = (e: ScreenEntry | null) => JSON.stringify(e);

// A UI exit pops our entries with history.go(); its popstate is ours, not the user's. Operations run one at a time: one
// requested while a traversal is in flight waits for it (a push first would be popped by it; two pops would overlap).
let ours: (() => void) | null = null;
let busy: Promise<void> | null = null;
let queue: Promise<void> = Promise.resolve();
let queued = 0;
const POP_WAIT_MS = 600;

function after(run: () => void): void {
  if (!busy && !queued) { run(); return; } // idle: synchronous, so a push stays within the click's user activation
  queued++;
  queue = queue.then(async () => {
    while (busy) await busy;
    queued--;
    try { run(); } catch { /* history unavailable */ }
  });
}

/**
 * Go back `steps` entries to `target`. If no popstate arrives, the traversal was spent on a frame entry a document left
 * (or never happened): go back once more, then, if still nowhere, rewrite the entry we meant to leave to the target, so the
 * state is never left stale.
 */
function popTo(steps: number, target: ScreenEntry | null): void {
  const from = key(currentEntry());
  busy = new Promise<void>((resolve) => {
    let t: ReturnType<typeof setTimeout> | undefined;
    let retried = false;
    const finish = () => { clearTimeout(t); ours = null; busy = null; resolve(); };
    const wait = () => {
      t = setTimeout(() => {
        if (key(currentEntry()) !== from) { finish(); return; }
        if (!retried) { retried = true; history.go(-1); wait(); return; }
        history.replaceState(target, '', '/');
        finish();
      }, POP_WAIT_MS);
    };
    ours = finish;
    wait();
  });
  history.go(-steps);
}

/** Opening a screen over the library: push its entry (no-op when it is already current). Call within the click when possible. */
export function enterScreen(e: ScreenEntry): void {
  after(() => {
    const c = currentEntry();
    if (!(c && c.hr === e.hr && (c.hr !== 'reader' || c.id === (e as { id: string }).id))) history.pushState(e, '', '/');
  });
}

/** Leaving a screen from the UI: drop its entries (and its layer's) so entries never pile up. */
export function leaveScreen(): void {
  after(() => { const c = currentEntry(); if (c) popTo(c.hr === 'reader' && c.layer ? 2 : 1, null); });
}

/** A modal layer opened in the reader: one entry, so back closes it before leaving the reader. */
export function enterLayer(id: string): void {
  after(() => { const c = currentEntry(); if (c?.hr === 'reader' && c.id === id && !c.layer) history.pushState({ hr: 'reader', id, layer: true }, '', '/'); });
}

/** The layer closed from the UI: drop its entry. */
export function leaveLayer(): void {
  after(() => { const c = currentEntry(); if (c?.hr === 'reader' && c.layer) popTo(1, { hr: 'reader', id: c.id }); });
}

/** From popstate: true when this pop is one the shell asked for (the app has already acted on it). */
export function ownPop(): boolean {
  if (!ours) return false;
  ours();
  return true;
}

/** At boot: a screen entry without its screen (the app restarts on the library, e.g. after a reload) becomes the library. */
export function normalizeAtBoot(screenShown: boolean): void {
  if (!screenShown && currentEntry()) history.replaceState(null, '', location.pathname + location.search);
}
