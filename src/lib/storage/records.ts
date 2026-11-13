import { openDb, req, withTx } from './db';
import { SETTING_DEFAULTS } from './types';
import type { Issue, IssueKind, PageProgress, Settings, TextRecord } from './types';

export async function getProgress(bookId: string): Promise<Map<string, PageProgress>> {
  const db = await openDb();
  const all = await req(db.transaction('progress').objectStore('progress').index('bookId').getAll(IDBKeyRange.only(bookId)) as IDBRequest<PageProgress[]>);
  return new Map(all.map((p) => [p.path, p]));
}

export async function getAllProgress(): Promise<PageProgress[]> {
  const db = await openDb();
  return req(db.transaction('progress').objectStore('progress').getAll());
}

export async function putProgress(p: PageProgress): Promise<void> {
  await withTx('progress', 'readwrite', (tx) => { tx.objectStore('progress').put(p); });
}

export async function recordIssue(bookId: string, path: string, kind: IssueKind): Promise<void> {
  await withTx('issues', 'readwrite', async (tx) => {
    const s = tx.objectStore('issues');
    const cur = await req(s.get([bookId, path]) as IDBRequest<Issue | undefined>);
    const next: Issue = { bookId, path, kind, count: (cur?.count ?? 0) + 1, lastSeen: Date.now() };
    s.put(next);
  });
}

export async function listIssues(bookId: string): Promise<Issue[]> {
  const db = await openDb();
  return req(db.transaction('issues').objectStore('issues').index('bookId').getAll(IDBKeyRange.only(bookId)));
}

export async function getTexts(bookId: string): Promise<TextRecord[]> {
  const db = await openDb();
  return req(db.transaction('texts').objectStore('texts').index('bookId').getAll(IDBKeyRange.only(bookId)));
}

export async function getSetting<K extends keyof Settings>(key: K): Promise<Settings[K]> {
  const db = await openDb();
  const v = await req(db.transaction('settings').objectStore('settings').get(key));
  return v === undefined ? SETTING_DEFAULTS[key] : (v as Settings[K]);
}

export async function setSetting<K extends keyof Settings>(key: K, value: Settings[K]): Promise<void> {
  await withTx('settings', 'readwrite', (tx) => { tx.objectStore('settings').put(value, key); });
}

/** Issues that mean the document is incomplete (external ones only mean it needs the network). */
export const missingCount = (issues: Issue[]): number => issues.filter((i) => i.kind !== 'external').length;

export async function listAllIssues(): Promise<Issue[]> {
  const db = await openDb();
  return req(db.transaction('issues').objectStore('issues').getAll());
}
