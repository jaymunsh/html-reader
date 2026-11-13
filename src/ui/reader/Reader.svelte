<script lang="ts">
  import { onMount } from 'svelte';
  import { getBook, getBookFiles, getProgress, setSetting, updateBook, type Book } from '../../lib/storage';
  import { ProgressTracker } from '../../lib/progress';
  import type { Restore } from '../../lib/protocol';
  import { ensureController, tellSw } from '../sw-client';
  import { createSession, type AgentState } from './session';

  let { bookId, openPath, onexit, onopened }: {
    bookId: string; openPath?: string | null; onexit: () => void; onopened?: () => void;
  } = $props();

  let notice = $state<'none' | 'unsupported' | 'missing'>('none');
  let agent = $state<AgentState>('pending');
  let path = $state('');
  let iframe = $state<HTMLIFrameElement>();

  let tracker: ProgressTracker | null = null;
  let book: Book | undefined;
  let session: ReturnType<typeof createSession> | null = null;
  let firstPath: string | null = null; // restore applies only to the page first requested
  let gone = false;

  const flush = () => { tracker?.flush().catch(() => {}); };
  const onVisibility = () => { if (document.visibilityState === 'hidden') flush(); };

  onMount(() => {
    void open();
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      gone = true;
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibility);
      flush();
      session?.destroy();
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
    const files = await getBookFiles(bookId);
    const progress = await getProgress(bookId);
    if (gone) return;
    tracker = new ProgressTracker(bookId, progress);
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
      onPage: (p) => {
        path = p;
        firstPath = null;
        void updateBook(bookId, { lastPath: p, lastOpenedAt: Date.now() }).catch(() => {});
      },
      onScroll: (pct, ratio) => { tracker?.update(path, pct, ratio); },
      onTap: () => {},
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

<div class="reader" data-testid="reader" data-book-id={bookId} data-path={path} data-agent={agent} data-overlay="closed"
  hidden={notice !== 'none'}>
  <iframe bind:this={iframe} data-testid="reader-frame" title="문서"></iframe>
  <button type="button" class="back" data-testid="reader-back" onclick={back}>서재</button>
</div>

<style>
  .reader { position: fixed; inset: 0; background: var(--bg-reader); }
  .reader[hidden] { display: none; }
  iframe { position: fixed; top: var(--sat); left: 0; right: 0; bottom: 0; width: 100%; height: calc(100% - var(--sat)); border: 0; display: block; }
  .back { position: fixed; left: max(8px, env(safe-area-inset-left)); top: max(8px, env(safe-area-inset-top)); z-index: 10; }
</style>
