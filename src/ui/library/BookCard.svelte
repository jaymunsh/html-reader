<script lang="ts">
  import type { Book } from '../../lib/storage';
  let { book, pct, readCount, onopen, ondelete }: {
    book: Book; pct: number; readCount: number; onopen: (id: string) => void; ondelete: (book: Book) => void;
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
    background: var(--surface, #fff); border-radius: 22px; cursor: pointer; min-height: 44px;
    box-shadow: 0 1px 2px rgba(21,24,30,.06), 0 6px 18px rgba(21,24,30,.05); }
  .ring { flex: none; min-width: 48px; text-align: center; font-weight: 600; color: var(--accent, #2F6FEB); }
  .body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .title { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .meta { font-size: 13px; color: var(--text-3, #5B6270); }
  .menu-btn { flex: none; min-width: 44px; min-height: 44px; border: 0; background: none; font-size: 20px; color: inherit; }
  .menu-item { position: absolute; right: 12px; top: 56px; z-index: 5; min-height: 44px; padding: 0 20px; border: 1px solid var(--hairline, rgba(21,24,30,.08));
    border-radius: 12px; background: var(--surface, #fff); color: #C0392B; font: inherit; }
</style>
