<script lang="ts">
  import { tick, type Snippet } from 'svelte';
  import Icon from './icons/Icon.svelte';

  // The ⋯ row menu: focus moves to the first item on open; Escape, Tab out, or a press outside `within` closes it.
  // Items are role=menuitem buttons; call `close()` before acting (it returns focus to the ⋯ button).
  let { open = $bindable(false), testid, within, children }: {
    open?: boolean; testid: string;
    /** A press inside this element is left to it (default: the menu itself). */
    within?: HTMLElement;
    children: Snippet<[() => void]>;
  } = $props();
  let root = $state<HTMLElement>();
  let btn = $state<HTMLButtonElement>();
  let list = $state<HTMLElement>();
  const items = () => [...(list?.querySelectorAll<HTMLElement>('[role=menuitem]') ?? [])];

  function close() { open = false; btn?.focus(); }

  $effect(() => {
    if (!open) return;
    void tick().then(() => items()[0]?.focus({ preventScroll: true }));
    const out = (e: Event) => { if (!(within ?? root)?.contains(e.target as Node)) open = false; };
    window.addEventListener('pointerdown', out, true);
    return () => window.removeEventListener('pointerdown', out, true);
  });

  function onkeydown(e: KeyboardEvent) {
    if (!open) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const all = items(), i = all.indexOf(document.activeElement as HTMLElement);
    all[(i + (e.key === 'ArrowDown' ? 1 : -1) + all.length) % all.length]?.focus();
  }
  // Focus moving elsewhere (Tab) closes it. Not to an ancestor: WebKit focuses the nearest focusable ancestor (the panel)
  // on a press on an item, before its click. A null target (a press on nothing focusable) is the outside press's job.
  function onfocusout(e: FocusEvent) {
    const to = e.relatedTarget as Node | null;
    if (to && root && !root.contains(to) && !to.contains(root)) open = false;
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
<span bind:this={root} class="wrap" onclick={(e) => e.stopPropagation()} {onkeydown} {onfocusout}>
  <button bind:this={btn} type="button" class="icon-btn menu-btn" data-testid={testid} aria-label="메뉴" aria-haspopup="menu" aria-expanded={open}
    onclick={() => (open = !open)}><Icon name="more" /></button>
  {#if open}
    <div bind:this={list} class="menu" role="menu">{@render children(close)}</div>
  {/if}
</span>

<style>
  .wrap { position: relative; flex: none; align-self: flex-start; }
  .menu-btn { border-radius: var(--r-control); color: var(--text-3); cursor: pointer; }
  .menu-btn:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
  @media (hover: hover) { .menu-btn:hover { background: var(--bg-app); color: var(--text); } }
  .menu {
    position: absolute; right: 0; top: calc(100% - 4px); z-index: var(--z-popover); min-width: 160px; padding: 6px; box-sizing: border-box;
    background: var(--surface); border: 1px solid var(--hairline); border-radius: var(--r-control); box-shadow: var(--shadow-card);
    transform-origin: top right; animation: pop .14s ease-out both;
  }
  .menu :global(button) {
    display: block; width: 100%; min-height: 44px; padding: 0 14px; text-align: left; border: 0; border-radius: var(--r-control);
    background: none; color: var(--text); font: inherit; font-size: 15px; font-weight: 600; cursor: pointer;
  }
  .menu :global(button.danger) { color: var(--danger); }
  .menu :global(button:focus-visible) { outline: 2px solid var(--accent); outline-offset: -2px; }
  @media (hover: hover) { .menu :global(button:hover) { background: var(--bg-app); } }
  @keyframes pop { from { opacity: 0; transform: scale(.94); } }
  @media (prefers-reduced-motion: reduce) { .menu { animation: none; } }
</style>
