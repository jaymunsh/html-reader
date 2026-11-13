<script lang="ts">
  import { onMount, tick } from 'svelte';
  import {
    deleteBook, getAllProgress, getSetting, listAllIssues, listBooks, missingCount, setSetting, type Book, type Issue, type PageProgress,
  } from '../../lib/storage';
  import { bookProgress } from '../../lib/progress';
  import { needsIosTabNotice, isStandalone } from '../../lib/platform';
  import BookCard from './BookCard.svelte';
  import Icon from '../icons/Icon.svelte';
  import ImportFlow from './ImportFlow.svelte';
  import Dialog from './Dialog.svelte';
  import { layout } from '../layout.svelte';

  let books = $state<Book[]>([]);
  let issues = $state(new Map<string, Issue[]>());
  let progress = $state(new Map<string, Map<string, PageProgress>>());
  let { onopen, onsettings, updateReady = false, onapply }: { onopen: (id: string) => void; onsettings: () => void; updateReady?: boolean; onapply: () => void } = $props();
  let input: HTMLInputElement;
  let flow: ImportFlow;
  let dragging = $state(false);
  let importing = $state(false);
  let pct = $state(0);
  let flowModal = $state(false);
  let loaded = $state(false);

  type Dlg = 'ios' | 'temp' | 'safety' | { del: Book };
  let dlg = $state<Dlg | null>(null);
  let answer: ((ok: boolean) => void) | null = null;
  // One dialog at a time: later asks wait for the open one to be answered.
  let dlgQ: Promise<unknown> = Promise.resolve();
  const ask = (d: Dlg) => {
    const p = dlgQ.then(() => new Promise<boolean>((res) => { dlg = d; answer = res; }));
    dlgQ = p.then(() => {}, () => {});
    return p;
  };
  function reply(ok: boolean) { dlg = null; answer?.(ok); answer = null; }

  async function refresh() {
    const [all, prog, iss] = await Promise.all([listBooks(), getAllProgress(), listAllIssues().catch(() => [])]);
    const im = new Map<string, Issue[]>();
    for (const i of iss) (im.get(i.bookId) ?? im.set(i.bookId, []).get(i.bookId)!).push(i);
    issues = im;
    books = all.sort((a, b) => (b.lastOpenedAt || b.importedAt) - (a.lastOpenedAt || a.importedAt));
    const m = new Map<string, Map<string, PageProgress>>();
    for (const p of prog) (m.get(p.bookId) ?? m.set(p.bookId, new Map()).get(p.bookId)!).set(p.path, p);
    progress = m;
    loaded = true;
  }
  onMount(() => {
    void refresh();
    // A file dropped anywhere must never make the browser navigate to it.
    const stop = (e: DragEvent) => { if (hasFiles(e)) e.preventDefault(); };
    const end = () => { dragging = false; };
    window.addEventListener('dragover', stop);
    window.addEventListener('drop', stop);
    window.addEventListener('drop', end);
    window.addEventListener('dragend', end);
    return () => {
      window.removeEventListener('dragover', stop);
      window.removeEventListener('drop', stop);
      window.removeEventListener('drop', end);
      window.removeEventListener('dragend', end);
    };
  });

  // Entry gates (iOS tab notice, safety notice) run once per pick/drop; files then import one at a time, in order.
  const queue: File[] = [];
  let draining = $state(false);
  async function drain() {
    if (draining) return;
    draining = true;
    try {
      for (let f; (f = queue.shift()); ) await flow.start(f);
    } finally { draining = false; }
  }

  // Batches are gated and imported strictly in arrival order.
  let batches: Promise<void> = Promise.resolve();
  function enter(files: File[]) {
    batches = batches.then(() => gateAndImport(files)).catch(() => {});
    return batches;
  }

  async function gateAndImport(files: File[]) {
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

  // Opening a book unmounts the library and with it the running import (and its entry choice): not while importing.
  const busy = $derived(importing || draining);
  function open(id: string) { if (!busy) onopen(id); }

  async function confirmDelete() {
    const d = dlg;
    reply(true);
    if (!d || typeof d !== 'object') return;
    const i = books.findIndex((b) => b.id === d.del.id);
    await deleteBook(d.del.id); await refresh(); await tick();
    // Focus the next card's menu, else the previous one's, else the import button (the deleted card's menu is gone).
    const near = books[i] ?? books[i - 1];
    const to = (near && document.querySelector<HTMLElement>(`[data-book-id="${near.id}"] [data-testid=book-menu]`))
      || document.querySelector<HTMLElement>('[data-testid=import-button]');
    to?.focus({ preventScroll: true });
  }
</script>

<main data-testid="library" class:desk={layout.desktop} class:dragging inert={!!dlg || flowModal} {ondragover} {ondrop}
  ondragleave={(e) => { if (!(e.relatedTarget instanceof Node) || !e.currentTarget.contains(e.relatedTarget)) dragging = false; }}>
  <div class="wrap">
    {#if updateReady}
      <div class="update" role="status" data-testid="update-banner">
        <span>업데이트 준비됨</span>
        <!-- Applying reloads every tab: not while an import is running here. -->
        <button type="button" data-testid="update-apply" disabled={busy} onclick={onapply}>적용</button>
      </div>
    {/if}
    <header class="title">
      <h1>서재</h1>
      <button type="button" class="icon-btn settings" data-testid="settings-button" aria-label="설정" onclick={onsettings}><Icon name="settings" /></button>
    </header>
    {#if books.length}
      <div class="list">
        {#each books as book (book.id)}
          {@const bp = bookProgress(book.pagePaths, progress.get(book.id) ?? new Map())}
          {@const bi = issues.get(book.id) ?? []}
          <BookCard {book} pct={bp.pct} readCount={bp.readCount} missing={missingCount(bi)} online={bi.some((i) => i.kind === 'external')} onopen={open} ondelete={(b) => void ask({ del: b })} />
        {/each}
      </div>
    {:else if loaded}
      <div class="empty">
        <span class="empty-icon"><Icon name="folder" size={32} /></span>
        <p>아직 문서가 없습니다. ZIP 또는 HTML 파일을 가져오세요.</p>
      </div>
    {/if}
  </div>
  <div class="bar" data-bar>
    <div class="bar-in">
      <!-- Left: the search input's place (P3-8); shows the import progress meanwhile. -->
      <div class="slot">
        {#if importing}
          <div class="progress" data-testid="import-progress" role="status">
            <span>가져오는 중… {pct}%</span>
            <i><b style:transform={`scaleX(${pct / 100})`}></b></i>
          </div>
        {/if}
      </div>
      <button type="button" class="import" data-testid="import-button" onclick={() => input.click()}><Icon name="plus" size={20} />가져오기</button>
    </div>
  </div>
  <input bind:this={input} type="file" data-testid="import-input" hidden multiple
    accept=".zip,.html,.htm,application/zip,text/html" {onchange} />
</main>

<ImportFlow bind:this={flow} bind:busy={importing} bind:pct bind:modal={flowModal} held={!!dlg} onimported={refresh} />

{#if dlg === 'ios'}
  <Dialog title="홈 화면에 추가해서 쓰세요" testid="ios-notice" oncancel={() => reply(false)}>
    <p>공유 버튼 → "홈 화면에 추가"로 설치하면 문서가 앱 저장소에 안전하게 보관됩니다.</p>
    <div class="actions">
      <button type="button" class="primary" data-testid="ios-continue-tab" onclick={() => reply(true)}>탭에서 계속</button>
      <button type="button" data-testid="confirm-cancel" onclick={() => reply(false)}>취소</button>
    </div>
  </Dialog>
{:else if dlg === 'temp'}
  <Dialog title="탭에서 계속합니다" testid="ios-temp-warning">
    <p>임시 보관 — 홈 화면 앱에서는 보이지 않으며 지워질 수 있음</p>
    <div class="actions"><button type="button" class="primary" data-testid="ios-temp-ok" onclick={() => reply(true)}>확인</button></div>
  </Dialog>
{:else if dlg === 'safety'}
  <Dialog title="신뢰하는 문서만 가져오세요" testid="safety-notice">
    <p>직접 만들었거나 신뢰하는 문서만 가져오세요. 문서 안의 스크립트는 이 앱의 저장 데이터에 접근할 수 있습니다.</p>
    <div class="actions"><button type="button" class="primary" data-testid="confirm-ok" onclick={() => reply(true)}>확인</button></div>
  </Dialog>
{:else if dlg}
  <Dialog title="문서 삭제" oncancel={() => reply(false)}>
    <p>"{dlg.del.title}" 문서를 삭제할까요? 진행률과 북마크도 함께 지워집니다.</p>
    <div class="actions">
      <button type="button" class="danger" data-testid="confirm-ok" onclick={confirmDelete}>삭제</button>
      <button type="button" data-testid="confirm-cancel" data-autofocus onclick={() => reply(false)}>취소</button>
    </div>
  </Dialog>
{/if}

<style>
  main {
    min-height: 100vh; box-sizing: border-box; color: var(--text);
    padding: calc(20px + var(--sat)) max(16px, env(safe-area-inset-right)) calc(64px + var(--sab) + 24px) max(16px, env(safe-area-inset-left));
  }
  main.desk { padding-left: 32px; padding-right: 32px; }
  main.dragging { outline: 2px dashed var(--accent); outline-offset: -8px; background: var(--accent-soft); }
  .wrap { max-width: 1040px; margin: 0 auto; }
  .title { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 4px 0 16px; }
  .title h1 { margin: 0; font-size: 34px; font-weight: 800; line-height: 1.15; letter-spacing: -0.02em; }
  .desk .title { margin: 16px 0 24px; }
  .settings { flex: none; cursor: pointer; border-radius: var(--r-control); background: var(--surface); box-shadow: var(--shadow-card); }
  .list { display: flex; flex-direction: column; gap: 10px; }
  .desk .list { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 14px; }
  .empty { display: flex; flex-direction: column; align-items: center; gap: 14px; padding: 72px 24px; text-align: center; }
  .empty-icon { width: 64px; height: 64px; display: grid; place-items: center; border-radius: var(--r-card); background: var(--surface); color: var(--text-3); box-shadow: var(--shadow-card); }
  .empty p { margin: 0; max-width: 260px; font-size: 15px; line-height: 1.55; color: var(--text-3); text-wrap: balance; word-break: keep-all; }
  .update {
    display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 6px 6px 6px 16px; margin-bottom: 12px;
    border-radius: var(--r-control); background: var(--info-bg); color: var(--info-fg); font-size: 15px; font-weight: 600;
  }
  .update button {
    min-height: 44px; padding: 0 16px; border: 0; border-radius: var(--r-control); background: var(--surface); color: var(--info-fg);
    font: inherit; cursor: pointer;
  }
  .update button:disabled { opacity: .5; cursor: default; }
  .bar {
    position: fixed; left: 0; right: 0; bottom: 0; z-index: var(--z-bar); padding-bottom: var(--sab);
    background: var(--bar); -webkit-backdrop-filter: blur(22px) saturate(1.6); backdrop-filter: blur(22px) saturate(1.6);
    border-top: 1px solid var(--hairline);
  }
  .bar-in {
    display: flex; align-items: center; gap: 12px; height: 64px; box-sizing: border-box; max-width: 1040px; margin: 0 auto;
    padding: 0 max(16px, env(safe-area-inset-right)) 0 max(16px, env(safe-area-inset-left));
  }
  .desk .bar-in { max-width: calc(1040px + 64px); padding: 0 32px; }
  .slot { flex: 1; min-width: 0; }
  .progress { display: flex; flex-direction: column; gap: 6px; font-size: 13px; font-weight: 600; color: var(--text-2); font-variant-numeric: tabular-nums; }
  .progress i { display: block; height: 4px; max-width: 220px; border-radius: 2px; background: var(--accent-soft); overflow: hidden; }
  .progress b { display: block; height: 100%; background: var(--accent); transform-origin: left; transition: transform .2s ease; }
  .import {
    flex: none; display: inline-flex; align-items: center; gap: 6px; min-height: 44px; padding: 0 18px 0 14px;
    border: 0; border-radius: var(--r-control); background: var(--accent); color: var(--surface);
    font: inherit; font-size: 15px; font-weight: 600; cursor: pointer; transition: transform .15s ease;
  }
  .import:active { transform: scale(.97); }
  .import:focus-visible, .update button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
</style>
