/** sessionStorage key of the agent's in-book history stack (src/agent/history.ts); the shell clears it when a book opens. */
export const frameHistoryKey = (bookId: string) => `hr-frame-history:${bookId}`;
