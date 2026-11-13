<script lang="ts">
  let { pct, hidden }: { pct: number; hidden: boolean } = $props();
</script>

<div class="line" class:hidden data-testid="progress-line" data-pct={Math.round(pct)} aria-hidden="true">
  <i style:transform={`scaleX(${pct / 100})`}></i>
</div>

<style>
  .line { position: fixed; left: 0; right: 0; bottom: 0; height: 2px; z-index: var(--z-line); pointer-events: none; transition: opacity .2s ease; }
  .line.hidden { opacity: 0; }
  i { display: block; width: 100%; height: 100%; background: var(--accent); transform-origin: left; }
</style>
