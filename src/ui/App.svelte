<script lang="ts">
  import { onMount } from 'svelte';
  import { cleanupOrphans, importRunning } from '../lib/storage';
  import Library from './library/Library.svelte';
  import { setScreen } from './chrome';
  import Settings from './settings/Settings.svelte';
  import { applyUpdate, hasWaitingUpdate, watchForUpdate } from './sw-client';

  type Screen = { name: 'library' } | { name: 'settings' } | { name: 'reader'; id: string; path: string | null };

  function initial(): Screen {
    const q = new URLSearchParams(location.search);
    const id = q.get('open');
    return id ? { name: 'reader', id, path: q.get('path') || null } : { name: 'library' };
  }

  let screen = $state<Screen>(initial());
  let updateReady = $state(false);
  onMount(() => watchForUpdate(() => { updateReady = true; }));

  function toLibrary() {
    clean();
    screen = { name: 'library' };
    let wanted = false;
    try { wanted = sessionStorage.getItem('update-wanted') === '1'; } catch { /* ignore */ }
    // Applying reloads every tab: never while an import (any tab) is running; the banner stays for later.
    if (hasWaitingUpdate() || wanted) void importRunning().then((busy) => { if (!busy) applyUpdate(); });
  }

  $effect(() => { document.documentElement.dataset.screen = screen.name; setScreen(screen.name); });

  // Orphan cleanup once the first screen is up (skips itself while an import holds the lock).
  onMount(() => {
    const run = () => { void import('./reader/Reader.svelte').catch(() => {}); void cleanupOrphans().catch(() => {}).finally(() => { document.documentElement.dataset.cleanup = 'done'; }); };
    if ('requestIdleCallback' in window) requestIdleCallback(run); else setTimeout(run, 1500);
  });

  // Drop ?open= from the address once the reader has taken over (after any SW-install reload).
  function clean() {
    if (location.search) history.replaceState(null, '', '/');
  }
</script>

{#if screen.name === 'reader'}
  {#key screen.id}
    {#await import('./reader/Reader.svelte') then { default: Reader }}
      <Reader bookId={screen.id} openPath={screen.path} onopened={clean} onexit={toLibrary} />
    {:catch}
      <div role="alert" data-testid="reader-load-error">
        <p>문서를 열 수 없습니다.</p>
        <button type="button" onclick={toLibrary}>서재로</button>
      </div>
    {/await}
  {/key}
{:else if screen.name === 'settings'}
  <Settings onback={() => (screen = { name: 'library' })} />
{:else}
  <Library {updateReady} onapply={() => void importRunning().then((busy) => { if (!busy) applyUpdate(); })} onsettings={() => (screen = { name: 'settings' })} onopen={(id) => (screen = { name: 'reader', id, path: null })} />
{/if}

<div class="top-inset" data-testid="top-inset" class:reader={screen.name === 'reader'}></div>

<style>
  .top-inset { position: fixed; top: 0; left: 0; right: 0; height: var(--sat); background: var(--bg-app); z-index: 5; }
  .top-inset.reader { background: var(--bg-reader); }
</style>
