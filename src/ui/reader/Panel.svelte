<script lang="ts">
  import { tick, untrack, type Snippet } from 'svelte';
  import Icon from '../icons/Icon.svelte';
  import { layout } from '../layout.svelte';

  const PANEL_MIN = 240;
  const PANEL_MAX = 480;

  let { open, tab = $bindable('files'), onClose, width = $bindable(320), max = PANEL_MAX, onWidthCommit, onEscape, blocked = false, files, bookmarks }: {
    open: boolean; tab: 'files' | 'bookmarks'; onClose(): void;
    width?: number; max?: number; onWidthCommit?(w: number): void; onEscape?(): void; blocked?: boolean;
    files: Snippet; bookmarks: Snippet;
  } = $props();

  let el = $state<HTMLElement>();
  const applied = $derived(Math.min(width, max)); // `width` is the preference; a narrow window caps what is shown
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

  // Resize: while dragging only a guide line moves (the book would reflow on every pointermove); the width applies on release.
  let grabX = 0;
  let startW = 0;
  let guide = $state<number | null>(null); // the width the drag would apply
  function down(e: PointerEvent) {
    if (e.button !== 0) return;
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* ignore */ }
    grabX = e.clientX; startW = applied; guide = applied;
  }
  function move(e: PointerEvent) {
    if (guide !== null) guide = Math.min(max, Math.max(PANEL_MIN, Math.round(startW + grabX - e.clientX)));
  }
  function up() {
    if (guide === null) return;
    const w = guide;
    guide = null;
    if (w !== applied) { width = w; onWidthCommit?.(w); }
  }
  function cancel() { guide = null; }

  // Mobile sheet: drag the grabber down to close. Past a quarter of the sheet, or a downward flick, closes; else it springs back.
  const FLICK = 0.5;     // px/ms
  const FLICK_MIN = 16;  // px: a flick still has to travel a little
  let pull = $state<{ y0: number; dy: number; t: number; v: number } | null>(null);
  function pullDown(e: PointerEvent) {
    if (!open || (e.pointerType === 'mouse' && e.button !== 0)) return;
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* ignore */ }
    pull = { y0: e.clientY, dy: 0, t: e.timeStamp, v: 0 };
  }
  function pullMove(e: PointerEvent) {
    if (!pull) return;
    const dy = Math.max(0, e.clientY - pull.y0), dt = e.timeStamp - pull.t;
    if (dt > 0) pull.v = (dy - pull.dy) / dt;
    pull.dy = dy; pull.t = e.timeStamp;
  }
  function pullUp(e: PointerEvent) {
    if (!pull) return;
    const { dy, t } = pull;
    const v = e.timeStamp - t > 100 ? 0 : pull.v; // held still before letting go: not a flick
    pull = null;
    if (dy > (el?.offsetHeight ?? 400) / 4 || (v > FLICK && dy > FLICK_MIN)) onClose();
  }
</script>

{#if !layout.desktop}
  <div class="scrim" class:open role="presentation" onclick={onClose}></div>
{/if}
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<aside bind:this={el} class="panel" class:dock={layout.desktop} class:open data-testid="panel" data-open={open} tabindex="-1" inert={!open || blocked}
  aria-label="패널" class:pulling={!!pull} style:width={layout.desktop ? `${applied}px` : null}
  style:transform={pull && pull.dy ? `translateY(${pull.dy}px)` : null} {onkeydown}>
  {#if layout.desktop}
    <div class="resizer" data-testid="panel-resizer" role="separator" aria-orientation="vertical" aria-label="패널 폭"
      onpointerdown={down} onpointermove={move} onpointerup={up} onpointercancel={cancel}></div>
    {#if guide !== null}<div class="guide" data-testid="panel-resize-guide" aria-hidden="true" style:left={`${applied - guide - 2}px`}></div>{/if}
  {:else}
    <!-- Touch affordance only: Escape, the scrim and ☰ close the sheet for everyone else. -->
    <div class="grab" data-testid="panel-grabber" aria-hidden="true" onpointerdown={pullDown} onpointermove={pullMove} onpointerup={pullUp}
      onpointercancel={() => (pull = null)}><div class="grabber"></div></div>
  {/if}
  <div class="head">
    <div class="seg" role="tablist">
      <button type="button" role="tab" data-testid="panel-tab-files" aria-selected={tab === 'files'} onclick={() => (tab = 'files')}>파일</button>
      <button type="button" role="tab" data-testid="panel-tab-bookmarks" aria-selected={tab === 'bookmarks'} onclick={() => (tab = 'bookmarks')}>북마크</button>
    </div>
    {#if layout.desktop && open}
      <button type="button" class="icon-btn" data-testid="panel-toggle" aria-label="패널 접기" aria-expanded="true" onclick={onClose}><Icon name="panel" /></button>
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
  .scrim { position: fixed; inset: 0; z-index: var(--z-panel-scrim); background: var(--scrim); opacity: 0; pointer-events: none; transition: opacity .25s ease; }
  .scrim.open { opacity: 1; pointer-events: auto; }
  .panel {
    position: fixed; z-index: var(--z-panel); display: flex; flex-direction: column; box-sizing: border-box;
    background: var(--surface); color: var(--text);
  }
  .panel:not(.dock) {
    left: 0; right: 0; bottom: 0; height: 70vh; border-radius: var(--r-sheet) var(--r-sheet) 0 0;
    padding-bottom: var(--sab); transform: translateY(100%); transition: transform .25s ease;
  }
  .panel:not(.dock).open { transform: none; }
  .dock { top: 0; right: 0; bottom: 0; padding-top: var(--sat); border-left: 1px solid var(--hairline); }
  .dock:not(.open) { visibility: hidden; }
  .grab { flex: none; display: flex; justify-content: center; padding: 8px 0; touch-action: none; cursor: grab; }
  .grabber { width: 36px; height: 5px; border-radius: 3px; background: var(--hairline); }
  .panel.pulling { transition: none; }
  @media (prefers-reduced-motion: reduce) { .panel:not(.dock), .scrim { transition: none; } }
  .resizer { position: absolute; left: -4px; top: 0; bottom: 0; width: 10px; cursor: col-resize; touch-action: none; z-index: var(--z-local); }
  /* Centered on the new left edge (offsets: the 1px border and half the 2px line). */
  .guide { position: absolute; top: 0; bottom: 0; width: 2px; background: var(--accent); pointer-events: none; z-index: var(--z-local); }
  .head { display: flex; align-items: center; gap: 8px; padding: 8px 12px; flex: none; }
  .seg { flex: 1; display: flex; padding: 2px; border-radius: var(--r-control); background: var(--bg-app); }
  .seg button { flex: 1; min-height: 44px; border: 0; border-radius: var(--r-control); background: none; color: var(--text-2); font: inherit; }
  .seg button[aria-selected='true'] { background: var(--surface); color: var(--text); font-weight: 600; box-shadow: var(--shadow-card); }
  .body { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; }
  .help { flex: none; margin: 0; padding: 10px 12px; border-top: 1px solid var(--hairline); font-size: 12px; color: var(--text-3); }
</style>
