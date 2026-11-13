export interface Book {
  id: string; title: string; sourceName: string; cacheName: string;
  entryPath: string; pagePaths: string[]; fileCount: number; totalBytes: number;
  importedAt: number; lastOpenedAt: number; lastPath: string; textScale: number;
}
export interface BookFiles { bookId: string; paths: string[]; titles: Record<string, string> }
export interface PageProgress { bookId: string; path: string; maxPct: number; lastScrollRatio: number; read: boolean; updatedAt: number }
export interface Bookmark { id: string; bookId: string; path: string; scrollRatio: number; label: string; createdAt: number }
export interface TextRecord { bookId: string; path: string; text: string }
export type IssueKind = 'missing' | 'outside-root' | 'external';
export interface Issue { bookId: string; path: string; kind: IssueKind; count: number; lastSeen: number }
export interface Settings {
  librarySort: 'recent' | 'imported' | 'name' | 'progress'; progressLine: boolean; activeBookId: string | null;
  hintSeen: boolean; safetyNoticeSeen: boolean; theme: 'system' | 'light' | 'dark'; panelWidth: number; panelOpen: boolean;
}
export const SETTING_DEFAULTS: Settings = {
  librarySort: 'recent', progressLine: true, activeBookId: null,
  hintSeen: false, safetyNoticeSeen: false, theme: 'system', panelWidth: 320, panelOpen: true,
};
