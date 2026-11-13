<script lang="ts">
  import { onDestroy } from 'svelte';
  import { importFile } from '../../lib/importer/client';
  import { ImportError, importErrorMessage, type ImportErrorCode } from '../../lib/importer/errors';
  import Dialog from './Dialog.svelte';

  // `held`: the library has its own dialog up, so the error list waits behind it (one dialog at a time).
  // `modal`: a dialog of this component is showing (the library goes inert).
  let { onimported, busy = $bindable(false), pct = $bindable(0), modal = $bindable(false), held = false }: {
    onimported: () => void; busy?: boolean; pct?: number; modal?: boolean; held?: boolean;
  } = $props();
  // Errors stay until dismissed, so a batch never hides an earlier file's cause (spec §9.1).
  let errors = $state<{ id: number; name: string; code: ImportErrorCode }[]>([]);
  let nextId = 0;
  let choices = $state<string[] | null>(null);
  let pick: ((p: string | null) => void) | null = null;
  const showErrors = $derived(!choices && !held && errors.length > 0);
  $effect(() => { modal = !!choices || showErrors; });

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
      const code = e instanceof ImportError ? e.code : 'failed';
      if (code !== 'cancelled') errors.push({ id: nextId++, name: file.name, code }); // the user cancelled it: nothing to report
    } finally {
      busy = false; choices = null;
    }
  }

  function choose(p: string | null) { choices = null; pick?.(p); pick = null; }
  // Unmounted mid-choice: cancel it, or the import (and its lock) would wait forever.
  onDestroy(() => choose(null));
</script>

<!-- The entry choice also waits behind a library dialog. `held` is read first: with `choices && !held`, Svelte 5.57
     did not re-run this block when `held` alone turned false (the choice never appeared). -->
{#if !held && choices}
  <Dialog title="시작 페이지 선택" oncancel={() => choose(null)}>
    <p>시작할 페이지를 선택하세요.</p>
    <div class="options">
      {#each choices as p (p)}
        <button type="button" class="option" data-testid="entry-choice" data-path={p} onclick={() => choose(p)}>{p}</button>
      {/each}
    </div>
    <div class="actions"><button type="button" data-testid="entry-cancel" onclick={() => choose(null)}>취소</button></div>
  </Dialog>
{:else if showErrors}
  <Dialog title="가져오지 못했습니다" oncancel={() => (errors = [])}>
    {#each errors as err (err.id)}
      <div class="err" role="alert" data-testid="import-error" data-code={err.code} data-name={err.name}>
        <p class="msg"><strong>{err.name}</strong>{importErrorMessage(err.code)}</p>
        <button type="button" data-testid="confirm-ok" onclick={() => (errors = errors.filter((x) => x.id !== err.id))}>확인</button>
      </div>
    {/each}
  </Dialog>
{/if}

<style>
  .options { display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px; }
  .err { display: flex; align-items: center; gap: 12px; padding: 12px 0; border-top: 1px solid var(--hairline); }
  .err p.msg { flex: 1; min-width: 0; margin: 0; }
  .err strong { display: block; color: var(--text); font-weight: 600; overflow-wrap: anywhere; }
</style>
