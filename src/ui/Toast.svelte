<script lang="ts">
  import type { Snippet } from 'svelte';

  // A bottom toast with one action. `above`: over the panel sheet (an undo for something done inside it).
  let { testid, actionTestid, actionLabel, onaction, above = false, children }: {
    testid: string; actionTestid: string; actionLabel: string; onaction(): void; above?: boolean; children: Snippet;
  } = $props();
</script>

<div class="toast" class:above role="status" data-testid={testid}>
  <p>{@render children()}</p>
  <button type="button" data-testid={actionTestid} onclick={onaction}>{actionLabel}</button>
</div>

<style>
  .toast {
    position: fixed; left: 12px; right: calc(var(--panel-w, 0px) + 12px); bottom: calc(var(--sab) + 16px); z-index: var(--z-toast);
    display: flex; align-items: center; gap: 12px; padding: 12px 8px 12px 16px; box-sizing: border-box;
    background: var(--surface); color: var(--text); border: 1px solid var(--hairline); border-radius: 14px;
    box-shadow: var(--shadow-card); font-size: 14px; line-height: 1.45;
  }
  .toast.above { z-index: var(--z-undo); }
  p { margin: 0; flex: 1; }
  button { flex: none; min-width: 44px; min-height: 44px; background: none; border: 0; color: var(--accent); font-weight: 600; font-size: 14px; }
  button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: var(--r-control); }
</style>
