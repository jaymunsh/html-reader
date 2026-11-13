import { precacheAndRoute } from 'workbox-precaching';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<string | { url: string; revision: string | null }> };

// 빌드마다 SW 바이트가 달라지도록 빌드 태그를 SW에 포함한다(업데이트 테스트용).
const BUILD_TAG: string = __BUILD_TAG__;

precacheAndRoute(self.__WB_MANIFEST);

self.addEventListener('message', (e) => {
  if (e.data?.type === 'get-build-tag') e.source?.postMessage({ type: 'build-tag', tag: BUILD_TAG });
});

self.addEventListener('activate', (e) => {
  e.waitUntil(self.clients.claim());
});
