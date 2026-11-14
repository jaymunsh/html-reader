<script lang="ts">
  import { tick } from 'svelte';
  import Icon from '../icons/Icon.svelte';
  import { SEARCH_DEBOUNCE_MS, hitSnippet, searchBook, type SearchGroup, type SearchHit } from '../../lib/search';

  // Spec §7.1. 'fullscreen': the mobile panel's content (the caller wraps it in a Sheet).
  // 'dropdown': the PC top bar's input with results below it; not modal. Below a 640px bar it collapses to a 44px toggle.
  let { bookId, variant, onPick, onClose }: {
    bookId: string; variant: 'fullscreen' | 'dropdown';
    onPick(path: string, query: string, snippet: string): void; onClose(): void;
  } = $props();

  const LIMIT_NOTE = '스크립트가 실행된 뒤에 만들어지는 텍스트는 검색되지 않습니다.';
  let query = $state('');
  // The groups found for `q`: kept until the next query's results arrive (no flicker while typing).
  let res = $state<{ q: string; groups: SearchGroup[] } | null>(null);
  let open = $state(false);     // dropdown: the results are showing
  let expanded = $state(false); // dropdown on a narrow bar: the input is shown in place of the toggle
  let input = $state<HTMLInputElement>();
  let root = $state<HTMLElement>();

  $effect(() => {
    const q = query.trim();
    if (!q) { res = null; return; }
    let live = true;
    const t = setTimeout(() => {
      void searchBook(bookId, q).then((groups) => { if (live) res = { q, groups }; }).catch(() => { if (live) res = { q, groups: [] }; });
    }, SEARCH_DEBOUNCE_MS);
    return () => { live = false; clearTimeout(t); };
  });

  /** The `/` shortcut and the narrow bar's toggle: show the input and focus it. */
  export function focus() {
    expanded = true;
    void tick().then(() => input?.focus());
  }
  function close() { open = false; onClose(); }
  function pick(path: string, h: SearchHit) {
    const q = res!.q;
    if (variant === 'dropdown') close();
    onPick(path, q, hitSnippet(h));
  }
  function onkeydown(e: KeyboardEvent) {
    if (variant !== 'dropdown' || e.key !== 'Escape' || !open) return; // the fullscreen Sheet handles its own Escape
    e.preventDefault();
    close();
    input?.focus();
  }
  // Outside click (the document frame included) moves focus out: close and collapse.
  function onfocusout(e: FocusEvent) {
    if (variant === 'dropdown' && !root?.contains(e.relatedTarget as Node | null)) { open = false; expanded = false; }
  }
  const name = (p: string) => p.split('/').pop() ?? p;
</script>

{#snippet results()}
  <!-- Keep focus in the input while clicking a result (WebKit would blur it to the body and close the dropdown first). -->
  <div class="results" role="presentation" onmousedown={(e) => variant === 'dropdown' && e.preventDefault()}>
    {#if res}
      {#each res.groups as g (g.path)}
        <section class="group" data-testid="search-group" data-path={g.path}>
          <h3><span class="fn">{name(g.path)}</span><span class="n">{g.total > g.hits.length ? `${g.total}건 중 ${g.hits.length}건 표시` : `${g.total}건`}</span></h3>
          {#each g.hits as h, i (i)}
            <!-- Text nodes only (never {@html}): the snippet is document text, not markup. -->
            <button type="button" class="hit" data-testid="search-result" onclick={() => pick(g.path, h)}>{h.before}<mark>{h.match}</mark>{h.after}</button>
          {/each}
        </section>
      {:else}
        <p class="empty">일치하는 내용이 없습니다</p>
      {/each}
    {/if}
    <p class="note" data-testid="search-limit-note">{LIMIT_NOTE}</p>
  </div>
{/snippet}

{#if variant === 'fullscreen'}
  <div class="full">
    <div class="head">
      <label class="field">
        <Icon name="search" size={18} />
        <input bind:this={input} bind:value={query} type="search" data-testid="search-input" data-autofocus placeholder="검색" aria-label="검색" enterkeyhint="search" />
      </label>
      <button type="button" class="cancel" data-testid="search-cancel" onclick={onClose}>취소</button>
    </div>
    {@render results()}
  </div>
{:else}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div class="dd" class:expanded bind:this={root} role="search" {onkeydown} {onfocusout}>
    <button type="button" class="icon-btn toggle" data-testid="search-toggle" aria-label="검색" aria-expanded={expanded} onclick={focus}><Icon name="search" /></button>
    <div class="pop">
      <label class="field">
        <Icon name="search" size={16} />
        <input bind:this={input} bind:value={query} type="search" data-testid="search-input" placeholder="검색" aria-label="검색"
          onfocus={() => (open = true)} oninput={() => (open = true)} />
        <kbd aria-hidden="true">/</kbd>
      </label>
      <!-- P3-K18 (Svelte 5.57.3): read the state `open` before the trimmed query so the block re-renders on both. -->
      {#if open && query.trim()}
        <div class="drop">{@render results()}</div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .field { display: flex; align-items: center; gap: 8px; box-sizing: border-box; padding: 0 12px; border-radius: var(--r-control); background: var(--hairline); color: var(--text-3); }
  .field input { flex: 1; min-width: 0; height: 100%; border: 0; padding: 0; background: none; color: var(--text); font: inherit; font-size: 16px; outline: none; }
  .field:focus-within { outline: 2px solid var(--accent); outline-offset: -2px; }
  input::-webkit-search-cancel-button { display: none; }

  .full { display: flex; flex-direction: column; flex: 1; min-height: 0; }
  .head { display: flex; align-items: center; gap: 8px; padding: 8px max(12px, env(safe-area-inset-right)) 8px max(12px, env(safe-area-inset-left)); border-bottom: 1px solid var(--hairline); }
  .head .field { flex: 1; height: 44px; }
  .cancel { min-height: 44px; min-width: 44px; padding: 0 8px; border: 0; background: none; color: var(--accent); font: inherit; font-weight: 600; }
  .full .results { flex: 1; overflow: auto; overscroll-behavior: contain; }

  .group { padding: 4px 0; border-bottom: 1px solid var(--hairline); }
  h3 { display: flex; gap: 8px; align-items: baseline; margin: 0; padding: 12px 16px 4px; font-size: 13px; font-weight: 600; }
  .fn { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .n { flex: none; color: var(--text-3); font-weight: 400; font-size: 12px; }
  .hit { display: block; width: 100%; min-height: 44px; box-sizing: border-box; padding: 10px 16px; border: 0; background: none; color: var(--text-2); font: inherit; font-size: 14px; line-height: 1.5; text-align: left; overflow-wrap: anywhere; }
  .hit:hover { background: var(--accent-soft); }
  .hit:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
  mark { background: var(--accent-soft); color: var(--accent); font-weight: 600; border-radius: 3px; }
  .empty { margin: 24px 16px; text-align: center; color: var(--text-3); }
  .note { margin: 0; padding: 12px 16px; font-size: 12px; color: var(--text-3); }

  /* PC dropdown. Wide bar: the input sits in the bar and shrinks before anything else; results open under it. */
  .dd { position: relative; display: flex; align-items: center; flex: 0 1 220px; min-width: 100px; }
  :global(.actions) > .dd { flex-shrink: 1; } /* the bar's other controls never shrink */
  .toggle { display: none; }
  .pop { display: contents; }
  .dd .field { position: relative; width: 100%; height: 36px; }
  .dd .field::before { content: ''; position: absolute; inset: -4px 0; } /* 44px tall target */
  .dd input { position: relative; font-size: 14px; } /* painted above the label's hit-area strip */
  .dd input { width: 0; } /* no intrinsic width (it still flexes): the dropdown's floor in the bar is its 100px min-width */
  kbd { flex: none; min-width: 20px; padding: 0 4px; box-sizing: border-box; border: 1px solid var(--hairline); border-radius: 6px; background: var(--surface); color: var(--text-3); font: inherit; font-size: 12px; text-align: center; }
  .drop, .expanded .pop {
    background: var(--surface); color: var(--text); border: 1px solid var(--hairline); border-radius: var(--r-control); box-shadow: var(--shadow-card);
  }
  .drop { position: absolute; top: calc(100% + 6px); left: 0; width: max(100%, 360px); max-height: min(70vh, 560px); overflow: auto; overscroll-behavior: contain; }
  /* Narrow bar (dock open on a small window): a 44px toggle; expanded, the input and results drop under the bar's right side. */
  @container topbar (max-width: 639px) {
    .dd { position: static; flex: none; min-width: 0; }
    .toggle { display: grid; }
    .pop { display: none; }
    .expanded .pop { display: block; position: absolute; top: calc(100% + 6px); right: 8px; width: min(420px, calc(100% - 16px)); padding: 8px; box-sizing: border-box; }
    .drop { position: static; width: auto; margin-top: 8px; border: 0; box-shadow: none; max-height: min(60vh, 520px); }
  }
</style>
