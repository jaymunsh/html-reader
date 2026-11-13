const MAP: Record<string, string> = {
  html: 'text/html', htm: 'text/html', xhtml: 'application/xhtml+xml',
  css: 'text/css', js: 'text/javascript', mjs: 'text/javascript',
  json: 'application/json', svg: 'image/svg+xml', wasm: 'application/wasm',
  woff2: 'font/woff2', woff: 'font/woff', ttf: 'font/ttf', otf: 'font/otf',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
  webp: 'image/webp', avif: 'image/avif', ico: 'image/x-icon', bmp: 'image/bmp',
  mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime',
  mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', ogg: 'audio/ogg',
  txt: 'text/plain', xml: 'application/xml', pdf: 'application/pdf', vtt: 'text/vtt',
};

export function mimeFor(path: string): string {
  const name = path.slice(path.lastIndexOf('/') + 1);
  const dot = name.lastIndexOf('.');
  if (dot < 0) return 'application/octet-stream';
  return MAP[name.slice(dot + 1).toLowerCase()] ?? 'application/octet-stream';
}

function essence(type: string): string {
  return type.split(';')[0].trim().toLowerCase();
}

export function isHtmlMime(type: string): boolean {
  const t = essence(type);
  return t === 'text/html' || t === 'application/xhtml+xml';
}

export function isMediaMime(type: string): boolean {
  const t = essence(type);
  return t.startsWith('video/') || t.startsWith('audio/');
}
