<script lang="ts">
  import { tick, untrack, type Snippet } from 'svelte';
  import Icon from '../icons/Icon.svelte';
  import { layout } from '../layout.svelte';

  const PANEL_MIN = 240;
  const PANEL_MAX = 480;

  let { open, tab = $bindable('files'), onClose, width = $bindable(320), onWidthCommit, onEscape, files, bookmarks }: {
    open: boolean; tab: 'files' | 'bookmarks'; onClose(): void;
    width?: number; onWidthCommit?(w: number): void; onEscape?(): void;
    files: Snippet; bookmarks: Snippet;
  } = $props();

  let el = $state<HTMLElement>();
  // Opening the sheet moves focus inside it: the current file row on the files tab, otherwise the active tab.
  $effect(() => {
    if (!open || layout.desktop) return;
    void tick().then(() => {
      const t = el?.querySelector<HTMLElement>(untrack(() => tab) === 'files' ? '[aria-current=page]' : '[aria-selected=true]')
        ?? el?.querySelector<HTMLElement>('[aria-selected=true]');
      t?.focus({ preventScroll: true });
    });
  });

  function onkeydown(e: KeyboardEvent) {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    if (layout.desktop) onEscape?.(); else onClose();
  }

  let grabX = 0;
  let startW = 0;
  let dragging = false;
  function down(e: PointerEvent) {
    if (e.button !== 0) return;
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* ignore */ }
    dragging = true; grabX = e.clientX; startW = width;
  }
  function move(e: PointerEvent) {
    if (dragging) width = Math.min(PANEL_MAX, Math.max(PANEL_MIN, Math.round(startW + grabX - e.clientX)));
  }
  function up() { if (dragging) { dragging = false; onWidthCommit?.(width); } }
</script>

{#if !layout.desktop}
  <div class="scrim" class:open role="presentation" onclick={onClose}></div>
{/if}
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<aside bind:this={el} class="panel" class:dock={layout.desktop} class:open data-testid="panel" data-open={open} inert={!open}
  aria-label="패널" style:width={layout.desktop ? `${width}px` : null} {onkeydown}>
  {#if layout.desktop}
    <div class="resizer" data-testid="panel-resizer" role="separator" aria-orientation="vertical" aria-label="패널 폭"
      onpointerdown={down} onpointermove={move} onpointerup={up} onpointercancel={up}></div>
  {:else}
    <div class="grabber" aria-hidden="true"></div>
  {/if}
  <div class="head">
    <div class="seg" role="tablist">
      <button type="button" role="tab" data-testid="panel-tab-files" aria-selected={tab === 'files'} onclick={() => (tab = 'files')}>파일</button>
      <button type="button" role="tab" data-testid="panel-tab-bookmarks" aria-selected={tab === 'bookmarks'} onclick={() => (tab = 'bookmarks')}>북마크</button>
    </div>
    {#if layout.desktop && open}
      <button type="button" class="icon" data-testid="panel-toggle" aria-label="패널 접기" aria-expanded="true" onclick={onClose}><Icon name="panel" /></button>
    {/if}
  </div>
  <div class="body" role="tabpanel">
    {#if tab === 'files'}{@render files()}{:else}{@render bookmarks()}{/if}
  </div>
  {#if layout.desktop}
    <p class="help" data-testid="shortcut-help">T 패널 · / 검색 · B 북마크 · [ ] 쪽 이동 · + − 확대</p>
  {/if}
</aside>

<style>
  .scrim { position: fixed; inset: 0; z-index: 29; background: var(--scrim); opacity: 0; pointer-events: none; transition: opacity .25s ease; }
  .scrim.open { opacity: 1; pointer-events: auto; }
  .panel {
    position: fixed; z-index: 30; display: flex; flex-direction: column; box-sizing: border-box;
    background: var(--surface); color: var(--text);
  }
  .panel:not(.dock) {
    left: 0; right: 0; bottom: 0; height: 70vh; border-radius: var(--r-sheet) var(--r-sheet) 0 0;
    padding-bottom: var(--sab); transform: translateY(100%); transition: transform .25s ease;
  }
  .panel:not(.dock).open { transform: none; }
  .dock { top: 0; right: 0; bottom: 0; padding-top: var(--sat); border-left: 1px solid var(--hairline); }
  .dock:not(.open) { visibility: hidden; }
  .grabber { width: 36px; height: 5px; border-radius: 3px; background: var(--hairline); margin: 8px auto 0; flex: none; }
  .resizer { position: absolute; left: -4px; top: 0; bottom: 0; width: 10px; cursor: col-resize; touch-action: none; z-index: 1; }
  .head { display: flex; align-items: center; gap: 8px; padding: 8px 12px; flex: none; }
  .seg { flex: 1; display: flex; padding: 2px; border-radius: var(--r-control); background: var(--bg-app); }
  .seg button { flex: 1; min-height: 44px; border: 0; border-radius: var(--r-control); background: none; color: var(--text-2); font: inherit; }
  .seg button[aria-selected='true'] { background: var(--surface); color: var(--text); font-weight: 600; box-shadow: var(--shadow-card); }
  .icon { background: none; border: 0; color: var(--text); width: 44px; height: 44px; display: grid; place-items: center; }
  .body { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; }
  .help { flex: none; margin: 0; padding: 10px 12px; border-top: 1px solid var(--hairline); font-size: 12px; color: var(--text-3); }
</style>
