import { installGuards } from './guards';

const script = document.currentScript as HTMLScriptElement | null;
const bookId = script?.dataset.book ?? '';
const scale = Number(script?.dataset.scale) || 1;

installGuards(bookId);

if (scale !== 1) document.documentElement.style.zoom = String(scale);

function isActive(): boolean {
  try {
    return window.parent !== window && window.parent === window.top
      && parent.location.origin === location.origin && parent.location.pathname === '/';
  } catch { return false; }
}

if (isActive()) {
  // Task 22: start()
}
