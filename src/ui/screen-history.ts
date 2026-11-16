// Session history for the shell's screens. The library is the base entry (state null); the reader and settings each own
// exactly one entry above it, so the browser's / Android's back leaves them to the library in one step and the library's
// back leaves the app. In-book navigation never adds entries (session.ts replaces, the agent replaces link navigations).

export type ScreenEntry = { hr: 'reader'; id: string } | { hr: 'settings' };

export function currentEntry(): ScreenEntry | null {
  const s = history.state as { hr?: unknown; id?: unknown } | null;
  if (!s || typeof s !== 'object') return null;
  if (s.hr === 'reader' && typeof s.id === 'string') return { hr: 'reader', id: s.id };
  if (s.hr === 'settings') return { hr: 'settings' };
  return null;
}

const same = (a: ScreenEntry | null, b: ScreenEntry) => !!a && a.hr === b.hr && (a.hr !== 'reader' || a.id === (b as { id: string }).id);

// A UI exit pops our entry with history.back(); its popstate is ours, not the user's. A push requested meanwhile waits for it
// (pushing first would let that back pop the new entry instead).
let leaving: (() => void) | null = null;
let left: Promise<void> | null = null;
const LEAVE_WAIT_MS = 1000;

/** Opening a screen over the library: push its entry (no-op when it is already current). Call within the click when possible. */
export function enterScreen(e: ScreenEntry): void {
  const push = () => { if (!same(currentEntry(), e)) history.pushState(e, '', '/'); };
  if (left) void left.then(push); else push();
}

/** Leaving a screen from the UI: drop its entry so entries never pile up (a forward entry may stay; it is reused). */
export function leaveScreen(): void {
  if (!currentEntry() || left) return;
  left = new Promise<void>((resolve) => {
    const t = setTimeout(() => done(), LEAVE_WAIT_MS); // popstate never came (should not happen): do not block pushes forever
    const done = () => { clearTimeout(t); leaving = null; left = null; resolve(); };
    leaving = done;
  });
  history.back();
}

/** From popstate: true when this pop is the one leaveScreen() asked for (the app has already left the screen). */
export function ownPop(): boolean {
  if (!leaving) return false;
  leaving();
  return true;
}

/** At boot: a screen entry without its screen (the app restarts on the library, e.g. after a reload) becomes the library. */
export function normalizeAtBoot(screenShown: boolean): void {
  if (!screenShown && currentEntry()) history.replaceState(null, '', location.pathname + location.search);
}
