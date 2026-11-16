import type { AgentMsg } from '../lib/protocol';

const EXTERNAL = /^(https?|mailto|tel):$/;

function linkOf(e: MouseEvent): { a: Element; url: URL } | null {
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return null;
  const a = (e.target as Element | null)?.closest?.('a[href]');
  if (!a || a.hasAttribute('download')) return null;
  // SVG <a> exposes href/target as SVGAnimatedString; resolve via attributes instead.
  try { return { a, url: new URL(a.getAttribute('href') ?? '', a.ownerDocument.baseURI) }; } catch { return null; }
}

export function installLinkHandling(send: (m: AgentMsg) => void): void {
  document.addEventListener('click', (e) => {
    if (e.defaultPrevented) return;
    const l = linkOf(e);
    if (!l) return;
    const { a, url } = l;
    if (url.origin !== location.origin) {
      if (EXTERNAL.test(url.protocol)) { e.preventDefault(); send({ type: 'open-external', url: url.href }); }
      return;
    }
    if (/^_(blank|top|parent)$/i.test(a.getAttribute('target') ?? '')) a.setAttribute('target', '_self');
  }, true);

  // In-book links replace the frame's history entry (session history belongs to the shell: back leaves the reader in one
  // step). Bubble phase on window, so the document's own handlers run first and may still cancel or handle the click.
  window.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0) return;
    const l = linkOf(e);
    if (!l || l.url.origin !== location.origin) return;
    const t = l.a.getAttribute('target');
    if (t && !/^_self$/i.test(t)) return; // a named frame inside the document
    e.preventDefault();
    location.replace(l.url.href);
  });
}

/** Scripts' pushState becomes replaceState for the same reason (single-page documents, hash routers). */
export function keepHistoryFlat(): void {
  try {
    const H = History.prototype;
    Object.defineProperty(H, 'pushState', { configurable: true, writable: true, value: H.replaceState });
  } catch { /* ignore */ }
}
