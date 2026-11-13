/// <reference lib="webworker" />
import { precache, matchPrecache, cleanupOutdatedCaches } from 'workbox-precaching';
import { getSetting, recordIssue, setSetting } from '../lib/storage';
import { pickContext } from './context';
import { decideRoute } from './route';
import { invalidateBook, serveBookFile } from './serve';

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

async function handle(event: FetchEvent): Promise<Response | undefined> {
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
  let ctxBookId = picked.bookId;
  if (picked.useFallback) ctxBookId = activeMemo ?? (await getSetting('activeBookId').catch(() => null));

  const route = decideRoute({
    url, selfOrigin: self.location.origin, method: request.method, isNavigation,
    destination: request.destination, ctxBookId,
  });

  switch (route.kind) {
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
      return serveBookFile(route, request);
    case 'external':
      event.waitUntil(recordIssue(route.bookId, url.origin + url.pathname, 'external').catch(() => {}));
      return fetch(request);
    case 'passthrough':
      return undefined;
  }
}

self.addEventListener('fetch', (event) => {
  // respondWith는 동기적으로 호출해야 하므로, passthrough 여부는 맥락 판정 전에 알 수 없다.
  // 교차 출처이고 맥락이 없는 요청은 handle이 undefined를 돌려주고 네트워크로 보낸다.
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin && event.request.mode === 'navigate') return;
  event.respondWith(handle(event).then((r) => r ?? fetch(event.request)));
});
