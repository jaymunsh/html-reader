<script lang="ts" module>
  // The last element focused outside any dialog: where focus returns once the dialogs are gone.
  let lastOutside: HTMLElement | null = null;
  // Whether the last input was the keyboard: only then does the returned focus show its ring.
  let kb = false;
  if (typeof document !== 'undefined') {
    document.addEventListener('keydown', () => { kb = true; }, true);
    document.addEventListener('pointerdown', () => { kb = false; }, true);
    document.addEventListener('focusin', (e) => {
      const t = e.target as HTMLElement;
      if (!t.closest?.('[role=dialog]')) lastOutside = t;
    });
  }
  let seq = 0;
</script>

<script lang="ts">
  import { onMount, tick, type Snippet } from 'svelte';
  import { layout } from '../layout.svelte';

  // Bottom sheet on mobile, centred card on PC. The caller makes the library inert while one is open.
  let { title, testid, oncancel, children }: { title: string; testid?: string; oncancel?: () => void; children: Snippet } = $props();
  let el: HTMLElement;
  const id = `dlg-${++seq}`;
  const back = lastOutside;

  onMount(() => {
    (el.querySelector<HTMLElement>('[data-autofocus]') ?? el.querySelector<HTMLElement>('button') ?? el).focus({ preventScroll: true });
    return () => void tick().then(() => {
      if (document.querySelector('[role=dialog]:not([inert])')) return; // the next dialog took focus (a closed Sheet is inert)
      (back?.isConnected ? back : document.querySelector<HTMLElement>('[data-testid=import-button]'))
        ?.focus({ preventScroll: true, focusVisible: kb } as FocusOptions);
    });
  });

  function onkeydown(e: KeyboardEvent) {
    if (e.key !== 'Escape' || !oncancel) return;
    e.preventDefault(); e.stopPropagation();
    oncancel();
  }
</script>

<div class="layer" class:desk={layout.desktop}>
  <div bind:this={el} class="dialog" role="dialog" aria-modal="true" aria-labelledby={id} tabindex="-1" data-testid={testid} {onkeydown}>
    <h2 {id}>{title}</h2>
    {@render children()}
  </div>
</div>

<style>
  .layer {
    position: fixed; inset: 0; z-index: var(--z-dialog); display: flex; align-items: flex-end; justify-content: center;
    background: var(--scrim); animation: fade .2s ease both;
  }
  .layer.desk { align-items: center; padding: 24px; }
  .dialog {
    box-sizing: border-box; width: 100%; max-height: 85vh; overflow-y: auto; overscroll-behavior: contain;
    padding: 24px 20px calc(16px + var(--sab)); background: var(--surface); color: var(--text);
    border-radius: var(--r-sheet) var(--r-sheet) 0 0; outline: none;
    animation: rise .28s cubic-bezier(.2, .8, .2, 1) both;
  }
  .desk .dialog { width: min(420px, 100%); padding: 24px; border-radius: var(--r-sheet); box-shadow: var(--shadow-card); animation-name: pop; animation-duration: .2s; }
  h2 { margin: 0 0 8px; font-size: 19px; font-weight: 700; line-height: 1.35; letter-spacing: -0.01em; }
  .dialog :global(p) { margin: 0 0 20px; font-size: 15px; line-height: 1.55; color: var(--text-2); overflow-wrap: anywhere; }
  .dialog :global(.actions) { display: flex; flex-direction: column; gap: 8px; }
  .desk .dialog :global(.actions) { flex-direction: row-reverse; }
  .dialog :global(button) {
    min-height: 48px; padding: 0 18px; border: 0; border-radius: var(--r-control); font: inherit; font-size: 16px; font-weight: 600;
    background: none; color: var(--accent); cursor: pointer;
  }
  .desk .dialog :global(button) { min-height: 44px; font-size: 15px; }
  .dialog :global(button:focus-visible) { outline: 2px solid var(--accent); outline-offset: 2px; }
  .dialog :global(button.primary) { background: var(--accent); color: var(--surface); }
  .dialog :global(button.danger) { background: var(--danger); color: var(--surface); }
  .dialog :global(button.option) {
    width: 100%; text-align: left; font-weight: 500; color: var(--text); background: var(--bg-app); overflow-wrap: anywhere;
  }
  @keyframes fade { from { opacity: 0; } }
  @keyframes rise { from { transform: translateY(100%); } }
  @keyframes pop { from { opacity: 0; transform: scale(.96); } }
  @media (prefers-reduced-motion: reduce) { .layer, .dialog { animation: none; } }
</style>
