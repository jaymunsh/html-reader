import type { AgentMsg } from '../lib/protocol';
import { isEditableTarget } from '../lib/shortcuts';

// Forward keys the document left alone to the shell (spec §6.2). Bubble phase on window, so the document's own handlers run first.
// Never calls preventDefault.
export function installKeys(send: (m: AgentMsg) => void): void {
  window.addEventListener('keydown', (e) => {
    if (e.defaultPrevented || e.isComposing || isEditableTarget(e.target as Element | null)) return;
    send({ type: 'key', key: e.key, mods: { ctrl: e.ctrlKey, meta: e.metaKey, alt: e.altKey, shift: e.shiftKey } });
  });
}
