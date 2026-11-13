import { mount } from 'svelte';
import App from './ui/App.svelte';
import { cleanupOrphans } from './lib/storage';
import { registerSw } from './ui/sw-client';

mount(App, { target: document.getElementById('app')! });
registerSw();

if (import.meta.env.VITE_E2E) (window as any).__hrTest = { cleanupOrphans };
