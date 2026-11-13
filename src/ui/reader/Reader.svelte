<script lang="ts">
  import { onMount } from 'svelte';
  import { getBook, getBookFiles, getProgress, getSetting, setSetting, updateBook, type Book } from '../../lib/storage';
  import { ProgressTracker, bookProgress, formatPageInfo } from '../../lib/progress';
  import { orderedPages } from '../../lib/file-tree';
  import ProgressLine from './ProgressLine.svelte';
  import type { Restore } from '../../lib/protocol';
  import { ensureController, tellSw } from '../sw-client';
  import Overlay from './Overlay.svelte';
  import { layout } from '../layout.svelte';
  import { createSession, type AgentState } from './session';

  let { bookId, openPath, onexit, onopened }: {
    bookId: string; openPath?: string | null; onexit: () => void; onopened?: () => void;
  } = $props();

  let notice = $state<'none' | 'unsupported' | 'missing'>('none');
  let agent = $state<AgentState>('pending');
  let path = $state('');
  let iframe = $state<HTMLIFrameElement>();
  let title = $state('');
  let overlayOpen = $state(false);
  let curPct = $state(0);
  let bookPct = $state(0);
  let pages = $state<string[]>([]);
  let showLine = $state(true);
  const pageInfo = $derived(formatPageInfo(pages, path, bookPct));
  const refreshBook = () => { if (book && tracker) bookPct = bookProgress(book.pagePaths, tracker.all()).pct; };

  export const OVERLAY_HIDE_MS = 3000;
  let hideTimer: ReturnType<typeof setTimeout> | undefined;
  const holds = new Set<symbol>();
  function arm() {
    clearTimeout(hideTimer);
    if (overlayOpen && !holds.size) hideTimer = setTimeout(() => { overlayOpen = false; }, OVERLAY_HIDE_MS);
  }
  /** Keep the overlay up while dragging / using a panel; call the returned function to release. */
  export function holdOverlay(reason: string): () => void {
    const k = Symbol(reason);
    holds.add(k);
    clearTimeout(hideTimer);
    return () => { holds.delete(k); arm(); };
  }
  /** Any interaction with the overlay restarts the idle timer. */
  export const pokeOverlay = arm;
  const onTap = () => { if (layout.desktop) return; overlayOpen = !overlayOpen; arm(); };

  let tracker: ProgressTracker | null = null;
  let book: Book | undefined;
  let session: ReturnType<typeof createSession> | null = null;
  let firstPath: string | null = null; // restore applies only to the page first requested
  let gone = false;

  const flush = () => { tracker?.flush().catch(() => {}); };
  const onVisibility = () => { if (document.visibilityState === 'hidden') flush(); };

  onMount(() => {
    void getSetting('progressLine').then((v) => { showLine = v; }).catch(() => {});
    void open();
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      gone = true;
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibility);
      flush();
      session?.destroy();
      clearTimeout(hideTimer);
    };
  });

  async function open() {
    if ((await ensureController()) === 'unsupported') { notice = 'unsupported'; return; }
    if (gone) return;
    onopened?.();
    const b = await getBook(bookId);
    if (gone) return;
    if (!b) { notice = 'missing'; return; }
    book = b;
    pages = orderedPages(b.pagePaths);
    const files = await getBookFiles(bookId);
    const progress = await getProgress(bookId);
    if (gone) return;
    tracker = new ProgressTracker(bookId, progress);
    refreshBook();
    const known = new Set(files?.paths ?? b.pagePaths);
    const wanted = openPath || b.lastPath;
    const start = wanted && known.has(wanted) ? wanted : b.entryPath;
    await setSetting('activeBookId', bookId);
    tellSw({ type: 'active-book', id: bookId });
    if (gone || !iframe) return;
    path = start;
    firstPath = start;
    session = createSession(iframe, bookId, {
      onState: (s) => { agent = s; },
      onPage: (p, t) => {
        path = p;
        curPct = 0; // never show the previous page's position
        refreshBook();
        title = t ?? book?.title ?? '';
        firstPath = null;
        void updateBook(bookId, { lastPath: p, lastOpenedAt: Date.now() }).catch(() => {});
      },
      onScroll: (pct, ratio) => {
        tracker?.update(path, pct, ratio);
        if (Number.isFinite(pct)) curPct = Math.min(100, Math.max(0, pct));
        refreshBook();
      },
      onTap,
      onKey: () => {},
      onExternal: (url) => { window.open(url, '_blank', 'noopener'); },
      getInit: (p) => {
        const init: { textScale: number; restore?: Restore } = { textScale: book?.textScale ?? 1 };
        if (p === firstPath) {
          const r = tracker?.get(p)?.lastScrollRatio ?? 0;
          if (r > 0) init.restore = { scrollRatio: r };
        }
        return init;
      },
      onNoSw: () => { notice = 'unsupported'; },
    });
    session.navigate(start);
  }

  async function back() {
    try { await tracker?.flush(); } catch { /* best effort */ }
    await setSetting('activeBookId', null).catch(() => {});
    tellSw({ type: 'active-book', id: null });
    onexit();
  }
</script>

{#if notice === 'unsupported'}
  <div role="alert" data-testid="unsupported-notice">
    <p>이 환경에서는 문서를 열 수 없습니다.</p>
    <button type="button" onclick={onexit}>서재로</button>
  </div>
{:else if notice === 'missing'}
  <div role="alert" data-testid="book-missing-notice">
    <p>문서를 찾을 수 없습니다.</p>
    <button type="button" data-testid="confirm-ok" onclick={onexit}>확인</button>
  </div>
{/if}

<div class="reader" data-testid="reader" data-book-id={bookId} data-path={path} data-agent={agent} data-overlay={layout.desktop || overlayOpen ? 'open' : 'closed'}
  hidden={notice !== 'none'}>
  <iframe bind:this={iframe} data-testid="reader-frame" title="문서"></iframe>
  <div role="presentation" onpointerdown={pokeOverlay}><Overlay open={overlayOpen} {title} {pageInfo} pct={curPct} onback={back} /></div>
  {#if showLine}<ProgressLine pct={curPct} hidden={overlayOpen && !layout.desktop} />{/if}
</div>

<style>
  .reader { position: fixed; inset: 0; background: var(--bg-reader); }
  .reader[hidden] { display: none; }
  iframe { position: fixed; top: var(--sat); left: 0; right: 0; bottom: 0; width: 100%; height: calc(100% - var(--sat)); border: 0; display: block; }
</style>
