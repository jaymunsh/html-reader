export type ByteRange = { start: number; end: number };

/** null = Range 없음 또는 문법 무효 → 200 전체 응답. */
export function parseRange(header: string | null, total: number): ByteRange | 'unsatisfiable' | null {
  if (!header) return null;
  const m = /^bytes=(.+)$/i.exec(header.trim());
  if (!m) return null;
  const first = m[1].split(',')[0].trim();
  const r = /^(\d*)-(\d*)$/.exec(first);
  if (!r || (r[1] === '' && r[2] === '')) return null;

  if (r[1] === '') {
    const suffix = Number(r[2]);
    if (suffix === 0 || total === 0) return 'unsatisfiable';
    return { start: Math.max(0, total - suffix), end: total - 1 };
  }
  const start = Number(r[1]);
  if (r[2] !== '' && Number(r[2]) < start) return null;
  if (start >= total) return 'unsatisfiable';
  const end = r[2] === '' ? total - 1 : Math.min(Number(r[2]), total - 1);
  return { start, end };
}

export function rangeResponse(blob: Blob, contentType: string, header: string | null): Response {
  const total = blob.size;
  const range = parseRange(header, total);
  if (range === 'unsatisfiable') {
    return new Response(null, {
      status: 416,
      headers: { 'Content-Range': `bytes */${total}`, 'Accept-Ranges': 'bytes' },
    });
  }
  if (range === null) {
    return new Response(blob, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(total),
        'Accept-Ranges': 'bytes',
      },
    });
  }
  const { start, end } = range;
  return new Response(blob.slice(start, end + 1, contentType), {
    status: 206,
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(end - start + 1),
      'Content-Range': `bytes ${start}-${end}/${total}`,
      'Accept-Ranges': 'bytes',
    },
  });
}
