export type EncodingSource = 'bom' | 'meta' | 'utf8' | 'fallback';

const latin1 = (b: Uint8Array): string => {
  let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return s;
};

function normalizeLabel(label: string): string | null {
  try {
    return new TextDecoder(label.trim()).encoding;
  } catch {
    return null;
  }
}

export function detectEncoding(bytes: Uint8Array): { encoding: string; source: EncodingSource } {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return { encoding: 'utf-8', source: 'bom' };
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) return { encoding: 'utf-16le', source: 'bom' };
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) return { encoding: 'utf-16be', source: 'bom' };

  // 주석을 건너뛴 앞 1024바이트 ASCII 뷰 (닫히지 않은 주석은 끝까지 제거)
  const head = latin1(bytes.subarray(0, 1024)).replace(/<!--[\s\S]*?(?:-->|$)/g, ' ');
  const re = /<meta\s[^>]*?charset\s*=\s*["']?([^\s"'>;/]+)/gi;
  for (let m = re.exec(head); m; m = re.exec(head)) {
    const enc = normalizeLabel(m[1]);
    if (enc) return { encoding: enc, source: 'meta' };
  }

  try {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return { encoding: 'utf-8', source: 'utf8' };
  } catch {
    return { encoding: 'euc-kr', source: 'fallback' };
  }
}

export function decodeHtml(bytes: Uint8Array): { html: string; encoding: string; source: EncodingSource } {
  const { encoding, source } = detectEncoding(bytes);
  return { html: new TextDecoder(encoding).decode(bytes), encoding, source };
}

const NAMED: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', copy: '©', reg: '®',
  middot: '·', hellip: '…', mdash: '—', ndash: '–',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”',
};

export function decodeEntities(s: string): string {
  return s.replace(/&(?:#(\d+)|#[xX]([0-9a-fA-F]+)|([a-zA-Z]+));/g, (all, dec, hex, name) => {
    if (name !== undefined) return Object.prototype.hasOwnProperty.call(NAMED, name) ? NAMED[name] : all;
    const cp = dec !== undefined ? parseInt(dec, 10) : parseInt(hex, 16);
    if (!Number.isFinite(cp) || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) return all;
    return String.fromCodePoint(cp);
  });
}

export function extractTitle(html: string): string {
  const m = /<title[^>]*>([\s\S]*?)<\/title\s*>/i.exec(html);
  if (!m) return '';
  return decodeEntities(m[1]).replace(/[\s ]+/g, ' ').trim();
}

export function isFullDocument(bytes: Uint8Array): boolean {
  return /<(?:!doctype|html|head|body)/i.test(latin1(bytes.subarray(0, 2048)));
}
