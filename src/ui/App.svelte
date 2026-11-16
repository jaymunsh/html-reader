<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { initLaunch, takePendingShare, type LaunchQueueLike } from '../lib/launch';
  import { cleanupOrphans, importRunning } from '../lib/storage';
  import Library from './library/Library.svelte';
  import { setScreen } from './chrome';
  import Settings from './settings/Settings.svelte';
  import Status from './Status.svelte';
  import { currentEntry, enterScreen, leaveScreen, normalizeAtBoot, ownPop } from './screen-history';
  import { applyUpdate, hasWaitingUpdate, watchForUpdate } from './sw-client';

  type Screen = { name: 'library' } | { name: 'settings' } | { name: 'reader'; id: string; path: string | null };

  function initial(): Screen {
    const q = new URLSearchParams(location.search);
    const id = q.get('open');
    return id ? { name: 'reader', id, path: q.get('path') || null } : { name: 'library' };
  }

  const first = initial();
  let screen = $state<Screen>(first);
  normalizeAtBoot(first.name !== 'library');
  let updateReady = $state(false);
  onMount(() => watchForUpdate(() => { updateReady = true; }));

  let receiving = 0; // files are on their way to the library: no update reload before their import takes the lock
  function toLibrary() {
    clean();
    leaveScreen();
    screen = { name: 'library' };
    let wanted = false;
    try { wanted = sessionStorage.getItem('update-wanted') === '1'; } catch { /* ignore */ }
    // Applying reloads every tab: never while an import (any tab) is running; the banner stays for later.
    if (!receiving && (hasWaitingUpdate() || wanted)) void importRunning().then((busy) => { if (!busy) applyUpdate(); });
  }

  // Files opened with the installed app (§7.5) go through the library's one import funnel.
  let lib = $state<Library>();
  let reader = $state<{ exit(): Promise<void>; closeLayers(): void; show(path: string): void }>();
  async function receiveFiles(files: File[]) {
    receiving++;
    try {
      if (screen.name === 'reader' && reader) await reader.exit(); // flushes progress, clears activeBookId, onexit → library
      else if (screen.name !== 'library') toLibrary(); // also drops ?open=; `receiving` blocks the update reload
      await tick(); // the library mounts (and binds) only on its screen
    } finally { receiving--; }
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
  // The reader is up: a ?open= start turns its own entry into the library and pushes the reader above it (opening from the
  // library already pushed within the click).
  function readerOpened(id: string) {
    clean();
    enterScreen({ hr: 'reader', id });
  }
  function openReader(id: string) {
    enterScreen({ hr: 'reader', id });
    screen = { name: 'reader', id, path: null };
  }
  function openSettings() {
    enterScreen({ hr: 'settings' });
    screen = { name: 'settings' };
  }
  function closeSettings() {
    leaveScreen();
    screen = { name: 'library' };
  }

  // A document that sends the whole tab to one of its pages (top.location = '/book/…'): stay in the app instead of loading
  // that address (the SW would redirect it to /?open=, stacking entries). Navigation API only; elsewhere the SW redirect stays.
  onMount(() => {
    const nav = (window as unknown as { navigation?: EventTarget }).navigation;
    const onNavigate = (ev: Event) => {
      const e = ev as Event & { navigationType: string; cancelable: boolean; formData: unknown; downloadRequest: unknown; destination: { url: string } };
      if (e.navigationType !== 'push' || !e.cancelable || e.formData || e.downloadRequest) return;
      let id: string, path: string;
      try {
        const u = new URL(e.destination.url);
        const m = u.origin === location.origin ? /^\/book\/([^/]+)\/(.+)$/.exec(u.pathname) : null;
        if (!m) return;
        id = m[1]; path = m[2].split('/').map(decodeURIComponent).join('/').normalize('NFC');
      } catch { return; }
      e.preventDefault();
      if (screen.name === 'reader' && screen.id === id && reader) reader.show(path);
      else if (screen.name === 'reader') { history.replaceState({ hr: 'reader', id }, '', '/'); screen = { name: 'reader', id, path }; }
      else { enterScreen({ hr: 'reader', id }); screen = { name: 'reader', id, path }; }
    };
    nav?.addEventListener('navigate', onNavigate);
    return () => nav?.removeEventListener('navigate', onNavigate);
  });

  // Back / forward between the library and the screen above it.
  function onPopState() {
    if (ownPop()) return;
    const e = currentEntry();
    if (screen.name === 'reader') {
      if (e?.hr === 'reader' && e.id === screen.id) { if (!e.layer) reader?.closeLayers(); return; } // back closes a sheet first
      if (reader) void reader.exit(); else toLibrary(); // exit flushes progress, then onexit → toLibrary (its entry is gone)
    } else if (screen.name === 'settings') {
      if (e?.hr !== 'settings') screen = { name: 'library' };
    } else if (e) {
      screen = e.hr === 'reader' ? { name: 'reader', id: e.id, path: null } : { name: 'settings' }; // forward
    }
  }
</script>

{#if screen.name === 'reader'}
  {#key screen.id}
    {#await import('./reader/Reader.svelte') then { default: Reader }}
      <Reader bind:this={reader} bookId={screen.id} openPath={screen.path} onopened={() => readerOpened(screen.name === 'reader' ? screen.id : '')} onexit={toLibrary} />
    {:catch}
      <Status kind="error" testid="reader-load-error">
        <p>문서를 열 수 없습니다.</p>
        <button type="button" onclick={toLibrary}>서재로</button>
      </Status>
    {/await}
  {/key}
{:else if screen.name === 'settings'}
  <Settings onback={closeSettings} />
{:else}
  <Library bind:this={lib} {updateReady} onapply={() => void importRunning().then((busy) => { if (!busy) applyUpdate(); })} onsettings={openSettings} onopen={openReader} />
{/if}

<svelte:window onpopstate={onPopState} />

<div class="top-inset" data-testid="top-inset" class:reader={screen.name === 'reader'}></div>

<style>
  .top-inset { position: fixed; top: 0; left: 0; right: 0; height: var(--sat); background: var(--bg-app); z-index: var(--z-inset); }
  .top-inset.reader { background: var(--bg-reader); }
</style>
