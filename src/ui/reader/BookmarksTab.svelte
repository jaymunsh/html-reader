<script lang="ts">
  import type { Bookmark } from '../../lib/storage';
  import { ymd } from '../../lib/date';
  import Icon from '../icons/Icon.svelte';
  import Menu from '../Menu.svelte';

  let { list, onpick, ondelete, onrename }: {
    list: Bookmark[]; onpick(b: Bookmark): void; ondelete(b: Bookmark): void; onrename(b: Bookmark): void;
  } = $props();

  const SWIPE_DELETE = 80;
  // Touch swipe: the row follows the finger leftwards; past 80px on release it is deleted. Works on deltas only.
  let drag = $state<{ id: string; x0: number; dx: number } | null>(null);
  let swallow = false; // a swipe is not a tap on the row
  function down(e: PointerEvent, b: Bookmark) {
    swallow = false;
    if (e.pointerType === 'touch') drag = { id: b.id, x0: e.clientX, dx: 0 };
  }
  function move(e: PointerEvent) {
    if (!drag) return;
    const was = drag.dx;
    drag.dx = Math.min(0, e.clientX - drag.x0);
    // Capture only once it is a swipe: a captured tap would retarget its click to the row, not the button under it.
    if (was >= -10 && drag.dx < -10) {
      try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* synthetic or stale pointer */ }
    }
  }
  function up(b: Bookmark) {
    if (!drag) return;
    const dx = drag.dx;
    drag = null;
    swallow = dx < -10;
    if (dx < -SWIPE_DELETE) ondelete(b);
  }
  function pick(b: Bookmark) {
    if (swallow) { swallow = false; return; }
    onpick(b);
  }
</script>

{#if list.length}
  <ul>
    {#each list as b (b.id)}
      <li data-testid="bookmark-row" data-id={b.id} class:dragging={drag?.id === b.id}
        style:transform={drag?.id === b.id && drag.dx ? `translateX(${drag.dx}px)` : null}
        onpointerdown={(e) => down(e, b)} onpointermove={move} onpointerup={() => up(b)} onpointercancel={() => (drag = null)}>
        <button type="button" class="row" onclick={() => pick(b)}>
          <span class="main">{b.label}</span>
          <span class="sub">{b.path.split('/').pop()} · {ymd(b.createdAt)}</span>
        </button>
        <button type="button" class="icon-btn del" data-testid="bookmark-delete" aria-label="삭제" onclick={() => ondelete(b)}><Icon name="close" size={18} /></button>
        <Menu testid="bookmark-menu">
          {#snippet children(close)}
            <button type="button" role="menuitem" data-testid="bookmark-rename" onclick={() => { close(); onrename(b); }}>이름 바꾸기</button>
          {/snippet}
        </Menu>
      </li>
    {/each}
  </ul>
{:else}
  <p class="empty">북마크가 없습니다</p>
{/if}

<style>
  ul { list-style: none; margin: 0; padding: 0 8px 8px; }
  li {
    display: flex; align-items: center; gap: 2px; border-radius: var(--r-control); background: var(--surface);
    touch-action: pan-y; transition: transform .2s ease;
  }
  li.dragging { transition: none; }
  .row {
    flex: 1; min-width: 0; display: flex; flex-direction: column; min-height: 52px; padding: 6px 8px; box-sizing: border-box;
    border: 0; border-radius: var(--r-control); background: none; color: var(--text); font: inherit; text-align: left; justify-content: center;
  }
  .main, .sub { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .sub { font-size: 12px; color: var(--text-3); }
  .del { flex: none; color: var(--text-3); border-radius: var(--r-control); }
  li :global(.wrap) { align-self: center; }
  .empty { margin: 32px 16px; text-align: center; color: var(--text-3); }
  @media (prefers-reduced-motion: reduce) { li { transition: none; } }
</style>
