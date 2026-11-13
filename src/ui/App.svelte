<script lang="ts">
  import { onMount } from 'svelte';
  import { cleanupOrphans } from '../lib/storage';
  import Library from './library/Library.svelte';
  import { applyTheme, resolveTheme, setChromeColor } from './chrome';
  import Reader from './reader/Reader.svelte';

  type Screen = { name: 'library' } | { name: 'reader'; id: string; path: string | null };

  function initial(): Screen {
    const q = new URLSearchParams(location.search);
    const id = q.get('open');
    return id ? { name: 'reader', id, path: q.get('path') || null } : { name: 'library' };
  }

  let screen = $state<Screen>(initial());

  $effect(() => { document.documentElement.dataset.screen = screen.name; setChromeColor(screen.name); });

  // P1: theme follows the system only.
  onMount(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const on = () => { applyTheme(resolveTheme('system', mq.matches)); setChromeColor(screen.name); };
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  });

  // Orphan cleanup once the first screen is up (skips itself while an import holds the lock).
  onMount(() => {
    const run = () => { void cleanupOrphans().catch(() => {}).finally(() => { document.documentElement.dataset.cleanup = 'done'; }); };
    if ('requestIdleCallback' in window) requestIdleCallback(run); else setTimeout(run, 1500);
  });

  // Drop ?open= from the address once the reader has taken over (after any SW-install reload).
  function clean() {
    if (location.search) history.replaceState(null, '', '/');
  }
</script>

{#if screen.name === 'reader'}
  {#key screen.id}
    <Reader bookId={screen.id} openPath={screen.path} onopened={clean} onexit={() => { clean(); screen = { name: 'library' }; }} />
  {/key}
{:else}
  <Library onopen={(id) => (screen = { name: 'reader', id, path: null })} />
{/if}

<div class="top-inset" data-testid="top-inset" class:reader={screen.name === 'reader'}></div>

<style>
  .top-inset { position: fixed; top: 0; left: 0; right: 0; height: var(--sat); background: var(--bg-app); z-index: 5; }
  .top-inset.reader { background: var(--bg-reader); }
</style>
