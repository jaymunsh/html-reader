const GENERIC = new Set(['document', 'index', 'untitled', 'home', '제목 없음', 'untitled document']);

export function defaultTitle(pageTitle: string, sourceName: string): string {
  const t = pageTitle.trim();
  return t === '' || GENERIC.has(t.toLowerCase()) ? sourceName : t;
}

export function dedupeTitle(title: string, existing: string[]): string {
  const used = new Set(existing);
  if (!used.has(title)) return title;
  for (let n = 2; ; n++) {
    const c = `${title} (${n})`;
    if (!used.has(c)) return c;
  }
}

export const TITLE_MAX = 100;
export function validateTitle(input: string): { ok: true; title: string } | { ok: false; reason: 'empty' | 'too-long' } {
  const title = input.trim();
  if (!title) return { ok: false, reason: 'empty' };
  return [...title].length > TITLE_MAX ? { ok: false, reason: 'too-long' } : { ok: true, title };
}
