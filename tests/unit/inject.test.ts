import { expect, test } from 'vitest';
import { agentTag, injectAgent, planInjection } from '../../src/lib/inject';

const enc = (s: string) => new TextEncoder().encode(s);
const dec = (b: Uint8Array) => new TextDecoder().decode(b);
const TAG = '<script src="/__reader/agent.js" data-book="abc123def456" data-scale="1.25"></script>';
const inj = (html: string) => dec(injectAgent(enc(html), { bookId: 'abc123def456', textScale: 1.25 }));

test('태그 형태', () => expect(dec(agentTag('abc123def456', 1.25, 'ascii'))).toBe(TAG));

test.each([
  ['<head> 직후', '<!doctype html><html><head><title>x</title></head>', `<!doctype html><html><head>${TAG}<title>x</title></head>`],
  ['속성 있는 head', '<html><head lang="ko"><title>x</title>', `<html><head lang="ko">${TAG}<title>x</title>`],
  ['대문자', '<HTML><HEAD><TITLE>x</TITLE>', `<HTML><HEAD>${TAG}<TITLE>x</TITLE>`],
  ['head 없음 → html 직후', '<!doctype html><html lang="ko"><body>x', `<!doctype html><html lang="ko">${TAG}<body>x`],
  ['html도 없음 → doctype 직후', '<!DOCTYPE html><p>x', `<!DOCTYPE html>${TAG}<p>x`],
  ['아무것도 없음 → 맨 앞', '<p>x</p>', `${TAG}<p>x</p>`],
  ['<header>는 head가 아니다', '<header>x</header>', `${TAG}<header>x</header>`],
  ['주석 안의 <head>는 건너뛴다', '<!doctype html><!-- <head> --><html><head><title>', `<!doctype html><!-- <head> --><html><head>${TAG}<title>`],
  ['빈 문서', '', TAG],
  ['head 없는 문서: <body> 뒤 스크립트 속 "<head>"는 보지 않는다', '<!doctype html><html><body><script>s="<head>"</script>',
    `<!doctype html><html>${TAG}<body><script>s="<head>"</script>`],
])('%s', (_n, input, want) => expect(inj(input)).toBe(want));

test('BOM 뒤에 넣는다', () => {
  const out = injectAgent(new Uint8Array([0xef, 0xbb, 0xbf, ...enc('<p>x</p>')]), { bookId: 'abc123def456', textScale: 1 });
  expect([...out.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  expect(dec(out.slice(3))).toMatch(/^<script src="\/__reader\/agent\.js"/);
});

test('doctype 앞에는 절대 넣지 않는다', () => {
  const out = inj('\n  <!doctype html><html><head>');
  expect(out.indexOf('<script')).toBeGreaterThan(out.indexOf('<!doctype html>'));
});

test('4KB 창 밖의 <head>는 보지 않는다 (Review Focus 4)', () => {
  const html = '<!doctype html><!--' + 'x'.repeat(5000) + '--><html><head>';
  expect(inj(html).startsWith('<!doctype html>' + TAG)).toBe(true);
});

test('meta charset이 1024바이트 밖으로 밀리면 meta 뒤에 넣는다', () => {
  const meta = '<meta charset="euc-kr">';
  const html = '<html><head>' + '<!--' + 'x'.repeat(940) + '-->' + meta + '<title>t</title>';
  expect(html.indexOf(meta) + meta.length).toBeLessThanOrEqual(1024);
  const out = inj(html);
  expect(out).toContain(meta + TAG);
  expect(out.indexOf(meta) + meta.length).toBeLessThanOrEqual(1024);
});

test('meta charset이 충분히 앞이면 <head> 직후 그대로', () => {
  expect(inj('<html><head><meta charset="utf-8"><title>')).toBe(`<html><head>${TAG}<meta charset="utf-8"><title>`);
});

test('XHTML', () => {
  const x = '<?xml version="1.0"?><!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Strict//EN" "x.dtd"><html xmlns="http://www.w3.org/1999/xhtml"><head><title/>';
  expect(inj(x)).toContain('<head>' + TAG + '<title/>');
});

test('UTF-16LE는 UTF-16으로 넣는다', () => {
  const src = '<html><head><title>x</title>';
  const u16 = new Uint8Array(2 + src.length * 2); u16[0] = 0xff; u16[1] = 0xfe;
  [...src].forEach((c, i) => { u16[2 + i * 2] = c.charCodeAt(0); });
  const out = injectAgent(u16, { bookId: 'abc123def456', textScale: 1 });
  const text = new TextDecoder('utf-16le').decode(out.slice(2));
  expect(text).toBe('<html><head><script src="/__reader/agent.js" data-book="abc123def456" data-scale="1"></script><title>x</title>');
  expect(planInjection(u16.slice(0, 4096)).encoding).toBe('utf-16le');
});
