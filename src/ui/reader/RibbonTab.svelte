<script lang="ts">
  let { onopen }: { onopen: () => void } = $props();
</script>

<button type="button" class="tab" data-testid="ribbon-tab" aria-label="메뉴 열기" onclick={onopen}>
  <i data-testid="ribbon-shape"></i>
</button>

<style>
  .tab {
    position: fixed; right: 0; top: calc(var(--sat) + 150px); z-index: var(--z-ribbon); width: 48px; height: 48px;
    padding: 0; border: 0; background: transparent; display: flex; align-items: center; justify-content: flex-end;
  }
  i { display: block; width: 14px; height: 26px; background: var(--accent); opacity: 0.35; clip-path: polygon(0 0, 100% 0, 100% 100%, 0 100%, 35% 50%); }
</style>
