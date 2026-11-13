import { crc32 } from './crc32';

const utf8Fatal = new TextDecoder('utf-8', { fatal: true });
const utf8Lenient = new TextDecoder('utf-8');

/** Info-ZIP Unicode Path extra field (0x7075), valid only for version 1 and matching CRC of the raw name. */
function unicodePath(raw: Uint8Array, extra: Uint8Array): string | null {
  const v = new DataView(extra.buffer, extra.byteOffset, extra.byteLength);
  let p = 0;
  while (p + 4 <= extra.length) {
    const id = v.getUint16(p, true);
    const size = v.getUint16(p + 2, true);
    const end = p + 4 + size;
    if (end > extra.length) break;
    if (id === 0x7075 && size >= 5 && v.getUint8(p + 4) === 1 && v.getUint32(p + 5, true) === crc32(raw)) {
      return utf8Lenient.decode(extra.subarray(p + 9, end));
    }
    p = end;
  }
  return null;
}

export function decodeEntryName(raw: Uint8Array, flags: number, extra: Uint8Array): string {
  let name = unicodePath(raw, extra);
  if (name === null) {
    if (flags & 0x800) name = utf8Lenient.decode(raw);
    else {
      try {
        name = utf8Fatal.decode(raw);
      } catch {
        name = new TextDecoder('euc-kr').decode(raw);
      }
    }
  }
  return name.replaceAll('\\', '/').normalize('NFC');
}

export function sanitizeEntryPath(name: string): string | null {
  const out: string[] = [];
  for (const seg of name.split('/')) {
    if (seg === '..') return null;
    if (seg === '' || seg === '.') continue;
    out.push(seg);
  }
  return out.length ? out.join('/') : null;
}

const JUNK_FILES = new Set(['.ds_store', 'thumbs.db', 'desktop.ini']);

export function isJunk(path: string): boolean {
  const segs = path.split('/');
  if (segs.includes('__MACOSX')) return true;
  const file = segs[segs.length - 1];
  return JUNK_FILES.has(file.toLowerCase()) || file.startsWith('._');
}
