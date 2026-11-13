<script lang="ts">
  import type { Issue } from '../../lib/storage';
  import Sheet from '../Sheet.svelte';

  let { open, issues, onClose, invoker }: { open: boolean; issues: Issue[]; onClose(): void; invoker?: HTMLElement } = $props();
  const reason = (k: Issue['kind']) => (k === 'missing' ? '묶음에 없음' : '묶음 바깥 경로 참조 — 상위 폴더째로 압축하세요');
</script>

<Sheet {open} {onClose} {invoker} label="누락된 리소스" testid="issue">
  <div class="head">
    <strong>누락된 리소스</strong>
    <button type="button" data-testid="issue-close" data-autofocus onclick={onClose}>닫기</button>
  </div>
  <ul>
    {#each issues as i (i.kind + i.path)}
      <li data-testid="issue-row"><code>{i.path}</code><span>{reason(i.kind)}</span></li>
    {/each}
  </ul>
</Sheet>

<style>
  .head { display: flex; align-items: center; justify-content: space-between; padding: 8px 16px; flex: none; }
  .head button { min-height: 44px; min-width: 44px; padding: 0 12px; border: 0; background: none; color: var(--accent); font: inherit; }
  ul { list-style: none; margin: 0; padding: 0 16px 16px; overflow-y: auto; overscroll-behavior: contain; }
  li { display: flex; flex-direction: column; gap: 2px; padding: 10px 0; border-top: 1px solid var(--hairline); }
  code { overflow-wrap: anywhere; font-size: 13px; }
  li span { font-size: 13px; color: var(--text-3); }
</style>
