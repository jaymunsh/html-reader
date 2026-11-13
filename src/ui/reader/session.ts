import { cacheKey } from '../../lib/path';
import { APP_TAG, parseAgentMessage, wrap, type Mods, type Restore, type ShellMsg } from '../../lib/protocol';

export type AgentState = 'pending' | 'ready' | 'limited';
export interface SessionHooks {
  onState(state: AgentState): void;
  onPage(path: string, title: string | null): void;
  onScroll(pct: number, ratio: number): void;
  onTap(): void;
  onKey(key: string, mods: Mods): void;
  onExternal(url: string): void;
  getInit(path: string): { textScale: number; restore?: Restore };
  onNoSw(): void;
}
export const READY_TIMEOUT_MS = 3000;
// The iframe load event can reach the shell before the agent's ready message; wait before deciding a page has no agent.
export const LOAD_GRACE_MS = 150;

function bookPathOf(pathname: string, bookId: string): string | null {
  const prefix = `/book/${bookId}/`;
  if (!pathname.startsWith(prefix)) return null;
  try { return pathname.slice(prefix.length).split('/').map(decodeURIComponent).join('/'); } catch { return null; }
}

export function createSession(iframe: HTMLIFrameElement, bookId: string, hooks: SessionHooks) {
  let state: AgentState = 'pending';
  let timer: ReturnType<typeof setTimeout> | null = null;
  let readySinceLoad = false;
  let graceTimer: ReturnType<typeof setTimeout> | null = null;

  const set = (s: AgentState) => { if (state !== s) { state = s; hooks.onState(s); } };
  const clear = () => { if (timer !== null) { clearTimeout(timer); timer = null; } };

  function onMessage(e: MessageEvent) {
    if (e.origin !== location.origin || e.source !== iframe.contentWindow) return;
    const d = e.data as { app?: unknown; type?: unknown } | null;
    if (d && typeof d === 'object' && d.app === APP_TAG && d.type === 'no-sw') { hooks.onNoSw(); return; }
    const p = parseAgentMessage(d);
    if (!p.ok) {
      if (p.reason === 'version') {
        try { sessionStorage.setItem('update-wanted', '1'); } catch { /* ignore */ }
        clear();
        set('limited');
      }
      return; // foreign / invalid: ignored
    }
    const m = p.msg;
    switch (m.type) {
      case 'ready': {
        readySinceLoad = true;
        clear();
        set('ready');
        iframe.contentWindow?.postMessage(wrap({ type: 'init', ...hooks.getInit(m.path) }), location.origin);
        hooks.onPage(m.path, m.title);
        break;
      }
      case 'scroll': if (state === 'ready') hooks.onScroll(m.pct, m.ratio); break;
      case 'tap': if (state === 'ready') hooks.onTap(); break;
      case 'key': if (state === 'ready') hooks.onKey(m.key, m.mods); break;
      case 'open-external': hooks.onExternal(m.url); break;
    }
  }

  function onLoad() {
    let pathname: string;
    try { pathname = iframe.contentWindow!.location.pathname; } catch { return; }
    const path = bookPathOf(pathname, bookId);
    if (path === null) return;
    if (graceTimer !== null) clearTimeout(graceTimer);
    graceTimer = null;
    const hadReady = readySinceLoad;
    readySinceLoad = false;
    if (hadReady) return;
    graceTimer = setTimeout(() => {
      graceTimer = null;
      if (readySinceLoad) { readySinceLoad = false; return; } // ready arrived after load
      clear();
      set('limited');
      hooks.onPage(path, null);
    }, LOAD_GRACE_MS);
  }

  window.addEventListener('message', onMessage);
  iframe.addEventListener('load', onLoad);

  return {
    navigate(path: string): void {
      readySinceLoad = false;
      if (graceTimer !== null) { clearTimeout(graceTimer); graceTimer = null; }
      clear();
      set('pending');
      timer = setTimeout(() => { timer = null; if (state === 'pending') set('limited'); }, READY_TIMEOUT_MS);
      iframe.src = cacheKey(bookId, path);
    },
    post(msg: ShellMsg): void {
      if (state === 'ready') iframe.contentWindow?.postMessage(wrap(msg), location.origin);
    },
    destroy(): void {
      clear();
      if (graceTimer !== null) clearTimeout(graceTimer);
      window.removeEventListener('message', onMessage);
      iframe.removeEventListener('load', onLoad);
    },
  };
}
