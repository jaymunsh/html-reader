<script lang="ts">
  import { tick } from 'svelte';
  import { buildTree } from '../../lib/file-tree';
  import { bookProgress } from '../../lib/progress';
  import type { PageProgress } from '../../lib/storage';
  import Icon from '../icons/Icon.svelte';

  let { open, sourceName, pagePaths, titles, progress, current, onpick }: {
    open: boolean; sourceName: string; pagePaths: string[]; titles: Record<string, string>;
    progress: ReadonlyMap<string, PageProgress>; current: string; onpick(path: string): void;
  } = $props();

  const rows = $derived(buildTree(pagePaths));
  const sum = $derived(bookProgress(pagePaths, progress));
  const status = (p: string) => {
    const pr = progress.get(p);
    return pr?.read ? 'read' : pr && pr.maxPct > 0 ? 'partial' : 'unread';
  };

  let list = $state<HTMLElement>();
  // Opening the panel (or moving to another page while it is open) brings the current row into view.
  $effect(() => {
    if (!open || !current) return;
    void tick().then(() => list?.querySelector('[aria-current=page]')?.scrollIntoView({ block: 'center' }));
  });
</script>

<div class="head" data-testid="panel-head">
  <span class="sum">{sourceName} · HTML {sum.total}개 중 {sum.readCount}개 읽음</span>
  <span class="all">전체 {Math.floor(sum.pct)}%</span>
</div>
<ul bind:this={list}>
  {#each rows as r (r.kind === 'file' ? r.path : `dir:${r.dir}`)}
    {#if r.kind === 'folder'}
      <li class="folder"><Icon name="folder" size={18} />{r.label}</li>
    {:else}
      {@const s = status(r.path)}
      <li>
        <button type="button" class="row" class:indent={r.indent} data-testid="file-row" data-path={r.path} data-status={s}
          aria-current={r.path === current ? 'page' : undefined} onclick={() => onpick(r.path)}>
          <span class="name">
            <span class="main">{r.name}</span>
            {#if titles[r.path]}<span class="sub">{titles[r.path]}</span>{/if}
          </span>
          {#if s === 'read'}
            <span class="st ok"><Icon name="check" size={16} />읽음</span>
          {:else if s === 'partial'}
            <span class="st">{Math.floor(progress.get(r.path)!.maxPct)}%</span>
          {:else}
            <span class="st">안 읽음</span>
          {/if}
        </button>
      </li>
    {/if}
  {/each}
</ul>

<style>
  .head { display: flex; justify-content: space-between; gap: 8px; padding: 4px 16px 8px; font-size: 13px; color: var(--text-3); }
  .all { white-space: nowrap; }
  ul { list-style: none; margin: 0; padding: 0 8px 8px; }
  .folder { display: flex; align-items: center; gap: 6px; min-height: 36px; padding: 0 8px; font-size: 13px; color: var(--text-3); }
  .row {
    display: flex; align-items: center; gap: 12px; width: 100%; min-height: 44px; padding: 6px 8px; box-sizing: border-box;
    border: 0; border-radius: var(--r-control); background: none; color: var(--text); font: inherit; text-align: left;
  }
  .row.indent { padding-left: 32px; }
  .row[aria-current='page'] { background: var(--accent-soft); }
  .name { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .main, .sub { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .sub { font-size: 12px; color: var(--text-3); }
  .st { display: flex; align-items: center; gap: 4px; flex: none; font-size: 12px; color: var(--text-3); }
  .st.ok { color: var(--ok); }
</style>
