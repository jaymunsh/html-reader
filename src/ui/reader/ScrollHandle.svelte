<script lang="ts">
  import { onDestroy } from 'svelte';
  import Icon from '../icons/Icon.svelte';

  let { ratio, label, onSeek, onDragState }: {
    ratio: number; label: string; onSeek: (ratio: number) => void; onDragState: (dragging: boolean) => void;
  } = $props();

  const H = 64;
  let track = $state<HTMLDivElement>();
  let trackH = $state(0);
  let dragging = $state(false);
  let dragRatio = $state(0);
  let grab = H / 2; // pointer offset inside the capsule at pointerdown
  let raf = 0;
  let pending = 0;

  const shown = $derived(dragging ? dragRatio : Math.min(1, Math.max(0, ratio)));
  const y = $derived(shown * Math.max(0, trackH - H));

  function calc(clientY: number): number {
    const r = track!.getBoundingClientRect();
    const span = r.height - H;
    return span > 0 ? Math.min(1, Math.max(0, (clientY - r.top - grab) / span)) : 0;
  }
  function seek(clientY: number) {
    dragRatio = pending = calc(clientY);
    if (!raf) raf = requestAnimationFrame(() => { raf = 0; onSeek(pending); });
  }
  function down(e: PointerEvent) {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    const el = e.currentTarget as HTMLElement;
    // Keep receiving moves after the finger slides off onto the iframe; synthetic pointers may refuse capture.
    try { el.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    grab = e.clientY - el.getBoundingClientRect().top;
    dragging = true;
    onDragState(true);
    seek(e.clientY);
  }
  function move(e: PointerEvent) { if (dragging) seek(e.clientY); }
  function end() {
    if (!dragging) return;
    dragging = false;
    onDragState(false);
  }
  onDestroy(() => { if (raf) cancelAnimationFrame(raf); if (dragging) onDragState(false); });
</script>

<div class="track" bind:this={track} bind:clientHeight={trackH}>
  <div class="mover" style:transform={`translateY(${y}px)`}>
    {#if dragging}
      <div class="bubble" data-testid="scroll-bubble">{label} · {Math.round(dragRatio * 100)}%</div>
    {/if}
    <div class="handle" data-testid="scroll-handle" role="slider" tabindex="-1" aria-label="빠른 스크롤" aria-orientation="vertical"
      aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(shown * 100)}
      onpointerdown={down} onpointermove={move} onpointerup={end} onpointercancel={end}>
      <Icon name="chevron-up" size={14} /><Icon name="chevron-down" size={14} />
    </div>
  </div>
</div>

<style>
  /* between the top bar (52px + hairline) and the bottom bar (56px + hairline) */
  .track { position: fixed; right: 0; z-index: 9; top: calc(var(--sat) + 53px); bottom: calc(var(--sab) + 57px); width: 44px; pointer-events: none; }
  .mover { position: absolute; right: 0; top: 0; width: 30px; height: 64px; will-change: transform; }
  .handle {
    position: relative; width: 30px; height: 64px; box-sizing: border-box; display: flex; flex-direction: column; align-items: center; justify-content: space-around;
    border-radius: 15px 0 0 15px; background: var(--bar); color: var(--text-2); border: 1px solid var(--hairline); border-right: 0;
    -webkit-backdrop-filter: blur(22px) saturate(1.6); backdrop-filter: blur(22px) saturate(1.6);
    touch-action: none; pointer-events: auto; user-select: none; -webkit-user-select: none;
  }
  .handle::before { content: ''; position: absolute; inset: 0 0 0 -14px; } /* 44px-wide hit area */
  .bubble {
    position: absolute; right: 40px; top: 50%; translate: 0 -50%; white-space: nowrap; max-width: 60vw; overflow: hidden; text-overflow: ellipsis;
    padding: 8px 14px; border-radius: var(--r-chip); background: rgba(21,24,30,.82); color: #fff; font-size: 13px; pointer-events: none;
  }
</style>
