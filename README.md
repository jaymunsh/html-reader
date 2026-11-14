<p align="center">
  <img src="public/__app/icons/icon.svg" width="112" height="112" alt="HTML Reader icon">
</p>

<h1 align="center">HTML Reader</h1>

<p align="center">An offline PWA that reads zipped HTML documents exactly as a browser would render them</p>

<p align="center"><a href="https://html-reader-kohl.vercel.app"><b>Open the app →</b></a></p>

<p align="center"><b>English</b> · <a href="README.ko.md">한국어</a></p>

---

HTML Reader opens ZIP bundles of HTML documents (internal docs, reports, offline web course material, HTML you built yourself) on desktop (macOS, Windows) and mobile (iOS, Android), and runs them the way a normal browser would. It works on whole directories, not single files: links between pages and relative JS, CSS, JSON, fonts, images and media all resolve. After the first visit it works fully offline. Built with Svelte 5 + Vite, a Service Worker and IndexedDB.

## Features

- **Runs as authored**: links between pages, JSON loaded with `fetch()`, ES modules, CSS `url()` and `@font-face`, root-absolute paths (`/css/a.css`) and EUC-KR documents all work.
- **Pick up where you left off**: reading progress is saved per page, and each book reopens at your last position.
- **Find your way**: a file-tree panel, a fast-scroll handle, and full-text search across the whole book.
- **Comfortable reading**: bookmarks, text size, light and dark app themes, keyboard shortcuts on desktop.
- **Library**: re-import a revised version in place, rename books, search and sort the library.
- **Open directly**: the installed app opens `.zip`/`.html` files on desktop (file handlers) and accepts shared files on Android (share target).
- **Offline and local only**: documents never leave the device; nothing is uploaded to a server.
- **Screen space**: on mobile the document takes the whole screen until you tap; on desktop (768px and wider) the top bar and file panel stay visible (`T` collapses the panel). On iOS 26 the status-bar area is painted with the app background so the document never shows through it.

## Development

| Purpose | Command |
|---|---|
| Unit tests | `npm test` (= `vitest run`); one file: `npx vitest run tests/unit/<name>.test.ts` |
| Type check | `npm run check` (= `svelte-check && tsc --noEmit`) |
| Build | `npm run build` (agent → app); `npm run build:v2` (second build for the update test) |
| Test fixtures | `npm run fixtures` (= `node scripts/make-fixtures.ts`, Node 26 type stripping) |
| E2E | `npm run e2e` (= `playwright test`); one spec: `npx playwright test tests/e2e/<name>.spec.ts --project=chromium` |
| Bundle budget | `npm run size` (= `node scripts/check-size.mjs`) |
| App icons | `node scripts/make-icons.mjs` (renders the PNGs from `public/__app/icons/icon.svg`) |

E2E always runs against the production build served by `tests/server/static-server.mjs` (never the dev server), which mirrors the rewrites in `vercel.json`.

Playwright projects: `chromium` (Desktop Chrome), `webkit` (Desktop Safari), `mobile-chromium` (Pixel 7), `mobile-webkit` (iPhone 15) and `update` (Chromium, port 4174, serial). Specs named `*.desktop.*` run only on the two desktop projects, `*.mobile.*` only on the two mobile projects, and everything else on all four.

## Deployment

Static deployment on Vercel. `npm run build` produces `dist/`, which is what gets deployed. Service Workers and PWA install require HTTPS (localhost excepted).

`vercel.json`:
- Rewrite `/book/:path*` → `/__app/no-sw.html`: a fallback notice for document URLs opened before the Service Worker controls the page.
- Rewrite `/(.*)` → `/index.html`: every other path goes to the app shell.
- Headers: `Cache-Control: no-cache` on `/sw.js` and `/index.html`, so browsers always recheck the Service Worker and app shell after a new deploy.

## Known limitations

Out of scope:
- No sync between devices. Books and progress are stored on each device only.
- No export or import of progress and bookmarks.
- No folder picking or loading from a URL. Imports accept ZIP files and single HTML files only.
- No forced dark mode for documents, no highlighting.
- No detection or substitution for documents that reference installed fonts by name only.
- No static reference check at import time. Missing resources are reported from real requests while reading.
- ZIP file-name encodings: UTF-8 and CP949 only (no Shift-JIS and the like). Encrypted ZIPs and Deflate64 are not supported.
- Hash-routed SPA documents are tracked as one page per HTML file, not per screen.
- No native wrapper (Capacitor/Tauri) and no app-store distribution.
- No full security isolation between documents (see below).

Accepted trade-offs:
- Video is supported at the "it plays" level. Range requests work (multi-range requests get the first range only), but large videos are not optimized; videos of several hundred MB can be slow or fail on iOS.
- The largest single entry (for example a video of several hundred MB) is held in memory during import, so an import can run out of memory on iOS. The import is then rolled back and the cause is shown.
- Document JavaScript runs on the same origin as the app. The app installs guards only against documents breaking the reader by accident (Service Worker register/unregister, prefixed localStorage/sessionStorage, blocked access to the app's Cache Storage and IndexedDB). A malicious document can bypass them and read other documents' data, so only open documents you trust (the first import screen says so too). Cookies are not isolated and can be shared between documents.
- On iOS, Safari tabs and the home-screen app have separate storage.

## Real-device checklist

These cannot be verified by the automated tests.

- [ ] iOS Safari tab: on the library screen the top bar is the app background color (#EEF0F4 / dark #101216) and content never shows through it while scrolling
- [ ] iOS Safari tab: on the reader screen the top bar is white (black in dark mode) and document content never shows under the status bar
- [ ] iOS home-screen app: the two items above hold, and the status-bar text (clock) is visible in both light and dark
- [ ] iOS home-screen app: the home indicator overlays the document with no extra margin strip
- [ ] In an iOS Safari tab, tapping Import shows the add-to-home-screen notice first
- [ ] iOS: books imported in a Safari tab do not appear in the home-screen app (separate storage, expected)
- [ ] iOS and Android: pinch zoom works on documents
- [ ] iOS and Android: video in a document plays and can seek
- [ ] With airplane mode on, reopening the app still lets you read books
- [ ] Android (installed app): sharing a ZIP from a file manager and choosing HTML Reader imports it (at least two file managers)
- [ ] Android (installed app): when a large ZIP share fails, the "앱에서 직접 가져오기를 이용하세요" (use Import in the app) notice appears
- [ ] Windows/macOS Chrome or Edge (installed app): opening a .zip/.html file with "Open with → HTML Reader" imports it
- [ ] After deploying a new version: nothing changes while reading, and the update applies on returning to the library
