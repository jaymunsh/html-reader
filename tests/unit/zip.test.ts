import { expect, test } from 'vitest';
import { buildZip, encodeEucKr } from '../../tools/zip-builder.ts';
import { readCentralDirectory, readEntry, ZipError } from '../../src/lib/zip';

const blob = (b: Uint8Array) => new Blob([b as BlobPart]);
const text = async (b: Blob) => new TextDecoder().decode(await b.arrayBuffer());
const big = 'lorem ipsum 한글 '.repeat(5000);
const code = (p: Promise<unknown>) => p.then(() => 'no-error', (e) => (e as ZipError).code);

test('encodeEucKr 왕복', () => expect(new TextDecoder('euc-kr').decode(encodeEucKr('한글 문서'))).toBe('한글 문서'));

test('STORED·DEFLATE 엔트리', async () => {
  const f = blob(buildZip([{ name: 'a.txt', data: 'hello', method: 0 }, { name: 'dir/', directory: true }, { name: 'dir/b.txt', data: big }]));
  const es = await readCentralDirectory(f);
  expect(es.map((e) => [e.name, e.method, e.isDirectory])).toEqual([['a.txt', 0, false], ['dir/', 0, true], ['dir/b.txt', 8, false]]);
  expect(es[2].uncompressedSize).toBe(new TextEncoder().encode(big).length);
  expect(await text(await readEntry(f, es[0]))).toBe('hello');
  let seen = 0;
  expect(await text(await readEntry(f, es[2], (n) => { seen += n; }))).toBe(big);
  expect(seen).toBe(es[2].uncompressedSize);
});

test('데이터 디스크립터 ZIP(macOS Finder)', async () => {
  const f = blob(buildZip([{ name: 'a.html', data: big, dataDescriptor: true }]));
  const [e] = await readCentralDirectory(f);
  expect(await text(await readEntry(f, e))).toBe(big);
});

test('ZIP64', async () => {
  const f = blob(buildZip([{ name: 'a.txt', data: 'zip64' }, { name: 'b.txt', data: big }], { zip64: true }));
  const es = await readCentralDirectory(f);
  expect(es.map((e) => e.name)).toEqual(['a.txt', 'b.txt']);
  expect(await text(await readEntry(f, es[1]))).toBe(big);
});

test('EOCD 주석이 있어도 찾는다', async () => {
  const f = blob(buildZip([{ name: 'a.txt', data: 'x' }], { comment: new TextEncoder().encode('PK\x05\x06 fake ' + 'c'.repeat(300)) }));
  expect((await readCentralDirectory(f)).length).toBe(1);
});

test('엔트리 0개', async () => expect(await readCentralDirectory(blob(buildZip([])))).toEqual([]));
test('ZIP 아님', async () => expect(await code(readCentralDirectory(blob(new TextEncoder().encode('<html>not a zip</html>'))))).toBe('not-zip'));
test('잘린 ZIP', async () => {
  const b = buildZip([{ name: 'a.txt', data: big }]);
  expect(await code(readCentralDirectory(blob(b.slice(0, b.length - 30))))).toBe('not-zip');
  const cut = new Uint8Array(b); cut.fill(0, b.length - 22 - 51, b.length - 22);   // 중앙 디렉터리 엔트리(46 + 'a.txt' 5바이트)를 시그니처까지 0으로, EOCD는 유지
  expect(await code(readCentralDirectory(blob(cut)))).toBe('corrupt');
});
test('CRC 불일치', async () => {
  const f = blob(buildZip([{ name: 'a.txt', data: big, corruptCrc: true }]));
  expect(await code(readEntry(f, (await readCentralDirectory(f))[0]))).toBe('crc-mismatch');
});
test('암호화·미지원 압축 감지', async () => {
  const f = blob(buildZip([{ name: 'enc.txt', data: 'x', encrypted: true }, { name: 'd64.txt', data: 'x', method: 9 }]));
  const [enc, d64] = await readCentralDirectory(f);
  expect(enc.encrypted).toBe(true);
  expect(d64.method).toBe(9);
  expect(await code(readEntry(f, enc))).toBe('encrypted');
  expect(await code(readEntry(f, d64))).toBe('unsupported-method');
});
test('CP949 파일명', async () => {
  const raw = new Uint8Array([...encodeEucKr('한글'), ...new TextEncoder().encode('.html')]);
  const [e] = await readCentralDirectory(blob(buildZip([{ name: raw, data: 'x' }])));
  expect(e.name).toBe('한글.html');
});
