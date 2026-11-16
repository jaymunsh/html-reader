<script lang="ts">
  import { tick, type Snippet } from 'svelte';

  // Modal sheet: scrim, slide-in, focus in on open, Escape → onClose, focus back to the invoker on close.
  // The caller makes the background inert while it is open.
  let { open, onClose, variant = 'bottom', label, testid, invoker, children }: {
    open: boolean; onClose(): void; variant?: 'bottom' | 'fullscreen'; label: string;
    /** Where focus returns on close. Defaults to the element focused at open (WebKit does not focus clicked buttons). */
    invoker?: HTMLElement;
    /** `${testid}-sheet` on the sheet, `${testid}-scrim` on the scrim. */
    testid?: string; children: Snippet;
  } = $props();
  let el = $state<HTMLElement>();
  let back: HTMLElement | null = null;

  $effect(() => {
    if (open) {
      back = invoker ?? (document.activeElement as HTMLElement | null);
      void tick().then(() => (el?.querySelector<HTMLElement>('[data-autofocus]') ?? el?.querySelector<HTMLElement>('button') ?? el)?.focus({ preventScroll: true }));
    } else if (back) {
      const b = back; back = null;
      void tick().then(() => { if (b.isConnected && b !== document.body) b.focus({ preventScroll: true }); });
    }
  });
  function onkeydown(e: KeyboardEvent) {
    if (e.key !== 'Escape') return;
    e.preventDefault(); e.stopPropagation();
    onClose();
  }
</script>

<div class="scrim" class:open data-testid={testid && `${testid}-scrim`} role="presentation" onclick={onClose}></div>
<div bind:this={el} class="sheet {variant}" class:open data-testid={testid && `${testid}-sheet`} inert={!open}
  role="dialog" tabindex="-1" aria-modal="true" aria-label={label} {onkeydown}>
  {@render children()}
</div>

<style>
  .scrim { position: fixed; inset: 0; z-index: var(--z-sheet-scrim); background: var(--scrim); opacity: 0; pointer-events: none; transition: opacity .25s ease; }
  .scrim.open { opacity: 1; pointer-events: auto; }
  .sheet {
    position: fixed; z-index: var(--z-sheet); display: flex; flex-direction: column; box-sizing: border-box;
    background: var(--surface); color: var(--text); outline: none;
    visibility: hidden; transition: transform .25s ease, opacity .25s ease, visibility 0s .25s;
  }
  .sheet.open { visibility: visible; transform: none; opacity: 1; transition: transform .25s ease, opacity .25s ease; }
  .bottom {
    left: 0; right: 0; bottom: 0; max-height: 70vh; max-height: 70dvh; margin: 0 auto; max-width: 560px; padding-bottom: var(--sab);
    border-radius: var(--r-sheet) var(--r-sheet) 0 0; transform: translateY(100%);
  }
  .fullscreen { inset: 0; padding: var(--sat) 0 var(--sab); opacity: 0; transform: translateY(16px); }
  @media (prefers-reduced-motion: reduce) {
    .scrim, .sheet, .sheet.open { transition: none; }
  }
</style>
