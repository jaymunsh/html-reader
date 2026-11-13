<script lang="ts">
  import { onMount, tick, untrack } from 'svelte';
  import { getBook, getBookFiles, getProgress, getSetting, setSetting, updateBook, type Book, type PageProgress } from '../../lib/storage';
  import { ProgressTracker, bookProgress, formatPageInfo } from '../../lib/progress';
  import { neighbor, orderedPages } from '../../lib/file-tree';
  import ProgressLine from './ProgressLine.svelte';
  import type { Restore } from '../../lib/protocol';
  import { ensureController, tellSw } from '../sw-client';
  import Icon from '../icons/Icon.svelte';
  import Overlay from './Overlay.svelte';
  import RibbonTab from './RibbonTab.svelte';
  import ScrollHandle from './ScrollHandle.svelte';
  import HintToast from './HintToast.svelte';
  import Panel from './Panel.svelte';
  import FilesTab from './FilesTab.svelte';
  import { layout } from '../layout.svelte';
  import { createSession, type AgentState } from './session';
  import { isEditableTarget, shortcutFor, type Action } from '../../lib/shortcuts';
  import type { Mods } from '../../lib/protocol';
  import { stepZoom, zoomLabel } from '../../lib/zoom';

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
  let curRatio = $state(0);
  let scrollable = $state(false); // false until the agent reports a scroll range (non-scrolling = pct 100, ratio 0)
  let bookPct = $state(0);
  let pages = $state<string[]>([]);
  let showLine = $state(false); // rendered only once the setting has loaded
  let hint = $state(false); // first-run hint, shown once the setting has loaded as unseen
  async function dismissHint() { await setSetting('hintSeen', true).catch(() => {}); hint = false; }
  $effect(() => { if (overlayOpen && hint) void dismissHint(); });
  const pageInfo = $derived(pages.length ? formatPageInfo(pages, path, bookPct) : '');
  let progress = $state<ReadonlyMap<string, PageProgress>>(new Map());
  const refreshBook = () => { if (book && tracker) { progress = tracker.all(); bookPct = bookProgress(book.pagePaths, progress).pct; } };

  // Panel: mobile bottom sheet (sheetOpen) / desktop docked panel (dockOpen, persisted).
  let titles = $state<Record<string, string>>({});
  let sourceName = $state('');
  let panelTab = $state<'files' | 'bookmarks'>('files');
  let sheetOpen = $state(false);
  let dockOpen = $state(false);
  let panelWidth = $state(320);
  let panelReady = $state(false); // the panel renders once its saved state is loaded (no slide-in at boot)
  let btnPanel = $state<HTMLButtonElement>();
  const panelOpen = $derived(layout.desktop ? dockOpen : sheetOpen);
  const sheet = $derived(!layout.desktop && sheetOpen);
  let sheetHold: (() => void) | null = null;
  function openSheet() { sheetOpen = true; sheetHold ??= holdOverlay('panel'); }
  function closePanel() {
    if (layout.desktop) { dockOpen = false; void setSetting('panelOpen', false).catch(() => {}); return; }
    sheetOpen = false; sheetHold?.(); sheetHold = null;
    void tick().then(() => btnPanel?.focus());
  }
  function openDock() { dockOpen = true; void setSetting('panelOpen', true).catch(() => {}); }
  function pick(p: string) { session?.navigate(p); if (!layout.desktop) closePanel(); }

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
  const openOverlay = () => { overlayOpen = true; arm(); };
  const onTap = () => { if (layout.desktop) return; overlayOpen = !overlayOpen; arm(); };

  // Crossing the 768px breakpoint: drop every mobile-only state (sheet + its hold, overlay, timer). The iframe node stays.
  let wasDesktop = layout.desktop;
  $effect(() => {
    if (layout.desktop === wasDesktop) return;
    wasDesktop = layout.desktop;
    sheetOpen = false; sheetHold?.(); sheetHold = null;
    overlayOpen = false; clearTimeout(hideTimer);
    // The frame's width changes, so the text reflows; engines without scroll anchoring (WebKit) would drift. Re-apply the ratio.
    const r = untrack(() => curRatio);
    requestAnimationFrame(() => session?.post({ type: 'scroll-to', ratio: r }));
  });

  let tracker: ProgressTracker | null = null;
  let book: Book | undefined;
  let session: ReturnType<typeof createSession> | null = null;
  let firstPath: string | null = null; // restore applies only to the page first requested
  let gone = false;
  let scale = $state(1);

  const flush = () => { tracker?.flush().catch(() => {}); };
  const onVisibility = () => { if (document.visibilityState === 'hidden') flush(); };

  onMount(() => {
    void getSetting('progressLine').then((v) => { showLine = v; }).catch(() => {});
    void getSetting('hintSeen').then((v) => { hint = !v; }).catch(() => {});
    void Promise.all([getSetting('panelOpen'), getSetting('panelWidth')]).then(([o, w]) => {
      dockOpen = o && innerWidth >= 1024; panelWidth = w;
    }).catch(() => {}).finally(() => { panelReady = true; });
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
      sheetHold?.();
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
    scale = b.textScale ?? 1;
    pages = orderedPages(b.pagePaths);
    const files = await getBookFiles(bookId);
    titles = files?.titles ?? {};
    sourceName = b.sourceName;
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
        curRatio = 0;
        scrollable = false;
        refreshBook();
        title = t ?? book?.title ?? '';
        firstPath = null;
        void updateBook(bookId, { lastPath: p, lastOpenedAt: Date.now() }).catch(() => {});
      },
      onScroll: (pct, ratio) => {
        tracker?.update(path, pct, ratio);
        scrollable = !(pct === 100 && ratio === 0);
        if (Number.isFinite(ratio)) curRatio = ratio;
        if (Number.isFinite(pct)) curPct = Math.min(100, Math.max(0, pct));
        refreshBook();
      },
      onTap,
      onKey,
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

  let dragHold: (() => void) | null = null;
  function onDragState(d: boolean) {
    if (d) dragHold ??= holdOverlay('scroll-handle');
    else { dragHold?.(); dragHold = null; }
  }
  const fileName = $derived(path.split('/').pop() ?? '');
  const go = (dir: -1 | 1) => { const n = neighbor(pages, path, dir); if (n) session?.navigate(n); };
  const prevPath = $derived(neighbor(pages, path, -1));
  const nextPath = $derived(neighbor(pages, path, 1));

  // Keep the shell's book copy current: the next page's init (and the SW's data-scale) must carry the new zoom.
  function zoomBy(dir: 1 | -1) {
    if (agent === 'limited') return;
    const next = stepZoom(scale, dir);
    if (next === scale) return;
    scale = next;
    if (book) book.textScale = next;
    session?.post({ type: 'set-scale', textScale: next });
    void updateBook(bookId, { textScale: next }).then(() => tellSw({ type: 'book-changed', id: bookId })).catch(() => {});
  }
  const zoomOutOff = $derived(agent === 'limited' || stepZoom(scale, -1) === scale);
  const zoomInOff = $derived(agent === 'limited' || stepZoom(scale, 1) === scale);

  // One dispatcher for the shell's own keydown and the agent's forwarded keys. Actions without a handler are ignored.
  const actions: Partial<Record<Action, () => void>> = {
    'toggle-overlay': onTap,
    'toggle-panel': () => { if (panelOpen) closePanel(); else if (layout.desktop) openDock(); else openSheet(); },
    'prev-page': () => go(-1),
    'next-page': () => go(1),
    'zoom-in': () => zoomBy(1),
    'zoom-out': () => zoomBy(-1),
    top: () => session?.post({ type: 'scroll-to', ratio: 0 }),
    bottom: () => session?.post({ type: 'scroll-to', ratio: 1 }),
  };
  function onKey(key: string, mods: Mods) {
    const a = shortcutFor(key, mods, { desktop: layout.desktop });
    if (a) actions[a]?.();
  }
  function onWindowKey(e: KeyboardEvent) {
    if (e.defaultPrevented || e.isComposing || e.repeat || isEditableTarget(e.target as Element | null) || notice !== 'none') return;
    // Space on a focused control belongs to that control (its keyup activation), not to the overlay toggle.
    if (e.key === ' ' && (e.target as Element | null)?.closest?.('button, a[href], [role=button], [role=tab], summary')) return;
    onKey(e.key, { ctrl: e.ctrlKey, meta: e.metaKey, alt: e.altKey, shift: e.shiftKey });
  }

  async function back() {
    try { await tracker?.flush(); } catch { /* best effort */ }
    await setSetting('activeBookId', null).catch(() => {});
    tellSw({ type: 'active-book', id: null });
    onexit();
  }
</script>

<svelte:window onkeydown={onWindowKey} />

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

<div class="reader" class:desk={layout.desktop} data-testid="reader" data-book-id={bookId} data-path={path} data-agent={agent} data-overlay={layout.desktop || overlayOpen ? 'open' : 'closed'}
  hidden={notice !== 'none'} style:--panel-w={layout.desktop && dockOpen ? `${panelWidth}px` : '0px'}>
  <iframe bind:this={iframe} data-testid="reader-frame" title="문서" inert={sheet}></iframe>
  <div role="presentation" onpointerdown={pokeOverlay} inert={sheet}><Overlay open={overlayOpen} {title} {pageInfo} pct={curPct} onback={back}>
    {#snippet topActions()}
      {#if !layout.desktop}
        <button type="button" class="act" data-testid="btn-panel" aria-label="파일·북마크" aria-expanded={sheetOpen} bind:this={btnPanel} onclick={openSheet}><Icon name="menu" /></button>
      {:else}
        {@render pn()}
        {#if panelReady && !dockOpen}
          <button type="button" class="act" data-testid="panel-toggle" aria-label="패널 펼치기" aria-expanded="false" onclick={openDock}><Icon name="panel" /></button>
        {/if}
      {/if}
    {/snippet}
    {#snippet bottom()}
      <div class="nav">
        <button type="button" data-testid="btn-top" aria-label="맨 위" disabled={agent === 'limited'} onclick={actions.top}><Icon name="to-top" /></button>
        {@render pn()}
        <button type="button" data-testid="btn-bottom" aria-label="맨 아래" disabled={agent === 'limited'} onclick={actions.bottom}><Icon name="to-bottom" /></button>
      </div>
    {/snippet}
  </Overlay></div>
  {#if panelReady}
    <Panel open={panelOpen} bind:tab={panelTab} onClose={closePanel} bind:width={panelWidth}
      onWidthCommit={(w) => void setSetting('panelWidth', w).catch(() => {})} onEscape={() => iframe?.focus()}>
      {#snippet files()}
        {#if pages.length}
          <FilesTab open={panelOpen} {sourceName} pagePaths={pages} {titles} {progress} current={path} onpick={pick} />
        {/if}
      {/snippet}
      {#snippet bookmarks()}<p class="empty">북마크가 없습니다</p>{/snippet}
    </Panel>
  {/if}
  {#if !layout.desktop && overlayOpen && !sheetOpen && agent === 'ready' && scrollable}
    <ScrollHandle ratio={curRatio} label={fileName} onSeek={(r) => session?.post({ type: 'scroll-to', ratio: r })} {onDragState} />
  {/if}
  {#if !layout.desktop && !overlayOpen}<RibbonTab onopen={openOverlay} />{/if}
  {#if hint && !layout.desktop}<HintToast ondismiss={dismissHint} />{/if}
  {#if showLine && !layout.desktop}<ProgressLine pct={curPct} hidden={overlayOpen && !layout.desktop} />{/if}
</div>

{#snippet pn()}
  <button type="button" class="act" data-testid="btn-prev" aria-label="이전 쪽" disabled={!prevPath} onclick={() => go(-1)}><Icon name="prev" /></button>
  <button type="button" class="act zb" data-testid="zoom-out" aria-label="글자 작게" disabled={zoomOutOff} onclick={() => zoomBy(-1)}>가-</button>
  <span class="zv" data-testid="zoom-value">{zoomLabel(scale)}</span>
  <button type="button" class="act zb" data-testid="zoom-in" aria-label="글자 크게" disabled={zoomInOff} onclick={() => zoomBy(1)}>가+</button>
  <button type="button" class="act" data-testid="btn-next" aria-label="다음 쪽" disabled={!nextPath} onclick={() => go(1)}><Icon name="next" /></button>
{/snippet}

<style>
  .reader { position: fixed; inset: 0; background: var(--bg-reader); }
  .reader[hidden] { display: none; }
  .nav { display: flex; justify-content: space-around; align-items: center; min-height: 56px; }
  .act:disabled, .nav button:disabled { opacity: .35; }
  .nav button { background: none; border: 0; color: var(--text); width: 44px; height: 44px; display: grid; place-items: center; }
  .act { background: none; border: 0; color: var(--text); width: 44px; height: 44px; display: grid; place-items: center; }
  .zb { font-size: 14px; font-weight: 600; }
  .zv { min-width: 40px; text-align: center; font-size: 12px; color: var(--text-3); font-variant-numeric: tabular-nums; }
  .empty { margin: 32px 16px; text-align: center; color: var(--text-3); }
  iframe { position: fixed; top: var(--sat); left: 0; right: var(--panel-w); bottom: 0; width: calc(100% - var(--panel-w)); height: calc(100% - var(--sat)); border: 0; display: block; }
  .desk iframe { top: calc(var(--sat) + 48px); height: calc(100% - var(--sat) - 48px); }
</style>
