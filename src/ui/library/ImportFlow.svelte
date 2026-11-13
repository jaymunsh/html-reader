<script lang="ts">
  import { importFile } from '../../lib/importer/client';
  import { ImportError, importErrorMessage, type ImportErrorCode } from '../../lib/importer/errors';

  let { onimported }: { onimported: () => void } = $props();
  let busy = $state(false);
  let pct = $state(0);
  let error = $state<ImportErrorCode | null>(null);
  let choices = $state<string[] | null>(null);
  let pick: ((p: string | null) => void) | null = null;

  export async function start(file: File): Promise<void> {
    if (busy) return;
    busy = true; pct = 0; error = null;
    try {
      await importFile(file, { kind: 'new' }, {
        onProgress: (d, t) => { pct = t ? Math.round((d / t) * 100) : 100; },
        chooseEntry: (paths) => new Promise((res) => { pick = res; choices = paths; }),
      });
      onimported();
    } catch (e) {
      error = e instanceof ImportError ? e.code : 'failed';
    } finally {
      busy = false; choices = null;
    }
  }

  function choose(p: string | null) { choices = null; pick?.(p); pick = null; }
</script>

{#if busy && !choices}
  <p data-testid="import-progress">가져오는 중… {pct}%</p>
{/if}
{#if choices}
  <div role="dialog" aria-label="시작 페이지 선택">
    <p>시작할 페이지를 선택하세요.</p>
    {#each choices as p (p)}
      <button type="button" data-testid="entry-choice" data-path={p} onclick={() => choose(p)}>{p}</button>
    {/each}
    <button type="button" data-testid="entry-cancel" onclick={() => choose(null)}>취소</button>
  </div>
{/if}
{#if error}
  <div role="alert" data-testid="import-error" data-code={error}>
    <p>{importErrorMessage(error)}</p>
    <button type="button" data-testid="confirm-ok" onclick={() => (error = null)}>확인</button>
  </div>
{/if}
