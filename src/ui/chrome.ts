import { getSetting, setSetting } from '../lib/storage';
export type Screen = 'library' | 'reader' | 'settings';
export type Theme = 'light' | 'dark';

export const resolveTheme = (setting: 'system' | 'light' | 'dark', prefersDark: boolean): Theme =>
  setting === 'system' ? (prefersDark ? 'dark' : 'light') : setting;

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
}

const hex = (rgb: string) => '#' + (rgb.match(/\d+/g) ?? []).slice(0, 3).map((n) => (+n).toString(16).padStart(2, '0')).join('');

/** Paint html/body and the theme-color meta with the screen's token (computed value). */
export function setChromeColor(screen: Screen): void {
  const root = document.documentElement;
  const v = screen === 'reader' ? 'var(--bg-reader)' : 'var(--bg-app)';
  root.style.backgroundColor = v;
  document.body.style.backgroundColor = v;
  const rgb = getComputedStyle(root).backgroundColor;
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', hex(rgb));
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
