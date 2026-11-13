import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.zip': 'application/zip',
};

async function isFile(p) {
  try { return (await stat(p)).isFile(); } catch { return false; }
}

function makeServer(getDir, switchable) {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (switchable && req.method === 'POST' && url.pathname === '/__test/use') {
      const dir = url.searchParams.get('dir');
      if (dir !== 'dist' && dir !== 'dist-v2') { res.writeHead(400); res.end('bad dir'); return; }
      switchable.dir = dir;
      res.writeHead(200); res.end('ok'); return;
    }
    const root = path.resolve(getDir());
    let pathname;
    try { pathname = decodeURIComponent(url.pathname); } catch { res.writeHead(400); res.end(); return; }
    let file = path.join(root, pathname);
    if (!file.startsWith(root + path.sep) && file !== root) { res.writeHead(403); res.end(); return; }
    if (pathname.endsWith('/') || !(await isFile(file))) {
      // vercel.json과 같은 규칙: /book/* → no-sw.html(없으면 404), 그 외 → index.html
      if (pathname.startsWith('/book/')) {
        file = path.join(root, '__app/no-sw.html');
        if (!(await isFile(file))) { res.writeHead(404); res.end('not found'); return; }
      } else {
        file = path.join(root, 'index.html');
      }
    }
    try {
      const body = await readFile(file);
      res.writeHead(200, {
        'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream',
        'Cache-Control': 'no-cache',
      });
      res.end(body);
    } catch {
      res.writeHead(404); res.end('not found');
    }
  });
}

makeServer(() => 'dist').listen(4173);
const state = { dir: 'dist' };
makeServer(() => state.dir, state).listen(4174);
console.log('static server: 4173 (dist), 4174 (switchable)');
