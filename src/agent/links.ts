import type { AgentMsg } from '../lib/protocol';

const EXTERNAL = /^(https?|mailto|tel):$/;

export function installLinkHandling(send: (m: AgentMsg) => void): void {
  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = (e.target as Element | null)?.closest?.('a[href]');
    if (!a || a.hasAttribute('download')) return;
    // SVG <a> exposes href/target as SVGAnimatedString; resolve via attributes instead.
    let url: URL;
    try { url = new URL(a.getAttribute('href') ?? '', a.ownerDocument.baseURI); } catch { return; }
    if (url.origin !== location.origin) {
      if (EXTERNAL.test(url.protocol)) { e.preventDefault(); send({ type: 'open-external', url: url.href }); }
      return;
    }
    if (/^_(blank|top|parent)$/i.test(a.getAttribute('target') ?? '')) a.setAttribute('target', '_self');
  }, true);
}
