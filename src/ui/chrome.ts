import { getSetting, setSetting } from '../lib/storage';
export type Screen = 'library' | 'reader' | 'settings';
export type Theme = 'light' | 'dark';

export const resolveTheme = (setting: 'system' | 'light' | 'dark', prefersDark: boolean): Theme =>
  setting === 'system' ? (prefersDark ? 'dark' : 'light') : setting;

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
}

const hex = (rgb: string) => '#' + (rgb.match(/\d+/g) ?? []).slice(0, 3).map((n) => (+n).toString(16).padStart(2, '0')).join('');

export type ReaderChrome = 'book' | 'app';
const isReaderChrome = (v: unknown): v is ReaderChrome => v === 'book' || v === 'app';
let readerChrome: ReaderChrome = 'book';
let readerTouched = false;
let bookBg: string | null = null; // sanitized '#rrggbb' of the open page, or null (unknown -> --bg-reader)

/** Reader top color (spec §6.6): the book's background under 'book' (else --bg-reader), the app background under 'app'. */
const screenColor = (screen: Screen) =>
  screen !== 'reader' || readerChrome === 'app' ? 'var(--bg-app)' : bookBg ?? 'var(--bg-reader)';

/** Paint html/body, the top strip (--chrome) and the theme-color meta with the screen's color (computed value). */
export function setChromeColor(screen: Screen): void {
  const root = document.documentElement;
  const v = screenColor(screen);
  root.style.backgroundColor = v;
  root.style.setProperty('--chrome', v);
  document.body.style.backgroundColor = v;
  const rgb = getComputedStyle(root).backgroundColor;
  // Stylesheet not applied yet: var() is unresolved (transparent -> '#000000'). Keep the static meta and retry once on load.
  if (/^rgba\(.*,\s*0\)$|^transparent$/.test(rgb)) { addEventListener('load', () => setChromeColor(current), { once: true }); return; }
  // Every per-scheme meta gets the same value, so a forced theme that differs from the system scheme still tints the browser UI.
  document.querySelectorAll('meta[name=theme-color]').forEach((m) => m.setAttribute('content', hex(rgb)));
}

type ThemeSetting = 'system' | 'light' | 'dark';
const isSetting = (v: unknown): v is ThemeSetting => v === 'system' || v === 'light' || v === 'dark';
let setting: ThemeSetting = 'system';
let touched = false;
let current: Screen = 'library';
const mq = () => matchMedia('(prefers-color-scheme: dark)');
const repaint = () => { applyTheme(resolveTheme(setting, mq().matches)); setChromeColor(current); };
const mirror = (t: ThemeSetting) => { try { localStorage.setItem('theme', t); } catch { /* ignore */ } };

/** Synchronous boot value (IndexedDB is async): the localStorage mirror of the theme setting. */
export function bootTheme(): ThemeSetting {
  let v: unknown = null;
  try { v = localStorage.getItem('theme'); } catch { /* ignore */ }
  return isSetting(v) ? v : 'system';
}

/** Remember the visible screen so a theme change repaints its color. */
export function setScreen(screen: Screen): void { current = screen; setChromeColor(screen); }

/** IndexedDB stays the source of truth: apply it (fixing any mirror drift) and follow the system while 'system'. */
export async function initTheme(): Promise<void> {
  setting = bootTheme();
  const saved = await getSetting('theme').catch(() => null);
  if (!touched && isSetting(saved)) { setting = saved; mirror(saved); }
  repaint();
  mq().addEventListener('change', repaint);
}

/** Apply immediately; resolves to false when saving failed (the applied theme then lasts for this session only). */
export async function setThemeSetting(t: ThemeSetting): Promise<boolean> {
  touched = true;
  setting = t;
  repaint();
  mirror(t);
  try { await setSetting('theme', t); return true; } catch { return false; }
}

/** The open page's background as sanitized by the caller ('#rrggbb'); anything else, or null, means unknown. */
export function setBookBg(hex: string | null): void {
  const v = hex !== null && /^#[0-9a-f]{6}$/.test(hex) ? hex : null;
  if (v === bookBg) return;
  bookBg = v;
  if (current === 'reader') setChromeColor(current);
}

export async function initReaderChrome(): Promise<void> {
  const saved = await getSetting('readerChrome').catch(() => null);
  if (readerTouched || !isReaderChrome(saved)) return;
  readerChrome = saved;
  setChromeColor(current);
}

/** Apply immediately; resolves to false when saving failed (the choice then lasts for this session only). */
export async function setReaderChrome(v: ReaderChrome): Promise<boolean> {
  readerTouched = true;
  readerChrome = v;
  setChromeColor(current);
  try { await setSetting('readerChrome', v); return true; } catch { return false; }
}
