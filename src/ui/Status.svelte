<script lang="ts">
  import type { Snippet } from 'svelte';

  // A centered full-screen message: an error with its way out, or a loading note. `delay` keeps fast opens from flashing it.
  let { kind, testid, delay = 0, children }: { kind: 'loading' | 'error'; testid?: string; delay?: number; children: Snippet } = $props();

  let shown = $state(false);
  $effect(() => {
    if (!delay) { shown = true; return; }
    const t = setTimeout(() => { shown = true; }, delay);
    return () => clearTimeout(t);
  });
</script>

{#if shown}
  <div class="status {kind}" role={kind === 'error' ? 'alert' : 'status'} data-testid={testid}>
    {#if kind === 'loading'}<span class="spin" aria-hidden="true"></span>{/if}
    {@render children()}
  </div>
{/if}

<style>
  .status {
    position: fixed; inset: 0; box-sizing: border-box; display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 16px; text-align: center; color: var(--text-2); font-size: 15px; line-height: 1.55; overflow-wrap: anywhere;
    padding: calc(var(--sat) + 24px) max(24px, env(safe-area-inset-right)) calc(var(--sab) + 24px) max(24px, env(safe-area-inset-left));
  }
  /* Above the top safe-area strip (z-inset) so iOS standalone does not cover it; the reader behind is hidden. */
  .error { z-index: var(--z-bar); background: var(--bg-app); }
  /* Under the bars (back stays usable) and never in the way of the page that is loading. */
  .loading { z-index: var(--z-line); pointer-events: none; color: var(--text-3); font-size: 14px; }
  .status :global(p) { margin: 0; max-width: 32em; }
  .status :global(button) {
    min-height: 48px; min-width: 120px; padding: 0 20px; border: 0; border-radius: var(--r-control); font: inherit; font-size: 16px;
    font-weight: 600; background: var(--accent); color: var(--surface); cursor: pointer;
  }
  .status :global(button:focus-visible) { outline: 2px solid var(--accent); outline-offset: 2px; }
  .spin {
    width: 24px; height: 24px; border-radius: 50%; border: 2.5px solid var(--hairline); border-top-color: var(--accent);
    animation: spin .8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) { .spin { animation-duration: 2.4s; } }
</style>
