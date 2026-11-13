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
