<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon from '../icons/Icon.svelte';
  import { layout } from '../layout.svelte';

  let { open, title, pageInfo = '', pct = 0, onback, topActions, bottom }: {
    open: boolean; title: string; pageInfo?: string; pct?: number; onback: () => void; topActions?: Snippet; bottom?: Snippet;
  } = $props();
  // Desktop: the top bar is pinned open and there is no bottom bar (layout details: Task 8).
  const shown = $derived(open || layout.desktop);
</script>

<header class="bar top" class:closed={!shown} data-testid="overlay-top" inert={!shown}>
  <button type="button" class="back" data-testid="reader-back" aria-label="서재로" onclick={onback}><Icon name="back" /></button>
  <span class="title" data-testid="overlay-title">{title}</span>
  <span class="page-info" data-testid="page-info">{pageInfo}</span>
  <span class="actions">{@render topActions?.()}</span>
  <div class="pbar" data-testid="progress-bar" data-pct={Math.round(pct)}><i style:transform={`scaleX(${pct / 100})`}></i></div>
</header>

{#if !layout.desktop}
  <footer class="bar bottom" class:closed={!open} data-testid="overlay-bottom" inert={!open}>{@render bottom?.()}</footer>
{/if}

<style>
  .bar {
    position: fixed; left: 0; right: 0; z-index: 10;
    background: var(--bar); -webkit-backdrop-filter: blur(22px) saturate(1.6); backdrop-filter: blur(22px) saturate(1.6);
    transition: transform .2s ease, opacity .2s ease; color: var(--text);
  }
  .bar.closed { opacity: 0; pointer-events: none; }
  .top {
    top: 0; display: flex; align-items: center; gap: 8px; min-height: 52px;
    padding: var(--sat) max(8px, env(safe-area-inset-right)) 0 max(8px, env(safe-area-inset-left));
    border-bottom: 1px solid var(--hairline); box-sizing: content-box;
  }
  .top.closed { transform: translateY(-100%); }
  .bottom {
    bottom: 0; min-height: 56px; padding: 0 max(8px, env(safe-area-inset-right)) var(--sab) max(8px, env(safe-area-inset-left));
    border-top: 1px solid var(--hairline); box-sizing: content-box;
  }
  .bottom.closed { transform: translateY(100%); }
  .back { background: none; border: 0; color: inherit; width: 44px; height: 44px; display: grid; place-items: center; }
  .title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
  .page-info { font-size: 12px; color: var(--text-3); white-space: nowrap; }
  .pbar { position: absolute; left: 0; right: 0; bottom: -1px; height: 2px; pointer-events: none; }
  .pbar i { display: block; width: 100%; height: 100%; background: var(--accent); transform-origin: left; }
  .actions { display: flex; gap: 4px; }
</style>
