<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { initLaunch, takePendingShare, type LaunchQueueLike } from '../lib/launch';
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

  let receiving = false; // files are on their way to the library: no update reload before their import takes the lock
  function toLibrary() {
    clean();
    screen = { name: 'library' };
    let wanted = false;
    try { wanted = sessionStorage.getItem('update-wanted') === '1'; } catch { /* ignore */ }
    // Applying reloads every tab: never while an import (any tab) is running; the banner stays for later.
    if (!receiving && (hasWaitingUpdate() || wanted)) void importRunning().then((busy) => { if (!busy) applyUpdate(); });
  }

  // Files opened with the installed app (§7.5) go through the library's one import funnel.
  let lib = $state<Library>();
  let reader = $state<{ exit(): Promise<void> }>();
  async function receiveFiles(files: File[]) {
    receiving = true;
    try {
      if (screen.name === 'reader' && reader) await reader.exit(); // flushes progress, clears activeBookId, onexit → library
      else if (screen.name !== 'library') screen = { name: 'library' };
      await tick(); // the library mounts (and binds) only on its screen
    } finally { receiving = false; }
    if (!lib) return false;
    await lib.enqueue(files); // settles once the batch is done (imported, failed or cancelled)
    return true;
  }
  onMount(() => initLaunch((window as unknown as { launchQueue?: LaunchQueueLike }).launchQueue, (files) => void receiveFiles(files)));

  // Share target (§7.5): the SW sends us to /?import=pending|failed. Files left in the inbox by a closed app are
  // imported on any start, whatever the query; the inbox is emptied only once their import has settled.
  onMount(() => {
    const q = new URLSearchParams(location.search);
    const failed = q.get('import') === 'failed';
    if (q.has('import')) { q.delete('import'); const s = q.toString(); history.replaceState(null, '', s ? `/?${s}` : '/'); } // ?open= stays for clean()
    const run = async () => {
      if (failed) { void lib?.shareFailed(); return; }
      const { files, done } = await takePendingShare();
      if (!files.length) return;
      if (await receiveFiles(files)) await done();
    };
    void run().catch(() => {}).finally(() => { document.documentElement.dataset.share = 'done'; });
  });

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
      <Reader bind:this={reader} bookId={screen.id} openPath={screen.path} onopened={clean} onexit={toLibrary} />
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
  <Library bind:this={lib} {updateReady} onapply={() => void importRunning().then((busy) => { if (!busy) applyUpdate(); })} onsettings={() => (screen = { name: 'settings' })} onopen={(id) => (screen = { name: 'reader', id, path: null })} />
{/if}

<div class="top-inset" data-testid="top-inset" class:reader={screen.name === 'reader'}></div>

<style>
  .top-inset { position: fixed; top: 0; left: 0; right: 0; height: var(--sat); background: var(--bg-app); z-index: var(--z-inset); }
  .top-inset.reader { background: var(--bg-reader); }
</style>
