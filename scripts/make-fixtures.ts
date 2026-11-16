// Deterministic E2E fixture generator: `npm run fixtures`. No randomness, fixed ZIP timestamps.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildZip, encodeEucKr, type BuildEntry } from '../tools/zip-builder.ts';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '..');
const FONT = join(ROOT, 'scripts/font-src/PretendardVariable.woff2');
const enc = new TextEncoder();
const PNG_1PX = Uint8Array.from(Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64'));

const paras = (n: number, special?: Record<number, string>) =>
  Array.from({ length: n }, (_, i) => {
    const k = i + 1;
    return `<p id="p${k}">문단 ${k} ${special?.[k] ?? '이것은 뷰포트보다 훨씬 긴 문서를 만들기 위한 본문 문장입니다. 읽는 위치를 확인하는 데 쓰입니다.'}</p>`;
  }).join('\n');

const page = (o: { title?: string; head?: string; h1: string; body?: string; paragraphs?: number; special?: Record<number, string> }) =>
  `<!doctype html>\n<html lang="ko"><head><meta charset="utf-8">${o.title ? `<title>${o.title}</title>` : ''}${o.head ?? ''}</head>\n` +
  `<body><h1 id="h">${o.h1}</h1>\n${o.body ?? ''}\n${paras(o.paragraphs ?? 0, o.special)}\n</body></html>\n`;
const long = (o: Parameters<typeof page>[0]) => page({ paragraphs: 200, ...o });
const css = (href: string) => `<link rel="stylesheet" href="${href}">`;

const f = (name: string, data: string | Uint8Array, extra: Partial<BuildEntry> = {}): BuildEntry => ({ name, data, ...extra });

function writeAll(out: string, files: Record<string, Uint8Array | string>) {
  for (const [n, d] of Object.entries(files)) {
    mkdirSync(dirname(join(out, n)), { recursive: true });
    writeFileSync(join(out, n), typeof d === 'string' ? enc.encode(d) : d);
  }
}

/** 1 second, 8 kHz, 8-bit mono PCM WAV (deterministic triangle-ish pattern). */
function wav(): Uint8Array {
  const n = 8000;
  const b = new Uint8Array(44 + n);
  const dv = new DataView(b.buffer);
  const tag = (o: number, s: string) => { for (let i = 0; i < 4; i++) b[o + i] = s.charCodeAt(i); };
  tag(0, 'RIFF'); dv.setUint32(4, 36 + n, true); tag(8, 'WAVE'); tag(12, 'fmt ');
  dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
  dv.setUint32(24, 8000, true); dv.setUint32(28, 8000, true); dv.setUint16(32, 1, true); dv.setUint16(34, 8, true);
  tag(36, 'data'); dv.setUint32(40, n, true);
  for (let i = 0; i < n; i++) b[44 + i] = 128 + Math.round(20 * Math.sin(i / 10));
  return b;
}

function cspHtml(body = ''): string {
  const head = '<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="script-src \'none\'"><!--';
  const tail = '--><meta charset="utf-8">';
  const target = 1010;
  const html = head + 'x'.repeat(target - head.length - tail.length) + tail;
  return html + '<title>CSP</title></head><body><h1 id="h">csp</h1>' + body + '</body></html>\n';
}

export function makeBigZip(outDir: string): void {
  mkdirSync(outDir, { recursive: true });
  const entries: BuildEntry[] = [f('index.html', page({ title: '큰 문서', h1: 'big', paragraphs: 5 }))];
  for (let i = 0; i < 400; i++) {
    const d = new Uint8Array(50 * 1024);
    for (let j = 0; j < d.length; j++) d[j] = (i * 7 + j) % 251;
    entries.push({ name: `data/file${String(i).padStart(3, '0')}.bin`, data: d, method: 0 });
  }
  writeFileSync(join(outDir, 'big.zip'), buildZip(entries));
}

export function makeFixtures(outDir: string, opts: { big?: boolean } = {}): void {
  mkdirSync(outDir, { recursive: true });
  const font = readFileSync(FONT);
  const z = (entries: BuildEntry[], o?: Parameters<typeof buildZip>[1]) => buildZip(entries, o);

  const links = '<p><a id="rel" href="page2.html">rel</a> <a id="abs" href="/page2.html">abs</a> <a id="sub" href="sub/page3.html">sub</a> ' +
    '<a id="noref" href="noref.html">noref</a> <a id="odd" href="a%20b%23c%3F.html">odd</a></p>';
  writeAll(outDir, {
    '01-multipage.zip': z([
      f('index.html', long({ title: '여러 쪽 문서', head: css('/css/a.css'), h1: 'index', body: links })),
      f('page2.html', long({ title: '두 번째 쪽', head: css('css/b.css'), h1: 'page2', special: { 150: '두 번째 쪽에만 있는 문장 알파카 입니다.' } })),
      f('sub/page3.html', long({ title: '세 번째 쪽', head: css('../css/a.css'), h1: 'page3', body: '<p><a id="home" href="/">home</a></p>' })),
      f('noref.html', long({ title: '참조 없음', head: '<meta name="referrer" content="no-referrer">' + css('/css/a.css'), h1: 'noref', body: '<p><a id="abs" href="/page2.html">abs</a></p>' })),
      f('css/a.css', '#h{color:rgb(1,2,3)}'),
      f('css/b.css', '#h{color:rgb(4,5,6)}'),
      f('a b#c?.html', long({ title: '특수 문자 이름', h1: 'odd' })),
    ]),
    '02-fetch-module.zip': z([
      f('index.html', page({
        title: 'fetch', h1: 'fetch',
        body: '<img id="img" src="/img/x.png"><div id="slot"></div>\n<script type="module" src="./main.js"></script>\n' +
          '<script>\nfetch(\'./data.json\').then(r=>r.json()).then(j=>{window.__json=j.ok});\n' +
          'fetch(\'./frag.html\').then(r=>r.text()).then(t=>{window.__frag=t;document.getElementById(\'slot\').innerHTML=t});\n</script>',
      })),
      f('data.json', '{"ok":true}'),
      f('main.js', "import {v} from './dep.js';\nwindow.__mod=v;\n"),
      f('dep.js', "export const v = 'ok';\n"),
      f('frag.html', '<div class="frag">조각</div>'),
      f('img/x.png', PNG_1PX),
    ]),
    '03-font.zip': z([
      f('index.html', long({ title: '글꼴', head: css('css/style.css'), h1: '글꼴 시험' })),
      f('css/style.css', "@font-face{font-family:TestFont;src:url('../fonts/test.woff2')}\n#h{font-family:TestFont}\n"),
      f('fonts/test.woff2', font),
    ]),
    '04-inner-scroll.zip': z([
      f('index.html', `<!doctype html>\n<html lang="ko"><head><meta charset="utf-8"><title>내부 스크롤</title>` +
        `<style>html,body{height:100%;margin:0;overflow:hidden}</style></head>\n<body><div id="scroller" style="height:100vh;overflow-y:auto">` +
        `<h1 id="h">inner</h1>\n${paras(200)}\n</div></body></html>\n`),
    ]),
    // Root clipped by html/body overflow:hidden, no inner scroller: the page cannot scroll, so it counts as read.
    '04-root-hidden.zip': z([
      f('index.html', long({ title: '루트 잠김', head: '<style>html,body{overflow:hidden}</style>', h1: 'locked' })),
    ]),
    // html clips, body is the scroller (its overflow does not propagate because html is non-visible).
    '04-body-scroll.zip': z([
      f('index.html', long({ title: '본문 스크롤', head: '<style>html{height:100%;overflow:hidden}body{height:100%;margin:0;overflow:auto}</style>', h1: 'body' })),
    ]),
    // 100vh body + default 8px margin overflows the root by 16px; the real scroller is the inner <main>.
    '04-margin-inner.zip': z([
      f('index.html', `<!doctype html>\n<html lang="ko"><head><meta charset="utf-8"><title>여백 내부 스크롤</title>` +
        `<style>body{height:100vh}main{height:100%;overflow:auto}</style></head>\n<body><main id="scroller">` +
        `<h1 id="h">margin</h1>\n${paras(200)}\n</main></body></html>\n`),
    ]),
    '05-cp949-name.zip': z([
      { name: encodeEucKr('한글.html'), utf8Flag: false, data: page({ title: '한글', h1: 'ko' }) },
      { name: enc.encode('index.html'), utf8Flag: false, data: long({ title: 'CP949', h1: 'index', body: `<p><a id="ko" href="${encodeURIComponent('한글.html')}">ko</a></p>` }) },
    ]),
    '05-nfd-macos.zip': z([
      { name: '문서/'.normalize('NFD'), directory: true },
      { name: '문서/index.html'.normalize('NFD'), dataDescriptor: true, data: long({ title: '문서', h1: 'index' }) },
      { name: '문서/한글 페이지.html'.normalize('NFD'), dataDescriptor: true, data: page({ title: '한글 페이지', h1: 'page' }) },
      { name: '문서/.DS_Store'.normalize('NFD'), dataDescriptor: true, data: 'junk' },
      { name: '__MACOSX/문서/._index.html'.normalize('NFD'), dataDescriptor: true, data: 'junk' },
    ]),
    '06-euckr.zip': z([
      { name: 'index.html', data: encodeEucKr('<!doctype html><html><head><meta charset="euc-kr"><title>한글 문서</title></head><body><h1 id="h">가나다라 한글</h1></body></html>\n') },
      { name: 'nometa.html', data: encodeEucKr('<!doctype html><html><head><title>메타 없음</title></head><body><h1 id="h">메타 없는 한글</h1></body></html>\n') },
    ]),
    '07-video.zip': z([
      f('index.html', page({ title: '미디어', h1: 'media', body: '<audio id="a" src="clip.wav" preload="metadata"></audio>\n<video id="v" src="clip.mp4"></video>' })),
      f('clip.wav', wav()),
      f('clip.mp4', Uint8Array.from({ length: 300000 }, (_, i) => i % 251), { method: 0 }),
    ]),
    '08-missing.zip': z([
      f('index.html', page({
        title: '누락', head: css('../outside.css') + '<link rel="icon" href="favicon.ico">', h1: 'missing',
        body: '<img src="img/none.png"><img src="https://example.invalid/x.png">',
      })),
    ]),
    '09-click-handlers.zip': z([f('index.html', clickPage()), f('page2.html', page({ title: '두 번째', h1: 'page2' }))]),
    '10-single.html': long({ title: 'Document', h1: 'single' }),
    '11-sw-killer.zip': z([
      f('index.html', page({
        title: 'killer', h1: 'killer',
        body: `<script>
navigator.serviceWorker.getRegistrations().then(rs=>{window.__regs=rs.length; rs.forEach(r=>r.unregister())});
navigator.serviceWorker.register('/sw.js').catch(()=>{window.__regRejected=true});
localStorage.clear(); localStorage.setItem('theme','killer');
caches.keys().then(k=>{window.__cacheKeys=k});
try { const r = indexedDB.deleteDatabase('html-reader'); r.onsuccess = () => __idbDelete='success'; r.onerror = () => __idbDelete='error' } catch { __idbDelete = 'error' }
</script>`,
      })),
    ]),
    '11-storage-peer.zip': z([
      f('index.html', page({
        title: 'peer', h1: 'peer',
        body: "<script>window.__before=localStorage.getItem('theme'); localStorage.setItem('theme','peer'); window.__len=localStorage.length</script>",
      })),
    ]),
    '12-frame-escape.zip': z([
      f('index.html', page({
        title: '프레임 탈출', h1: 'escape',
        body: '<p><a id="top" target="_top" href="page2.html">top</a> <a id="blank" target="_blank" href="page2.html">blank</a> ' +
          `<button id="toploc" onclick="top.location='page2.html'">toploc</button> <a id="ext" href="https://example.com/x">ext</a></p>`,
      })),
      f('page2.html', page({ title: '두 번째', h1: 'page2' })),
    ]),
    '13-csp.zip': z([f('index.html', cspHtml())]),
    '13-csp-missing.zip': z([f('index.html', cspHtml('<img src="img/none.png">'))]),
    'err-encrypted.zip': z([f('index.html', page({ h1: 'enc' }), { encrypted: true })]),
    'err-nohtml.zip': z([f('notes.txt', 'hello'), f('style.css', 'body{}')]),
    'err-crc.zip': z([f('index.html', page({ h1: 'crc' }), { corruptCrc: true })]),
    'err-deflate64.zip': z([f('index.html', page({ h1: 'd64' }), { method: 9 })]),
    'many-pages.zip': z(Array.from({ length: 300 }, (_, i) => {
      const n = String(i + 1).padStart(3, '0');
      return f(`p${n}.html`, page({ title: `쪽 ${n}`, h1: `p${n}` }));
    })),
    'title-a.zip': z([f('index.html', long({ title: '보고서', h1: 'a' }))]),
    'title-b.zip': z([f('index.html', long({ title: '보고서', h1: 'b' }))]),
    'search.zip': z([
      f('index.html', long({ title: '검색', h1: 'search', special: { 30: '첫 번째 고래 이야기', 170: '두 번째 고래 이야기 끝' } })),
      f('other.html', long({ title: '다른 쪽', h1: 'other' }).replace('<p id="p120">', '<p id="split">여기 <b>알</b>파카 가 있다</p>\n<p id="p120">')
        .replace('<p id="p130">', '<p id="lit">태그 글자 &lt;b&gt;굵게&lt;/b&gt; 그대로</p>\n<p id="p130">')
        .replace('</body>', `<script>document.body.insertAdjacentHTML('beforeend','<p id="late">늦게 생긴 문장</p>')</script>\n</body>`)),
    ]),
    // Same file name in three folders: a re-import of a revised bundle (replace), and a corrupted revision.
    'reimport/v1/report.zip': z([
      f('index.html', long({ title: '보고서', h1: 'v1' })),
      f('keep.html', long({ title: '유지', h1: 'keep' })),
      f('gone.html', long({ title: '사라짐', h1: 'gone' })),
    ]),
    'reimport/v2/report.zip': z([
      f('index.html', long({ title: '보고서', h1: 'v2' })),
      f('keep.html', long({ title: '유지', h1: 'keep', special: { 1: '개정판 문장' } })),
      f('new.html', long({ title: '새 쪽', h1: 'new' })),
    ]),
    'reimport/bad/report.zip': z([
      f('index.html', long({ title: '보고서', h1: 'bad' })),
      f('keep.html', long({ title: '유지', h1: 'keep' }), { corruptCrc: true }),
    ]),
    'pick-entry.zip': z([f('a.html', page({ title: 'A', h1: 'a' })), f('b.html', page({ title: 'B', h1: 'b' }))]),
  });
  const trunc = z([f('index.html', long({ title: '잘림', h1: 'trunc' }))]);
  writeFileSync(join(outDir, 'err-truncated.zip'), trunc.subarray(0, Math.floor(trunc.length / 2)));

  if (opts.big !== false) makeBigZip(outDir);
}

function clickPage(): string {
  const sec = (inner: string) => `<section style="min-height:200px">${inner}</section>`;
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><title>클릭 처리기</title>
<style>#pointer{cursor:pointer}</style></head>
<body><h1 id="h">click</h1>
${sec('<p id="plain">일반 문단입니다.</p>')}
${sec('<p id="handler">핸들러 문단입니다.</p>')}
${sec('<p id="onclick" onclick="this.setAttribute(\'data-clicked\',(+this.getAttribute(\'data-clicked\')||0)+1)">onclick 속성 문단입니다.</p>')}
${sec('<div role="tab" id="tab1" aria-selected="true">탭 1</div> <div role="tab" id="tab2" aria-selected="false">탭 2</div>')}
${sec('<p id="pointer">포인터 문단입니다.</p>')}
${sec('<p id="prevent">preventDefault 문단입니다.</p>')}
${sec('<a id="link" href="#x">링크</a> <input id="inp"> <a id="next" href="page2.html">다음</a>')}
<script>
document.getElementById('handler').addEventListener('click', function () {
  this.setAttribute('data-clicked', (+this.getAttribute('data-clicked') || 0) + 1);
});
document.querySelectorAll('[role=tab]').forEach(function (t) {
  t.addEventListener('click', function () {
    document.querySelectorAll('[role=tab]').forEach(function (o) { o.setAttribute('aria-selected', String(o === t)); });
  });
});
document.addEventListener('click', function (e) {
  if (e.target instanceof Element && e.target.closest('#prevent')) e.preventDefault();
}, true);
document.addEventListener('keydown', function (e) { if (e.key === ']' && e.target.id !== 'inp') e.preventDefault(); });
</script>
</body></html>
`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  makeFixtures(join(ROOT, 'tests/fixtures'));
}
