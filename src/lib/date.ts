const p2 = (n: number) => String(n).padStart(2, '0');

/** Local date as `YYYY.MM.DD`. */
export const ymd = (t: number): string => { const d = new Date(t); return `${d.getFullYear()}.${p2(d.getMonth() + 1)}.${p2(d.getDate())}`; };
