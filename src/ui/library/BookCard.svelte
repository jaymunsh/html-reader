<script lang="ts">
  import type { Book } from '../../lib/storage';
  import Icon from '../icons/Icon.svelte';
  import ProgressRing from './ProgressRing.svelte';
  import Menu from '../Menu.svelte';
  import { ymd } from '../../lib/date';
  let { book, pct, readCount, missing = 0, online = false, onopen, ondelete }: {
    book: Book; pct: number; readCount: number; missing?: number; online?: boolean; onopen: (id: string) => void; ondelete: (book: Book) => void;
  } = $props();
  let menu = $state(false);
  let el = $state<HTMLElement>();
  function when(t: number): string {
    if (!t) return '안 읽음';
    const m = Math.floor((Date.now() - t) / 60_000);
    if (m < 1) return '방금';
    if (m < 60) return `${m}분 전`;
    if (m < 60 * 24) return `${Math.floor(m / 60)}시간 전`;
    return ymd(t);
  }

  // Menu: the ⋯ button, right click, or a 500ms touch press. Opening is idempotent (a long press also fires contextmenu).
  // A press that opened the menu, or a tap that only closed it, swallows the click that follows instead of opening the book.
  let swallow = false;
  let timer = 0;
  let sx = 0, sy = 0;
  function down(e: PointerEvent) {
    if ((e.target as Element).closest('.menu-btn, .menu')) return;
    swallow = menu; menu = false;
    clearTimeout(timer);
    if (e.pointerType !== 'touch') return;
    sx = e.clientX; sy = e.clientY;
    timer = window.setTimeout(() => { swallow = true; menu = true; }, 500);
  }
  function move(e: PointerEvent) { if (Math.hypot(e.clientX - sx, e.clientY - sy) > 10) clearTimeout(timer); }
  const stop = () => clearTimeout(timer);
  function click() {
    if (swallow) { swallow = false; return; }
    onopen(book.id);
  }
</script>

<div bind:this={el} class="card" data-testid="book-card" data-book-id={book.id} data-title={book.title} role="button" tabindex="0"
  onclick={click} onpointerdown={down} onpointermove={move} onpointerup={stop} onpointercancel={stop}
  oncontextmenu={(e) => { e.preventDefault(); clearTimeout(timer); menu = true; }}
  onkeydown={(e) => {
    if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onopen(book.id); }
  }}>
  <ProgressRing {pct} />
  <span class="body">
    <span class="title" data-testid="book-title">{book.title}</span>
    <span class="sub">{book.sourceName} · {ymd(book.importedAt)}</span>
    <span class="meta">
      <span data-testid="book-pages">{readCount}/{book.pagePaths.length}쪽</span>
      <span aria-hidden="true">·</span>
      <span>{when(book.lastOpenedAt)}</span>
      {#if missing}<span class="chip warn" data-testid="issue-badge"><Icon name="warning" size={14} />누락 {missing}</span>{/if}
      {#if online}<span class="chip info" data-testid="online-badge" aria-label="온라인 필요"><Icon name="cloud" size={14} /></span>{/if}
    </span>
  </span>
  <!-- A press elsewhere on the card is the card's own (it closes the menu and swallows the click). -->
  <Menu bind:open={menu} testid="book-menu" within={el}>
    {#snippet children(close)}
      <button type="button" role="menuitem" class="danger" data-testid="menu-delete" onclick={() => { close(); ondelete(book); }}>삭제</button>
    {/snippet}
  </Menu>
</div>

<style>
  .card {
    position: relative; display: flex; align-items: center; gap: 14px; padding: 14px 8px 14px 16px; min-height: 80px; box-sizing: border-box;
    background: var(--surface); color: var(--text); border-radius: var(--r-card); box-shadow: var(--shadow-card); cursor: pointer;
    -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; -webkit-tap-highlight-color: transparent;
    transition: transform .15s ease;
  }
  .card:active { transform: scale(.985); }
  .card:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .title {
    font-size: 16px; font-weight: 650; line-height: 1.3; letter-spacing: -0.01em; overflow-wrap: anywhere;
    display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
  }
  .sub { font-size: 13px; line-height: 1.4; color: var(--text-3); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .meta { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 6px; margin-top: 2px; font-size: 13px; line-height: 1.4; color: var(--text-2); font-variant-numeric: tabular-nums; }
  .chip { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: var(--r-chip); font-size: 12px; font-weight: 600; }
  .chip.warn { background: var(--warn-bg); color: var(--warn-fg); }
  .chip.info { background: var(--info-bg); color: var(--info-fg); }
  @media (prefers-reduced-motion: reduce) { .card { transition: none; } }
</style>
