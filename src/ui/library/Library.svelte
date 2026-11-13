<script lang="ts">
  import { onMount } from 'svelte';
  import {
    deleteBook, getAllProgress, getSetting, listBooks, setSetting, type Book, type PageProgress,
  } from '../../lib/storage';
  import { bookProgress } from '../../lib/progress';
  import { needsIosTabNotice, isStandalone } from '../../lib/platform';
  import BookCard from './BookCard.svelte';
  import ImportFlow from './ImportFlow.svelte';

  let books = $state<Book[]>([]);
  let progress = $state(new Map<string, Map<string, PageProgress>>());
  let { onopen }: { onopen: (id: string) => void } = $props();
  let input: HTMLInputElement;
  let flow: ImportFlow;
  let dragging = $state(false);

  type Dlg = 'ios' | 'temp' | 'safety' | { del: Book };
  let dlg = $state<Dlg | null>(null);
  let answer: ((ok: boolean) => void) | null = null;
  const ask = (d: Dlg) => new Promise<boolean>((res) => { dlg = d; answer = res; });
  function reply(ok: boolean) { dlg = null; answer?.(ok); answer = null; }

  async function refresh() {
    const [all, prog] = await Promise.all([listBooks(), getAllProgress()]);
    books = all.sort((a, b) => (b.lastOpenedAt || b.importedAt) - (a.lastOpenedAt || a.importedAt));
    const m = new Map<string, Map<string, PageProgress>>();
    for (const p of prog) (m.get(p.bookId) ?? m.set(p.bookId, new Map()).get(p.bookId)!).set(p.path, p);
    progress = m;
  }
  onMount(refresh);

  // Entry gates (iOS tab notice, safety notice) run once per pick/drop; files then import one at a time, in order.
  const queue: File[] = [];
  let draining = false;
  async function drain() {
    if (draining) return;
    draining = true;
    try {
      for (let f; (f = queue.shift()); ) await flow.start(f);
    } finally { draining = false; }
  }

  async function enter(files: File[]) {
    if (!files.length) return;
    if (needsIosTabNotice(navigator.userAgent, navigator.maxTouchPoints, isStandalone())) {
      if (!(await ask('ios'))) return;
      await ask('temp');
    }
    if (!(await getSetting('safetyNoticeSeen'))) {
      await ask('safety');
      await setSetting('safetyNoticeSeen', true);
      void navigator.storage?.persist?.(); // result intentionally ignored (shown in P2-1)
    }
    queue.push(...files);
    await drain();
  }

  function onchange() {
    void enter([...(input.files ?? [])]);
    input.value = '';
  }

  const hasFiles = (e: DragEvent) => !!e.dataTransfer?.types.includes('Files');
  function ondragover(e: DragEvent) { if (hasFiles(e)) { e.preventDefault(); dragging = true; } }
  function ondrop(e: DragEvent) {
    if (!hasFiles(e)) return;
    e.preventDefault(); dragging = false;
    void enter([...e.dataTransfer!.files]);
  }

  async function confirmDelete() {
    const d = dlg;
    reply(true);
    if (d && typeof d === 'object') { await deleteBook(d.del.id); await refresh(); }
  }
</script>

<main data-testid="library" class:dragging {ondragover} {ondrop} ondragleave={(e) => { if (e.target === e.currentTarget) dragging = false; }}>
  <h1>서재</h1>
  <button type="button" data-testid="import-button" onclick={() => input.click()}>가져오기</button>
  <input bind:this={input} type="file" data-testid="import-input" hidden multiple
    accept=".zip,.html,.htm,application/zip,text/html" {onchange} />
  <ImportFlow bind:this={flow} onimported={refresh} />
  {#each books as book (book.id)}
    {@const bp = bookProgress(book.pagePaths, progress.get(book.id) ?? new Map())}
    <BookCard {book} pct={bp.pct} readCount={bp.readCount} {onopen} ondelete={(b) => void ask({ del: b })} />
  {/each}
</main>

{#if dlg === 'ios'}
  <div class="dialog" role="dialog" aria-modal="true" data-testid="ios-notice">
    <h2>홈 화면에 추가해서 쓰세요</h2>
    <p>공유 버튼 → "홈 화면에 추가"로 설치하면 문서가 앱 저장소에 안전하게 보관됩니다.</p>
    <button type="button" data-testid="ios-continue-tab" onclick={() => reply(true)}>탭에서 계속</button>
    <button type="button" data-testid="confirm-cancel" onclick={() => reply(false)}>취소</button>
  </div>
{:else if dlg === 'temp'}
  <div class="dialog" role="dialog" aria-modal="true" data-testid="ios-temp-warning">
    <p>임시 보관 — 홈 화면 앱에서는 보이지 않으며 지워질 수 있음</p>
    <button type="button" data-testid="ios-temp-ok" onclick={() => reply(true)}>확인</button>
  </div>
{:else if dlg === 'safety'}
  <div class="dialog" role="dialog" aria-modal="true" data-testid="safety-notice">
    <p>직접 만들었거나 신뢰하는 문서만 가져오세요. 문서 안의 스크립트는 이 앱의 저장 데이터에 접근할 수 있습니다.</p>
    <button type="button" data-testid="confirm-ok" onclick={() => reply(true)}>확인</button>
  </div>
{:else if dlg}
  <div class="dialog" role="dialog" aria-modal="true">
    <p>"{dlg.del.title}" 문서를 삭제할까요? 진행률과 북마크도 함께 지워집니다.</p>
    <button type="button" data-testid="confirm-ok" onclick={confirmDelete}>삭제</button>
    <button type="button" data-testid="confirm-cancel" onclick={() => reply(false)}>취소</button>
  </div>
{/if}

<style>
  main { min-height: 100vh; padding: 16px; box-sizing: border-box; }
  main.dragging { outline: 2px dashed var(--accent, #2F6FEB); outline-offset: -8px; background: var(--accent-soft, #EAF0FD); }
  .dialog { position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%); z-index: 20; width: min(90vw, 360px);
    padding: 20px; border-radius: 22px; background: var(--surface, #fff); box-shadow: 0 0 0 100vmax var(--scrim, rgba(21,24,30,.38)); }
  .dialog button { min-height: 44px; border-radius: 12px; margin-right: 8px; }
</style>
