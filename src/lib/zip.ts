import { Inflate } from 'fflate';
import { crc32 } from './crc32';
import { decodeEntryName } from './filename';

export type ZipErrorCode = 'not-zip' | 'corrupt' | 'multi-disk' | 'encrypted' | 'unsupported-method' | 'crc-mismatch';
export class ZipError extends Error {
  code: ZipErrorCode;
  constructor(code: ZipErrorCode, detail?: string) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'ZipError';
    this.code = code;
  }
}

export interface ZipEntry {
  name: string;
  method: number;
  flags: number;
  encrypted: boolean;
  isDirectory: boolean;
  crc32: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
}

const SIG_EOCD = 0x06054b50;
const SIG_LOC64 = 0x07064b50;
const SIG_EOCD64 = 0x06064b50;
const SIG_CEN = 0x02014b50;
const SIG_LOCAL = 0x04034b50;

async function readBytes(file: Blob, start: number, end: number): Promise<Uint8Array> {
  if (start < 0 || end > file.size || start > end) throw new ZipError('corrupt', 'range outside file');
  return new Uint8Array(await file.slice(start, end).arrayBuffer());
}

function u64(v: DataView, p: number): number {
  const n = v.getUint32(p + 4, true) * 0x100000000 + v.getUint32(p, true);
  if (n > Number.MAX_SAFE_INTEGER) throw new ZipError('corrupt', '64-bit value too large');
  return n;
}

export async function readCentralDirectory(file: Blob): Promise<ZipEntry[]> {
  const tailStart = Math.max(0, file.size - 65557);
  const tail = await readBytes(file, tailStart, file.size);
  const tv = new DataView(tail.buffer, tail.byteOffset, tail.byteLength);
  let eocd = -1;
  for (let i = tail.length - 22; i >= 0; i--) {
    if (tv.getUint32(i, true) === SIG_EOCD && i + 22 + tv.getUint16(i + 20, true) === tail.length) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new ZipError('not-zip', 'EOCD not found');

  const diskNo = tv.getUint16(eocd + 4, true);
  const cdDisk = tv.getUint16(eocd + 6, true);
  let total = tv.getUint16(eocd + 10, true);
  let cdSize = tv.getUint32(eocd + 12, true);
  let cdOffset = tv.getUint32(eocd + 16, true);
  if (diskNo !== 0 && diskNo !== 0xffff) throw new ZipError('multi-disk');
  if (cdDisk !== 0 && cdDisk !== 0xffff) throw new ZipError('multi-disk');

  if (total === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff || diskNo === 0xffff || cdDisk === 0xffff) {
    const locPos = tailStart + eocd - 20;
    if (locPos < 0) throw new ZipError('corrupt', 'missing ZIP64 locator');
    const loc = await readBytes(file, locPos, locPos + 20);
    const lv = new DataView(loc.buffer, loc.byteOffset, loc.byteLength);
    if (lv.getUint32(0, true) !== SIG_LOC64) throw new ZipError('corrupt', 'missing ZIP64 locator');
    if (lv.getUint32(4, true) !== 0 || lv.getUint32(16, true) > 1) throw new ZipError('multi-disk');
    const z64Pos = u64(lv, 8);
    const z = await readBytes(file, z64Pos, z64Pos + 56);
    const zv = new DataView(z.buffer, z.byteOffset, z.byteLength);
    if (zv.getUint32(0, true) !== SIG_EOCD64) throw new ZipError('corrupt', 'bad ZIP64 EOCD');
    if (zv.getUint32(16, true) !== 0 || zv.getUint32(20, true) !== 0) throw new ZipError('multi-disk');
    total = u64(zv, 32);
    cdSize = u64(zv, 40);
    cdOffset = u64(zv, 48);
  }

  const cd = await readBytes(file, cdOffset, cdOffset + cdSize);
  const v = new DataView(cd.buffer, cd.byteOffset, cd.byteLength);
  const entries: ZipEntry[] = [];
  let p = 0;
  for (let i = 0; i < total; i++) {
    if (p + 46 > cd.length || v.getUint32(p, true) !== SIG_CEN) throw new ZipError('corrupt', 'bad central directory entry');
    const flags = v.getUint16(p + 8, true);
    const method = v.getUint16(p + 10, true);
    const crc = v.getUint32(p + 16, true);
    let csize = v.getUint32(p + 20, true);
    let usize = v.getUint32(p + 24, true);
    const nameLen = v.getUint16(p + 28, true);
    const extraLen = v.getUint16(p + 30, true);
    const commentLen = v.getUint16(p + 32, true);
    let offset = v.getUint32(p + 42, true);
    const end = p + 46 + nameLen + extraLen + commentLen;
    if (end > cd.length) throw new ZipError('corrupt', 'central directory entry overruns');
    const rawName = cd.subarray(p + 46, p + 46 + nameLen);
    const extra = cd.subarray(p + 46 + nameLen, p + 46 + nameLen + extraLen);

    if (usize === 0xffffffff || csize === 0xffffffff || offset === 0xffffffff) {
      const ev = new DataView(extra.buffer, extra.byteOffset, extra.byteLength);
      let q = 0;
      while (q + 4 <= extra.length) {
        const id = ev.getUint16(q, true);
        const size = ev.getUint16(q + 2, true);
        const stop = q + 4 + size;
        if (stop > extra.length) break;
        if (id === 1) {
          let r = q + 4;
          const take = () => {
            if (r + 8 > stop) throw new ZipError('corrupt', 'short ZIP64 extra');
            const n = u64(ev, r);
            r += 8;
            return n;
          };
          if (usize === 0xffffffff) usize = take();
          if (csize === 0xffffffff) csize = take();
          if (offset === 0xffffffff) offset = take();
          break;
        }
        q = stop;
      }
    }

    const name = decodeEntryName(rawName, flags, extra);
    entries.push({
      name,
      method,
      flags,
      encrypted: (flags & 1) !== 0,
      isDirectory: name.endsWith('/'),
      crc32: crc,
      compressedSize: csize,
      uncompressedSize: usize,
      localHeaderOffset: offset,
    });
    p = end;
  }
  return entries;
}

export async function readEntry(file: Blob, entry: ZipEntry, onBytes?: (n: number) => void): Promise<Blob> {
  if (entry.encrypted) throw new ZipError('encrypted', entry.name);
  if (entry.method !== 0 && entry.method !== 8) throw new ZipError('unsupported-method', String(entry.method));

  const lh = await readBytes(file, entry.localHeaderOffset, entry.localHeaderOffset + 30);
  const lv = new DataView(lh.buffer, lh.byteOffset, lh.byteLength);
  if (lv.getUint32(0, true) !== SIG_LOCAL) throw new ZipError('corrupt', 'bad local header');
  const start = entry.localHeaderOffset + 30 + lv.getUint16(26, true) + lv.getUint16(28, true);
  const end = start + entry.compressedSize;
  if (end > file.size) throw new ZipError('corrupt', 'entry data overruns file');

  const parts: BlobPart[] = [];
  let crc = 0;
  let total = 0;
  const emit = (chunk: Uint8Array) => {
    if (!chunk.length) return;
    total += chunk.length;
    if (total > entry.uncompressedSize) throw new ZipError('crc-mismatch', 'size exceeds declared');
    crc = crc32(chunk, crc);
    parts.push(chunk as Uint8Array<ArrayBuffer>);
    onBytes?.(chunk.length);
  };

  const reader = file.slice(start, end).stream().getReader();
  if (entry.method === 0) {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      emit(value.slice());
    }
  } else {
    const inf = new Inflate((chunk) => emit(chunk.slice()));
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        inf.push(value);
      }
      inf.push(new Uint8Array(0), true);
    } catch (e) {
      if (e instanceof ZipError) throw e;
      throw new ZipError('corrupt', 'inflate failed');
    }
  }
  if (total !== entry.uncompressedSize || crc !== entry.crc32) throw new ZipError('crc-mismatch', entry.name);
  return new Blob(parts);
}
