import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { LOAD_GRACE_MS, READY_TIMEOUT_MS, createSession, pendingRestore, type SessionHooks } from '../../src/ui/reader/session';
import { APP_TAG, PROTOCOL_VERSION } from '../../src/lib/protocol';

const ORIGIN = 'https://reader.test';
const msgs: Record<string, ((e: any) => void)[]> = {};
const store = new Map<string, string>();

function makeIframe(pathname = '/book/b1/index.html') {
  const loads: (() => void)[] = [];
  const win = { postMessage: vi.fn(), location: { pathname } };
  const iframe = {
    contentWindow: win, src: '',
    addEventListener: (_: string, f: () => void) => loads.push(f),
    removeEventListener: (_: string, f: () => void) => { loads.splice(loads.indexOf(f), 1); },
  };
  return { iframe: iframe as unknown as HTMLIFrameElement, win, load: () => loads.forEach((f) => f()) };
}
function makeHooks() {
  const states: string[] = [];
  const h = {
    onState: vi.fn((s: string) => { states.push(s); }), onPage: vi.fn(), onScroll: vi.fn(), onTap: vi.fn(), onKey: vi.fn(),
    onExternal: vi.fn(), getInit: vi.fn(() => ({ textScale: 1, restore: { scrollRatio: 0.4 } })), onNoSw: vi.fn(),
  };
  return { h: h as unknown as SessionHooks & typeof h, states };
}
const agentMsg = (m: object, over: object = {}) => ({ app: APP_TAG, protocolVersion: PROTOCOL_VERSION, ...m, ...over });
const post = (source: unknown, data: unknown, origin = ORIGIN) => (msgs.message ?? []).forEach((f) => f({ origin, source, data }));

beforeEach(() => {
  vi.useFakeTimers();
  for (const k of Object.keys(msgs)) delete msgs[k];
  store.clear();
  vi.stubGlobal('location', { origin: ORIGIN });
  vi.stubGlobal('window', {
    addEventListener: (t: string, f: any) => { (msgs[t] ??= []).push(f); },
    removeEventListener: (t: string, f: any) => { msgs[t] = (msgs[t] ?? []).filter((x) => x !== f); },
  });
  vi.stubGlobal('sessionStorage', { setItem: (k: string, v: string) => store.set(k, v) });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

test('navigate -> pending; ready -> ready + init with restore + onPage', () => {
  const { iframe, win } = makeIframe(); const { h, states } = makeHooks();
  const s = createSession(iframe, 'b1', h);
  s.navigate('a b.html');
  expect(states).toEqual([]);
  expect((iframe as any).src).toContain('b1');
  post(win, agentMsg({ type: 'ready', path: 'index.html', title: 'T' }));
  expect(states).toEqual(['ready']);
  expect(h.getInit).toHaveBeenCalledWith('index.html');
  expect(win.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'init', textScale: 1, restore: { scrollRatio: 0.4 } }), ORIGIN);
  expect(h.onPage).toHaveBeenCalledWith('index.html', 'T');
  post(win, agentMsg({ type: 'scroll', pct: 50, ratio: 0.3 }));
  expect(h.onScroll).toHaveBeenCalledWith(50, 0.3);
  vi.advanceTimersByTime(READY_TIMEOUT_MS * 2);
  expect(states).toEqual(['ready']); // 3s timer cancelled
});

test('version mismatch -> limited + update-wanted', () => {
  const { iframe, win } = makeIframe(); const { h, states } = makeHooks();
  createSession(iframe, 'b1', h).navigate('index.html');
  post(win, agentMsg({ type: 'ready', path: 'index.html', title: 'T' }, { protocolVersion: PROTOCOL_VERSION + 1 }));
  expect(states).toEqual(['limited']);
  expect(store.get('update-wanted')).toBe('1');
  expect(win.postMessage).not.toHaveBeenCalled();
});

test('foreign messages are ignored (no version, wrong source/origin)', () => {
  const { iframe, win } = makeIframe(); const { h, states } = makeHooks();
  createSession(iframe, 'b1', h).navigate('index.html');
  post(win, { type: 'ready', path: 'x', title: 'y' });                       // no app/version
  post(win, agentMsg({ type: 'ready', path: 'x', title: 'y' }), 'https://evil.test');
  post({}, agentMsg({ type: 'ready', path: 'x', title: 'y' }));
  expect(states).toEqual([]);
  expect(store.has('update-wanted')).toBe(false);
  expect(h.onPage).not.toHaveBeenCalled();
});

test('no-sw message -> onNoSw', () => {
  const { iframe, win } = makeIframe(); const { h } = makeHooks();
  createSession(iframe, 'b1', h).navigate('index.html');
  post(win, { app: APP_TAG, type: 'no-sw' });
  expect(h.onNoSw).toHaveBeenCalled();
});

test('3s without ready -> limited', () => {
  const { iframe } = makeIframe(); const { h, states } = makeHooks();
  createSession(iframe, 'b1', h).navigate('index.html');
  vi.advanceTimersByTime(READY_TIMEOUT_MS - 1);
  expect(states).toEqual([]);
  vi.advanceTimersByTime(1);
  expect(states).toEqual(['limited']);
});

test('load before ready does not go limited; load without ready does (after grace)', () => {
  const { iframe, win, load } = makeIframe(); const { h, states } = makeHooks();
  createSession(iframe, 'b1', h).navigate('index.html');
  load();                                                                     // load beats ready
  post(win, agentMsg({ type: 'ready', path: 'index.html', title: 'T' }));
  vi.advanceTimersByTime(LOAD_GRACE_MS * 2);
  expect(states).toEqual(['ready']);

  load();                                                                     // ready came first: normal
  expect(states).toEqual(['ready']);
  load();                                                                     // next page, no agent
  vi.advanceTimersByTime(LOAD_GRACE_MS);
  expect(states).toEqual(['ready', 'limited']);
  expect(h.onPage).toHaveBeenLastCalledWith('index.html', null);
});

test('destroy removes listeners', () => {
  const { iframe, win } = makeIframe(); const { h, states } = makeHooks();
  const s = createSession(iframe, 'b1', h); s.navigate('index.html'); s.destroy();
  post(win, agentMsg({ type: 'ready', path: 'index.html', title: 'T' }));
  expect(states).toEqual([]);
});

test('pendingRestore: 같은 경로면 한 번 소비, 다른 경로면 비움, 이후엔 없음 (P3-K15)', () => {
  const p = pendingRestore();
  const r = { find: { query: 'q', snippet: 's q' } };
  p.set('a.html', r);
  expect(p.take('a.html')).toEqual(r);
  expect(p.take('a.html')).toBeUndefined();
  p.set('a.html', r);
  expect(p.take('b.html')).toBeUndefined(); // an in-document link went elsewhere
  expect(p.take('a.html')).toBeUndefined();
  p.set('a.html', r);
  p.set('c.html');                          // a plain navigation clears it
  expect(p.take('a.html')).toBeUndefined();
});

test('첫 이동은 src, 이후 쪽 이동은 location.replace(기록을 쌓지 않음), replace가 막히면 src', () => {
  const { iframe, win } = makeIframe(); const { h } = makeHooks();
  const replace = vi.fn();
  (win.location as any).replace = replace;
  const s = createSession(iframe, 'b1', h);
  s.navigate('index.html');
  expect((iframe as any).src).toBe('/book/b1/index.html');
  expect(replace).not.toHaveBeenCalled();
  expect(JSON.parse(store.get('hr-frame-history:b1')!)).toMatchObject({ p: 1 }); // a new entry of the book's own history
  s.navigate('sub/page 2.html');
  expect(replace).toHaveBeenCalledWith('/book/b1/sub/page%202.html');
  expect((iframe as any).src).toBe('/book/b1/index.html');
  replace.mockImplementation(() => { throw new Error('blocked'); });
  s.navigate('c.html');
  expect((iframe as any).src).toBe('/book/b1/c.html');
});
