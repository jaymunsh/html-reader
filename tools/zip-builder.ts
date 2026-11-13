// Test/fixture-only ZIP writer. Never import from product code.
import { deflateSync } from 'fflate';
import { crc32 } from '../src/lib/crc32.ts';

export interface BuildEntry {
  name: string | Uint8Array;
  data?: Uint8Array | string;
  method?: number;
  utf8Flag?: boolean;
  extra?: Uint8Array;
  dataDescriptor?: boolean;
  encrypted?: boolean;
  corruptCrc?: boolean;
  directory?: boolean;
}

const enc = new TextEncoder();
const U32 = 0xffffffff;

class W {
  parts: number[] = [];
  get length() { return this.parts.length; }
  u8(...b: number[]) { this.parts.push(...b); return this; }
  u16(n: number) { return this.u8(n & 0xff, (n >>> 8) & 0xff); }
  u32(n: number) { return this.u16(n & 0xffff).u16(Math.floor(n / 0x10000) & 0xffff); }
  u64(n: number) { return this.u32(n % 0x100000000).u32(Math.floor(n / 0x100000000)); }
  bytes(b: Uint8Array) { for (const x of b) this.parts.push(x); return this; }
  done() { return Uint8Array.from(this.parts); }
}

export function buildZip(entries: BuildEntry[], opts: { zip64?: boolean; comment?: Uint8Array } = {}): Uint8Array {
  const out = new W();
  const central = new W();
  const zip64 = !!opts.zip64;

  for (const e of entries) {
    const dir = !!e.directory || (typeof e.name === 'string' && e.name.endsWith('/'));
    const name = typeof e.name === 'string' ? enc.encode(e.name) : e.name;
    // Directories are always STORED with size 0, whatever method was requested.
    const raw = dir ? new Uint8Array(0) : typeof e.data === 'string' ? enc.encode(e.data) : (e.data ?? new Uint8Array(0));
    const method = dir ? 0 : (e.method ?? 8);
    const body = method === 8 ? deflateSync(raw) : raw;
    const crc = e.corruptCrc ? (crc32(raw) ^ 0xdeadbeef) >>> 0 : crc32(raw);
    const utf8 = e.utf8Flag ?? typeof e.name === 'string';
    const dd = !!e.dataDescriptor && !dir;
    const flags = (e.encrypted ? 1 : 0) | (dd ? 8 : 0) | (utf8 ? 0x800 : 0);
    const offset = out.length;

    out.u32(0x04034b50).u16(zip64 ? 45 : 20).u16(flags).u16(method).u16(0).u16(0x21)
      .u32(dd ? 0 : crc).u32(dd ? 0 : body.length).u32(dd ? 0 : raw.length)
      .u16(name.length).u16(0).bytes(name).bytes(body);
    if (dd) out.u32(0x08074b50).u32(crc).u32(body.length).u32(raw.length);

    const extra = new W();
    if (zip64) extra.u16(1).u16(24).u64(raw.length).u64(body.length).u64(offset);
    if (e.extra) extra.bytes(e.extra);
    const x = extra.done();
    central.u32(0x02014b50).u16(zip64 ? 45 : 20).u16(zip64 ? 45 : 20).u16(flags).u16(method).u16(0).u16(0x21)
      .u32(crc).u32(zip64 ? U32 : body.length).u32(zip64 ? U32 : raw.length)
      .u16(name.length).u16(x.length).u16(0).u16(0).u16(0).u32(dir ? 0x10 : 0).u32(zip64 ? U32 : offset)
      .bytes(name).bytes(x);
  }

  const cdOffset = out.length;
  const cd = central.done();
  out.bytes(cd);
  const comment = opts.comment ?? new Uint8Array(0);
  const n = entries.length;
  if (zip64) {
    const z64Offset = out.length;
    out.u32(0x06064b50).u64(44).u16(45).u16(45).u32(0).u32(0).u64(n).u64(n).u64(cd.length).u64(cdOffset);
    out.u32(0x07064b50).u32(0).u64(z64Offset).u32(1);
    out.u32(0x06054b50).u16(0).u16(0).u16(0xffff).u16(0xffff).u32(U32).u32(U32).u16(comment.length).bytes(comment);
  } else {
    out.u32(0x06054b50).u16(0).u16(0).u16(n).u16(n).u32(cd.length).u32(cdOffset).u16(comment.length).bytes(comment);
  }
  return out.done();
}

let eucKrMap: Map<string, Uint8Array> | null = null;
export function encodeEucKr(s: string): Uint8Array {
  if (!eucKrMap) {
    eucKrMap = new Map();
    const dec = new TextDecoder('euc-kr');
    for (let hi = 0xa1; hi <= 0xfe; hi++) {
      for (let lo = 0xa1; lo <= 0xfe; lo++) {
        const ch = dec.decode(Uint8Array.of(hi, lo));
        if (ch.length === 1 && ch !== '�' && !eucKrMap.has(ch)) eucKrMap.set(ch, Uint8Array.of(hi, lo));
      }
    }
  }
  const out: number[] = [];
  for (const ch of s) {
    if (ch.codePointAt(0)! < 0x80) { out.push(ch.charCodeAt(0)); continue; }
    const b = eucKrMap.get(ch);
    if (!b) throw new Error(`not encodable in EUC-KR: ${ch}`);
    out.push(b[0], b[1]);
  }
  return Uint8Array.from(out);
}

export function unicodePathExtra(rawName: Uint8Array, utf8Name: string): Uint8Array {
  const n = enc.encode(utf8Name);
  return new W().u16(0x7075).u16(5 + n.length).u8(1).u32(crc32(rawName)).bytes(n).done();
}
