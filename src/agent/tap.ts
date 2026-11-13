import type { AgentMsg } from '../lib/protocol';

const INTERACTIVE = 'a,button,input,select,textarea,label,summary,video,audio,iframe,[role=button],[role=link],[role=tab],[role=menuitem],[role=checkbox],[contenteditable],[onclick],[tabindex]';
const MAX_MOVE = 10, MAX_MS = 300;

type Pt = { x: number; y: number; t: number };

// Tap rules (spec §6.3). Capture phase only records; the decision is made on the click that reaches window's bubble phase,
// so anything the document stops or prevents is not a tap. Never calls preventDefault.
export function installTap(send: (m: AgentMsg) => void): void {
  let down: (Pt & { id: number; clean: boolean }) | null = null;
  let up: Pt | null = null;
  const pt = (e: PointerEvent): Pt => ({ x: e.clientX, y: e.clientY, t: e.timeStamp });
  const opts: AddEventListenerOptions = { capture: true, passive: true };
  const on = (type: string, fn: (e: PointerEvent) => void) => addEventListener(type, fn as EventListener, opts);

  on('pointerdown', (e) => {
    // A second pointer, a non-primary button or an existing selection spoils the gesture (the selection is gone by click time).
    const busy = down && !up; // another pointer still down (a finished gesture without click leaves stale state)
    const clean = !busy && e.isPrimary && e.button === 0 && !(getSelection()?.toString());
    down = busy ? { ...down!, clean: false } : { ...pt(e), id: e.pointerId, clean };
    up = null;
  });
  on('pointerup', (e) => { if (down && e.pointerId === down.id) up = pt(e); });
  on('pointercancel', () => { down = up = null; });

  addEventListener('click', (e) => {
    const d = down, u = up;
    down = up = null;
    if (!d || !u || !d.clean || e.defaultPrevented) return;
    if (Math.hypot(u.x - d.x, u.y - d.y) > MAX_MOVE || u.t - d.t > MAX_MS) return;
    const target = e.target as Element | null;
    if (!target?.closest || target.closest(INTERACTIVE) || getComputedStyle(target).cursor === 'pointer') return;
    send({ type: 'tap' });
  }, { passive: true });
}
