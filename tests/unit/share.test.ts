// Node의 Request/FormData/Response로 검증, CacheStorage는 메모리 모의
import { expect, test } from 'vitest';
import { handleShareTarget, SHARE_CACHE } from '../../src/sw/share';
import { takePendingShare } from '../../src/lib/launch';

function fakeCaches() {
  const store = new Map<string, Response>();
  const cache = {
    put: async (k: string, r: Response) => { store.set(k, r); },
    keys: async () => [...store.keys()].map((k) => ({ url: 'https://app.test' + k })),   // 삽입 순서 (P4-K15)
    match: async (k: any) => store.get(typeof k === 'string' ? k : new URL(k.url).pathname)?.clone(),
    delete: async (k: any) => store.delete(typeof k === 'string' ? k : new URL(k.url).pathname),
  };
  const api = {
    has: async (n: string) => n === SHARE_CACHE,
    open: async (n: string) => { expect(n).toBe(SHARE_CACHE); return cache; },
  } as any;
  return { api, store };
}
const post = (body: BodyInit, headers?: HeadersInit) => new Request('https://app.test/__app/share-target', { method: 'POST', body, headers });

test('파일을 inbox에 넣고 303 /?import=pending', async () => {
  const { api, store } = fakeCaches();
  const fd = new FormData();
  fd.append('file', new File(['PK\x03\x04zip'], '분기 보고서.zip', { type: 'application/x-zip-compressed' }));
  const res = await handleShareTarget(post(fd), api);
  expect([res.status, res.headers.get('Location')]).toEqual([303, '/?import=pending']);
  expect(store.size).toBe(1);
});

test('이름 없는 HTML은 shared-<n>.html, 가져온 뒤 done()이 inbox를 비운다 (Review Focus 3, 4)', async () => {
  const { api, store } = fakeCaches();
  // Node는 이름이 빈 File을 FormData에서 문자열로 바꾸므로 본문을 손으로 만든다 (P4-K7).
  const part = (name: string, type: string, body: string) =>
    `--b\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: ${type}\r\n\r\n${body}\r\n`;
  const raw = part('분기 보고서.zip', 'application/x-zip-compressed', 'PK\x03\x04zip') + part('', 'application/octet-stream', '<!doctype html><p>x') + '--b--\r\n';
  const res = await handleShareTarget(post(raw, { 'Content-Type': 'multipart/form-data; boundary=b' }), api);
  expect(res.headers.get('Location')).toBe('/?import=pending');
  expect(store.size).toBe(2);
  const { files, done } = await takePendingShare(api);
  expect(files.map((f) => f.name)).toEqual(['분기 보고서.zip', 'shared-2.html']);
  expect(await files[0].text()).toBe('PK\x03\x04zip');
  expect(store.size).toBe(2);                                                          // 가져오기 전에는 지우지 않는다 (P4-K10)
  await done();
  expect(store.size).toBe(0);
  expect((await takePendingShare(api)).files).toEqual([]);                             // 두 번 가져오지 않는다
});

test('이름이 있어도 확장자 없는 HTML은 .html을 붙이고, ZIP은 이름 그대로', async () => {
  const { api, store } = fakeCaches();
  const put = (n: string, type: string, body: string) => store.set(`/__share/1-${store.size}`, new Response(body, { headers: { 'Content-Type': type, 'X-File-Name': encodeURIComponent(n) } }));
  put('report', 'text/html', '<p>x');
  put('note', 'application/octet-stream', '﻿  <HTML><body>');
  put('archive', 'application/octet-stream', 'PK\x03\x04');
  put('memo.pdf', 'application/pdf', '%PDF');
  expect((await takePendingShare(api)).files.map((f) => f.name)).toEqual(['report.html', 'note.html', 'archive', 'memo.pdf']);
});

test('inbox 캐시가 없거나 caches가 없으면 아무것도 하지 않는다 (P4-K17)', async () => {
  let opened = false;
  const api = { has: async () => false, open: async () => { opened = true; } } as any;
  expect((await takePendingShare(api)).files).toEqual([]);
  expect(opened).toBe(false);
  expect((await takePendingShare(undefined)).files).toEqual([]);
});

test('본문을 읽지 못하거나 파일이 없으면 303 /?import=failed', async () => {
  const { api, store } = fakeCaches();
  const bad = post('not multipart', { 'Content-Type': 'multipart/form-data; boundary=x' });
  expect((await handleShareTarget(bad, api)).headers.get('Location')).toBe('/?import=failed');
  expect((await handleShareTarget(post(new FormData()), api)).headers.get('Location')).toBe('/?import=failed');
  expect(store.size).toBe(0);
});

test('cache.put이 실패하면 저장한 것을 지우고 /?import=failed', async () => {
  const { api, store } = fakeCaches();
  const cache = await api.open(SHARE_CACHE);
  let n = 0;
  const put = cache.put;
  cache.put = async (k: string, r: Response) => { if (n++) throw new Error('quota'); await put(k, r); };
  const fd = new FormData();
  fd.append('file', new File(['a'], 'a.html')); fd.append('file', new File(['b'], 'b.html'));
  const res = await handleShareTarget(post(fd), api);
  expect([res.status, res.headers.get('Location')]).toEqual([303, '/?import=failed']);
  expect(store.size).toBe(0);
});
