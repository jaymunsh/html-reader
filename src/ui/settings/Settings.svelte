<script lang="ts">
  import { onMount } from 'svelte';
  import { getSetting, setSetting } from '../../lib/storage';
  import { setThemeSetting } from '../chrome';
  import Icon from '../icons/Icon.svelte';

  let { onback }: { onback: () => void } = $props();
  let theme = $state<'system' | 'light' | 'dark'>('system');
  let progressLine = $state(true);
  let persisted = $state<boolean | null>(null);

  onMount(() => {
    void getSetting('theme').then((v) => (theme = v));
    void getSetting('progressLine').then((v) => (progressLine = v));
    void Promise.resolve(navigator.storage?.persisted?.()).then((v) => (persisted = !!v), () => (persisted = false));
  });

  const themes = [['system', '시스템'], ['light', '라이트'], ['dark', '다크']] as const;
  function pick(t: 'system' | 'light' | 'dark') {
    const prev = theme;
    theme = t;
    void setThemeSetting(t).then((ok) => { if (!ok && theme === t) theme = prev; });
  }
  function toggleLine() {
    const v = progressLine;
    void setSetting('progressLine', v).catch(() => { if (progressLine === v) progressLine = !v; });
  }
</script>

<main data-testid="settings">
  <header>
    <button type="button" class="icon-btn back" data-testid="settings-back" aria-label="뒤로" onclick={onback}><Icon name="back" /></button>
    <h1>설정</h1>
  </header>

  <section>
    <h2>화면 테마</h2>
    <div class="seg" role="group" aria-label="화면 테마">
      {#each themes as [v, label] (v)}
        <button type="button" data-testid={`theme-${v}`} aria-pressed={theme === v} onclick={() => pick(v)}>{label}</button>
      {/each}
    </div>
  </section>

  <section>
    <label class="row">
      <span>리더 하단 진행선</span>
      <input type="checkbox" data-testid="setting-progress-line" bind:checked={progressLine} onchange={toggleLine} />
    </label>
  </section>

  <section>
    <p class="persist" data-testid="persist-status">
      {#if persisted === null}&nbsp;{:else if persisted}영구 저장: 허용됨{:else}영구 저장: 허용되지 않음 — 브라우저가 저장 공간이 부족할 때 문서를 지울 수 있습니다{/if}
    </p>
  </section>
</main>

<style>
  main { min-height: 100vh; box-sizing: border-box; padding: calc(8px + var(--sat)) 16px 24px; max-width: 640px; margin: 0 auto; }
  header { display: flex; align-items: center; gap: 4px; min-height: 52px; }
  h1 { font-size: 20px; font-weight: 700; margin: 0; }
  h2 { font-size: 13px; font-weight: 600; color: var(--text-3); margin: 0 0 8px 4px; }
  .back { border-radius: var(--r-control); margin-left: -10px; }
  section { margin-top: 20px; background: var(--surface); border-radius: var(--r-card); padding: 14px; box-shadow: var(--shadow-card); }
  .seg { display: flex; gap: 6px; padding: 4px; border-radius: var(--r-control); background: var(--bg-app); }
  .seg button { flex: 1; min-height: 44px; border: 0; border-radius: 9px; background: none; color: var(--text-2); font: inherit; font-weight: 600; }
  .seg button[aria-pressed='true'] { background: var(--accent-soft); color: var(--accent); }
  .row { display: flex; align-items: center; justify-content: space-between; min-height: 44px; color: var(--text); }
  .row input { width: 22px; height: 22px; accent-color: var(--accent); }
  .persist { margin: 0; color: var(--text-2); font-size: 14px; line-height: 1.5; }
  button:focus-visible, input:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
</style>
