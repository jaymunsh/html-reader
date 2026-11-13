<script lang="ts">
  let { ondismiss }: { ondismiss: () => void } = $props();
</script>

<div class="toast" role="status" data-testid="hint-toast">
  <p>빈 곳을 한 번 탭하면 메뉴가 열려요 — 링크·버튼은 그대로 동작해요. 오른쪽 가장자리 탭으로도 열 수 있어요.</p>
  <button type="button" data-testid="hint-ok" onclick={ondismiss}>확인</button>
</div>

<style>
  .toast {
    position: fixed; left: 12px; right: 12px; bottom: calc(var(--sab) + 16px); z-index: 11;
    display: flex; align-items: center; gap: 12px; padding: 12px 8px 12px 16px;
    background: var(--surface); color: var(--text); border: 1px solid var(--hairline); border-radius: 14px;
    font-size: 14px; line-height: 1.45;
  }
  p { margin: 0; flex: 1; }
  button { min-width: 44px; min-height: 44px; background: none; border: 0; color: var(--accent); font-weight: 600; font-size: 14px; }
</style>
