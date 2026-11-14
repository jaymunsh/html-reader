import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { VitePWA } from 'vite-plugin-pwa';

const define = { __BUILD_TAG__: JSON.stringify(process.env.VITE_BUILD_TAG ?? 'dev') };

export default defineConfig({
  define,
  plugins: [
    svelte(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src/sw',
      filename: 'sw.ts', // → dist/sw.js
      includeManifestIcons: false, // glob이 이미 아이콘을 프리캐시에 넣는다(중복 항목 → SW 평가 실패)
      injectRegister: false,// 등록은 src/ui/sw-client.ts가 직접 한다
      manifestFilename: '__app/manifest.webmanifest',
      injectManifest: {
        rollupFormat: 'iife',
        globPatterns: ['index.html', '__app/**/*.{js,css,woff2,png,svg,html}', '__reader/agent.js'],
      },
      manifest: {
        name: 'HTML Reader', short_name: 'HTML Reader', lang: 'ko',
        display: 'standalone', start_url: '/', scope: '/',
        theme_color: '#EEF0F4', background_color: '#EEF0F4',
        icons: [
          { src: '/__app/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/__app/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
        file_handlers: [{ action: '/', accept: { 'application/zip': ['.zip'], 'text/html': ['.html', '.htm'] } }],
        launch_handler: { client_mode: ['focus-existing', 'auto'] },
        share_target: {
          action: '/__app/share-target', method: 'POST', enctype: 'multipart/form-data',
          params: { files: [{ name: 'file', accept: ['application/zip', 'application/x-zip-compressed', 'application/octet-stream', '.zip', 'text/html', '.html'] }] },
        },
      },
    }),
  ],
  build: { assetsDir: '__app', target: 'es2022' },
  worker: { format: 'es' },
  test: { include: ['tests/unit/**/*.test.ts'], environment: 'node' },
});
