<script lang="ts">
  // `busy`: an indeterminate line at the top of the reading area (a page is loading), instead of the bottom reading line.
  let { pct = 0, hidden = false, busy = false }: { pct?: number; hidden?: boolean; busy?: boolean } = $props();
</script>

{#if busy}
  <div class="line busy" data-testid="progress-busy" role="progressbar" aria-label="불러오는 중"><i></i></div>
{:else}
  <div class="line" class:hidden data-testid="progress-line" data-pct={Math.round(pct)} aria-hidden="true">
    <i style:transform={`scaleX(${pct / 100})`}></i>
  </div>
{/if}

<style>
  .line { position: fixed; left: 0; right: 0; bottom: 0; height: 2px; z-index: var(--z-line); pointer-events: none; transition: opacity .2s ease; }
  .line.hidden { opacity: 0; }
  i { display: block; width: 100%; height: 100%; background: var(--accent); transform-origin: left; }
  .busy { top: var(--busy-top, var(--sat)); bottom: auto; right: var(--panel-w, 0px); overflow: hidden; }
  .busy i { width: 40%; animation: slide 1.1s ease-in-out infinite; }
  @keyframes slide { from { transform: translateX(-100%); } to { transform: translateX(250%); } }
  @media (prefers-reduced-motion: reduce) {
    .busy i { width: 100%; animation: pulse 1.6s ease-in-out infinite alternate; }
    @keyframes pulse { from { opacity: .25; } to { opacity: .8; } }
  }
</style>
