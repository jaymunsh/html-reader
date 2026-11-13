<script lang="ts">
  import type { Book } from '../../lib/storage';
  import Icon from '../icons/Icon.svelte';
  let { book, pct, readCount, missing = 0, online = false, onopen, ondelete }: {
    book: Book; pct: number; readCount: number; missing?: number; online?: boolean; onopen: (id: string) => void; ondelete: (book: Book) => void;
  } = $props();
  let menu = $state(false);

  function when(t: number): string {
    if (!t) return '안 읽음';
    const m = Math.floor((Date.now() - t) / 60_000);
    if (m < 1) return '방금';
    if (m < 60) return `${m}분 전`;
    if (m < 60 * 24) return `${Math.floor(m / 60)}시간 전`;
    const d = new Date(t);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
  }
</script>

<div class="card" data-testid="book-card" data-book-id={book.id} data-title={book.title} role="button" tabindex="0"
  onclick={() => onopen(book.id)}
  onkeydown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onopen(book.id); } }}>
  <span class="ring" data-testid="book-progress">{Math.round(pct)}%</span>
  <span class="body">
    <span class="title" data-testid="book-title">{book.title}</span>
    <span class="meta"><span data-testid="book-pages">{readCount}/{book.pagePaths.length}쪽</span> · {when(book.lastOpenedAt)}</span>
    {#if missing || online}
      <span class="badges">
        {#if missing}<span class="chip warn" data-testid="issue-badge"><Icon name="warning" size={14} />누락 {missing}</span>{/if}
        {#if online}<span class="chip info" data-testid="online-badge" aria-label="온라인 필요"><Icon name="cloud" size={14} /></span>{/if}
      </span>
    {/if}
  </span>
  <button type="button" class="menu-btn" data-testid="book-menu" aria-label="메뉴" aria-expanded={menu}
    onclick={(e) => { e.stopPropagation(); menu = !menu; }}>⋯</button>
  {#if menu}
    <button type="button" class="menu-item" data-testid="menu-delete"
      onclick={(e) => { e.stopPropagation(); menu = false; ondelete(book); }}>삭제</button>
  {/if}
</div>

<style>
  .card { position: relative; display: flex; align-items: center; gap: 14px; padding: 14px 16px; margin: 10px 0;
    background: var(--surface); border-radius: var(--r-card); cursor: pointer; min-height: 44px;
    box-shadow: var(--shadow-card); }
  .ring { flex: none; min-width: 48px; text-align: center; font-weight: 600; color: var(--accent); }
  .body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .title { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .meta { font-size: 13px; color: var(--text-3); }
  .badges { display: flex; gap: 6px; margin-top: 2px; }
  .chip { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: var(--r-chip); font-size: 12px; font-weight: 600; }
  .chip.warn { background: var(--warn-bg); color: var(--warn-fg); }
  .chip.info { background: var(--info-bg); color: var(--info-fg); }
  .menu-btn { flex: none; min-width: 44px; min-height: 44px; border: 0; background: none; font-size: 20px; color: inherit; }
  .menu-item { position: absolute; right: 12px; top: 56px; z-index: 5; min-height: 44px; padding: 0 20px; border: 1px solid var(--hairline);
    border-radius: var(--r-control); background: var(--surface); color: #C0392B; font: inherit; }
</style>
