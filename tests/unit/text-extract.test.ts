import { expect, test } from 'vitest';
import { encodeEucKr } from '../../tools/zip-builder.ts';
import { extractText, htmlToText } from '../../src/lib/text-extract';

test('script/style/template/noscript 블록과 태그·주석 제거', () => {
  expect(htmlToText(`<html><head><title>T</title><style>p{color:red}</style><script>var a="<p>no</p>";</script></head>
    <body><h1>제목</h1><p>본문 <b>굵게</b></p><template><p>tpl</p></template><noscript>ns</noscript><!-- 주석 --></body></html>`))
    .toBe('T 제목 본문 굵게');
});
test('닫히지 않은 script는 끝까지 제거', () => expect(htmlToText('<p>a</p><script>var x = 1;')).toBe('a'));
test('엔티티·공백 정리', () => expect(htmlToText('<p>A&amp;B&nbsp;&lt;C&gt;</p>\n\n<p>  D  </p>')).toBe('A&B <C> D'));
test('인접 태그 사이에 공백', () => expect(htmlToText('<li>하나</li><li>둘</li>')).toBe('하나 둘'));
test('NFC', () => expect(htmlToText('<p>' + '한글'.normalize('NFD') + '</p>')).toBe('한글'.normalize('NFC')));
test('EUC-KR 문서', () => {
  const b = Uint8Array.from([...new TextEncoder().encode('<meta charset="euc-kr"><p>'), ...encodeEucKr('검색 대상'), ...new TextEncoder().encode('</p>')]);
  expect(extractText(b)).toBe('검색 대상');
});
