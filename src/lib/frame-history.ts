/** sessionStorage key of the agent's in-book history stack (src/agent/history.ts); the shell clears it when a book opens. */
export const frameHistoryKey = (bookId: string) => `hr-frame-history:${bookId}`;

/**
 * The next load in the frame is a new entry, though it navigates with location.replace (the shell's page changes, the
 * agent's converted links and pushes). An unmarked replace (the document's own location.replace, a meta refresh) only
 * overwrites the current entry — otherwise a redirect stub would trap the document's back.
 */
export function markPush(store: Storage | null, bookId: string): void {
  try {
    const k = frameHistoryKey(bookId);
    let s: Record<string, unknown> = {};
    try { const v = JSON.parse(store?.getItem(k) ?? ''); if (v && typeof v === 'object') s = v; } catch { /* empty */ }
    s.p = 1;
    store?.setItem(k, JSON.stringify(s));
  } catch { /* storage blocked */ }
}
