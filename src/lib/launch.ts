import { SHARE_CACHE } from '../sw/share';
// File handlers (§7.5): the installed app receives opened files through window.launchQueue (Chromium desktop only).
export interface LaunchQueueLike { setConsumer(cb: (params: { files?: readonly { getFile(): Promise<File> }[] }) => void): void }

export function initLaunch(queue: LaunchQueueLike | undefined, onFiles: (files: File[]) => void): void {
  queue?.setConsumer(async ({ files }) => {
    if (!files?.length) return;
    const got = (await Promise.allSettled(files.map((h) => h.getFile())))
      .flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
    if (got.length) onFiles(got);
  });
}

export const isImportableName = (name: string): boolean => /\.(zip|html?)$/i.test(name);

// Share target (§7.5): files the SW parked in the inbox, in arrival order. `done()` deletes them once their
// import has finished, so closing the app mid-import loses nothing (the next start imports them again).
export async function takePendingShare(cacheStorage: CacheStorage | undefined = globalThis.caches): Promise<{ files: File[]; done: () => Promise<void> }> {
  // has() first: opening would create an empty cache on every start.
  if (!cacheStorage || !(await cacheStorage.has(SHARE_CACHE))) return { files: [], done: async () => {} };
  const cache = await cacheStorage.open(SHARE_CACHE);
  const keys = await cache.keys();
  const files: File[] = [];
  for (const [n, key] of keys.entries()) {
    const res = await cache.match(key);
    if (!res) continue;
    const blob = await res.blob();
    let name = '';
    try { name = decodeURIComponent(res.headers.get('X-File-Name') ?? ''); } catch { /* keep empty */ }
    name ||= `shared-${n + 1}`;
    // The worker tells single HTML by its name: give shared HTML one (ZIPs are sniffed by their bytes).
    if (!isImportableName(name) && (/^text\/html\b/i.test(res.headers.get('Content-Type') ?? '') || /<html|<!doctype/i.test(await blob.slice(0, 512).text()))) name += '.html';
    files.push(new File([blob], name, { type: blob.type }));
  }
  return { files, done: async () => { await Promise.all(keys.map((k) => cache.delete(k))); } };
}
