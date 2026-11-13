import type { Mods } from './protocol';

export type Action = 'toggle-overlay' | 'toggle-panel' | 'search' | 'bookmark' | 'prev-page' | 'next-page' | 'top' | 'bottom' | 'zoom-in' | 'zoom-out';

const MAP: Record<string, Action> = {
  t: 'toggle-panel', '/': 'search', b: 'bookmark', '[': 'prev-page', ']': 'next-page',
  home: 'top', end: 'bottom', '+': 'zoom-in', '=': 'zoom-in', '-': 'zoom-out',
};

/** Spec §6.2 PC shortcuts. Ctrl/⌘/Alt combos are never ours (browser zoom, find). Space is the mobile layout's overlay toggle. */
export function shortcutFor(key: string, mods: Mods, ctx: { desktop: boolean }): Action | null {
  if (mods.ctrl || mods.meta || mods.alt) return null;
  if (key === ' ') return ctx.desktop ? null : 'toggle-overlay';
  return MAP[key.toLowerCase()] ?? null;
}

/** input, textarea, select, or (inherited) contenteditable. Shared by the shell and the agent. */
export function isEditableTarget(el: Element | null): boolean {
  if (!el) return false;
  return /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || !!(el as HTMLElement).isContentEditable;
}
