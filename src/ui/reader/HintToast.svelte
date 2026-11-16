<script lang="ts">
  import Toast from '../Toast.svelte';
  let { ondismiss }: { ondismiss: () => void } = $props();
</script>

<Toast testid="hint-toast" actionTestid="hint-ok" actionLabel="확인" onaction={ondismiss}>
  빈 곳을 한 번 탭하면 메뉴가 열려요 — 링크·버튼은 그대로 동작해요. 오른쪽 가장자리 탭으로도 열 수 있어요.
</Toast>
