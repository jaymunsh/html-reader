import './ui/theme/tokens.css';
import { applyTheme, resolveTheme, setChromeColor } from './ui/chrome';
import { mount } from 'svelte';
import App from './ui/App.svelte';
import { cleanupOrphans } from './lib/storage';
import { registerSw } from './ui/sw-client';

const dark = matchMedia('(prefers-color-scheme: dark)');
applyTheme(resolveTheme('system', dark.matches));
setChromeColor('library');

mount(App, { target: document.getElementById('app')! });
registerSw();

if (import.meta.env.VITE_E2E) (window as any).__hrTest = { cleanupOrphans };
