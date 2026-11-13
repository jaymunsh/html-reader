import './ui/theme/tokens.css';
import './ui/theme/base.css';
import { applyTheme, bootTheme, initTheme, resolveTheme, setChromeColor } from './ui/chrome';
import { mount } from 'svelte';
import App from './ui/App.svelte';
import { cleanupOrphans } from './lib/storage';
import { registerSw } from './ui/sw-client';

// Paint the mirrored theme synchronously (no wrong-theme frame, mount is not delayed); IndexedDB then corrects any drift.
applyTheme(resolveTheme(bootTheme(), matchMedia('(prefers-color-scheme: dark)').matches));
setChromeColor('library');
mount(App, { target: document.getElementById('app')! });
void initTheme();
registerSw();

if (import.meta.env.VITE_E2E) (window as any).__hrTest = { cleanupOrphans };
