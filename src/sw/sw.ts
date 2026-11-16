/// <reference lib="webworker" />
import { precache, matchPrecache, cleanupOutdatedCaches } from 'workbox-precaching';
import { getSetting, recordIssue, setSetting } from '../lib/storage';
import { pickContext } from './context';
import { decideRoute } from './route';
import { invalidateBook, serveBookFile } from './serve';
import { splitBookUrl } from '../lib/path';
import { handleShareTarget } from './share';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<string | { url: string; revision: string | null }> };

// 빌드마다 SW 바이트가 달라지도록 빌드 태그를 SW에 포함한다(업데이트 테스트용).
const BUILD_TAG: string = __BUILD_TAG__;

precache(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// install에서 skipWaiting을 부르지 않는다(사용자가 갱신을 수락할 때만 skip-waiting 메시지).
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

// 메모는 캐시일 뿐이다. 진실은 IndexedDB의 settings.activeBookId.
let activeMemo: string | null = null;

self.addEventListener('message', (e) => {
  const d = e.data;
  if (d?.type === 'get-build-tag') e.source?.postMessage({ type: 'build-tag', tag: BUILD_TAG });
  else if (d?.type === 'active-book') {
    activeMemo = d.id ?? null;
    e.waitUntil(setSetting('activeBookId', activeMemo).catch(() => {}));
  } else if (d?.type === 'book-changed') invalidateBook(d.id);
  else if (d?.type === 'skip-waiting') void self.skipWaiting();
});

function samePathname(href: string | null | undefined): string | null {
  if (!href) return null;
  try {
    const u = new URL(href);
    return (u.protocol === 'http:' || u.protocol === 'https:') && u.origin === self.location.origin ? u.pathname : null;
  } catch {
    return null;
  }
}

async function pickBookId(event: FetchEvent): Promise<string | null> {
  const request = event.request;
  const url = new URL(request.url);
  const isNavigation = request.mode === 'navigate';

  let client: WindowClient | Client | undefined;
  if (!isNavigation && event.clientId) client = await self.clients.get(event.clientId);
  const picked = pickContext({
    isNavigation,
    destination: request.destination,
    targetPathname: url.pathname,
    targetSameOrigin: url.origin === self.location.origin,
    referrerPathname: samePathname(request.referrer),
    client: client
      ? {
          pathname: samePathname(client.url),
          frameType: (client as WindowClient).frameType ?? null,
          type: client.type,
        }
      : null,
  });
  if (!picked.useFallback) return picked.bookId;
  if (activeMemo) return activeMemo;
  const stored = await getSetting('activeBookId').catch(() => null);
  activeMemo = stored; // memo of IndexedDB truth (spec 5.1)
  return stored;
}

/** Cross-origin requests are never intercepted; the browser fetches them itself. We only note them. */
async function recordExternalIfBookContext(event: FetchEvent): Promise<void> {
  const bookId = await pickBookId(event);
  if (!bookId) return;
  const url = new URL(event.request.url);
  await recordIssue(bookId, url.origin + url.pathname, 'external').catch(() => {});
}

async function handle(event: FetchEvent): Promise<Response> {
  const request = event.request;
  const url = new URL(request.url);
  const isNavigation = request.mode === 'navigate';
  // A subresource whose URL already names its book needs the client's context only if that book is missing
  // (serveBookFile asks for it then), so the per-request clients.get is skipped.
  const lazyCtx = !isNavigation && url.origin === self.location.origin && splitBookUrl(url.pathname) !== null;
  const ctxBookId = lazyCtx ? null : await pickBookId(event);

  const route = decideRoute({
    url, selfOrigin: self.location.origin, method: request.method, isNavigation,
    destination: request.destination, ctxBookId,
  });

  switch (route.kind) {
    case 'share-target':
      return request.method === 'POST' ? handleShareTarget(request) : Response.redirect(new URL('/', url.origin).href, 302);
    case 'reader-asset':
    case 'app-asset':
      return (await matchPrecache(url.pathname)) ?? fetch(request);
    case 'app-shell':
      return (await matchPrecache('/index.html')) ?? fetch(request);
    case 'top-redirect':
      return Response.redirect(new URL(route.to, url.origin).href, 302);
    case 'book-redirect':
      return Response.redirect(new URL(route.to, url.origin).href, 302);
    case 'book-file':
      return serveBookFile(route, request, (p) => event.waitUntil(p), lazyCtx ? () => pickBookId(event) : undefined);
    case 'external': // cross-origin never reaches here (handled before respondWith)
    case 'passthrough':
      return fetch(request);
  }
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) {
    event.waitUntil(recordExternalIfBookContext(event));
    return; // no respondWith: default browser handling
  }
  event.respondWith(handle(event));
});
