import { decodeEntities, decodeHtml } from './html-meta';

/** 이미 디코딩된 HTML 문자열에서 검색용 평문을 뽑는다. DOM을 쓰지 않는다(Worker용). */
export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<!--[\s\S]*?(?:-->|$)/g, ' ')
      .replace(/<(script|style|template|noscript)\b[\s\S]*?(?:<\/\1\s*>|$)/gi, ' ')
      .replace(/<(?:\/?[a-zA-Z]|[!?])[^<>]*>/g, ' '),
  )
    .replace(/[\s ]+/g, ' ')
    .trim()
    .normalize('NFC');
}

export function extractText(bytes: Uint8Array): string {
  return htmlToText(decodeHtml(bytes).html);
}
