import {
  buildPathIndex, cacheKey, isIgnoredMissing, normalizeBookPath, resolveInBook, type PathIndex,
} from '../lib/path';
import { isHtmlMime, isMediaMime } from '../lib/mime';
import { agentTag, planInjection, SCAN_BYTES } from '../lib/inject';
import { rangeResponse } from '../lib/range';
import { getBook, getBookFiles, recordIssue } from '../lib/storage';
import type { Route } from './route';

export const NOT_IN_BUNDLE_HTML =
  '<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
  '<title>묶음에 없음</title></head><body style="font-family:system-ui,sans-serif;padding:2rem;color:#333">' +
  '<h1 style="font-size:1.1rem">이 페이지는 묶음에 없습니다</h1>' +
  '<p>가져온 파일 안에 이 주소의 파일이 없습니다.</p></body></html>';

// 캐시일 뿐이다. 진실은 IndexedDB이며 SW가 재시작되면 비워진다.
const indexMemo = new Map<string, PathIndex>();

export function invalidateBook(id: string): void {
  const prefix = `book-${id}-`;
  for (const k of [...indexMemo.keys()]) if (k.startsWith(prefix)) indexMemo.delete(k);
}

/** Location for a directory redirect, always inside the book (never the origin root). */
export function dirRedirectLocation(bookId: string, to: string, search = ''): string {
  const segs = to.split('/').filter((s) => s !== '');
  const enc = segs.map((s) => encodeURIComponent(s)).join('/');
  return `/book/${bookId}/${enc}${segs.length ? '/' : ''}${search}`;
}

const html404 = () =>
  new Response(NOT_IN_BUNDLE_HTML, { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
const notFound = (nav: boolean) => (nav ? html404() : new Response(null, { status: 404 }));

async function indexFor(bookId: string, cacheName: string): Promise<PathIndex | null> {
  const hit = indexMemo.get(cacheName);
  if (hit) return hit;
  const files = await getBookFiles(bookId);
  if (!files) return null;
  const idx = buildPathIndex(files.paths);
  indexMemo.set(cacheName, idx);
  return idx;
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

type WaitUntil = (p: Promise<unknown>) => void;

/** Never rejects: storage failures become a 503 so respondWith does not produce a network error. */
export async function serveBookFile(
  route: Extract<Route, { kind: 'book-file' }>,
  request: Request,
  waitUntil?: WaitUntil,
): Promise<Response> {
  try {
    return await serveInner(route, request, waitUntil);
  } catch {
    return new Response('서비스 워커가 저장소를 읽지 못했습니다.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
}

async function serveInner(
  route: Extract<Route, { kind: 'book-file' }>,
  request: Request,
  waitUntil?: WaitUntil,
): Promise<Response> {
  const { bookId, rest, ctxBookId } = route;
  // Recording must not delay the response; the SW stays alive for it via waitUntil.
  const record = (id: string, path: string, kind: Parameters<typeof recordIssue>[2]) => {
    const p = recordIssue(id, path, kind).catch(() => {});
    if (waitUntil) waitUntil(p);
  };
  const nav = request.mode === 'navigate';
  const url = new URL(request.url);

  const book = await getBook(bookId);
  if (!book) {
    if (ctxBookId && ctxBookId !== bookId) {
      record(ctxBookId, '../' + bookId + (rest ? '/' + safeDecode(rest) : ''), 'outside-root');
    }
    return notFound(nav);
  }

  const norm = normalizeBookPath(rest);
  if (!norm.ok) {
    record(bookId, safeDecode(rest), 'outside-root');
    return notFound(nav);
  }

  const missing = (path: string) => {
    if (!isIgnoredMissing(path)) record(bookId, path, 'missing');
    return notFound(nav);
  };

  const index = await indexFor(bookId, book.cacheName);
  if (!index) return missing(norm.path);
  const res = resolveInBook(index, norm.path, norm.dir);
  if (res.kind === 'redirect-dir') {
    return Response.redirect(new URL(dirRedirectLocation(bookId, res.to, url.search), url.origin).href, 301);
  }
  if (res.kind === 'missing') return missing(norm.path);

  const cache = await caches.open(book.cacheName);
  const cached = await cache.match(cacheKey(bookId, res.path));
  if (!cached) return missing(res.path);

  const type = cached.headers.get('Content-Type') ?? 'application/octet-stream';
  const range = request.headers.get('Range');
  if (range) return rangeResponse(await cached.blob(), type, range);

  if (nav && isHtmlMime(type)) {
    const blob = await cached.blob();
    const head = new Uint8Array(await blob.slice(0, SCAN_BYTES).arrayBuffer());
    const { encoding } = planInjection(head);
    const tag = agentTag(bookId, book.textScale, encoding);
    const { offset } = planInjection(head, tag.length);
    const out = new Blob([blob.slice(0, offset), tag as BlobPart, blob.slice(offset)], { type });
    return new Response(out, {
      status: 200,
      headers: { 'Content-Type': type, 'Content-Length': String(out.size) },
    });
  }

  if (isMediaMime(type)) {
    const headers = new Headers(cached.headers);
    headers.set('Accept-Ranges', 'bytes');
    return new Response(cached.body, { status: cached.status, headers });
  }
  return cached;
}
