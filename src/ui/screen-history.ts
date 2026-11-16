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

// A UI exit pops our entries with history.go(); its popstate is ours, not the user's. Anything requested meanwhile waits for
// it (pushing first would let that traversal pop the new entry instead).
let ours: (() => void) | null = null;
let busy: Promise<void> | null = null;
const POP_WAIT_MS = 600;

function after(run: () => void): void { if (busy) void busy.then(run); else run(); }

/**
 * Go back `steps` entries to `target`. If no popstate arrives (the traversal was spent on a frame entry a document added,
 * or never happened), the entry we meant to leave is rewritten to the target, so the state is never left stale.
 */
function popTo(steps: number, target: ScreenEntry | null): void {
  const from = key(currentEntry());
  busy = new Promise<void>((resolve) => {
    const finish = (timedOut: boolean) => {
      clearTimeout(t);
      if (timedOut && key(currentEntry()) === from) history.replaceState(target, '', '/');
      ours = null; busy = null; resolve();
    };
    const t = setTimeout(() => finish(true), POP_WAIT_MS);
    ours = () => finish(false);
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
