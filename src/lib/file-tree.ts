import { naturalComparePaths } from './path';

/** Pages in reading order: natural path sort (not folders-first). */
export function orderedPages(pagePaths: string[]): string[] {
  return [...pagePaths].sort(naturalComparePaths);
}
