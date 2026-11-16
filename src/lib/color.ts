// Book background reported by the agent (untrusted page data): only opaque rgb()/rgba() is accepted, and it leaves as '#rrggbb'.

const N = '(\\d{1,3}(?:\\.\\d+)?)';
const RGB = new RegExp(`^rgba?\\(\\s*${N}\\s*[,\\s]\\s*${N}\\s*[,\\s]\\s*${N}\\s*(?:[,/]\\s*(\\d*\\.?\\d+)(%?)\\s*)?\\)$`);

/** '#rrggbb' for an opaque rgb()/rgba() color; null for anything else (transparent, translucent, other syntaxes, junk). */
export function cssRgbToHex(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 64) return null;
  const m = RGB.exec(value.trim().toLowerCase());
  if (!m) return null;
  const ch = [m[1], m[2], m[3]].map(Number);
  if (ch.some((n) => !(n >= 0 && n <= 255))) return null;
  if (m[4] !== undefined && Number(m[4]) / (m[5] ? 100 : 1) < 1) return null; // translucent: what shows through is unknown
  return '#' + ch.map((n) => Math.round(n).toString(16).padStart(2, '0')).join('');
}
