<script lang="ts">
  import type { Book } from '../../lib/storage';
  let { book, onopen }: { book: Book; onopen: (id: string) => void } = $props();
</script>

<div data-testid="book-card" data-book-id={book.id} data-title={book.title} role="button" tabindex="0"
  onclick={() => onopen(book.id)}
  onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onopen(book.id); } }}>
  <span data-testid="book-title">{book.title}</span>
</div>
