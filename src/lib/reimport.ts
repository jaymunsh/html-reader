import { pickEntryPath } from './importer/plan';

/** What a replace import (spec §7.2) drops: records for paths the new bundle no longer has. */
export interface ReplacePlan { dropProgress: string[]; dropBookmarkIds: string[]; lastPath: string }

export function planReplace(i: {
  newPaths: string[];
  progressPaths: string[]; bookmarks: { id: string; path: string }[];
  lastPath: string; newEntryPath: string;
}): ReplacePlan {
  const kept = new Set(i.newPaths);
  return {
    dropProgress: i.progressPaths.filter((p) => !kept.has(p)),
    dropBookmarkIds: i.bookmarks.filter((b) => !kept.has(b.path)).map((b) => b.id),
    lastPath: !i.lastPath || kept.has(i.lastPath) ? i.lastPath : i.newEntryPath,
  };
}

/** The usual entry pick, else the old entry page if the new bundle still has it; null means ask the user. */
export function pickReplaceEntry(newPagePaths: string[], oldEntryPath: string): string | null {
  return pickEntryPath(newPagePaths) ?? (newPagePaths.includes(oldEntryPath) ? oldEntryPath : null);
}
