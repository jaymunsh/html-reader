import { chromium } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';

const dir = new URL('../public/__app/icons/', import.meta.url);
const svg = await readFile(new URL('icon.svg', dir), 'utf8');
const browser = await chromium.launch();
for (const [name, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<style>html,body{margin:0}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);
  await writeFile(new URL(name, dir), await page.screenshot({ type: 'png' }));
  await page.close();
}
await browser.close();
