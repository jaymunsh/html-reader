<script lang="ts">
  let { pct, size = 52 }: { pct: number; size?: number } = $props();
  const v = $derived(Math.max(0, Math.min(100, Math.round(pct))));
  const sw = 4;
  const r = $derived((size - sw) / 2);
  const c = $derived(2 * Math.PI * r);
</script>

<span class="ring" class:done={v >= 100} role="img" aria-label="진행률 {v}%" style:width="{size}px" style:height="{size}px">
  <svg width={size} height={size} viewBox="0 0 {size} {size}" aria-hidden="true">
    <circle class="track" cx={size / 2} cy={size / 2} {r} stroke-width={sw} fill="none" />
    {#if v > 0}
      <circle class="arc" cx={size / 2} cy={size / 2} {r} stroke-width={sw} fill="none" stroke-linecap="round"
        stroke-dasharray={c} stroke-dashoffset={c * (1 - v / 100)} transform="rotate(-90 {size / 2} {size / 2})" />
    {/if}
  </svg>
  <span class="num" data-testid="book-progress">{v}%</span>
</span>

<style>
  .ring { position: relative; flex: none; display: grid; place-items: center; }
  svg { position: absolute; inset: 0; }
  .track { stroke: var(--accent-soft); }
  .arc { stroke: var(--accent); }
  .done .arc { stroke: var(--ok); }
  .num { position: relative; font-size: 12px; font-weight: 700; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; color: var(--text); }
</style>
