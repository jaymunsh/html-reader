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
export async function startImport(page: Page, name: string | string[]): Promise<void> {
  await page.getByTestId('import-input').setInputFiles(typeof name === 'string' ? fixture(name) : name.map(fixture));
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

/** Click the book card and wait until the agent state has settled (not 'pending'). */
export async function openBook(page: Page, bookId: string): Promise<Frame> {
  await page.locator(`[data-testid=book-card][data-book-id="${bookId}"]`).click();
  await expect(page.getByTestId('reader')).toBeVisible();
  await expect(page.getByTestId('reader')).not.toHaveAttribute('data-agent', 'pending', { timeout: 10_000 });
  return bookFrame(page);
}

/** The frame whose URL is under /book/. */
export function bookFrame(page: Page): Frame {
  const f = page.frames().find((fr) => {
    try { return new URL(fr.url()).pathname.startsWith('/book/'); } catch { return false; }
  });
  if (!f) throw new Error('no /book/ frame');
  return f;
}

/** Open the reader overlay (mobile layout). No-op when already open or on the desktop layout (top bar always shown). */
export async function openOverlay(page: Page): Promise<void> {
  const reader = page.getByTestId('reader');
  if ((await reader.getAttribute('data-overlay')) === 'open') {
    // restart the auto-hide timer so it cannot close under the caller's next click
    await page.getByTestId('overlay-top').dispatchEvent('pointerdown');
    return;
  }
  if (await page.evaluate(() => matchMedia('(min-width: 768px)').matches)) return;
  const tab = page.getByTestId('ribbon-tab');
  if (await tab.count()) await tab.tap();
  else {
    const vp = page.viewportSize()!;
    await page.touchscreen.tap(vp.width / 2, vp.height / 2);
  }
  await expect(reader).toHaveAttribute('data-overlay', 'open');
  await overlaySettled(page);
}

/** Wait for the overlay's transitions to finish (Playwright counts an opacity-0 transformed bar as visible). */
export async function overlaySettled(page: Page): Promise<void> {
  await page.getByTestId('overlay-top').evaluate((e) => Promise.all(e.getAnimations({ subtree: true }).map((a) => a.finished)).then(() => undefined));
}

export async function backToLibrary(page: Page): Promise<void> {
  await openOverlay(page);
  await page.getByTestId('reader-back').click();
  await expect(page.getByTestId('library')).toBeVisible();
}

/** Scroll the main scroll container (document or largest inner scroller) to a 0-1 ratio. */
export async function scrollFrameTo(frame: Frame, ratio: number): Promise<void> {
  await frame.evaluate((r) => {
    let best: Element = document.scrollingElement ?? document.documentElement;
    let bestRange = best.scrollHeight - best.clientHeight;
    for (const el of document.querySelectorAll('*')) {
      const oy = getComputedStyle(el).overflowY;
      const range = el.scrollHeight - el.clientHeight;
      if ((oy === 'auto' || oy === 'scroll') && range > bestRange) { best = el; bestRange = range; }
    }
    best.scrollTop = r * bestRange;
    // let the scroll event be delivered (and reported) before the next scroll
    return new Promise<void>((res) => requestAnimationFrame(() => requestAnimationFrame(() => res())));
  }, ratio);
}
