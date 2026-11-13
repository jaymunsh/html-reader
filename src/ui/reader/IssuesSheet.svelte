<script lang="ts">
  import { tick } from 'svelte';
  import type { Issue } from '../../lib/storage';

  let { open, issues, onClose }: { open: boolean; issues: Issue[]; onClose(): void } = $props();
  let el = $state<HTMLElement>();
  const reason = (k: Issue['kind']) => (k === 'missing' ? '묶음에 없음' : '묶음 바깥 경로 참조 — 상위 폴더째로 압축하세요');

  // Opening moves focus inside the sheet (same pattern as Panel).
  $effect(() => {
    if (open) void tick().then(() => el?.querySelector<HTMLElement>('[data-testid=issue-close]')?.focus({ preventScroll: true }));
  });
  function onkeydown(e: KeyboardEvent) {
    if (e.key !== 'Escape') return;
    e.preventDefault(); e.stopPropagation();
    onClose();
  }
</script>

<div class="scrim" class:open data-testid="issue-scrim" role="presentation" onclick={onClose}></div>
<div bind:this={el} class="sheet" class:open data-testid="issue-sheet" inert={!open} role="dialog" tabindex="-1" aria-modal="true" aria-label="누락된 리소스" {onkeydown}>
  <div class="head">
    <strong>누락된 리소스</strong>
    <button type="button" data-testid="issue-close" onclick={onClose}>닫기</button>
  </div>
  <ul>
    {#each issues as i (i.kind + i.path)}
      <li data-testid="issue-row"><code>{i.path}</code><span>{reason(i.kind)}</span></li>
    {/each}
  </ul>
</div>

<style>
  .scrim { position: fixed; inset: 0; z-index: 39; background: var(--scrim); opacity: 0; pointer-events: none; transition: opacity .25s ease; }
  .scrim.open { opacity: 1; pointer-events: auto; }
  .sheet {
    position: fixed; z-index: 40; left: 0; right: 0; bottom: 0; max-height: 70vh; display: flex; flex-direction: column;
    box-sizing: border-box; padding-bottom: var(--sab); background: var(--surface); color: var(--text);
    border-radius: var(--r-sheet) var(--r-sheet) 0 0; transform: translateY(100%); transition: transform .25s ease, visibility 0s .25s;
    visibility: hidden; margin: 0 auto; max-width: 560px;
  }
  .sheet.open { transform: none; visibility: visible; transition: transform .25s ease; }
  .head { display: flex; align-items: center; justify-content: space-between; padding: 8px 16px; flex: none; }
  .head button { min-height: 44px; min-width: 44px; padding: 0 12px; border: 0; background: none; color: var(--accent); font: inherit; }
  ul { list-style: none; margin: 0; padding: 0 16px 16px; overflow-y: auto; overscroll-behavior: contain; }
  li { display: flex; flex-direction: column; gap: 2px; padding: 10px 0; border-top: 1px solid var(--hairline); }
  code { overflow-wrap: anywhere; font-size: 13px; }
  li span { font-size: 13px; color: var(--text-3); }
</style>
