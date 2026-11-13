import { mount } from 'svelte';
import App from './ui/App.svelte';

mount(App, { target: document.getElementById('app')! });
navigator.serviceWorker?.register('/sw.js');
