export const SCAN_BYTES = 4096;

export type InjectEncoding = 'ascii' | 'utf-16le' | 'utf-16be';

const DEFAULT_TAG_BYTES = 96;
const CHARSET_LIMIT = 1024;

function detect(head: Uint8Array): { encoding: InjectEncoding; bom: number } {
  if (head[0] === 0xff && head[1] === 0xfe) return { encoding: 'utf-16le', bom: 2 };
  if (head[0] === 0xfe && head[1] === 0xff) return { encoding: 'utf-16be', bom: 2 };
  if (head[0] === 0xef && head[1] === 0xbb && head[2] === 0xbf) return { encoding: 'ascii', bom: 3 };
  return { encoding: 'ascii', bom: 0 };
}

/** Lowercased ASCII view; for UTF-16 folds each 2-byte unit into one byte (non-ASCII -> 0xff). */
function fold(head: Uint8Array, encoding: InjectEncoding, bom: number): Uint8Array {
  const lower = (c: number) => (c >= 0x41 && c <= 0x5a ? c + 32 : c);
  if (encoding === 'ascii') {
    const out = new Uint8Array(head.length - bom);
    for (let i = 0; i < out.length; i++) out[i] = lower(head[bom + i]);
    return out;
  }
  const n = (head.length - bom) >> 1;
  const out = new Uint8Array(n);
  const le = encoding === 'utf-16le';
  for (let i = 0; i < n; i++) {
    const lo = head[bom + 2 * i + (le ? 0 : 1)];
    const hi = head[bom + 2 * i + (le ? 1 : 0)];
    out[i] = hi === 0 ? lower(lo) : 0xff;
  }
  return out;
}

const codes = (s: string) => [...s].map((c) => c.charCodeAt(0));
const isBoundary = (c: number | undefined) =>
  c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0c || c === 0x0d || c === 0x3e || c === 0x2f;

function startsWith(v: Uint8Array, i: number, pat: number[]): boolean {
  for (let k = 0; k < pat.length; k++) if (v[i + k] !== pat[k]) return false;
  return true;
}

function indexOfSeq(v: Uint8Array, from: number, pat: number[]): number {
  for (let i = from; i + pat.length <= v.length; i++) if (startsWith(v, i, pat)) return i;
  return -1;
}

/** Index just past the closing '>' of a tag starting at `from`, honoring quotes; -1 if not closed. */
function tagEnd(v: Uint8Array, from: number): number {
  let quote = 0;
  for (let i = from; i < v.length; i++) {
    const c = v[i];
    if (quote) {
      if (c === quote) quote = 0;
    } else if (c === 0x22 || c === 0x27) quote = c;
    else if (c === 0x3e) return i + 1;
  }
  return -1;
}

const P = {
  comment: codes('<!--'),
  commentEnd: codes('-->'),
  doctype: codes('<!doctype'),
  html: codes('<html'),
  head: codes('<head'),
  headClose: codes('</head'),
  body: codes('<body'),
  meta: codes('<meta'),
  charset: codes('charset'),
};

export function planInjection(
  head: Uint8Array,
  tagByteLength: number = DEFAULT_TAG_BYTES,
): { offset: number; encoding: InjectEncoding } {
  const window = head.length > SCAN_BYTES ? head.subarray(0, SCAN_BYTES) : head;
  const { encoding, bom } = detect(window);
  const unit = encoding === 'ascii' ? 1 : 2;
  const toBytes = (u: number) => bom + u * unit;
  const v = fold(window, encoding, bom);

  let doctypeEnd = -1;
  let htmlEnd = -1;
  let headEnd = -1;
  let metaStart = -1;
  let metaEnd = -1;

  scan: for (let i = 0; i < v.length; ) {
    if (v[i] !== 0x3c) {
      i++;
      continue;
    }
    if (startsWith(v, i, P.comment)) {
      const e = indexOfSeq(v, i + 4, P.commentEnd);
      if (e < 0) break;
      i = e + 3;
      continue;
    }
    const named = (pat: number[]) => startsWith(v, i, pat) && isBoundary(v[i + pat.length]);
    if (startsWith(v, i, P.doctype)) {
      const e = tagEnd(v, i);
      if (e < 0) break;
      if (doctypeEnd < 0) doctypeEnd = e;
      i = e;
    } else if (v[i + 1] === 0x3f || v[i + 1] === 0x21) {
      const e = tagEnd(v, i);
      if (e < 0) break;
      i = e;
    } else if (named(P.html)) {
      const e = tagEnd(v, i);
      if (e < 0) break;
      if (htmlEnd < 0) htmlEnd = e;
      i = e;
    } else if (named(P.head)) {
      const e = tagEnd(v, i);
      if (e < 0) break;
      if (headEnd < 0) headEnd = e;
      i = e;
    } else if (named(P.body) || (headEnd >= 0 && startsWith(v, i, P.headClose))) {
      break scan;
    } else if (headEnd >= 0 && metaStart < 0 && named(P.meta)) {
      const e = tagEnd(v, i);
      if (e < 0) break;
      if (indexOfSeq(v.subarray(i, e), 0, P.charset) >= 0) {
        metaStart = i;
        metaEnd = e;
      }
      i = e;
    } else {
      i++;
    }
  }

  const unitOffset = headEnd >= 0 ? headEnd : htmlEnd >= 0 ? htmlEnd : doctypeEnd >= 0 ? doctypeEnd : 0;
  let offset = toBytes(unitOffset);
  if (metaStart >= 0) {
    const mStart = toBytes(metaStart);
    const mEnd = toBytes(metaEnd);
    if (mEnd <= CHARSET_LIMIT && offset <= mStart && mEnd + tagByteLength > CHARSET_LIMIT) offset = mEnd;
  }
  return { offset, encoding };
}

export function agentTag(bookId: string, textScale: number, encoding: InjectEncoding): Uint8Array {
  const s = `<script src="/__reader/agent.js" data-book="${bookId}" data-scale="${textScale}"></script>`;
  if (encoding === 'ascii') return new TextEncoder().encode(s);
  const out = new Uint8Array(s.length * 2);
  const le = encoding === 'utf-16le';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    out[2 * i + (le ? 0 : 1)] = c & 0xff;
    out[2 * i + (le ? 1 : 0)] = c >> 8;
  }
  return out;
}

export function injectAgent(bytes: Uint8Array, opts: { bookId: string; textScale: number }): Uint8Array {
  const head = bytes.subarray(0, SCAN_BYTES);
  const first = planInjection(head);
  const tag = agentTag(opts.bookId, opts.textScale, first.encoding);
  const { offset } = planInjection(head, tag.length);
  const out = new Uint8Array(bytes.length + tag.length);
  out.set(bytes.subarray(0, offset), 0);
  out.set(tag, offset);
  out.set(bytes.subarray(offset), offset + tag.length);
  return out;
}
