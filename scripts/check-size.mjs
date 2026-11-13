import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const gz = (p) => gzipSync(readFileSync(`dist/${p}`)).length;
const html = readFileSync('dist/index.html', 'utf8');
const refs = [...html.matchAll(/<script[^>]*type="module"[^>]*src="([^"]+)"/g), ...html.matchAll(/<link[^>]*rel="modulepreload"[^>]*href="([^"]+)"/g)]
  .map((m) => m[1].replace(/^\//, ''));
if (!refs.length) { console.error('no module script or modulepreload refs in dist/index.html'); process.exit(1); }
const initial = [...new Set(refs)].reduce((s, p) => s + gz(p), 0);
const agent = gz('__reader/agent.js');

console.log(`initial js: ${initial} B gzip (limit 51200)`);
console.log(`agent: ${agent} B gzip (limit 8192)`);
if (initial > 51200 || agent > 8192) process.exit(1);
