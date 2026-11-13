/// <reference lib="webworker" />
import { precache, matchPrecache } from 'workbox-precaching';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<string | { url: string; revision: string | null }> };

// 빌드마다 SW 바이트가 달라지도록 빌드 태그를 SW에 포함한다(업데이트 테스트용).
const BUILD_TAG: string = __BUILD_TAG__;

precache(self.__WB_MANIFEST);
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

let activeBook: string | null = null; // 스파이크 전용. 정식 구현은 IndexedDB(Task 16)
const navLog: { destination: string; mode: string; url: string }[] = [];
self.addEventListener('message', (e) => {
  if (e.data?.type === 'get-build-tag') e.source?.postMessage({ type: 'build-tag', tag: BUILD_TAG });
  if (e.data?.type === 'active-book') activeBook = e.data.id;
  if (e.data?.type === 'gate-log') e.ports[0].postMessage(navLog);
});

const bookOf = (pathname: string) => /^\/book\/([^/]+)\//.exec(pathname)?.[1] ?? null;

async function context(event: FetchEvent): Promise<string | null> {
  const req = event.request, url = new URL(req.url);
  if (req.mode === 'navigate') {
    if (req.destination === 'document') return null;
    return bookOf(url.pathname) ?? (req.referrer ? bookOf(new URL(req.referrer).pathname) : null) ?? activeBook;
  }
  const client = event.clientId ? await self.clients.get(event.clientId) : undefined;
  if (!client) return activeBook;
  const fromUrl = bookOf(new URL(client.url).pathname);
  if (fromUrl) return fromUrl;
  return (client as WindowClient).frameType === 'top-level' ? null : activeBook;
}

async function serve(pathname: string): Promise<Response> {
  const hit = await caches.match(pathname, { cacheName: 'book-gate-v1' });
  return hit ?? new Response('not found', { status: 404 });
}

self.addEventListener('fetch', (event) => {
  const req = event.request, url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (req.mode === 'navigate') navLog.push({ destination: req.destination, mode: req.mode, url: url.pathname });
  event.respondWith((async () => {
    if (url.pathname.startsWith('/__reader/')) return (await matchPrecache(url.pathname)) ?? fetch(req);
    if (req.mode === 'navigate' && req.destination === 'document') {
      const id = bookOf(url.pathname);
      if (id) {
        const path = url.pathname.slice(`/book/${id}/`.length);
        return Response.redirect(`/?${new URLSearchParams({ open: id, path })}`, 302);
      }
      return (await matchPrecache('/index.html')) ?? fetch(req);
    }
    const ctx = await context(event);
    if (ctx && !url.pathname.startsWith('/book/')) {
      if (req.mode === 'navigate') return Response.redirect(`/book/${ctx}${url.pathname}${url.search}`, 302);
      return serve(`/book/${ctx}${url.pathname}`);
    }
    if (url.pathname.startsWith('/book/')) return serve(url.pathname);
    return (await matchPrecache(url.pathname === '/' ? '/index.html' : url.pathname)) ?? fetch(req);
  })());
});
