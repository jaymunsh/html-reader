import { expect, test } from 'vitest';
import { foldCase, hitSnippet, searchTexts } from '../../src/lib/search';

const T = (path: string, text: string) => ({ path, text });
const order = ['a.html', 'b.html', 'c.html'];
const LONE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

test('대소문자 무시 부분 일치, 페이지 순서, 원문 유지', () => {
  const r = searchTexts([T('b.html', 'xx Alpaca yy'), T('a.html', '한글 알파카 문장'), T('c.html', '없음')], 'ALPACA', order);
  expect(r).toEqual([{ path: 'b.html', total: 1, hits: [{ before: 'xx ', match: 'Alpaca', after: ' yy' }] }]);
  expect(searchTexts([T('b.html', 'x'), T('a.html', '한글 알파카 문장')], '알파', order)[0]).toMatchObject({ path: 'a.html', hits: [{ before: '한글 ', match: '알파', after: '카 문장' }] });
});
test('NFC 정규화', () => expect(searchTexts([T('a.html', '한글 문서')], '한글'.normalize('NFD'), order)[0].total).toBe(1));
test('앞뒤 40자 스니펫', () => {
  const [g] = searchTexts([T('a.html', 'L'.repeat(100) + 'KEY' + 'R'.repeat(100))], 'key', order);
  expect(g.hits[0]).toEqual({ before: 'L'.repeat(40), match: 'KEY', after: 'R'.repeat(40) });
  expect(hitSnippet(g.hits[0]).length).toBe(83);
});
test('페이지당 최대 20건, total은 전체', () => {
  const [g] = searchTexts([T('a.html', 'ab '.repeat(50))], 'ab', order);
  expect(g.hits.length).toBe(20); expect(g.total).toBe(50);
});
test('겹치는 일치는 한 번만', () => expect(searchTexts([T('a.html', 'aaaa')], 'aa', order)[0].total).toBe(2));
test('빈 검색어·공백·목록 밖 페이지', () => {
  expect(searchTexts([T('a.html', 'x')], '', order)).toEqual([]);
  expect(searchTexts([T('a.html', 'x')], '   ', order)).toEqual([]);
  expect(searchTexts([T('frag.html', 'key')], 'key', order)).toEqual([]);
});
test('메타문자는 글자 그대로 (Review Focus 4)', () => {
  expect(searchTexts([T('a.html', 'if (a.*b) <b>&amp;')], '.*', order)[0].hits[0].match).toBe('.*');
  expect(searchTexts([T('a.html', 'if (a.*b) <b>&amp;')], '<b>&', order)[0].total).toBe(1);
  expect(searchTexts([T('a.html', 'abc')], '.', order)).toEqual([]);
});
test('길이가 바뀌는 소문자화·서로게이트 쌍 (Review Focus 1)', () => {
  expect(foldCase('İstanbul ABC').length).toBe('İstanbul ABC'.length);
  expect(searchTexts([T('a.html', 'İİİ target 끝')], 'TARGET', order)[0].hits[0]).toEqual({ before: 'İİİ ', match: 'target', after: ' 끝' });
  // 'a' 한 유닛이 이모지 열과 검색어 사이에 있어 40유닛 경계가 서로게이트 쌍 중간에 떨어진다 (K5)
  const emoji = '😀'.repeat(30);
  const [g] = searchTexts([T('a.html', 'x' + emoji + 'aKEYa' + emoji + 'y')], 'key', order);
  const { before, after } = g.hits[0];
  expect(before).not.toMatch(LONE); expect(after).not.toMatch(LONE);
  expect(before.endsWith('a')).toBe(true); expect(after.startsWith('a')).toBe(true);
});
