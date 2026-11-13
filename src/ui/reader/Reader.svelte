<script lang="ts">
  import { onMount, tick, untrack } from 'svelte';
  import { getBook, getBookFiles, getProgress, getSetting, listIssues, missingCount, setSetting, updateBook, type Book, type Issue, type PageProgress } from '../../lib/storage';
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
  import IssuesSheet from './IssuesSheet.svelte';
  import FilesTab from './FilesTab.svelte';
  import SearchPanel from './SearchPanel.svelte';
  import Sheet from '../Sheet.svelte';
  import { layout } from '../layout.svelte';
  import { createSession, pendingRestore, type AgentState } from './session';
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
  let panelWidth = $state(320); // the user's preference; the applied width is clamped to the window
  let vw = $state(innerWidth);
  // Leave the desktop top bar at least 560px beside the dock (P3-K10: controls ~391px, badges, collapsed search, bookmark slot).
  const panelMax = $derived(Math.min(480, Math.max(240, vw - 560)));
  const panelApplied = $derived(Math.min(panelWidth, panelMax));
  let panelReady = $state(false); // the panel renders once its saved state is loaded (no slide-in at boot)
  let btnPanel = $state<HTMLButtonElement>();
  const panelOpen = $derived(layout.desktop ? dockOpen : sheetOpen);
  // Resource issues: refreshed shortly after a page loads (the SW records as the page fetches) and when the overlay opens.
  let issues = $state<Issue[]>([]);
  const missing = $derived(issues.filter((i) => i.kind !== 'external'));
  const nMissing = $derived(missingCount(issues));
  let issuesOpen = $state(false);
  let issuesHold: (() => void) | null = null;
  let btnIssues = $state<HTMLButtonElement>();
  let issueTimer: ReturnType<typeof setTimeout> | undefined;
  const refreshIssues = () => { void listIssues(bookId).then((l) => { if (!gone) issues = l; }).catch(() => {}); };
  $effect(() => { if (overlayOpen) untrack(refreshIssues); });
  function openIssues() { issuesOpen = true; issuesHold ??= holdOverlay('issues'); }
  function closeIssues() {
    issuesOpen = false; issuesHold?.(); issuesHold = null;   // Sheet returns focus to the badge
  }
  let searchOpen = $state(false);
  const sheet = $derived((!layout.desktop && (sheetOpen || searchOpen)) || issuesOpen);
  let sheetHold: (() => void) | null = null;
  function openSheet() { sheetOpen = true; sheetHold ??= holdOverlay('panel'); }
  function closePanel() {
    if (layout.desktop) { dockOpen = false; void setSetting('panelOpen', false).catch(() => {}); return; }
    sheetOpen = false; sheetHold?.(); sheetHold = null;
    void tick().then(() => btnPanel?.focus());
  }
  function openDock() { dockOpen = true; void setSetting('panelOpen', true).catch(() => {}); }
  function pick(p: string) { nav(p); if (!layout.desktop) closePanel(); }

  // Search (spec §7.1): mobile full-screen sheet / PC top-bar dropdown.
  let searchHold: (() => void) | null = null;
  let btnSearch = $state<HTMLButtonElement>();
  let searchBar = $state<SearchPanel>();
  function openSearch() {
    if (layout.desktop) { searchBar?.focus(); return; }
    searchOpen = true; searchHold ??= holdOverlay('search');
  }
  function closeSearch() { searchOpen = false; searchHold?.(); searchHold = null; } // Sheet returns focus to btn-search
  function onSearchPick(p: string, query: string, snippet: string) {
    if (!layout.desktop) closeSearch();
    else iframe?.focus(); // back to the document (like the panel's Escape): shortcuts work again, the dropdown's focusout closes it
    if (p === path) session?.post({ type: 'find', query, snippet });
    else nav(p, { find: { query, snippet } });
  }
  // Every navigation resets the pending restore; getInit takes it once, only for its page.
  const pending = pendingRestore();
  function nav(p: string, restore?: Restore) {
    pending.set(p, restore);
    session?.navigate(p);
  }

  export const OVERLAY_HIDE_MS = 3000;
  let hideTimer: ReturnType<typeof setTimeout> | undefined;
  const holds = new Set<symbol>();
  function arm() {
    clearTimeout(hideTimer);
    if (overlayOpen && !holds.size) hideTimer = setTimeout(() => { overlayOpen = false; }, OVERLAY_HIDE_MS);
  }
  // A keyboard user inside the overlay keeps it up (pointer focus does not: a tap still auto-hides).
  let overlayEl = $state<HTMLElement>();
  let focusHold: (() => void) | null = null;
  function onOverlayFocusIn(e: FocusEvent) {
    if ((e.target as Element).matches?.(':focus-visible')) focusHold ??= holdOverlay('focus');
  }
  function onOverlayFocusOut(e: FocusEvent) {
    if (!overlayEl?.contains(e.relatedTarget as Node | null)) { focusHold?.(); focusHold = null; }
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
    searchOpen = false; searchHold?.(); searchHold = null;
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
      sheetHold?.(); issuesHold?.(); focusHold?.(); searchHold?.();
      clearTimeout(issueTimer);
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
        clearTimeout(issueTimer);
        issueTimer = setTimeout(refreshIssues, 700);
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
        const pr = pending.take(p);
        if (pr) init.restore = pr;
        else if (p === firstPath) {
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
  const go = (dir: -1 | 1) => { const n = neighbor(pages, path, dir); if (n) nav(n); };
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
    search: openSearch,
    top: () => session?.post({ type: 'scroll-to', ratio: 0 }),
    bottom: () => session?.post({ type: 'scroll-to', ratio: 1 }),
  };
  /** Returns the action that handled the key, if any. */
  function onKey(key: string, mods: Mods): Action | null {
    if (sheet) return null; // nothing acts behind a modal sheet; the sheets handle their own Escape
    const a = shortcutFor(key, mods, { desktop: layout.desktop }); // never a Ctrl/⌘/Alt combo (browser find, zoom)
    const run = a && actions[a];
    if (!run) return null;
    run();
    return a;
  }
  function onWindowKey(e: KeyboardEvent) {
    if (e.defaultPrevented || e.isComposing || e.repeat || isEditableTarget(e.target as Element | null) || notice !== 'none') return;
    // Space on a focused control belongs to that control (its keyup activation), not to the overlay toggle.
    if (e.key === ' ' && (e.target as Element | null)?.closest?.('button, a[href], [role=button], [role=tab], summary')) return;
    // Only `/` prevents its default (it would type into the input it just focused); Home/End keep native list scrolling.
    if (onKey(e.key, { ctrl: e.ctrlKey, meta: e.metaKey, alt: e.altKey, shift: e.shiftKey }) === 'search') e.preventDefault();
  }

  async function back() {
    try { await tracker?.flush(); } catch { /* best effort */ }
    await setSetting('activeBookId', null).catch(() => {});
    tellSw({ type: 'active-book', id: null });
    onexit();
  }
</script>

<svelte:window onkeydown={onWindowKey} bind:innerWidth={vw} />

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
  hidden={notice !== 'none'} style:--panel-w={layout.desktop && dockOpen ? `${panelApplied}px` : '0px'}>
  <iframe bind:this={iframe} data-testid="reader-frame" title="문서" inert={sheet}></iframe>
  <div role="presentation" bind:this={overlayEl} onpointerdown={pokeOverlay} onfocusin={onOverlayFocusIn} onfocusout={onOverlayFocusOut} inert={sheet}><Overlay open={overlayOpen} {title} {pageInfo} pct={curPct} onback={back}>
    {#snippet topActions()}
      {#if nMissing}
        <button type="button" class="icon-btn badge warn" data-testid="issue-badge" aria-label={`누락 ${nMissing}`} bind:this={btnIssues} onclick={openIssues}><Icon name="warning" size={16} /><span class="full">누락{' '}</span>{nMissing}</button>
      {/if}
      {#if agent === 'limited'}<span class="badge info" data-testid="limited-badge" role="img" aria-label="제한 모드"><span class="ico"><Icon name="warning" size={16} /></span><span class="full">제한 모드</span></span>{/if}
      {#if !layout.desktop}
        <button type="button" class="icon-btn" data-testid="btn-search" aria-label="검색" aria-expanded={searchOpen} bind:this={btnSearch} onclick={openSearch}><Icon name="search" /></button>
        <button type="button" class="icon-btn" data-testid="btn-panel" aria-label="파일·북마크" aria-expanded={sheetOpen} bind:this={btnPanel} onclick={openSheet}><Icon name="menu" /></button>
      {:else}
        <SearchPanel bind:this={searchBar} {bookId} variant="dropdown" onPick={onSearchPick} onClose={() => {}} />
        {@render pn()}
        {#if panelReady && !dockOpen}
          <button type="button" class="icon-btn" data-testid="panel-toggle" aria-label="패널 펼치기" aria-expanded="false" onclick={openDock}><Icon name="panel" /></button>
        {/if}
      {/if}
    {/snippet}
    {#snippet bottom()}
      <div class="nav">
        <button type="button" class="icon-btn" data-testid="btn-top" aria-label="맨 위" disabled={agent === 'limited'} onclick={actions.top}><Icon name="to-top" /></button>
        {@render pn()}
        <button type="button" class="icon-btn" data-testid="btn-bottom" aria-label="맨 아래" disabled={agent === 'limited'} onclick={actions.bottom}><Icon name="to-bottom" /></button>
      </div>
    {/snippet}
  </Overlay></div>
  <IssuesSheet open={issuesOpen} issues={missing} onClose={closeIssues} invoker={btnIssues} />
  {#if !layout.desktop}
    <!-- WebKit does not focus a clicked button: pass btn-search so focus returns to it on close. -->
    <Sheet open={searchOpen} onClose={closeSearch} variant="fullscreen" label="검색" testid="search" invoker={btnSearch}>
      <SearchPanel {bookId} variant="fullscreen" onPick={onSearchPick} onClose={closeSearch} />
    </Sheet>
  {/if}
  {#if panelReady}
    <Panel open={panelOpen} bind:tab={panelTab} onClose={closePanel} bind:width={panelWidth} max={panelMax}
      onWidthCommit={(w) => void setSetting('panelWidth', w).catch(() => {})} onEscape={() => iframe?.focus()} blocked={issuesOpen}>
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
  <button type="button" class="icon-btn" data-testid="btn-prev" aria-label="이전 쪽" disabled={!prevPath} onclick={() => go(-1)}><Icon name="prev" /></button>
  <button type="button" class="icon-btn zb" data-testid="zoom-out" aria-label="글자 작게" disabled={zoomOutOff} onclick={() => zoomBy(-1)}>가-</button>
  <span class="zv" data-testid="zoom-value">{zoomLabel(scale)}</span>
  <button type="button" class="icon-btn zb" data-testid="zoom-in" aria-label="글자 크게" disabled={zoomInOff} onclick={() => zoomBy(1)}>가+</button>
  <button type="button" class="icon-btn" data-testid="btn-next" aria-label="다음 쪽" disabled={!nextPath} onclick={() => go(1)}><Icon name="next" /></button>
{/snippet}

<style>
  .reader { position: fixed; inset: 0; background: var(--bg-reader); }
  .reader[hidden] { display: none; }
  .nav { display: flex; justify-content: space-around; align-items: center; min-height: 56px; }
  .badge.icon-btn { width: auto; min-width: 44px; padding: 0 8px; gap: 4px; display: inline-flex; align-items: center; justify-content: center; flex: none; font-size: 12px; font-weight: 600; white-space: nowrap; }
  .badge.warn { color: var(--warn-fg); background: var(--warn-bg); border-radius: var(--r-chip); }
  span.badge { flex: none; padding: 4px 8px; font-size: 12px; white-space: nowrap; border-radius: var(--r-chip); background: var(--info-bg); color: var(--info-fg); }
  span.badge { min-height: 44px; display: inline-flex; align-items: center; box-sizing: border-box; }
  .ico { display: none; }
  /* Compact badges by the bar's own width: narrow phones and the desktop bar beside a wide dock alike. */
  @container topbar (max-width: 359px) {
    .full { display: none; }
    .ico { display: inline-flex; }
    span.badge { min-width: 44px; justify-content: center; }
  }
  .zb { font-size: 14px; font-weight: 600; }
  .zv { min-width: 40px; text-align: center; font-size: 12px; color: var(--text-3); font-variant-numeric: tabular-nums; }
  .empty { margin: 32px 16px; text-align: center; color: var(--text-3); }
  iframe { position: fixed; top: var(--sat); left: 0; right: var(--panel-w); bottom: 0; width: calc(100% - var(--panel-w)); height: calc(100% - var(--sat)); border: 0; display: block; }
  .desk iframe { top: calc(var(--sat) + 48px); height: calc(100% - var(--sat) - 48px); }
</style>
