<script lang="ts">
  import { onMount } from 'svelte';
  import { listBooks, type Book } from '../../lib/storage';
  import BookCard from './BookCard.svelte';
  import ImportFlow from './ImportFlow.svelte';

  let books = $state<Book[]>([]);
  let { onopen }: { onopen: (id: string) => void } = $props();
  let input: HTMLInputElement;
  let flow: ImportFlow;

  async function refresh() {
    const all = await listBooks();
    books = all.sort((a, b) => (b.lastOpenedAt || b.importedAt) - (a.lastOpenedAt || a.importedAt));
  }
  onMount(refresh);

  function onchange() {
    const file = input.files?.[0];
    if (file) void flow.start(file);
    input.value = '';
  }
</script>

<main data-testid="library">
  <h1>서재</h1>
  <button type="button" data-testid="import-button" onclick={() => input.click()}>가져오기</button>
  <input bind:this={input} type="file" data-testid="import-input" hidden
    accept=".zip,.html,.htm,application/zip,text/html" {onchange} />
  <ImportFlow bind:this={flow} onimported={refresh} />
  {#each books as book (book.id)}
    <BookCard {book} {onopen} />
  {/each}
</main>
