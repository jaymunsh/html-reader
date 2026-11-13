<script lang="ts">
  import { onDestroy } from 'svelte';
  import { importFile } from '../../lib/importer/client';
  import { ImportError, importErrorMessage, type ImportErrorCode } from '../../lib/importer/errors';

  let { onimported, busy = $bindable(false) }: { onimported: () => void; busy?: boolean } = $props();
  let pct = $state(0);
  // Errors stay until dismissed, so a batch never hides an earlier file's cause (spec §9.1).
  let errors = $state<{ id: number; name: string; code: ImportErrorCode }[]>([]);
  let nextId = 0;
  let choices = $state<string[] | null>(null);
  let pick: ((p: string | null) => void) | null = null;

  export async function start(file: File): Promise<void> {
    if (busy) return;
    busy = true; pct = 0;
    try {
      await importFile(file, { kind: 'new' }, {
        onProgress: (d, t) => { pct = t ? Math.round((d / t) * 100) : 100; },
        chooseEntry: (paths) => new Promise((res) => { pick = res; choices = paths; }),
      });
      onimported();
    } catch (e) {
      errors.push({ id: nextId++, name: file.name, code: e instanceof ImportError ? e.code : 'failed' });
    } finally {
      busy = false; choices = null;
    }
  }

  function choose(p: string | null) { choices = null; pick?.(p); pick = null; }
  // Unmounted mid-choice: cancel it, or the import (and its lock) would wait forever.
  onDestroy(() => choose(null));
</script>

{#if busy && !choices}
  <p data-testid="import-progress">가져오는 중… {pct}%</p>
{/if}
{#if choices}
  <div class="scrim"></div>
  <div class="dialog" role="dialog" aria-modal="true" aria-label="시작 페이지 선택">
    <p>시작할 페이지를 선택하세요.</p>
    {#each choices as p (p)}
      <button type="button" data-testid="entry-choice" data-path={p} onclick={() => choose(p)}>{p}</button>
    {/each}
    <button type="button" data-testid="entry-cancel" onclick={() => choose(null)}>취소</button>
  </div>
{/if}
{#each errors as err (err.id)}
  <div role="alert" data-testid="import-error" data-code={err.code} data-name={err.name}>
    <p><strong>{err.name}</strong> — {importErrorMessage(err.code)}</p>
    <button type="button" data-testid="confirm-ok" onclick={() => (errors = errors.filter((x) => x.id !== err.id))}>확인</button>
  </div>
{/each}

<style>
  .scrim { position: fixed; inset: 0; z-index: 19; background: var(--scrim); }
  .dialog { position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%); z-index: 20; width: min(90vw, 360px); max-height: 80vh; overflow-y: auto; box-sizing: border-box;
    padding: 20px; border-radius: var(--r-sheet); background: var(--surface); }
  .dialog button { min-height: 44px; border-radius: var(--r-control); margin-right: 8px; }
</style>
