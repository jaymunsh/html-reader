// Share target (§7.5, Android installed app): the SW parks shared files in a temporary cache, the app imports them.
// No SW-only top-level code: the app bundle imports SHARE_CACHE from here.
export const SHARE_CACHE = 'share-inbox';
export const SHARE_PATH = '/__app/share-target';

// Built by hand: Response.redirect makes the Location absolute (and throws on a relative URL outside a browser).
const back = (q: 'pending' | 'failed') => new Response(null, { status: 303, headers: { Location: `/?import=${q}` } });

export async function handleShareTarget(request: Request, cacheStorage: CacheStorage = caches): Promise<Response> {
  let files: File[];
  try {
    files = (await request.formData()).getAll('file').filter((v): v is File => typeof v !== 'string');
  } catch {
    return back('failed'); // formData() holds the whole body in memory: large ZIPs can fail here
  }
  if (!files.length) return back('failed');
  const saved: string[] = [];
  let cache: Cache | undefined;
  try {
    cache = await cacheStorage.open(SHARE_CACHE);
    const now = Date.now();
    for (const [i, f] of files.entries()) {
      const key = `/__share/${now}-${i}`;
      await cache.put(key, new Response(f, { headers: { 'Content-Type': f.type || 'application/octet-stream', 'X-File-Name': encodeURIComponent(f.name) } }));
      saved.push(key);
    }
  } catch {
    await Promise.all(saved.map((k) => cache?.delete(k).catch(() => false)));
    return back('failed');
  }
  return back('pending');
}
