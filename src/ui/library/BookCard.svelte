<script lang="ts">
  import type { Book } from '../../lib/storage';
  let { book }: { book: Book } = $props();
</script>

<div data-testid="book-card" data-book-id={book.id} data-title={book.title}>
  <span data-testid="book-title">{book.title}</span>
</div>
