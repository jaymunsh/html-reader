import { expect, type Frame, type Page } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export function fixture(name: string): string {
  return path.resolve(here, '../fixtures', name);
}

export async function idbGet(page: Page, store: string, key: unknown): Promise<any> {
  return page.evaluate(([s, k]) => new Promise((resolve, reject) => {
    const open = indexedDB.open('html-reader');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const r = db.transaction(s as string).objectStore(s as string).get(k as IDBValidKey);
      r.onsuccess = () => { db.close(); resolve(r.result); };
      r.onerror = () => { db.close(); reject(r.error); };
    };
  }), [store, key] as const);
}

export async function idbAll(page: Page, store: string): Promise<any[]> {
  return page.evaluate((s) => new Promise<any[]>((resolve, reject) => {
    const open = indexedDB.open('html-reader');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const r = db.transaction(s).objectStore(s).getAll();
      r.onsuccess = () => { db.close(); resolve(r.result); };
      r.onerror = () => { db.close(); reject(r.error); };
    };
  }), store);
}

/** Pick the file and click through the entry dialogs (iOS notices, safety notice). Does not wait for the result. */
export async function startImport(page: Page, name: string): Promise<void> {
  await page.getByTestId('import-input').setInputFiles(fixture(name));
  const dialogs = [
    page.getByTestId('ios-continue-tab'),
    page.getByTestId('ios-temp-ok'),
    page.getByTestId('safety-notice').getByTestId('confirm-ok'),
  ];
  const deadline = Date.now() + 5000;
  let quietSince = Date.now();
  while (Date.now() < deadline && Date.now() - quietSince < 300) {
    let clicked = false;
    for (const d of dialogs) {
      if (await d.isVisible()) {
        await d.click().catch(() => {});
        clicked = true;
      }
    }
    if (clicked) quietSince = Date.now();
    else await page.waitForTimeout(50);
  }
}

export async function importFixture(
  page: Page, name: string, opts: { entry?: string; dup?: 'replace' | 'add' } = {},
): Promise<string> {
  const before = new Set((await idbAll(page, 'books')).map((b) => b.id));
  await startImport(page, name);
  if (opts.dup) await page.getByTestId(opts.dup === 'replace' ? 'dup-replace' : 'dup-add').click();
  if (opts.entry) await page.locator(`[data-testid=entry-choice][data-path="${opts.entry}"]`).click();
  if (opts.dup === 'replace') {
    await expect(page.getByTestId('import-progress')).toHaveCount(0);
    const sourceName = name.replace(/\.[^.]+$/, '').normalize('NFC');
    const books = (await idbAll(page, 'books')).filter((b) => b.sourceName === sourceName);
    books.sort((a, b) => b.importedAt - a.importedAt);
    return books[0].id;
  }
  let id = '';
  await expect.poll(async () => {
    id = (await idbAll(page, 'books')).map((b) => b.id).find((i) => !before.has(i)) ?? '';
    return id;
  }, { timeout: 30_000 }).not.toBe('');
  await expect(page.locator(`[data-book-id="${id}"]`)).toBeVisible();
  return id;
}

/** Mount an iframe pointing straight at /book/<id>/<path> (no reader chrome). Returns its Frame. */
export async function mountRawFrame(page: Page, id: string, path: string): Promise<Frame> {
  const handle = await page.evaluateHandle(([i, p]) => {
    const f = document.createElement('iframe');
    f.setAttribute('data-raw-frame', '');
    f.style.cssText = 'position:fixed;left:0;top:0;width:600px;height:400px;background:#fff;z-index:99999';
    f.src = `/book/${i}/${p}`;
    document.body.append(f);
    return f;
  }, [id, path] as const);
  const frame = await handle.asElement()!.contentFrame();
  if (!frame) throw new Error('iframe has no frame');
  return frame;
}
