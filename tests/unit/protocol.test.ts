import { expect, test } from 'vitest';
import { parseAgentMessage, parseShellMessage, PROTOCOL_VERSION, wrap } from '../../src/lib/protocol';

test('wrap', () => expect(wrap({ type: 'tap' })).toEqual({ app: 'html-reader', protocolVersion: PROTOCOL_VERSION, type: 'tap' }));
test('유효한 agent 메시지', () => {
  for (const m of [{ type: 'ready', path: 'a/b.html', title: 'T' }, { type: 'scroll', pct: 62.5, ratio: 0.5 }, { type: 'tap' },
    { type: 'key', key: 'b', mods: { ctrl: false, meta: false, alt: false, shift: false } }, { type: 'open-external', url: 'https://x.test/' }] as const)
    expect(parseAgentMessage(wrap(m))).toEqual({ ok: true, msg: m });
});
test('문서가 보낸 남의 메시지', () => {
  for (const d of [null, 'hi', 42, { type: 'ready' }, { app: 'other', protocolVersion: 1, type: 'tap' }]) expect(parseAgentMessage(d)).toEqual({ ok: false, reason: 'foreign' });
});
test('버전 불일치', () => expect(parseAgentMessage({ ...wrap({ type: 'tap' }), protocolVersion: 99 })).toEqual({ ok: false, reason: 'version' }));
test('protocolVersion이 없는 메시지는 버전 불일치가 아니라 무시(foreign)', () => {
  expect(parseAgentMessage({ app: 'html-reader', type: 'tap' })).toEqual({ ok: false, reason: 'foreign' });
  expect(parseShellMessage({ app: 'html-reader', type: 'scroll-to', ratio: 0.5 })).toEqual({ ok: false, reason: 'foreign' });
});
test('형식 오류', () => {
  const bad = [{ type: 'ready', path: 1, title: 'T' }, { type: 'scroll', pct: 101, ratio: 0.5 }, { type: 'scroll', pct: 50, ratio: NaN },
    { type: 'scroll', pct: 50, ratio: 1.2 }, { type: 'key', key: 'b' }, { type: 'open-external', url: 'javascript:alert(1)' }, { type: 'nope' }];
  for (const m of bad) expect(parseAgentMessage({ app: 'html-reader', protocolVersion: PROTOCOL_VERSION, ...m })).toEqual({ ok: false, reason: 'invalid' });
});
test('셸 메시지', () => {
  for (const m of [{ type: 'init', textScale: 1.25 }, { type: 'init', textScale: 1, restore: { scrollRatio: 0.4 } },
    { type: 'init', textScale: 1, restore: { find: { query: '알파카', snippet: '문장 알파카 입니다' } } }, { type: 'init', textScale: 1, restore: { bookmark: { scrollRatio: 0.9 } } },
    { type: 'scroll-to', ratio: 0 }, { type: 'set-scale', textScale: 2 }, { type: 'find', query: 'q', snippet: 's' }] as const)
    expect(parseShellMessage(wrap(m))).toEqual({ ok: true, msg: m });
  expect(parseShellMessage(wrap({ type: 'init', textScale: 9 } as any))).toEqual({ ok: false, reason: 'invalid' });   // 0.5–3 범위 밖
  expect(parseShellMessage(wrap({ type: 'scroll-to', ratio: 2 } as any))).toEqual({ ok: false, reason: 'invalid' });
});
