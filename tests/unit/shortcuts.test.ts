import { expect, test } from 'vitest';
import { isEditableTarget, shortcutFor } from '../../src/lib/shortcuts';
const none = { ctrl: false, meta: false, alt: false, shift: false };
const k = (key: string, m: Partial<typeof none> = {}, desktop = true) => shortcutFor(key, { ...none, ...m }, { desktop });

test('기본 매핑', () => {
  expect([k('t'), k('T', { shift: true }), k('/'), k('b'), k('['), k(']'), k('Home'), k('End'), k('+', { shift: true }), k('='), k('-')])
    .toEqual(['toggle-panel', 'toggle-panel', 'search', 'bookmark', 'prev-page', 'next-page', 'top', 'bottom', 'zoom-in', 'zoom-in', 'zoom-out']);
});
test('Space는 모바일 레이아웃에서만', () => { expect(k(' ', {}, false)).toBe('toggle-overlay'); expect(k(' ', {}, true)).toBeNull(); });
test('수정자 키가 있으면 가로채지 않는다(브라우저 확대·찾기 보존)', () => {
  for (const m of [{ ctrl: true }, { meta: true }, { alt: true }]) for (const key of ['+', '-', '=', 'f', 'b', 't', '/']) expect(k(key, m)).toBeNull();
});
test('모르는 키', () => expect(k('x')).toBeNull());
test('isEditableTarget: 입력 요소와 contenteditable(상속 포함)', () => {
  const el = (tag: string, props: Record<string, unknown> = {}) => ({ tagName: tag, isContentEditable: false, ...props }) as unknown as Element;
  for (const t of ['INPUT', 'TEXTAREA', 'SELECT']) expect(isEditableTarget(el(t))).toBe(true);
  expect(isEditableTarget(el('P', { isContentEditable: true }))).toBe(true);
  expect(isEditableTarget(el('P'))).toBe(false);
  expect(isEditableTarget(null)).toBe(false);
});
