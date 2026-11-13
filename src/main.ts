import './ui/theme/tokens.css';
import { applyTheme, initTheme, resolveTheme, setChromeColor } from './ui/chrome';
import { mount } from 'svelte';
import App from './ui/App.svelte';
import { cleanupOrphans } from './lib/storage';
import { registerSw } from './ui/sw-client';

// Paint the system theme synchronously (no blank frame, mount is not delayed); the saved setting then overrides it.
applyTheme(resolveTheme('system', matchMedia('(prefers-color-scheme: dark)').matches));
setChromeColor('library');
mount(App, { target: document.getElementById('app')! });
void initTheme();
registerSw();

if (import.meta.env.VITE_E2E) (window as any).__hrTest = { cleanupOrphans };
