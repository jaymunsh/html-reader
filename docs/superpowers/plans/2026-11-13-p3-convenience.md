# HTML Reader PWA — P3 편의 기능 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 문서 전체 텍스트 검색, 북마크, 수정본 재가져오기(교체), 문서명 수정, 서재 검색·정렬을 추가한다.

**Architecture:** 검색은 P1에서 가져오기 때 만든 `texts` 색인으로 "어느 페이지인지"와 스니펫만 구하고, 실제 위치는 agent가 DOM에서 `TreeWalker`로 찾아 스크롤·강조한다. 교체 가져오기는 새 캐시(`v<n+1>`)에 다 쓴 뒤 IndexedDB 트랜잭션 하나로 포인터와 딸린 기록을 바꾼다. 판단 로직은 전부 순수 함수(`search`, `bookmarks`, `reimport`, `title`, `library-sort`)로 두고 Vitest로 검증한다.

**Tech Stack:** P1·P2와 동일(새 의존성 없음)

**Spec:** `docs/superpowers/specs/2026-11-13-html-reader-pwa-design.md` (§7.1–7.3, §7.6–7.7) — `docs/superpowers/plans/2026-11-13-index.md`의 공통 규약과 P1·P2 계획의 Interfaces를 전제로 한다.

## Global Constraints

- P1·P2의 Global Constraints 전부.
- 검색: NFC 정규화 + 대소문자 무시 부분 문자열, 입력 후 200ms 디바운스, 앞뒤 40자 스니펫, 페이지당 최대 20건. 형태소 분석 없음. 브라우저 찾기(`Ctrl/⌘+F`)는 막지 않는다.
- 북마크: 같은 페이지에서 비율 차이 2%(0.02) 이내면 같은 북마크로 보고 해제. 이름 최대 100자.
- 문서명: 앞뒤 공백 제거, 빈 이름 불가, 최대 100자. 직접 바꿀 때 중복은 경고만.
- 교체 가져오기는 `id`·`title`·`textScale`을 유지한다. `sourceName`은 이름을 바꿔도 변하지 않는다.
- 스니펫·문서명·북마크 이름은 항상 텍스트로 렌더링한다(`{@html}` 금지).

## Review Focus

1. **소문자화로 길이가 바뀌는 문자(`İ` 등)·서로게이트 쌍(이모지) 근처의 일치** — 스니펫 오프셋이 어긋나거나 반쪽 문자가 나오지 않는다. (Task 1)
2. **색인 텍스트와 실제 DOM이 다른 경우**(요소 경계에 걸친 일치 `<b>알</b>파카`, JS가 바꾼 DOM, 일치 없음) — 경계에 걸친 일치는 찾고, 없으면 오류 없이 페이지 맨 위에 머문다. (Task 2)
3. **교체 가져오기가 실패함**(손상된 수정본) — 기존 문서·진행률·북마크가 그대로이고 새 캐시만 지워진다. (Task 6)
4. **검색어에 `<`, `&`, 정규식 메타문자(`.*(`)가 들어감** — 글자 그대로 찾고, 스니펫이 HTML로 해석되지 않는다. (Task 1, Task 3)
5. **같은 `sourceName` 문서가 이미 둘 이상**("새 문서로 추가"를 고른 적이 있음) — 교체 대상은 가장 최근에 가져온 문서이고, 대화상자에 그 문서명이 표시된다. (Task 6)

---

### Task 1: `search`

**Files:** Create: `src/lib/search.ts` / Test: `tests/unit/search.test.ts`

**Interfaces:**
- Consumes: `getTexts`, `getBook`, `orderedPages`
- Produces:

```ts
export const SNIPPET_CONTEXT = 40; export const MAX_HITS_PER_PAGE = 20; export const SEARCH_DEBOUNCE_MS = 200;
export interface SearchHit { before: string; match: string; after: string }          // 원문 그대로(대소문자 유지)
export interface SearchGroup { path: string; total: number; hits: SearchHit[] }      // hits.length ≤ 20, total은 전체 일치 수
export function foldCase(s: string): string;                                         // NFC + 코드 유닛 단위 소문자화(길이가 달라지는 문자는 원문 유지) → 길이 보존
export function searchTexts(texts: { path: string; text: string }[], query: string, pageOrder: string[]): SearchGroup[];
export function hitSnippet(hit: SearchHit): string;                                  // before + match + after (agent에 넘기는 문맥)
export function searchBook(bookId: string, query: string): Promise<SearchGroup[]>;   // getTexts + orderedPages(book.pagePaths)
```

`searchTexts`: 검색어는 trim 후 `foldCase`. 빈 검색어는 `[]`. `pageOrder`에 있는 경로만, 그 순서대로. 일치가 없는 페이지는 빼고, 겹치는 일치는 세지 않는다(다음 탐색은 일치 끝에서 시작). 스니펫 경계가 서로게이트 쌍 중간이면 한 유닛 줄인다.

- [ ] **Step 1: 실패하는 테스트**

```ts
import { expect, test } from 'vitest';
import { foldCase, hitSnippet, searchTexts } from '../../src/lib/search';

const T = (path: string, text: string) => ({ path, text });
const order = ['a.html', 'b.html', 'c.html'];

test('대소문자 무시 부분 일치, 페이지 순서, 원문 유지', () => {
  const r = searchTexts([T('b.html', 'xx Alpaca yy'), T('a.html', '한글 알파카 문장'), T('c.html', '없음')], 'ALPACA', order);
  expect(r).toEqual([{ path: 'b.html', total: 1, hits: [{ before: 'xx ', match: 'Alpaca', after: ' yy' }] }]);
  expect(searchTexts([T('b.html', 'x'), T('a.html', '한글 알파카 문장')], '알파', order)[0]).toMatchObject({ path: 'a.html', hits: [{ before: '한글 ', match: '알파', after: '카 문장' }] });
});
test('NFC 정규화', () => expect(searchTexts([T('a.html', '한글 문서')], '한글'.normalize('NFD'), order)[0].total).toBe(1));
test('앞뒤 40자 스니펫', () => {
  const [g] = searchTexts([T('a.html', 'L'.repeat(100) + 'KEY' + 'R'.repeat(100))], 'key', order);
  expect(g.hits[0]).toEqual({ before: 'L'.repeat(40), match: 'KEY', after: 'R'.repeat(40) });
  expect(hitSnippet(g.hits[0]).length).toBe(83);
});
test('페이지당 최대 20건, total은 전체', () => {
  const [g] = searchTexts([T('a.html', 'ab '.repeat(50))], 'ab', order);
  expect(g.hits.length).toBe(20); expect(g.total).toBe(50);
});
test('겹치는 일치는 한 번만', () => expect(searchTexts([T('a.html', 'aaaa')], 'aa', order)[0].total).toBe(2));
test('빈 검색어·공백·목록 밖 페이지', () => {
  expect(searchTexts([T('a.html', 'x')], '', order)).toEqual([]);
  expect(searchTexts([T('a.html', 'x')], '   ', order)).toEqual([]);
  expect(searchTexts([T('frag.html', 'key')], 'key', order)).toEqual([]);
});
test('메타문자는 글자 그대로 (Review Focus 4)', () => {
  expect(searchTexts([T('a.html', 'if (a.*b) <b>&amp;')], '.*', order)[0].hits[0].match).toBe('.*');
  expect(searchTexts([T('a.html', 'if (a.*b) <b>&amp;')], '<b>&', order)[0].total).toBe(1);
  expect(searchTexts([T('a.html', 'abc')], '.', order)).toEqual([]);
});
test('길이가 바뀌는 소문자화·서로게이트 쌍 (Review Focus 1)', () => {
  expect(foldCase('İstanbul ABC').length).toBe('İstanbul ABC'.length);
  expect(searchTexts([T('a.html', 'İİİ target 끝')], 'TARGET', order)[0].hits[0]).toEqual({ before: 'İİİ ', match: 'target', after: ' 끝' });
  const emoji = '😀'.repeat(30);                                              // 60 코드 유닛
  const [g] = searchTexts([T('a.html', 'x' + emoji + 'KEY' + emoji + 'y')], 'key', order);
  for (const s of [g.hits[0].before, g.hits[0].after]) expect(s.isWellFormed()).toBe(true);
});
```

- [ ] **Step 2: 실패 확인** — `npx vitest run tests/unit/search.test.ts` → FAIL
- [ ] **Step 3: 구현** — `indexOf` 반복(정규식 사용 안 함).
- [ ] **Step 4: 통과 확인** → PASS
- [ ] **Step 5: Commit** — `feat: full-text search over indexed page texts`

---

### Task 2: agent 위치 찾기·강조 (`find`)

**Files:** Create: `src/agent/find.ts` / Modify: `src/agent/main.ts`, `scripts/make-fixtures.ts`(픽스처 `search.zip` 추가) / Test: `tests/e2e/find.spec.ts`

**Interfaces:**
- Consumes: `protocol`의 `find`, `init.restore.find`, `whenStable`, `findScroller`
- Produces: `findAndReveal(query: string, snippet: string): boolean`
  - `TreeWalker(document.body, SHOW_TEXT)`로 `script/style/template/noscript` 밖의 텍스트 노드를 이어 붙인 문자열과 (노드, 시작 오프셋) 표를 만든다. 요소 경계에는 아무것도 넣지 않는다(경계에 걸친 일치를 찾기 위해). 비교는 양쪽 모두 NFC + 소문자 + 공백류 연속을 한 칸으로 접은 형태로 하되 원래 오프셋 표를 유지한다.
  - 일치가 여러 개면 스니펫 문맥과 가장 잘 맞는 것: 점수 = (일치 앞 텍스트와 스니펫의 `before` 부분의 공통 접미사 길이) + (일치 뒤 텍스트와 `after` 부분의 공통 접두사 길이). `before`/`after`는 스니펫 안에서 검색어의 첫 위치로 나눈다. 동점·스니펫 불일치면 첫 일치.
  - 찾으면 `Range`를 만들어 `range.getBoundingClientRect()` 기준으로 스크롤 컨테이너를 일치가 화면 세로 중앙에 오게 스크롤하고, `CSS.highlights`가 있으면 `CSS.highlights.set('hr-find', new Highlight(range))` + 한 번만 주입하는 `<style>::highlight(hr-find){background:#ffe08a;color:#15181e}</style>`, 2500ms 뒤 `CSS.highlights.delete('hr-find')`. Highlight API가 없으면 스크롤만.
  - `init.restore.find`: DOM 준비 직후 한 번 시도, 못 찾았으면 `whenStable` 뒤 한 번 더. `find` 메시지: 즉시 한 번.

픽스처 `search.zip`: `index.html`(긴 페이지. 30번째 문단 `첫 번째 고래 이야기`, 170번째 문단 `두 번째 고래 이야기 끝`), `other.html`(긴 페이지. 120번째 문단 `<p id="split">여기 <b>알</b>파카 가 있다</p>`, 맨 끝에 `<script>document.body.insertAdjacentHTML('beforeend','<p id="late">늦게 생긴 문장</p>')</script>`).

- [ ] **Step 1: 실패하는 E2E** — 셸 UI 없이, 셸 창에서 iframe으로 직접 메시지를 보내 agent만 검증한다.

```ts
import { expect, test } from '@playwright/test';
import { importFixture, openBook } from './helpers';

const send = (page: any, msg: object) => page.evaluate((m: object) => {
  const w = (document.querySelector('[data-testid=reader-frame]') as HTMLIFrameElement).contentWindow!;
  w.postMessage({ app: 'html-reader', protocolVersion: 1, ...m }, location.origin);
}, msg);
const inView = (f: any, sel: string) => f.locator(sel).evaluate((e: Element) => { const r = e.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; });
const highlighted = (f: any) => f.evaluate(() => ('highlights' in CSS ? (CSS as any).highlights.has('hr-find') : null));

test('스니펫 문맥과 가장 잘 맞는 일치로 스크롤하고 잠시 강조한다', async ({ page }) => {
  await page.goto('/');
  const id = await importFixture(page, 'search.zip');
  const f = await openBook(page, id);
  await send(page, { type: 'find', query: '고래', snippet: '두 번째 고래 이야기 끝' });
  await expect.poll(() => inView(f, '#p170')).toBe(true);
  const h = await highlighted(f);
  if (h !== null) { expect(h).toBe(true); await expect.poll(() => highlighted(f), { timeout: 4000 }).toBe(false); }
});

test('스니펫이 안 맞으면 첫 일치로 폴백', async ({ page }) => {
  await page.goto('/');
  const id = await importFixture(page, 'search.zip');
  const f = await openBook(page, id);
  await send(page, { type: 'find', query: '고래', snippet: '전혀 다른 문맥 고래 없음' });
  await expect.poll(() => inView(f, '#p30')).toBe(true);
});

test('요소 경계에 걸친 일치를 찾고, 없는 검색어는 조용히 무시한다 (Review Focus 2)', async ({ page }) => {
  await page.goto('/');
  const id = await importFixture(page, 'search.zip');
  const f = await openBook(page, id);
  await f.evaluate(() => { location.href = 'other.html'; });
  await expect(page.getByTestId('reader')).toHaveAttribute('data-path', 'other.html');
  await expect(page.getByTestId('reader')).toHaveAttribute('data-agent', 'ready');
  const errors: string[] = []; page.on('pageerror', (e) => errors.push(e.message));
  await send(page, { type: 'find', query: '없는검색어zz', snippet: '없는검색어zz' });
  await page.waitForTimeout(300);
  expect(await f.evaluate(() => document.scrollingElement!.scrollTop)).toBe(0);
  await send(page, { type: 'find', query: '알파카', snippet: '여기 알파카 가 있다' });
  await expect.poll(() => inView(f, '#split')).toBe(true);
  expect(errors).toEqual([]);
});
```

- [ ] **Step 2: 실패 확인** — `npm run fixtures && npx playwright test tests/e2e/find.spec.ts --project=chromium --project=webkit` → FAIL
- [ ] **Step 3: 구현**
- [ ] **Step 4: 통과 확인** — 4개 프로젝트 PASS, `npm run build && npm run size`(agent ≤ 8,192B gzip)
- [ ] **Step 5: Commit** — `feat: agent find-in-DOM with context matching and highlight`

---

### Task 3: 검색 UI

**Files:** Create: `src/ui/reader/SearchPanel.svelte` / Modify: `src/ui/reader/{Reader,Overlay}.svelte` / Test: `tests/e2e/search.spec.ts`

**Interfaces:**
- Consumes: `searchBook`, `hitSnippet`, `SEARCH_DEBOUNCE_MS`, `session.navigate`, `session.post`, `Reader.actions.search`(P2-8)
- Produces:
  - `SearchPanel.svelte` props `{ bookId: string; variant: 'fullscreen' | 'dropdown'; onPick(path: string, query: string, snippet: string): void; onClose(): void }`.
  - 모바일: 상단 바에 `btn-search` → 전체 화면 패널. 맨 위 `search-input`(자동 포커스) + `search-cancel`(`취소`), 결과는 `search-group`(`data-path`, 머리에 파일명과 `N건` — total이 20을 넘으면 `N건 중 20건 표시`), 그 안에 `search-result`(스니펫: `before` + `<mark>match</mark>` + `after`, 텍스트 노드로 렌더링), 하단 `search-limit-note`: `스크립트가 실행된 뒤에 만들어지는 텍스트는 검색되지 않습니다.` 결과 없음: `일치하는 내용이 없습니다`.
  - PC: 상단 바 안에 `search-input`(placeholder `검색`, 오른쪽에 `/` 힌트 칩) → 결과를 입력 아래 드롭다운(같은 `search-group`/`search-result`/`search-limit-note`)으로. Escape·바깥 클릭으로 닫힌다.
  - 단축키 `/` → `search-input` 포커스(모바일은 패널을 연다). 이 핸들러는 `preventDefault`해서 `/`가 입력에 들어가지 않게 한다.
  - 결과를 누르면: 현재 페이지와 같으면 `session.post({ type: 'find', query, snippet })`, 다르면 `pendingRestore = { find: { query, snippet } }`로 두고 `session.navigate(path)` — `getInit(path)`가 이 값을 한 번 쓰고 비운다. 패널은 닫힌다.

- [ ] **Step 1: 실패하는 E2E**

```ts
import { expect, test } from '@playwright/test';
import { importFixture, openBook, openOverlay } from './helpers';

const inView = (f: any, sel: string) => f.locator(sel).evaluate((e: Element) => { const r = e.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; });
async function openSearch(page: any, isMobile: boolean) { if (isMobile) { await openOverlay(page); await page.getByTestId('btn-search').tap(); } else await page.getByTestId('search-input').click(); }

test('검색어 입력 → 다른 페이지의 결과 클릭 → 해당 위치로 스크롤되고 강조된다', async ({ page, isMobile }) => {
  await page.goto('/');
  const id = await importFixture(page, '01-multipage.zip');
  const f = await openBook(page, id);
  await openSearch(page, isMobile);
  await page.getByTestId('search-input').fill('알파카');
  const group = page.locator('[data-testid=search-group][data-path="page2.html"]');
  await expect(group).toBeVisible();
  await expect(group.locator('mark')).toHaveText('알파카');
  await expect(page.getByTestId('search-group')).toHaveCount(1);
  await expect(page.getByTestId('search-limit-note')).toContainText('스크립트가 실행된 뒤에 만들어지는 텍스트는 검색되지 않습니다.');
  await group.getByTestId('search-result').first().click();
  await expect(page.getByTestId('reader')).toHaveAttribute('data-path', 'page2.html');
  await expect.poll(() => inView(f, '#p150'), { timeout: 6000 }).toBe(true);
  const h = await f.evaluate(() => ('highlights' in CSS ? (CSS as any).highlights.has('hr-find') : null));
  if (h !== null) expect(h).toBe(true);
});

test('같은 페이지 결과, 20건 제한 표시, 결과 없음', async ({ page, isMobile }) => {
  await page.goto('/');
  const id = await importFixture(page, 'search.zip');
  const f = await openBook(page, id);
  await openSearch(page, isMobile);
  await page.getByTestId('search-input').fill('문단');                           // 모든 문단에 있는 단어
  const g = page.locator('[data-testid=search-group][data-path="index.html"]');
  await expect(g.getByTestId('search-result')).toHaveCount(20);
  await expect(g).toContainText('건 중 20건 표시');
  await page.getByTestId('search-input').fill('zzz없는말');
  await expect(page.getByTestId('search-group')).toHaveCount(0);
  await expect(page.getByText('일치하는 내용이 없습니다')).toBeVisible();
  await page.getByTestId('search-input').fill('두 번째 고래');
  await page.getByTestId('search-result').first().click();
  await expect(page.getByTestId('reader')).toHaveAttribute('data-path', 'index.html');
  await expect.poll(() => inView(f, '#p170')).toBe(true);
});

test('200ms 디바운스, 스니펫은 HTML로 해석되지 않는다 (Review Focus 4)', async ({ page, isMobile }) => {
  await page.goto('/');
  const id = await importFixture(page, 'search.zip');
  await openBook(page, id);
  await openSearch(page, isMobile);
  await page.getByTestId('search-input').pressSequentially('고래', { delay: 20 });
  await expect(page.getByTestId('search-group')).toHaveCount(0);                 // 아직 디바운스 중
  await expect(page.getByTestId('search-group').first()).toBeVisible({ timeout: 1500 });
  await page.getByTestId('search-input').fill('<b>');
  await page.waitForTimeout(400);
  expect(await page.locator('[data-testid=search-result] b').count()).toBe(0);
});

test('/ 단축키로 검색에 포커스', async ({ page, isMobile }) => {
  test.skip(isMobile, 'PC 단축키');
  await page.goto('/');
  const id = await importFixture(page, 'search.zip');
  const f = await openBook(page, id);
  await f.locator('#h').click();
  await page.keyboard.press('/');
  await expect(page.getByTestId('search-input')).toBeFocused();
  await expect(page.getByTestId('search-input')).toHaveValue('');
});
```

- [ ] **Step 2: 실패 확인** — `npx playwright test tests/e2e/search.spec.ts --project=chromium --project=mobile-chromium` → FAIL
- [ ] **Step 3: 구현**
- [ ] **Step 4: 통과 확인** — 4개 프로젝트 PASS
- [ ] **Step 5: Commit** — `feat: search panel (mobile full screen, desktop dropdown)`

---

### Task 4: `bookmarks` 로직 + 저장소

**Files:** Create: `src/lib/bookmarks.ts` / Modify: `src/lib/storage/records.ts`, `src/lib/storage/index.ts` / Test: `tests/unit/bookmarks.test.ts`

**Interfaces:**
- Produces:

```ts
// bookmarks.ts
export const BOOKMARK_NEAR = 0.02; export const LABEL_MAX = 100;
export function findNearBookmark(list: Bookmark[], path: string, ratio: number): Bookmark | undefined;   // 같은 path, |Δratio| ≤ 0.02, 여러 개면 가장 가까운 것
export function defaultBookmarkLabel(path: string, ratio: number): string;                               // `${마지막 세그먼트} · ${Math.round(ratio * 100)}%`
export function normalizeLabel(input: string, fallback: string): string;                                 // trim → 빈 값이면 fallback → 100자로 자름
export function newBookmark(bookId: string, path: string, ratio: number, now: number): Bookmark;         // id는 crypto.randomUUID()
// storage/records.ts
export function listBookmarks(bookId: string): Promise<Bookmark[]>;      // createdAt 내림차순
export function putBookmark(b: Bookmark): Promise<void>;
export function deleteBookmark(id: string): Promise<void>;
```

- [ ] **Step 1: 실패하는 테스트**

```ts
import 'fake-indexeddb/auto';
import { expect, test } from 'vitest';
import { defaultBookmarkLabel, findNearBookmark, newBookmark, normalizeLabel } from '../../src/lib/bookmarks';
import { deleteBookmark, listBookmarks, putBookmark } from '../../src/lib/storage';

const bm = (id: string, path: string, scrollRatio: number) => ({ id, bookId: 'b', path, scrollRatio, label: 'x', createdAt: 1 });
test('2% 이내면 같은 북마크', () => {
  const list = [bm('1', 'a.html', 0.5), bm('2', 'a.html', 0.515), bm('3', 'b.html', 0.5)];
  expect(findNearBookmark(list, 'a.html', 0.52)?.id).toBe('2');
  expect(findNearBookmark(list, 'a.html', 0.48)?.id).toBe('1');
  expect(findNearBookmark(list, 'a.html', 0.5401)).toBeUndefined();
  expect(findNearBookmark(list, 'c.html', 0.5)).toBeUndefined();
});
test('기본 이름·이름 정리', () => {
  expect(defaultBookmarkLabel('chapters/3장.html', 0.616)).toBe('3장.html · 62%');
  expect(normalizeLabel('  내 표시  ', 'f')).toBe('내 표시');
  expect(normalizeLabel('   ', 'a.html · 10%')).toBe('a.html · 10%');
  expect(normalizeLabel('가'.repeat(150), 'f')).toHaveLength(100);
});
test('newBookmark', () => expect(newBookmark('b', 'a.html', 0.25, 9)).toMatchObject({ bookId: 'b', path: 'a.html', scrollRatio: 0.25, label: 'a.html · 25%', createdAt: 9 }));
test('저장소', async () => {
  await putBookmark({ ...bm('1', 'a.html', 0.1), createdAt: 1 }); await putBookmark({ ...bm('2', 'a.html', 0.9), createdAt: 2 });
  await putBookmark({ ...bm('3', 'a.html', 0.5), bookId: 'other' });
  expect((await listBookmarks('b')).map((x) => x.id)).toEqual(['2', '1']);
  await deleteBookmark('2');
  expect((await listBookmarks('b')).map((x) => x.id)).toEqual(['1']);
});
```

- [ ] **Step 2: 실패 확인** — `npx vitest run tests/unit/bookmarks.test.ts` → FAIL
- [ ] **Step 3: 구현**
- [ ] **Step 4: 통과 확인** → PASS
- [ ] **Step 5: Commit** — `feat: bookmark logic and store`

---

### Task 5: 북마크 UI

**Files:** Create: `src/ui/reader/BookmarksTab.svelte` / Modify: `src/ui/reader/{Reader,Overlay,Panel}.svelte` / Test: `tests/e2e/bookmarks.spec.ts`

**Interfaces:**
- Consumes: Task 4 전부, `Reader.actions.bookmark`, 현재 `ratio`(마지막 `onScroll`), `session.navigate`/`post`
- Produces:
  - `btn-bookmark`(모바일·PC 상단 바): 현재 위치에 가까운 북마크가 있으면 `aria-pressed="true"` + `bookmark-filled` 아이콘. 누르거나 `B`: 가까운 북마크가 있으면 삭제, 없으면 `newBookmark` 저장. `limited`에서는 `disabled`.
  - `BookmarksTab.svelte`: `bookmark-row`마다 이름(주) + `파일명 · YYYY.MM.DD`(보조) + `bookmark-delete`(삭제 버튼) + `bookmark-menu`(⋯ → `bookmark-rename` → `rename-input` + `rename-save`, 저장 시 `normalizeLabel(input, defaultBookmarkLabel(...))`). 터치에서 행을 왼쪽으로 80px 넘게 밀면 삭제. 행을 누르면: 같은 페이지 → `post({ type: 'scroll-to', ratio })`, 다른 페이지 → `pendingRestore = { bookmark: { scrollRatio } }` + `navigate(path)`. 모바일은 시트를 닫는다. 목록이 비면 `북마크가 없습니다`.

- [ ] **Step 1: 실패하는 E2E**

```ts
import { expect, test } from '@playwright/test';
import { idbAll, importFixture, openBook, openOverlay, scrollFrameTo } from './helpers';
const ratio = (f: any) => f.evaluate(() => { const e = document.scrollingElement!; return e.scrollTop / (e.scrollHeight - e.clientHeight); });
async function openBookmarks(page: any, isMobile: boolean) {
  await openOverlay(page);
  if (isMobile) await page.getByTestId('btn-panel').tap();
  else if ((await page.getByTestId('panel').getAttribute('data-open')) !== 'true') await page.getByTestId('panel-toggle').click();
  await page.getByTestId('panel-tab-bookmarks').click();
}

test('북마크 추가 → 다른 페이지로 이동 → 북마크 탭에서 복귀', async ({ page, isMobile }) => {
  await page.goto('/');
  const id = await importFixture(page, '01-multipage.zip');
  const f = await openBook(page, id);
  await f.locator('#rel').evaluate((a: HTMLAnchorElement) => a.click());
  await expect(page.getByTestId('reader')).toHaveAttribute('data-path', 'page2.html');
  await scrollFrameTo(f, 0.5);
  await openOverlay(page);
  await page.getByTestId('btn-bookmark').click();
  await expect(page.getByTestId('btn-bookmark')).toHaveAttribute('aria-pressed', 'true');
  expect(await idbAll(page, 'bookmarks')).toMatchObject([{ bookId: id, path: 'page2.html', label: 'page2.html · 50%' }]);

  await f.evaluate(() => history.back());
  await expect(page.getByTestId('reader')).toHaveAttribute('data-path', 'index.html');
  await openOverlay(page);
  await expect(page.getByTestId('btn-bookmark')).toHaveAttribute('aria-pressed', 'false');
  await openBookmarks(page, isMobile);
  await expect(page.getByTestId('bookmark-row')).toHaveCount(1);
  await expect(page.getByTestId('bookmark-row')).toContainText('page2.html · 50%');
  await page.getByTestId('bookmark-row').click();
  await expect(page.getByTestId('reader')).toHaveAttribute('data-path', 'page2.html');
  await expect.poll(() => ratio(f), { timeout: 6000 }).toBeCloseTo(0.5, 1);
});

test('같은 위치(2% 이내)에서 다시 누르면 해제, 이름 바꾸기, 삭제', async ({ page, isMobile }) => {
  await page.goto('/');
  const id = await importFixture(page, '10-single.html');
  const f = await openBook(page, id);
  await scrollFrameTo(f, 0.3); await openOverlay(page);
  await page.getByTestId('btn-bookmark').click();
  await scrollFrameTo(f, 0.31); await openOverlay(page);
  await page.getByTestId('btn-bookmark').click();
  await expect.poll(async () => (await idbAll(page, 'bookmarks')).length).toBe(0);
  await scrollFrameTo(f, 0.7); await openOverlay(page);
  await page.getByTestId('btn-bookmark').click();
  await openBookmarks(page, isMobile);
  await page.getByTestId('bookmark-menu').click();
  await page.getByTestId('bookmark-rename').click();
  await page.getByTestId('rename-input').fill('  중요한 곳  ');
  await page.getByTestId('rename-save').click();
  await expect(page.getByTestId('bookmark-row')).toContainText('중요한 곳');
  expect((await idbAll(page, 'bookmarks'))[0].label).toBe('중요한 곳');
  await page.getByTestId('bookmark-delete').click();
  await expect(page.getByTestId('bookmark-row')).toHaveCount(0);
  await expect(page.getByTestId('panel')).toContainText('북마크가 없습니다');
});

test('B 단축키', async ({ page, isMobile }) => {
  test.skip(isMobile, 'PC 단축키');
  await page.goto('/');
  const id = await importFixture(page, '10-single.html');
  const f = await openBook(page, id);
  await f.locator('#h').click();
  await page.keyboard.press('b');
  await expect.poll(async () => (await idbAll(page, 'bookmarks')).length).toBe(1);
  await page.keyboard.press('b');
  await expect.poll(async () => (await idbAll(page, 'bookmarks')).length).toBe(0);
});

test('밀어서 삭제', async ({ page, isMobile }) => {
  test.skip(!isMobile, '터치 전용');
  await page.goto('/');
  const id = await importFixture(page, '10-single.html');
  await openBook(page, id); await openOverlay(page);
  await page.getByTestId('btn-bookmark').tap();
  await openBookmarks(page, true);
  const row = page.getByTestId('bookmark-row'), b = (await row.boundingBox())!;
  const ev = (t: string, x: number) => row.dispatchEvent(t, { clientX: x, clientY: b.y + b.height / 2, pointerId: 5, pointerType: 'touch', isPrimary: true, bubbles: true });
  await ev('pointerdown', b.x + b.width - 30); await ev('pointermove', b.x + b.width - 90); await ev('pointermove', b.x + b.width - 150); await ev('pointerup', b.x + b.width - 150);
  await expect(page.getByTestId('bookmark-row')).toHaveCount(0);
});
```

- [ ] **Step 2: 실패 확인** — `npx playwright test tests/e2e/bookmarks.spec.ts --project=chromium --project=mobile-webkit` → FAIL
- [ ] **Step 3: 구현**
- [ ] **Step 4: 통과 확인** — 4개 프로젝트 PASS
- [ ] **Step 5: Commit** — `feat: bookmarks UI`

---

### Task 6: 수정본 재가져오기(교체)

**Files:** Create: `src/lib/reimport.ts` / Modify: `src/lib/storage/books.ts`(`commitReplace`), `src/lib/importer/{importer.worker.ts,client.ts}`, `src/ui/library/ImportFlow.svelte`, `scripts/make-fixtures.ts` / Test: `tests/unit/reimport.test.ts`, `tests/e2e/reimport.spec.ts`

**Interfaces:**
- Consumes: `parseCacheName`, `cacheNameFor`, `pickEntryPath`, `tellSw`
- Produces:

```ts
// reimport.ts
export interface ReplacePlan { dropProgress: string[]; dropBookmarkIds: string[]; lastPath: string }
export function planReplace(i: {
  newPaths: string[];                                   // 새 묶음의 전체 경로(bookFiles.paths)
  progressPaths: string[]; bookmarks: { id: string; path: string }[];
  lastPath: string; newEntryPath: string;
}): ReplacePlan;
export function pickReplaceEntry(newPagePaths: string[], oldEntryPath: string): string | null;   // pickEntryPath ?? (oldEntryPath가 새 목록에 있으면 그것) ?? null
// storage/books.ts — 트랜잭션 1개. 반환: 이전 cacheName
export function commitReplace(bookId: string, next: Pick<Book, 'cacheName' | 'entryPath' | 'pagePaths' | 'fileCount' | 'totalBytes' | 'importedAt'>,
  files: BookFiles, texts: TextRecord[], plan: ReplacePlan): Promise<string>;
// importer/client.ts
export function findBySourceName(sourceName: string): Promise<Book | undefined>;   // 여러 개면 importedAt이 가장 최근인 것 (Review Focus 5)
```

`commitReplace`가 한 트랜잭션에서 하는 일: `books` 레코드에 `next`와 `plan.lastPath` 반영(`id`·`title`·`sourceName`·`textScale`·`lastOpenedAt` 유지) / `bookFiles` 교체 / 그 문서의 `texts` 전부 삭제 후 새로 기록 / `plan.dropProgress`·`plan.dropBookmarkIds` 삭제 / 그 문서의 `issues` 전부 삭제(인덱스 스펙 이슈 9).

Worker의 `mode.kind === 'replace'` 흐름: 기존 `book`을 읽어 `n` = `parseCacheName(book.cacheName).n + 1` → `cacheNameFor(id, n)`에 P1과 같은 방식으로 기록 → `pickReplaceEntry`(null이면 `need-entry`) → `planReplace` → `commitReplace` → **커밋 후** 이전 캐시 `caches.delete`. 실패하면 새 캐시만 삭제하고 `error`. 제목은 다시 계산하지 않는다. 완료 후 main이 `tellSw({ type: 'book-changed', id })`.

UI(`ImportFlow`): 가져오기 시작 전에 `findBySourceName(sourceNameOf(file.name))`이 있으면 대화상자 — 본문 `"<문서명>" 문서가 이미 있습니다.`, 버튼 `dup-replace`(`기존 문서 교체`)·`dup-add`(`새 문서로 추가`)·`confirm-cancel`. (가져오기는 서재에서만 시작되므로 "리더에 열려 있으면 먼저 닫는다"는 항상 충족된다. P4의 외부 전달은 P4-1이 서재로 먼저 이동시킨다.)

픽스처(같은 파일명이어야 하므로 하위 폴더에 둔다): `reimport/v1/report.zip`(`index.html` `<title>보고서</title>`, `keep.html`, `gone.html` — 모두 긴 페이지), `reimport/v2/report.zip`(`index.html` `<title>보고서</title>`, `keep.html`(본문에 `개정판 문장`), `new.html`), `reimport/bad/report.zip`(CRC 불일치 엔트리 포함).

- [ ] **Step 1: 실패하는 테스트**

```ts
// tests/unit/reimport.test.ts
import { expect, test } from 'vitest';
import { pickReplaceEntry, planReplace } from '../../src/lib/reimport';

test('남은 경로의 기록은 유지, 사라진 경로는 삭제', () => {
  expect(planReplace({ newPaths: ['index.html', 'keep.html', 'new.html', 'a.css'], progressPaths: ['index.html', 'keep.html', 'gone.html'],
    bookmarks: [{ id: '1', path: 'keep.html' }, { id: '2', path: 'gone.html' }], lastPath: 'keep.html', newEntryPath: 'index.html' }))
    .toEqual({ dropProgress: ['gone.html'], dropBookmarkIds: ['2'], lastPath: 'keep.html' });
});
test('lastPath가 사라졌으면 entryPath로', () => {
  expect(planReplace({ newPaths: ['index.html'], progressPaths: [], bookmarks: [], lastPath: 'gone.html', newEntryPath: 'index.html' }).lastPath).toBe('index.html');
  expect(planReplace({ newPaths: ['index.html'], progressPaths: [], bookmarks: [], lastPath: '', newEntryPath: 'index.html' }).lastPath).toBe('');
});
test('pickReplaceEntry', () => {
  expect(pickReplaceEntry(['a.html', 'index.html'], 'a.html')).toBe('index.html');
  expect(pickReplaceEntry(['a.html', 'b.html'], 'b.html')).toBe('b.html');
  expect(pickReplaceEntry(['a.html', 'b.html'], 'gone.html')).toBeNull();
});
```

`tests/unit/storage.test.ts`에 추가:

```ts
test('commitReplace: 포인터·파일·텍스트 교체, 기록 정리, 식별 정보 유지', async () => {
  const id = 'aaaaaaaaaaaa';
  await S.commitNewBook(book(id, { title: '내가 바꾼 이름', textScale: 1.25, lastPath: 'gone.html' }), { bookId: id, paths: ['index.html', 'gone.html'], titles: {} },
    [{ bookId: id, path: 'gone.html', text: 'old' }]);
  await S.putProgress({ bookId: id, path: 'gone.html', maxPct: 50, lastScrollRatio: 0.5, read: false, updatedAt: 1 });
  await S.putProgress({ bookId: id, path: 'index.html', maxPct: 80, lastScrollRatio: 0.7, read: false, updatedAt: 1 });
  await S.recordIssue(id, 'x.png', 'missing');
  const old = await S.commitReplace(id, { cacheName: S.cacheNameFor(id, 2), entryPath: 'index.html', pagePaths: ['index.html', 'new.html'], fileCount: 2, totalBytes: 20, importedAt: 99 },
    { bookId: id, paths: ['index.html', 'new.html'], titles: {} }, [{ bookId: id, path: 'new.html', text: 'new' }],
    { dropProgress: ['gone.html'], dropBookmarkIds: [], lastPath: 'index.html' });
  expect(old).toBe(S.cacheNameFor(id, 1));
  expect(await S.getBook(id)).toMatchObject({ title: '내가 바꾼 이름', textScale: 1.25, sourceName: 's', cacheName: `book-${id}-v2`, lastPath: 'index.html', importedAt: 99 });
  expect([...(await S.getProgress(id)).keys()]).toEqual(['index.html']);
  expect((await S.getTexts(id)).map((t) => t.path)).toEqual(['new.html']);
  expect(await S.listIssues(id)).toEqual([]);
});
```

```ts
// tests/e2e/reimport.spec.ts
import { expect, test } from '@playwright/test';
import { backToLibrary, idbAll, idbGet, importFixture, openBook, openOverlay, scrollFrameTo, startImport } from './helpers';

async function seed(page: any) {
  await page.goto('/');
  const id = await importFixture(page, 'reimport/v1/report.zip');
  const f = await openBook(page, id);
  for (const p of ['keep.html', 'gone.html']) {
    await f.evaluate((p: string) => { location.href = p; }, p);
    await expect(page.getByTestId('reader')).toHaveAttribute('data-path', p);
    await scrollFrameTo(f, 0.5); await openOverlay(page); await page.getByTestId('btn-bookmark').click();
  }
  await backToLibrary(page);
  return id;
}

test('교체: 남은 경로의 진행률·북마크 유지, 사라진 경로 기록 삭제, 구 캐시 삭제', async ({ page }) => {
  const id = await seed(page);
  const again = await importFixture(page, 'reimport/v2/report.zip', { dup: 'replace' });
  expect(again).toBe(id);
  await expect(page.getByTestId('book-card')).toHaveCount(1);
  const book = await idbGet(page, 'books', id);
  expect(book).toMatchObject({ cacheName: `book-${id}-v2`, lastPath: 'index.html', title: '보고서' });        // lastPath(gone.html)가 사라져 entryPath로
  expect(book.pagePaths).toEqual(['index.html', 'keep.html', 'new.html']);
  expect((await idbAll(page, 'progress')).map((p: any) => p.path).sort()).toEqual(['index.html', 'keep.html']);
  expect((await idbAll(page, 'bookmarks')).map((b: any) => b.path)).toEqual(['keep.html']);
  expect((await idbAll(page, 'texts')).map((t: any) => t.path).sort()).toEqual(['index.html', 'keep.html', 'new.html']);
  expect(await page.evaluate(() => caches.keys().then((k) => k.filter((n) => n.startsWith('book-'))))).toEqual([`book-${id}-v2`]);
  const f = await openBook(page, id);
  await f.evaluate(() => { location.href = 'keep.html'; });
  await expect(f.locator('body')).toContainText('개정판 문장');                                              // SW가 새 캐시를 서빙
});

test('"새 문서로 추가"를 고르면 별도 문서가 된다', async ({ page }) => {
  const id = await seed(page);
  const other = await importFixture(page, 'reimport/v2/report.zip', { dup: 'add' });
  expect(other).not.toBe(id);
  await expect(page.getByTestId('book-card')).toHaveCount(2);
  await expect(page.locator(`[data-book-id="${other}"]`)).toHaveAttribute('data-title', '보고서 (2)');
  expect((await idbGet(page, 'books', id)).cacheName).toBe(`book-${id}-v1`);
});

test('교체 실패 시 기존 문서는 그대로다 (Review Focus 3)', async ({ page }) => {
  const id = await seed(page);
  await startImport(page, 'reimport/bad/report.zip');
  await page.getByTestId('dup-replace').click();
  await expect(page.getByTestId('import-error')).toHaveAttribute('data-code', 'crc-mismatch');
  await page.getByTestId('confirm-ok').click();
  expect((await idbGet(page, 'books', id)).cacheName).toBe(`book-${id}-v1`);
  expect((await idbAll(page, 'bookmarks')).length).toBe(2);
  expect(await page.evaluate(() => caches.keys().then((k) => k.filter((n) => n.startsWith('book-'))))).toEqual([`book-${id}-v1`]);
  const f = await openBook(page, id);
  await expect(f.locator('#h')).toBeVisible();
});

test('같은 sourceName 문서가 둘이면 최근 것을 교체 대상으로 보여준다 (Review Focus 5)', async ({ page }) => {
  await page.goto('/');
  const first = await importFixture(page, 'reimport/v1/report.zip');
  const second = await importFixture(page, 'reimport/v2/report.zip', { dup: 'add' });
  await startImport(page, 'reimport/v2/report.zip');
  await expect(page.getByText('"보고서 (2)" 문서가 이미 있습니다.')).toBeVisible();
  await page.getByTestId('dup-replace').click();
  await expect.poll(async () => (await idbGet(page, 'books', second)).cacheName).toBe(`book-${second}-v2`);
  expect((await idbGet(page, 'books', first)).cacheName).toBe(`book-${first}-v1`);
});
```

- [ ] **Step 2: 실패 확인** — `npm run fixtures; npx vitest run tests/unit/reimport.test.ts tests/unit/storage.test.ts; npx playwright test tests/e2e/reimport.spec.ts --project=chromium` → FAIL
- [ ] **Step 3: `reimport.ts`, `commitReplace` 구현**
- [ ] **Step 4: Worker의 replace 흐름, 중복 대화상자 구현**
- [ ] **Step 5: 통과 확인** — `npm test && npx playwright test tests/e2e/reimport.spec.ts tests/e2e/import.spec.ts tests/e2e/library.spec.ts` → 4개 프로젝트 PASS
- [ ] **Step 6: Commit** — `feat: re-import with atomic replace`

---

### Task 7: 문서명 수정

**Files:** Modify: `src/lib/title.ts`, `src/ui/library/{Library,BookCard}.svelte` / Test: `tests/unit/title.test.ts`(추가), `tests/e2e/rename.spec.ts`, 픽스처 `title-a.zip`·`title-b.zip`(둘 다 `<title>보고서</title>`, `scripts/make-fixtures.ts`에 추가)

**Interfaces:**
- Produces:
  - `title.ts`: `export const TITLE_MAX = 100; export function validateTitle(input: string): { ok: true; title: string } | { ok: false; reason: 'empty' | 'too-long' }`
  - 카드 메뉴에 `menu-rename`(`이름 바꾸기`) → 대화상자: `rename-input`(현재 이름이 채워져 있고 전체 선택), `rename-save`(`저장`), `confirm-cancel`. 검증 실패 문구: `이름을 입력해 주세요.` / `이름은 100자까지 쓸 수 있습니다.`(저장 버튼 비활성). 다른 문서와 같은 이름이면 `dup-name-warning`(`같은 이름의 문서가 이미 있습니다.`)을 보여주되 저장은 허용. 저장 → `updateBook(id, { title })`.

- [ ] **Step 1: 실패하는 테스트**

```ts
// tests/unit/title.test.ts에 추가
import { validateTitle } from '../../src/lib/title';
test('validateTitle', () => {
  expect(validateTitle('  새 이름  ')).toEqual({ ok: true, title: '새 이름' });
  expect(validateTitle('   ')).toEqual({ ok: false, reason: 'empty' });
  expect(validateTitle('가'.repeat(100))).toEqual({ ok: true, title: '가'.repeat(100) });
  expect(validateTitle('가'.repeat(101))).toEqual({ ok: false, reason: 'too-long' });
});
```

```ts
// tests/e2e/rename.spec.ts
import { expect, test } from '@playwright/test';
import { idbGet, importFixture } from './helpers';

async function rename(page: any, id: string, value: string) {
  await page.locator(`[data-book-id="${id}"] [data-testid=book-menu]`).click();
  await page.getByTestId('menu-rename').click();
  await page.getByTestId('rename-input').fill(value);
}

test('같은 제목 → 접미사 자동 부여 → 이름 바꾸기 → 교체 재가져오기 후에도 유지', async ({ page }) => {
  await page.goto('/');
  const a = await importFixture(page, 'title-a.zip'), b = await importFixture(page, 'title-b.zip');
  await expect(page.locator(`[data-book-id="${a}"]`)).toHaveAttribute('data-title', '보고서');
  await expect(page.locator(`[data-book-id="${b}"]`)).toHaveAttribute('data-title', '보고서 (2)');
  await expect(page.locator(`[data-book-id="${b}"]`)).toContainText('title-b');                 // 보조 정보로 구분
  await rename(page, b, '  2분기 최종본  ');
  await page.getByTestId('rename-save').click();
  await expect(page.locator(`[data-book-id="${b}"]`)).toHaveAttribute('data-title', '2분기 최종본');
  expect(await idbGet(page, 'books', b)).toMatchObject({ title: '2분기 최종본', sourceName: 'title-b' });
  expect(await importFixture(page, 'title-b.zip', { dup: 'replace' })).toBe(b);                 // sourceName으로 매칭
  expect((await idbGet(page, 'books', b)).title).toBe('2분기 최종본');
});

test('빈 이름·101자는 저장 불가, 중복 이름은 경고만', async ({ page }) => {
  await page.goto('/');
  const a = await importFixture(page, 'title-a.zip'), b = await importFixture(page, 'title-b.zip');
  await rename(page, b, '   ');
  await expect(page.getByTestId('rename-save')).toBeDisabled();
  await page.getByTestId('rename-input').fill('가'.repeat(101));
  await expect(page.getByTestId('rename-save')).toBeDisabled();
  await page.getByTestId('rename-input').fill('보고서');
  await expect(page.getByTestId('dup-name-warning')).toBeVisible();
  await page.getByTestId('rename-save').click();
  await expect(page.locator(`[data-book-id="${b}"]`)).toHaveAttribute('data-title', '보고서');
  await expect(page.locator(`[data-book-id="${a}"]`)).toHaveAttribute('data-title', '보고서');
});
```

- [ ] **Step 2: 실패 확인** — `npm run fixtures; npx vitest run tests/unit/title.test.ts; npx playwright test tests/e2e/rename.spec.ts --project=chromium` → FAIL
- [ ] **Step 3: 구현**
- [ ] **Step 4: 통과 확인** — 4개 프로젝트 PASS
- [ ] **Step 5: Commit** — `feat: rename documents`

---

### Task 8: 서재 검색·정렬

**Files:** Create: `src/lib/library-sort.ts` / Modify: `src/ui/library/Library.svelte` / Test: `tests/unit/library-sort.test.ts`, `tests/e2e/library-sort.spec.ts`

**Interfaces:**
- Consumes: `Book`, `bookProgress`, `naturalComparePaths`와 같은 Collator, `getSetting`/`setSetting('librarySort')`
- Produces:

```ts
export type SortKey = 'recent' | 'imported' | 'name' | 'progress';
export function sortBooks(books: Book[], key: SortKey, pctById: Map<string, number>): Book[];   // 새 배열. recent: (lastOpenedAt || importedAt) 내림차순, imported: importedAt 내림차순, name: 자연 정렬 오름차순, progress: pct 내림차순(동률은 name)
export function filterBooks(books: Book[], query: string): Book[];                              // title·sourceName, NFC + 대소문자 무시 부분 일치, 빈 검색어는 전체
```

  - UI: 제목 아래 정렬 칩 가로 행 `sort-chip`(`data-sort`, 순서·문구: `recent` `최근 읽음`, `name` `이름`, `progress` `진행률`, `imported` `가져온 날짜`; 선택된 칩 `aria-pressed="true"`, 반경 `--r-chip`). 하단 바에 `library-search`(placeholder `서재 검색`). 필터 결과가 없으면 `일치하는 문서가 없습니다`.

- [ ] **Step 1: 실패하는 테스트**

```ts
// tests/unit/library-sort.test.ts
import { expect, test } from 'vitest';
import { filterBooks, sortBooks } from '../../src/lib/library-sort';
const b = (id: string, title: string, importedAt: number, lastOpenedAt = 0, sourceName = id) => ({ id, title, sourceName, importedAt, lastOpenedAt } as any);
const books = [b('a', '문서 10', 1, 50), b('b', '문서 2', 3, 0), b('c', '가나 Alpha', 2, 40)];   // 스크립트 간 정렬 순서에 기대지 않도록 모두 한글로 시작
const ids = (x: any[]) => x.map((v) => v.id).join('');
test('정렬', () => {
  const pct = new Map([['a', 10], ['b', 90], ['c', 90]]);
  expect(ids(sortBooks(books, 'recent', pct))).toBe('acb');           // 50, 40, (미열람 → importedAt 3)
  expect(ids(sortBooks(books, 'imported', pct))).toBe('bca');
  expect(ids(sortBooks(books, 'name', pct))).toBe('cba');             // 가나 Alpha, 문서 2, 문서 10
  expect(ids(sortBooks(books, 'progress', pct))).toBe('cba');         // 90(가나 Alpha), 90(문서 2), 10
  expect(ids(books)).toBe('abc');                                     // 원본 불변
});
test('필터', () => {
  expect(ids(filterBooks(books, '문서'))).toBe('ab');
  expect(ids(filterBooks(books, 'ALPH'))).toBe('c');
  expect(ids(filterBooks([b('x', '제목', 1, 0, 'q3-report')], 'Q3'))).toBe('x');
  expect(ids(filterBooks(books, '  '))).toBe('abc');
  expect(ids(filterBooks(books, '문서'.normalize('NFD')))).toBe('ab');
});
```

```ts
// tests/e2e/library-sort.spec.ts
import { expect, test } from '@playwright/test';
import { backToLibrary, importFixture, openBook, scrollFrameTo } from './helpers';
const order = (page: any) => page.getByTestId('book-card').evaluateAll((els: Element[]) => els.map((e) => e.getAttribute('data-title')));

test('서재 검색·정렬, 마지막 선택 저장', async ({ page }) => {
  await page.goto('/');
  const single = await importFixture(page, '10-single.html');            // 제목 10-single
  await importFixture(page, '01-multipage.zip');                         // 여러 쪽 문서
  await importFixture(page, '06-euckr.zip');                             // 한글 문서
  const f = await openBook(page, single); await scrollFrameTo(f, 1); await backToLibrary(page);

  await expect(page.locator('[data-testid=sort-chip][data-sort="recent"]')).toHaveAttribute('aria-pressed', 'true');
  expect(await page.getByTestId('sort-chip').evaluateAll((e: Element[]) => e.map((x) => x.textContent!.trim()))).toEqual(['최근 읽음', '이름', '진행률', '가져온 날짜']);
  expect((await order(page))[0]).toBe('10-single');
  await page.locator('[data-testid=sort-chip][data-sort="name"]').click();
  expect(await order(page)).toEqual(['10-single', '여러 쪽 문서', '한글 문서']);
  await page.locator('[data-testid=sort-chip][data-sort="imported"]').click();
  expect(await order(page)).toEqual(['한글 문서', '여러 쪽 문서', '10-single']);
  await page.locator('[data-testid=sort-chip][data-sort="progress"]').click();
  expect((await order(page))[0]).toBe('10-single');
  await page.reload();
  await expect(page.locator('[data-testid=sort-chip][data-sort="progress"]')).toHaveAttribute('aria-pressed', 'true');

  await page.getByTestId('library-search').fill('문서');
  expect((await order(page)).sort()).toEqual(['여러 쪽 문서', '한글 문서']);
  await page.getByTestId('library-search').fill('EUCKR');                // sourceName 일치
  expect(await order(page)).toEqual(['한글 문서']);
  await page.getByTestId('library-search').fill('없는이름');
  await expect(page.getByText('일치하는 문서가 없습니다')).toBeVisible();
});
```

- [ ] **Step 2: 실패 확인** — `npx vitest run tests/unit/library-sort.test.ts; npx playwright test tests/e2e/library-sort.spec.ts --project=chromium` → FAIL
- [ ] **Step 3: 구현**
- [ ] **Step 4: 통과 확인** — 4개 프로젝트 PASS
- [ ] **Step 5: Commit** — `feat: library search and sort`

---

### Task 9: P3 종료 검증

- [ ] **Step 1: 전체 회귀·예산** — Run: `npm test && npm run check && npm run build && npm run size && npm run e2e` / Expected: 전부 PASS, 예산 이내. 초기 JS가 넘으면 `SearchPanel`·`BookmarksTab`·`Settings`를 동적 import로 분리한다.
- [ ] **Step 2: 스펙 §11.2 편의 시나리오 대조** — 아래 표의 스펙 파일이 4개 프로젝트에서 PASS인지 보고한다.

| 시나리오 | 스펙 파일 |
|---|---|
| 검색 → 다른 페이지 결과 → 스크롤·강조 | `search.spec.ts`, `find.spec.ts` |
| 북마크 추가 → 이동 → 복귀 | `bookmarks.spec.ts` |
| 재가져오기(교체) | `reimport.spec.ts` |
| 서재 검색·정렬 | `library-sort.spec.ts` |
| 접미사 → 이름 바꾸기 → 교체 후 유지 | `rename.spec.ts` |

- [ ] **Step 3: Commit** — 변경이 있었으면 `chore: P3 exit fixes`
