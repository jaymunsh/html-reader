import { mount } from 'svelte';
import App from './ui/App.svelte';
import { registerSw } from './ui/sw-client';

mount(App, { target: document.getElementById('app')! });
registerSw();
