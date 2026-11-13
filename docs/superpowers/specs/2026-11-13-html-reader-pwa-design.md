# HTML Reader PWA — 설계 스펙

- 작성일: 2026-11-13
- 개정: v4 — 독립 리뷰(Fable) 반영, 브라우저 기반 검증, 디자인 확정(§13)
- 상태: 사용자 검토 대기

## 1. 목적과 범위

### 목적
ZIP으로 묶인 HTML 문서 묶음(사내문서, 리포트, 오프라인 웹 교재, 직접 만든 HTML 산출물 등)을
PC(macOS·Windows)와 모바일(iOS·Android)에서 **일반 브라우저와 동일하게 동작**시키며 읽는 PWA.
단일 HTML이 아니라 디렉터리 단위로 페이지 이동, JS·CSS·JSON·폰트·이미지·미디어 등
상대경로 리소스가 모두 동작해야 한다.

### 성공 기준
1. ZIP 안의 여러 HTML 페이지 사이 링크 이동, `fetch()`로 JSON 로드, ES module import,
   CSS `url()`/`@font-face`가 원본 그대로 동작한다. 루트 절대경로(`/css/a.css`)와 EUC-KR 문서도 동작한다.
2. 페이지별 읽기 진행률과 이어 읽기가 동작한다.
3. 긴 문서와 여러 파일 사이에서 파일 목록·빠른 스크롤·검색으로 원하는 위치를 쉽게 찾는다.
4. 평상시 리더 UI는 문서 공간을 차지하지 않는다.
5. iOS 26에서 상단 상태바 영역에 문서 내용이 비쳐 blur되거나 겹치지 않는다. 상단 영역은 앱 배경색으로 통일된다(§6.6).
6. 최초 1회 접속 후 완전 오프라인으로 동작한다.
7. 문서 전체 텍스트 검색, 북마크, 글자 크기 조절, 수정본 재가져오기, 문서명 수정, 서재 검색·정렬, 바로 열기 연동이 동작한다(§7).

### 범위 밖 (명시적 제외)
- 기기 간 동기화(서버 필요) — 문서와 진행률은 각 기기에만 저장된다.
- 진행률·북마크 백업 내보내기/가져오기.
- 폴더 직접 선택, URL로 불러오기 — 가져오기는 ZIP과 단일 HTML 파일만 지원.
- 강제 다크모드, 하이라이트(임의 HTML에서 품질이 불안정함).
- 설치 폰트를 이름으로만 참조하는 문서의 감지·대체.
- 가져오기 시점의 정적 참조 검사 — 누락 리소스는 읽는 중 실제 요청 결과로만 보고한다(§6.2).
- ZIP 파일명 인코딩 중 UTF-8·CP949 외(Shift-JIS 등), 암호화 ZIP, Deflate64 압축.
- 해시 라우팅 SPA 문서의 화면 단위 진행률 — 이런 문서는 HTML 파일 1개 = 페이지 1개로만 추적한다.
- 네이티브 래퍼(Capacitor/Tauri), 앱스토어 배포.
- 문서 간 완전한 보안 격리(§9.4 참조).

## 2. 플랫폼·배포

- 정적 호스팅(Vercel 등)에 배포, 서버 코드 없음. HTTPS 필수(Service Worker 조건).
- 문서는 서버로 업로드되지 않고 기기 내부에만 저장된다.
- 지원 대상: Chrome/Edge(Windows·macOS), Safari(macOS), iOS 26 Safari 및 홈 화면 앱, Android Chrome.
- 매니페스트: `display: standalone`, `start_url: /`, `scope: /`, `theme_color`, `background_color`.
  `mobile-web-app-capable` 메타를 둔다. `apple-mobile-web-app-capable`은 deprecated이므로 보조로만 병기한다.

### 2.1 iOS 저장소
- iOS에서 **Safari 탭과 홈 화면 앱은 저장소가 분리**되어 있다. Safari에서 가져온 문서는 홈 화면 앱에서 보이지 않는다.
- Safari 탭 저장소는 장기간 미사용 시 삭제될 수 있다. 홈 화면 앱은 이 정책에서 제외된다.
- 따라서 iOS Safari 탭(비 standalone)에서 가져오기를 누르면 **먼저 홈 화면 추가 안내**를 보여준다.
  "탭에서 계속"을 고르면 "임시 보관 — 홈 화면 앱에서는 보이지 않으며 지워질 수 있음" 경고를 띄우고 진행한다.
- 모든 플랫폼에서 첫 가져오기 시 `navigator.storage.persist()`를 요청하고, `persisted()` 결과를 설정 화면에 표시한다.

### 2.2 호스팅 폴백
SW가 아직 제어하지 않는 상태에서 `/book/*` 요청이 호스트로 나가면 앱 셸이 iframe 안에 다시 로드되는 문제가 생긴다.
- 호스팅 설정(`vercel.json`)에서 `/book/*`를 `/__app/no-sw.html`로 rewrite한다.
  이 페이지는 최상위 창이면 `/`로 이동하고, iframe 안이면 부모에 `no-sw` 메시지를 보내는 최소 페이지다.
- 그 밖의 경로는 `/`(앱)로 rewrite한다.

## 3. 기술 스택

| 영역 | 선택 | 이유 |
|---|---|---|
| 빌드 | Vite + TypeScript | 표준, 빠른 빌드 |
| UI | Svelte 5 | 런타임이 작아 초기 로딩에 유리 |
| PWA | `vite-plugin-pwa` (injectManifest) | 앱 셸 프리캐시 + 커스텀 SW 로직 |
| ZIP | 자체 중앙 디렉터리 파서 + `fflate`의 `Inflate`(동기 스트림) | 임의 접근으로 정확한 용량·진행률, 엔트리별 메모리 상한 |
| 단위 테스트 | Vitest | |
| E2E | Playwright (Chromium, WebKit, 모바일 에뮬레이션) | 브라우저 기반 자동 테스트로 검증. iOS 고유 동작은 범위 밖(§11.3) |

앱 자체 정적 자산(JS·CSS·아이콘·매니페스트)은 문서의 루트 절대경로와 겹치지 않도록 **모두 `/__app/` 아래**에 둔다.
reader-agent는 `/__reader/agent.js`에 둔다. 앱 HTML은 `/`(=`/index.html`)만 쓴다.

## 4. 아키텍처

```
┌─ 리더 셸 (앱 UI, 최상위 문서 /) ────────────────────┐
│ 서재 화면 / 리더 화면 / 오버레이 / 패널            │
│        ▲ postMessage (protocolVersion 포함)          │
│  ┌─ iframe: /book/<id>/<path> ──────────────────┐  │
│  │  원본 HTML + SW가 주입한 /__reader/agent.js    │  │
│  └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
        │ 모든 네트워크 요청
┌─ Service Worker ────────────────────────────────────┐
│ 요청 주체 판별 → book 매핑/리다이렉트 → 파일 응답    │
│ 네비게이션 HTML에만 agent 주입(바이트 단위)          │
│ 404·외부 요청 기록, Range 처리, 앱 셸 프리캐시        │
└─────────────────────────────────────────────────────┘
┌─ Import Worker ─────────┐   ┌─ 저장소 ─────────────────────────┐
│ 중앙 디렉터리 읽기 →     │ → │ Cache Storage: 파일 본문          │
│ 엔트리별 slice+Inflate   │   │ IndexedDB: 메타·진행률·북마크 등  │
└─────────────────────────┘   └──────────────────────────────────┘
```

### 4.1 컴포넌트

각 단위는 하나의 책임과 명확한 인터페이스를 가진다.

| 단위 | 책임 | 의존 |
|---|---|---|
| `zip` | EOCD·ZIP64·중앙 디렉터리 파싱, 엔트리 메타 반환, 엔트리 바이트 스트림 제공(STORED는 slice, DEFLATE는 Inflate) | fflate |
| `filename` | 엔트리 파일명 디코딩(Unicode extra field → UTF-8 플래그 → UTF-8 fatal → CP949), NFC 정규화, 정크 판정 | 없음(순수 함수) |
| `importer` (Worker) | 용량 사전 검사, 엔트리 저장, 시작 페이지·문서 페이지 판정, 텍스트 추출 호출, 진행률 보고, 원자적 커밋 | `zip`, `filename`, `html-meta`, `text-extract`, `storage` |
| `html-meta` | HTML 바이트에서 인코딩 판정, `<title>` 추출, 완전한 문서인지(조각인지) 판정 | 없음(순수 함수) |
| `text-extract` | HTML → 검색용 평문(Worker에서 동작, DOM 불필요) | `html-meta` |
| `storage` | Cache Storage·IndexedDB 접근 API, 스키마 마이그레이션, 고아 캐시 정리 | 없음 |
| `path` | 요청 URL → 문서 내 경로 정규화, 탈출 판정, 디렉터리 해석 | 없음(순수 함수) |
| `mime` | 확장자 → Content-Type | 없음(순수 함수) |
| `range` | Range 헤더 파싱 → 206/416 응답 생성 | 없음 |
| `inject` | HTML 바이트에 agent 스크립트 태그 삽입 | 없음(순수 함수) |
| `sw` | 요청 주체 판별, 라우팅, 리다이렉트, 파일 응답, 리소스 이슈 기록, 업데이트 수명주기 | `path`, `mime`, `range`, `inject`, `storage` |
| `reader-agent` | iframe 내부: 가드 설치, 스크롤 컨테이너 탐지, 진행률, 탭 판별, 검색 위치 찾기, 키 전달, 링크 정규화 | 없음(셸과 postMessage) |
| `protocol` | 셸 ↔ agent 메시지 타입 정의와 검증(공유 모듈) | 없음 |
| `progress` | 페이지별/문서별 진행률 계산·디바운스 저장 | `storage` |
| `search` | 문서 전체 검색, 결과 스니펫 생성 | `storage` |
| `launch` | `launchQueue`·share target 수신 → `importer` 호출 (P4) | `importer` |
| UI(Svelte) | 서재, 리더, 오버레이, 패널, 안내·설정 화면 | 위 단위들 |

### 4.2 데이터 모델

**Cache Storage** — 캐시 이름은 `books.cacheName`(예: `book-<id>-v<n>`), 키 `/book/<id>/<저장 경로>`, 값 `Response(blob, {Content-Type, Content-Length})`.
저장 경로는 NFC 정규화된 ZIP 내 경로(문서 루트 기준)다. 미디어를 포함한 모든 파일을 같은 방식(파일 1개 = Response 1개)으로 저장한다.

**IndexedDB `html-reader`** (스키마 버전을 두고 `onupgradeneeded`에서 단계별로 마이그레이션한다)
- `books`: `{ id, title, sourceName, cacheName, entryPath, pagePaths[], fileCount, totalBytes, importedAt, lastOpenedAt, lastPath, textScale }`
  - `title`: 화면에 보이는 문서명. 사용자가 수정할 수 있다(§7.7).
  - `sourceName`: 가져온 파일명(확장자 제외). 재가져오기 매칭에만 쓰며 이름을 바꿔도 변하지 않는다.
  - `cacheName`: 현재 유효한 캐시를 가리키는 포인터. 교체 시 이 값만 원자적으로 바꾼다.
  - `pagePaths`: **완전한 HTML 문서**인 파일 목록(조각 HTML 제외, §4.3). 진행률 분모와 페이지 목록·이전/다음의 기준이다.
  - `textScale`: 문서별 글자 크기 배율(기본 1.0, §7.4).
- `bookFiles`: 키 `bookId`, `{ paths[] }` — 저장된 전체 경로. SW의 대소문자 무시 조회·디렉터리 판정에 쓴다.
- `progress`: 키 `[bookId, path]`, `{ maxPct (0–100), lastScrollRatio (0–1), read (boolean), updatedAt }`
  - 위치는 px가 아니라 **비율**로 저장한다. 글자 크기나 화면 폭이 바뀌어도 대략 같은 위치로 복귀하기 위해서다.
- `bookmarks`: `{ id, bookId, path, scrollRatio, label, createdAt }`
- `texts`: 키 `[bookId, path]`, `{ text }` — 검색용 평문
- `issues`: 키 `[bookId, path]`, `{ kind: 'missing' | 'outside-root' | 'external', count, lastSeen }` — SW가 기록. 레코드 단위로 쓰므로 동시 기록에도 유실이 없다.
- `settings`: 키-값 — 서재 정렬, 진행선 표시 여부, `activeBookId`(SW 폴백용, §5.1) 등

### 4.3 가져오기 흐름

1. 사용자가 ZIP 또는 단일 `.html/.htm` 파일을 선택한다. PC에서는 드래그앤드롭도 가능하다. P4에서는 파일 연결·공유로도 들어온다(§7.5).
   iOS Safari 탭이면 먼저 §2.1의 안내를 거친다.
   `sourceName`이 같은 문서가 이미 있으면 "기존 문서 교체 / 새 문서로 추가"를 묻는다(§7.2).
2. 단일 HTML은 "파일 1개짜리 묶음"으로 취급하며 이후 흐름은 동일하다.
3. **중앙 디렉터리 읽기**: `file.slice()`로 EOCD(필요시 ZIP64 EOCD)와 중앙 디렉터리를 읽어 엔트리 목록을 만든다.
   - 파일명을 디코딩하고 NFC 정규화한다(`filename`). 백슬래시는 `/`로 바꾼다.
   - 정크 엔트리(`__MACOSX/`, `.DS_Store`, `Thumbs.db`, `desktop.ini`, `._*`)와 디렉터리 엔트리는 제외한다.
   - 단일 최상위 폴더만 남으면 그 폴더를 문서 루트로 삼는다.
   - 암호화 엔트리나 지원하지 않는 압축 방식(Deflate64 등)이 있으면 가져오기를 중단하고 원인을 안내한다.
4. **사전 검사**: 압축 해제 후 총 크기를 정확히 안다. 다음을 확인한다.
   - `storage.estimate()`의 여유 공간이 (해제 총량 × 1.2)보다 적으면 중단한다.
   - zip bomb 방지: 해제 총량이 4GB를 넘거나 엔트리 압축률이 1000:1을 넘으면 중단한다.
   - HTML이 하나도 없으면 거부한다.
5. **엔트리 저장**: 엔트리마다 `slice(offset, offset+compSize).stream()`을 STORED면 그대로, DEFLATE면 `Inflate`에 통과시켜 Blob으로 모은 뒤
   `cache.put`을 **await**하고 다음 엔트리로 넘어간다(백프레셔). 진행률은 처리한 바이트 / 해제 총량으로 보고한다.
   CRC32를 검증해 불일치하면 중단한다.
6. **HTML 분석**(`html-meta`): HTML 파일마다 앞부분 바이트로 인코딩을 판정한다(BOM → `<meta charset>`/`http-equiv` → UTF-8 fatal → EUC-KR).
   - 처음 2KB 안에 doctype, `<html`, `<head`, `<body` 중 하나라도 있으면 **완전한 문서**로 보고 `pagePaths`에 넣는다. 아니면 조각으로 본다.
   - `text-extract`가 평문을 만들어 `texts`에 저장한다.
7. **시작 페이지**: 루트 `index.html`(또는 `index.htm`) → `pagePaths`가 1개면 그것 → 아니면 목록에서 사용자가 선택.
8. **기본 문서명** 결정과 중복 접미사 부여(§7.7).
9. **원자적 커밋**: 모든 파일을 `book-<id>-v<n>` 캐시에 쓴 뒤 **하나의 IndexedDB 트랜잭션**으로 `books`·`bookFiles`·`texts`를 기록한다.
   이 트랜잭션이 끝나야 문서가 서재에 나타난다.
10. 실패하면 해당 캐시를 삭제한다. 탭 종료 등으로 정리 코드가 실행되지 못해도, **앱 시작 시** `books.cacheName`이 가리키지 않는 `book-*` 캐시와
    고아 `texts`·`bookFiles`를 정리한다.

### 4.4 읽기 흐름

1. **SW 준비 확인**: 리더에 들어가기 전에 `navigator.serviceWorker.ready`를 기다리고 `controller`가 있는지 확인한다(SW는 `clients.claim()` 사용).
   없으면 한 번 새로고침한다. 그래도 없거나 SW를 지원하지 않는 환경(일부 사생활 보호 모드 등)이면 "이 환경에서는 문서를 열 수 없음" 안내를 띄운다.
2. 셸이 `settings.activeBookId`를 기록하고 SW에도 메시지로 알린다. iframe에 `/book/<id>/<lastPath 또는 entryPath>`를 로드한다.
3. SW가 파일로 응답하고, 네비게이션 HTML이면 agent를 주입한다(§5.4).
4. **핸드셰이크**(§6.7): agent `ready` → 셸 `init{textScale, restore?}` → agent가 적용 후 보고 시작.
5. agent는 스크롤 시 `scroll{pct, ratio}`, 탭 시 `tap`, 키 입력 시 `key{...}`를 보낸다.
6. iframe 안에서 페이지를 이동하면 새 페이지의 `ready`가 온다. 셸은 그때 `lastPath`를 갱신하고 파일 패널의 현재 파일 표시를 갱신한다.
7. 셸이 진행률을 갱신한다(메모리 갱신 + 1초 디바운스 저장, `pagehide`·`visibilitychange(hidden)` 시 즉시 저장).

## 5. Service Worker 라우팅

### 5.1 요청 주체 판별
요청마다 먼저 "어느 문서(book)의 맥락인가"를 정한다.
- **서브리소스 요청**: `clients.get(event.clientId)`의 URL이 `/book/<id>/` 아래면 그 `<id>`다.
- **iframe/frame 네비게이션**(`request.mode === 'navigate'`, `destination`이 `iframe`·`frame`): 대상 URL이 `/book/<id>/` 아래면 그 `<id>`다.
  아니면 `request.referrer`가 `/book/<id>/` 아래인지 본다.
- **폴백**: 위로 판별되지 않으면(`no-referrer` 문서, Worker·`blob:`·`about:srcdoc` 클라이언트 등) `settings.activeBookId`를 쓴다.
  SW는 유휴 시 종료되므로 이 값은 메모리가 아니라 IndexedDB에서 읽는다(읽은 값은 SW 생존 동안만 캐시한다).

### 5.2 라우팅 순서
1. `/__reader/*`: 항상 프리캐시에서 응답한다.
2. **최상위 창 네비게이션**(`destination === 'document'`)이 `/book/<id>/<path>`를 향하면(새 탭에서 열기, `window.open`, 프레임 탈출 등)
   `302 → /?open=<id>&path=<path>`로 보낸다. 리더가 그 문서를 다시 감싸서 연다.
3. **book 맥락의 같은 출처 요청 중 `/book/` 밖을 향하는 것**(루트 절대경로: `/`, `/css/a.css`, `/assets/x.js`, `/favicon.ico` 등):
   - 네비게이션이면 `302 → /book/<id>/<path>`로 리다이렉트한다. 그래야 새 페이지의 URL이 `/book/<id>/` 아래에 남아 상대경로와 이후 판별이 유지된다.
   - 서브리소스면 리다이렉트 없이 `/book/<id>/<path>`의 내용으로 바로 응답한다.
   - 앱 경로(`/`, `/__app/*`)와 이름이 겹쳐도 **book 맥락이면 항상 book 쪽으로 매핑**한다. 예외는 `/__reader/*`뿐이다.
4. `/book/<id>/<path>`: §5.3 규칙으로 조회해 응답한다.
5. **book 맥락의 다른 출처 요청**: 그대로 네트워크로 통과시키고 `issues`에 `external`로 기록한다(오프라인이면 실패).
6. 그 외(앱 자신의 요청): `/`, `/index.html`, `/__app/*`는 프리캐시에서 응답한다. 다른 최상위 네비게이션은 앱 `/`로 응답한다.

### 5.3 경로 정규화와 조회
1. 쿼리스트링과 해시를 제거한다(`a.css?v=3` → `a.css`).
2. 퍼센트 디코딩, 백슬래시 → `/`, NFC 정규화를 한다.
3. `.`·`..`를 해석한다. 문서 루트 밖으로 나가면 404를 응답하고 `outside-root`로 기록한다.
4. 정확히 일치하는 키로 조회한다. 없으면 `bookFiles.paths`에서 **대소문자 무시**로 찾는다(Windows에서 만든 `Logo.PNG` 참조 대응).
5. 디렉터리 처리: 경로가 `/`로 끝나면 `index.html` → `index.htm` 순으로 찾는다.
   슬래시 없이 디렉터리를 가리키면(`sub`) `301 → sub/`로 보내 상대경로 기준을 맞춘다.
6. 없으면 404를 응답한다. 네비게이션이면 "이 페이지는 묶음에 없습니다" 안내 HTML을 보낸다.
   무시 목록(`favicon.ico`, `*.map`, `apple-touch-icon*`, `robots.txt`)이 아니면 `missing`으로 기록한다.

### 5.4 HTML 주입
- **네비게이션 요청**(`mode === 'navigate'`)이고 Content-Type이 `text/html` 또는 `application/xhtml+xml`일 때만 주입한다.
  `fetch()`/XHR로 읽는 HTML 조각에는 절대 주입하지 않는다.
- 바이트를 디코딩·재인코딩하지 않고 **바이트 단위로 삽입**한다. 삽입 위치는 처음 4KB 안에서 다음 순서로 찾는다.
  1. `<head ...>` 여는 태그 직후
  2. `<html ...>` 여는 태그 직후
  3. doctype 직후
  4. 위가 모두 없으면 맨 앞(단, BOM 뒤)

  주석(`<!-- -->`) 안의 일치는 건너뛴다. doctype 앞에는 절대 넣지 않는다(quirks mode 유발).
- 삽입 내용은 ASCII로 된 `<script src="/__reader/agent.js" data-book="<id>" data-scale="<textScale>"></script>`다.
  XHTML에서도 유효한 형태다. UTF-16 문서(BOM으로 판별)는 UTF-16으로 인코딩해 넣는다.
  `data-scale`은 첫 페인트 전에 글자 크기를 적용해 깜빡임을 없애기 위한 것이다.
- 삽입으로 `<meta charset>`이 문서의 처음 1024바이트 밖으로 밀리면 브라우저의 인코딩 프리스캔이 실패한다. 이 경우 `meta charset` 태그 **뒤**에 넣는다.
- 문서의 CSP(`<meta http-equiv="Content-Security-Policy">`)가 agent를 차단할 수 있다. 이 경우를 위해 agent 없는 모드를 둔다(§6.7).

### 5.5 Range 요청
- 동영상·오디오에서 Safari는 Range 응답이 필수다. 다음을 지원한다.
  - `bytes=a-b`, `bytes=a-`(열린 범위), `bytes=-n`(마지막 n바이트)
  - 응답: `206`, `Content-Range: bytes a-b/total`, `Content-Length`, `Accept-Ranges: bytes`, 정확한 Content-Type
  - 범위를 벗어나면 `416`과 `Content-Range: bytes */total`
  - 다중 범위는 첫 범위만 응답한다.
- Range가 없는 미디어 요청에도 `Accept-Ranges: bytes`를 붙인다.
- 영상 재생은 "재생되면 된다" 수준으로 지원한다. 대용량 영상 최적화는 하지 않으며, 수백 MB 이상의 영상은 iOS에서 느리거나 재생이 실패할 수 있다(수용한 제약).

### 5.6 MIME
`mime` 단위가 결정한다. `html/htm`, `xhtml`, `css`, `js/mjs`(`text/javascript`), `json`, `svg`, `wasm`, `woff2/woff/ttf/otf`,
이미지·미디어 형식을 반드시 정확히 지정한다. 모르는 확장자는 `application/octet-stream`.

## 6. 리더 UI

### 6.1 원칙
평상시에는 문서만 보인다. 리더 UI는 문서 위에 겹쳐 뜨는 오버레이이며 레이아웃을 밀지 않는다.

### 6.2 상태
- **평상시**: 문서 전체 화면 + 화면 하단 가장자리의 2px 진행선(설정에서 끄기 가능, 기본값 켬) + 책갈피 탭(§6.3).
- **첫 실행 안내**: 문서를 처음 열 때 한 번만 하단에 "빈 곳을 한 번 탭하면 메뉴가 열려요 — 링크·버튼은 그대로 동작해요. 오른쪽 가장자리 탭으로도 열 수 있어요." 토스트를 띄운다. "확인"을 누르거나 오버레이를 한 번 열면 다시 띄우지 않는다(`settings`에 기록).
- **원터치 시**: 다음 요소들을 표시한다.
  - 상단 바: ◀ 서재, 문서명, `7 / 12쪽 · 62%`, 🔍, 🔖, ☰
  - 진행 바: 상단 바 아래 경계선 위치에 현재 페이지의 %
  - 빠른 스크롤 핸들: 우측 가장자리. 드래그하면 `파일명 · NN%`를 말풍선으로 표시
  - 하단 바: ⤒ 맨 위, ◀ 이전 페이지, `가-` `NN%` `가+`, 다음 페이지 ▶, ⤓ 맨 아래

  다시 탭하거나 3초 동안 조작이 없으면 숨긴다(드래그·패널 사용 중에는 숨기지 않음).
- **☰ 패널**: `파일 / 북마크` 두 탭으로 구성한다. 모바일은 바텀시트, PC는 우측 사이드 패널로 표시한다.
  - 파일: ZIP의 폴더 구조대로 `pagePaths`의 HTML 파일만 트리로 보여준다. 폴더 행은 `chapters/`처럼 표시하고 파일은 들여쓴다.
    파일 행은 파일명을 주로, 그 페이지의 `<title>`(없으면 생략)을 보조로 표시하고, 오른쪽에 상태(`✓ 읽음 / 62% / 안 읽음`)를 둔다.
    현재 파일을 강조하며, 누르면 그 파일로 이동한다. 머리에 `q3-report.zip · HTML 7개 중 3개 읽음`, `전체 62%`를 표시한다.
  - 북마크: §7.3
  - 헤딩(`h1`~`h6`) 기반 목차는 만들지 않는다. 실제 문서에서 제목 태그가 일관되지 않아 품질이 들쭉날쭉하기 때문이다.
- **🔍 검색 패널**: §7.1. 모바일은 전체 화면, PC는 상단 바의 검색 입력에서 결과를 드롭다운으로 표시한다.
- 이전/다음 페이지 순서는 파일 트리 표시 순서(폴더 우선이 아닌 경로 자연 정렬)를 따른다.
- **PC 레이아웃**: 상단 바 하나에 ◀ 서재, 문서명·쪽 정보, 이전/다음, 확대, 검색 입력(`/` 힌트), 북마크를 둔다. 우측 사이드 패널(파일/북마크)은
  - 왼쪽 경계를 끌어 폭을 240–480px로 조절하고 `settings`에 저장한다.
  - 패널 머리의 버튼이나 `T`로 접고 펼친다. 상태를 저장한다.
  - 창 폭이 1024px 미만이면 접힌 상태로 시작한다.
  - 패널 하단에 단축키 안내를 한 줄로 둔다.
- **PC 단축키**: `Space`(오버레이 토글, 모바일 레이아웃일 때), `T`(패널 접기/펼치기), `/`(검색), `B`(북마크 추가), `[`/`]`(이전/다음 페이지), `Home`/`End`, `+`/`-`(확대, 수정자 키 없음).
  - 브라우저 확대 `Ctrl/⌘ +/-`는 **가로채지 않는다**(접근성 기능 보존).
  - 문서 안의 입력 요소에 포커스가 있거나 문서가 해당 키 이벤트를 이미 처리(`defaultPrevented`)했으면 단축키를 무시한다.
  - iframe에 포커스가 있을 때는 agent가 키 이벤트를 셸로 전달한다(§6.7).
- **리소스 이슈 표시**(읽는 중 실제 요청 결과 기반):
  - `missing`·`outside-root`가 있으면 상단 바와 서재 카드에 `⚠ 누락 N` 배지를 표시한다. 누르면 경로와 원인을 보여준다.
    원인 문구: "묶음에 없음" / "묶음 바깥 경로 참조 — 상위 폴더째로 압축하세요".
  - `external`이 있으면 서재 카드에 "온라인 필요" 아이콘을 표시한다.

### 6.3 탭 판별 (reader-agent)
문서 자체의 상호작용을 방해하지 않는 것이 최우선이다.
- 다음 조건을 **모두** 만족할 때만 `tap`으로 판정한다.
  - 포인터 이동 10px 이하, 300ms 이하
  - 선택된 텍스트 없음
  - 대상과 조상 중에 `a, button, input, select, textarea, label, summary, video, audio, iframe, [role=button|link|tab|menuitem|checkbox], [contenteditable], [onclick], [tabindex]` 없음
  - 대상의 computed `cursor`가 `pointer` 아님
  - 이벤트가 document까지 전파된 뒤에도 `defaultPrevented`가 false
- 판별이 실패하는 문서나 agent 없는 모드를 위해 **우회 수단을 항상 둔다**. 우회 수단은 셸이 소유하므로 agent 상태와 무관하게 동작한다.
  - **책갈피 탭**: 우측 가장자리, 화면 상단에서 약 150px 아래(스크롤 핸들이 다니는 가운데 구간을 피함). 14×26px 리본 모양(왼쪽 끝 V자 노치),
    액센트색 35% 투명도. 눈에 보이는 크기는 작지만 터치 영역은 투명하게 44px 이상 확보한다. 누르면 오버레이를 연다.
  - PC 단축키

### 6.4 스크롤 컨테이너 탐지
`document.scrollingElement`가 실제로 스크롤 가능하면 그것을 쓴다. 아니면 `overflow-y: auto|scroll`이면서
`scrollHeight > clientHeight`인 요소 중 화면 면적이 가장 큰 것을 고른다.
DOM 변경(`ResizeObserver` + 지연 재탐지)에 대응하며, 진행률·핸들·위치 복원은 모두 이 컨테이너를 기준으로 한다.

### 6.5 진행률 규칙
- 페이지 진행률은 `(scrollTop + clientHeight) / scrollHeight`의 **최댓값**으로 한다.
- 스크롤이 없는 페이지는 `load` 이후 레이아웃이 안정된 뒤(§6.7의 안정화 조건)에도 스크롤이 없으면 100%로 본다. JS로 늦게 그려지는 문서의 오판을 막기 위해서다.
- 98% 이상에 도달하면 `read = true`.
- 문서 진행률은 `pagePaths` 페이지 진행률의 평균이다(방문하지 않은 페이지는 0). 조각 HTML은 분모에서 빠진다.
- 서재 카드에는 문서 진행률, 읽은 페이지 수/전체, 마지막으로 연 시각을 표시한다.

### 6.6 iOS 상단 영역 (Liquid Glass 대응)
**배경**(커뮤니티 확인 동작이며 Apple 공식 문서는 없음, 버전마다 다를 수 있음):
- iOS 26 Safari는 상단·하단 바 색을 정할 때 `theme-color`를 사실상 쓰지 않는다. 기본적으로 `body`(또는 `html`) 배경색을 쓰고,
  화면 가장자리에 닿은 fixed 요소가 있으면 그 배경색이 우선한다. 그런 색이 없으면 바 아래로 콘텐츠가 비쳐 blur된다.
- `apple-mobile-web-app-status-bar-style: black-translucent`는 콘텐츠를 상태바 아래까지 끌어올리지만 상태바 글자색을 페이지에 맞춰 주지 않아
  밝은 문서에서 시계 등이 안 보일 수 있고, iOS 26.1 회귀 보고(WebKit bug 301994)도 있다.

**대응 — 단순하고 예측 가능한 방식으로 통일한다**:
- **상단 영역은 고정된 색으로 칠한다.** 문서 내용을 상태바 아래로 끌어올리지 않는다.
  - `apple-mobile-web-app-status-bar-style`은 `default`로 둔다(상태바 글자색은 시스템이 처리).
  - 서재 화면: 앱 배경색(라이트 `#EEF0F4`, 다크 `#101216`).
  - 리더 화면: **문서 영역 색**(라이트 `#FFFFFF`, 다크 `#000000`). 대부분의 문서가 흰 바탕이라 상단 띠가 문서와 이어져 보인다.
    어두운 바탕 문서에서는 상단 띠만 흰색으로 남는 한계를 수용한다.
  - 셸의 `html`·`body` `background-color`와 `theme-color` 메타는 화면(서재/리더) 전환 시 위 값으로 바꾼다. 매니페스트 `theme_color`·`background_color`는 서재 값으로 둔다.
  - 셸 최상단에 그 색의 fixed 요소(높이 `env(safe-area-inset-top)`)를 항상 두어, Safari 탭에서도 상단 바가 문서 내용 대신 이 색을 쓰게 한다.
- iframe은 `top: env(safe-area-inset-top)`부터 **화면 맨 아래까지** 배치한다. 하단 홈 인디케이터는 문서 위에 겹쳐 그려지며(일반 Safari와 같은 동작), 하단 여백 띠는 두지 않는다.
- 오버레이 상단 바는 safe-area까지 덮도록 화면 맨 위부터, 하단 바는 홈 인디케이터 영역까지 덮도록 화면 맨 아래까지 붙인다(`padding`에 safe-area 값을 더함).
- `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">` — `user-scalable=no`나 `maximum-scale`은 두지 않는다(핀치 확대 허용, §7.4).
- 문서 배경색에 맞춰 상단 색을 바꾸는 동적 동기화는 하지 않는다. 검증할 수 없는 iOS 버전별 동작에 의존하지 않기 위해서다.

### 6.7 셸 ↔ agent 프로토콜
- **활성 조건**: agent는 `window.parent === window.top`이고 부모가 같은 출처의 리더 셸일 때만 활성화된다. 중첩 iframe이나 frameset 자식 안에서는 가드(§9.4)만 설치하고 보고는 하지 않는다.
- **메시지 검증**: 모든 메시지에 `protocolVersion`과 `type`을 둔다. 셸은 `event.origin`이 자기 출처이고 `event.source === iframe.contentWindow`일 때만 처리한다.
  버전이 다르면 agent 없는 모드로 동작하고 서재로 돌아갈 때 업데이트를 적용한다(§10).
- **핸드셰이크**:
  1. agent는 `DOMContentLoaded`에 `ready{path, title}`을 보낸다.
  2. 셸은 `init{textScale, restore?: {scrollRatio} | {find} | {bookmark}}`로 응답한다.
  3. agent는 복원 위치를 적용하고, `load` 이후 레이아웃이 안정될 때까지(ResizeObserver 변화가 500ms 동안 없을 때, 최대 3초) 다시 적용한다.
     사용자가 직접 스크롤하면 재적용을 즉시 멈춘다.
- **agent 없는 모드**: `ready`가 3초 안에 오지 않으면(CSP 차단 등) 진행률·탭 토글 없이 문서만 보여준다.
  셸 소유 기능(책갈피 탭, 단축키 일부, 파일 패널, 이전/다음)은 유지하고, 상단 바에 "제한 모드" 표시를 둔다.
- **키 전달**: agent는 iframe 안의 `keydown`을 입력 요소가 아니고 `defaultPrevented`가 false일 때만 `key{key, mods}`로 셸에 전달한다.

## 7. 편의 기능

### 7.1 문서 전체 텍스트 검색
- **색인**: 가져오기 때 `text-extract`가 HTML별 평문을 만든다. `html-meta`로 판정한 인코딩으로 디코딩하고,
  `script/style/template/noscript` 블록과 태그를 제거한 뒤 HTML 엔티티를 디코딩하고 공백을 정리한다. 결과는 NFC 정규화해서 `texts`에 저장한다.
- **검색**: NFC 정규화 + 대소문자 무시 부분 문자열 검색(한글은 형태소 분석 없이 부분 일치). 입력 후 200ms 디바운스를 둔다.
  결과는 페이지별로 묶고 앞뒤 40자 스니펫을 붙이며, 페이지당 최대 20건까지 보여준다.
- **이동**: 색인은 "어느 페이지에 있는가"와 스니펫 용도로만 쓴다. 결과를 누르면 해당 페이지를 로드하고 `init`의 `restore.find{query, snippet}`로 전달한다.
  agent는 실제 DOM에서 `TreeWalker`로 일치 위치를 찾되, 스니펫 문맥과 가장 잘 맞는 일치를 고른다. 찾지 못하면 첫 일치로 폴백한다.
  위치를 찾으면 스크롤하고 CSS Custom Highlight API로 잠시 강조한다.
- **한계**: JS가 실행된 뒤에야 만들어지는 텍스트는 색인되지 않는다. 검색 패널 하단에 한 줄로 안내한다.
  브라우저 기본 찾기(`Ctrl/⌘+F`)는 막지 않는다.

### 7.2 수정본 재가져오기
- `sourceName`이 같은 문서가 있으면 "기존 문서 교체 / 새 문서로 추가"를 묻는다.
- **교체**:
  1. 그 문서가 리더에 열려 있으면 먼저 닫는다.
  2. 새 캐시 `book-<id>-v<n+1>`에 가져온다. 이 동안 기존 문서는 그대로 읽을 수 있는 상태로 남는다.
  3. 하나의 IndexedDB 트랜잭션으로 `books.cacheName` 포인터를 새 캐시로 바꾸고, `bookFiles`·`texts`를 교체하고, 진행률·북마크를 정리한다.
     - `id`, `title`(사용자가 바꾼 이름 포함), `textScale`은 유지한다.
     - 새 묶음에도 있는 경로의 진행률과 북마크는 유지하고, 사라진 경로의 기록과 `issues`는 삭제한다.
     - `lastPath`가 사라졌으면 `entryPath`로 되돌린다.
  4. 커밋 후 구 캐시를 삭제한다. 실패하면 새 캐시만 삭제한다. 남은 것은 §4.3-10의 시작 시 정리가 처리한다.

### 7.3 북마크
- 오버레이의 🔖 또는 `B`로 현재 위치(`path`, `scrollRatio`)를 저장한다. 같은 페이지에서 비율 차이 2% 이내에 북마크가 이미 있으면 해제한다.
- 이름은 `파일명 · NN%`로 자동으로 붙고, 사용자가 바꿀 수 있다(`label`, 최대 100자).
- ☰ 패널의 북마크 탭에서 목록(이름·파일·만든 날짜)을 보고, 누르면 이동하며, 밀거나 삭제 버튼으로 지운다. 이름 바꾸기는 행의 ⋯ 메뉴에서 한다.

### 7.4 확대 (글자 크기)
브라우저 확대와 같은 방식으로 통일한다.
- **확대 버튼**(`가-` `가+`, 단축키 `+`/`-`): 모든 플랫폼에서 문서 루트에 CSS `zoom`을 적용한다(PC 브라우저의 `Ctrl +`와 같은 페이지 확대).
  고정 폭 레이아웃은 확대 시 가로 스크롤이 생길 수 있으며, 이는 브라우저 확대와 같은 동작으로 수용한다.
- **핀치 확대(돋보기)**: 모바일의 두 손가락 확대를 막지 않는다(§6.6 viewport 설정). 이 확대는 저장하지 않는 일시적 확대다.
- 단계: 80·90·100·110·125·150·175·200%, 문서별 `textScale`로 저장한다.
- 적용은 SW 주입 시 `data-scale`로 첫 페인트 전에 한다(§5.4). 바꾸면 바꾸기 직전의 `scrollRatio`를 유지하도록 다시 스크롤한다.

### 7.5 바로 열기 연동 (P4, Android·PC)
- **PC(Chromium 설치 앱 전용)**: 매니페스트 `file_handlers`에 `.zip`, `.html`, `.htm`을 등록하고, `launchQueue`로 받은 파일을 가져오기로 넘긴다.
- **Android(설치 앱)**: 매니페스트 `share_target`(POST, multipart)을 등록한다.
  - `accept`에 `application/zip`, `application/x-zip-compressed`, `application/octet-stream`, `.zip`, `text/html`, `.html`을 모두 넣는다. 파일 관리자마다 ZIP의 MIME이 다르기 때문이다.
  - SW는 `request.formData()`로 파일을 받아 임시 캐시에 두고 `303 → /?import=pending`으로 보낸다. 앱이 그 파일을 가져온 뒤 임시 캐시를 지운다.
  - `formData()`는 본문 전체를 메모리에 올리므로 대용량 ZIP에서 실패할 수 있다. 실패하면 "앱에서 직접 가져오기를 이용하세요"라고 안내한다.
- **iOS**: PWA에 해당 기능이 없으므로 지원하지 않는다. 앱 안의 가져오기 버튼만 쓴다.

### 7.6 서재 검색·정렬
- 서재 상단 검색창: 제목과 `sourceName`을 부분 일치로 필터링한다.
- 정렬: 최근 읽음(기본), 가져온 날짜, 이름(자연 정렬), 진행률. 마지막 선택은 `settings`에 저장한다.

### 7.7 문서명 지정·수정
- **기본 이름**: 시작 페이지의 `<title>`을 쓰고, 비어 있으면 `sourceName`을 쓴다.
  `<title>`이 흔한 무의미 제목(대소문자 무시: `document`, `index`, `untitled`, `home`, `제목 없음`, `untitled document`)이면 `sourceName`을 쓴다.
- **중복 처리**: 이름이 기존 문서와 같으면 자동으로 ` (2)`, ` (3)` 접미사를 붙인다. 서재 카드에는 보조 정보로 `sourceName`과 가져온 날짜를 함께 표시해 구분을 돕는다.
- **수정**: 서재 카드의 ⋯ 메뉴(또는 길게 누르기/우클릭) → "이름 바꾸기"에서 바꾼다. 같은 메뉴에 "삭제"도 둔다.
  빈 이름은 허용하지 않고, 앞뒤 공백을 제거하며, 최대 100자까지 허용한다. 직접 바꿀 때는 중복 이름도 경고만 하고 허용한다.
- 이름을 바꿔도 재가져오기 매칭(`sourceName`)에는 영향이 없다. 교체로 다시 가져올 때도 사용자가 지정한 이름을 유지한다.

## 8. 성능

| 지점 | 방법 | 목표 |
|---|---|---|
| ZIP 가져오기 | Worker에서 엔트리별 slice + Inflate, `cache.put`을 await하는 백프레셔, ZIP 전체를 메모리에 올리지 않음 | 수백 MB ZIP에서도 UI가 멈추지 않음, 피크 메모리 ≈ 가장 큰 엔트리 1개 |
| 파일 응답 | Cache Storage의 `Response`를 그대로 응답, base64 변환 없음 | 로컬 파일 수준의 응답 속도 |
| HTML 주입 | 처음 4KB만 바이트 스캔 후 삽입, 네비게이션 HTML에만 적용 | 주입 오버헤드 무시할 수준 |
| 스크롤 | passive 리스너, rAF 스로틀 | 60fps 유지 |
| 오버레이 | `transform`/`opacity`만 애니메이션 | 레이아웃 재계산 없음 |
| 진행률 저장 | 메모리 갱신 + 1초 디바운스 + `pagehide` 시 즉시 저장 | IDB 쓰기 최소화 |
| 앱 시작 | 앱 셸 프리캐시, 서재는 `books` 메타만 읽음, 고아 정리는 첫 화면 표시 후 유휴 시간에 | 오프라인 재실행 시 1초 이내 표시 |
| 번들 | Svelte + 코드 분할(리더/서재), agent는 별도 소형 번들 | 초기 JS 50KB(gzip) 이하, agent 8KB(gzip) 이하 |

가장 큰 단일 엔트리(예: 수백 MB 동영상)는 Blob으로 모이는 동안 메모리를 쓴다. 이런 대용량 엔트리는 iOS에서 메모리 부족으로 가져오기가 실패할 수 있으며,
이 경우 가져오기를 롤백하고 원인을 안내한다(수용한 제약, §5.5).

## 9. 에러 처리와 제약

### 9.1 가져오기
- **파일명 인코딩**: Info-ZIP Unicode Path extra field(0x7075)가 있으면 그것을 쓴다. 없으면 UTF-8 플래그(bit 11)를 본다.
  플래그도 없으면 `TextDecoder('utf-8', {fatal: true})`를 시도하고, 실패하면 `TextDecoder('euc-kr')`로 해석한다. 이후 NFC 정규화한다.
- **손상 ZIP**(EOCD 없음, CRC 불일치 등)·**암호화·미지원 압축**·**용량 부족**(사전 검사 또는 `QuotaExceededError`)·**zip bomb 의심**: 중단하고 원인별 메시지를 표시한다.
  캐시를 정리하며, 정리하지 못한 것은 시작 시 정리가 처리한다.
- **HTML 없음**: 가져오기를 거부한다.

### 9.2 읽기
- **경로 탈출**: `..`로 문서 루트 밖을 가리키면 404를 응답하고 `outside-root`로 기록한다.
- **외부 링크**: 다른 출처로 가는 링크는 agent가 가로채 셸을 통해 새 브라우저 탭으로 연다.
  같은 문서 안의 링크는 `target`이 `_blank`·`_top`·`_parent`여도 `_self`로 정규화해 iframe 안에서 연다.
- **프레임 탈출**: 문서 스크립트가 `top.location`을 바꾸거나 `/book/*` 페이지가 최상위 창으로 열리면, SW가 §5.2-2 규칙으로 리더로 되돌린다.
- **SW 미제어·미지원**: §4.4-1과 §2.2.

### 9.3 iOS
- Safari 탭과 홈 화면 앱의 저장소 분리, 데이터 삭제 정책: §2.1.

### 9.4 같은 출처 실행에 대한 가드
문서의 JS는 앱과 같은 출처에서 실행된다. sandbox iframe은 opaque origin이 되어 SW 제어를 받지 못하므로 대안이 될 수 없다.
그래서 완전한 격리는 포기하고, **문서가 의도치 않게 리더를 망가뜨리는 것**을 막는 가드를 agent가 문서 스크립트보다 먼저 설치한다.
agent는 주입 위치상 문서의 다른 스크립트보다 먼저 실행된다.
- **Service Worker**: `navigator.serviceWorker.register`는 reject, `getRegistrations`는 빈 배열, `getRegistration`은 `undefined`를 반환하도록 스텁한다.
  HTML 내보내기 도구가 넣는 "기존 SW 전부 해제" 코드가 리더 SW를 해제하는 것을 막는다.
- **localStorage / sessionStorage**: 문서별 접두사(`book:<id>:`)를 붙이는 래퍼로 교체한다. `length`, `key()`, `clear()`도 그 접두사 범위에서만 동작한다.
  같은 템플릿으로 만든 문서끼리 진도·테마 값이 섞이지 않게 한다.
- **Cache Storage / IndexedDB**: `caches.delete`·`caches.keys`와 `indexedDB.deleteDatabase`·`indexedDB.open`이 앱 소유 이름(`book-*`, `workbox-*`, `html-reader`)에 접근하면 거부한다.
- **쿠키**: 격리하지 않는다(범위 밖). 문서끼리 쿠키를 공유할 수 있음을 수용한다.
- **수용한 위험**: 악의적인 문서는 가드를 우회해 다른 문서의 데이터에 접근할 수 있다. 사용자가 직접 가져온 신뢰할 수 있는 문서용이라는 전제로 수용하며, 첫 가져오기 화면에 한 줄로 고지한다.

## 10. 앱 업데이트

- SW는 새 버전을 받으면 **대기 상태로 둔다**(`skipWaiting` 자동 호출 안 함).
- 셸은 새 버전이 대기 중이면 서재 화면에 "업데이트 준비됨 — 적용" 알림을 띄운다. **리더가 열려 있는 동안에는 적용하지 않는다.**
  사용자가 적용하거나 리더를 닫고 서재로 돌아오면 `skipWaiting` 메시지를 보내고 새로고침한다.
- 셸과 agent 간 `protocolVersion`이 다르면 agent 없는 모드로 동작한다(§6.7).
- `/__reader/agent.js`는 프리캐시 자산으로 SW 버전과 함께 교체된다.
- 프리캐시 정리는 `workbox-precache-*` 캐시만 대상으로 한다. `book-*` 캐시는 절대 건드리지 않는다.
- IndexedDB 스키마는 버전 번호와 `onupgradeneeded` 단계별 마이그레이션으로 관리한다. 다른 탭이 구버전 연결을 잡고 있으면 `versionchange`에서 연결을 닫는다.
- SW는 유휴 시 종료될 수 있으므로 전역 메모리 상태에 의존하지 않는다. 필요한 상태는 IndexedDB에서 읽는다.

## 11. 테스트

### 11.1 단위 (Vitest)
- `zip`: EOCD·ZIP64 파싱, STORED/DEFLATE 엔트리, 데이터 디스크립터 ZIP(macOS Finder 생성), CRC 불일치, 암호화·미지원 압축 감지
- `filename`: UTF-8 플래그, Unicode extra field, CP949, NFD → NFC, 정크 판정
- `html-meta`: BOM·meta charset·EUC-KR 판정, `<title>` 추출, 완전한 문서/조각 판정
- `text-extract`: script/style 제거, 엔티티 디코딩, EUC-KR 문서, NFC
- `path`: 쿼리 제거, 퍼센트 디코딩, NFC, 탈출 판정, 대소문자 폴백, 디렉터리 해석
- `inject`: `<head>`/`<html>`/doctype/없음 위치, 주석 안 일치 무시, UTF-16, meta charset 1024바이트 보호, XHTML
- `range`: 일반·열린·suffix 범위, 416
- `mime`, 진행률 계산, 시작 페이지 결정, 기본 문서명·중복 접미사, 재가져오기 시 진행률·북마크 이관, 서재 정렬, `protocol` 메시지 검증

### 11.2 E2E (Playwright: Chromium, WebKit)
테스트용 ZIP 세트를 저장소에 둔다.
1. 여러 페이지와 상대·루트 절대 링크(`/page2.html`, `/css/a.css`)로 구성된 문서, `no-referrer` 메타가 있는 문서
2. `fetch('./data.json')`, ES module import, `fetch`로 읽는 HTML 조각(주입되지 않아야 함)
3. `@font-face` 상대경로 폰트
4. 내부 `div` 스크롤 컨테이너 문서
5. CP949 한글 파일명 ZIP, macOS에서 만든 NFD 한글 파일명 ZIP(`__MACOSX` 포함)
6. EUC-KR 인코딩 HTML(주입 후 한글이 깨지지 않아야 함)
7. 동영상(Range)
8. 누락 리소스가 있는 문서(읽는 중 배지 표시)
9. 클릭 핸들러가 붙은 `div`·탭 메뉴가 있는 문서(오버레이가 잘못 토글되지 않음)
10. 단일 `.html` 파일
11. SW 해제 코드·`localStorage.clear()`가 들어 있는 문서(리더가 계속 동작하고 다른 문서의 값이 남아 있어야 함)
12. `target=_top` 링크·`top.location` 변경 문서(리더 안에 머물러야 함)
13. agent를 차단하는 CSP 메타가 있는 문서(제한 모드로 열림)

공통 시나리오: 가져오기 → 읽기 → 진행률 저장 → 재실행 후 이어 읽기 → 오프라인 모드 재실행.

편의 기능 시나리오:
- 검색어 입력 → 다른 페이지의 결과 클릭 → 해당 위치로 스크롤되고 강조됨
- 북마크 추가 → 다른 페이지로 이동 → 북마크 탭에서 복귀
- 글자 크기 변경 → 위치 유지 → 재실행 후 크기 유지
- 같은 이름 ZIP 재가져오기(교체) → 남은 경로의 진행률·북마크 유지, 사라진 경로의 기록 삭제, 구 캐시 삭제
- 가져오기 도중 페이지 새로고침 → 재실행 시 고아 캐시 정리
- 서재 검색·정렬
- 같은 제목 문서 가져오기 → 접미사 자동 부여 → 이름 바꾸기 → 재가져오기(교체) 후에도 바꾼 이름 유지
- 새 SW 버전 배포 → 리더 열림 중에는 적용 안 됨 → 서재에서 적용
- (Chromium) `launchQueue`로 파일 전달 시 가져오기 진행

### 11.3 검증 범위
- 검증은 **브라우저 기반 자동 테스트**(Playwright Chromium·WebKit, 데스크톱과 모바일 에뮬레이션: iPhone·Pixel 프리셋, 터치 입력)로 한다.
  Xcode(iOS 시뮬레이터)와 Android 에뮬레이터는 쓰지 않는다.
- 모바일 에뮬레이션으로 확인하는 것: 터치 탭 토글, 바텀시트, 빠른 스크롤 핸들 드래그, safe-area 변수를 흉내 낸 레이아웃, 핀치 확대 허용(viewport 메타).
- 자동 테스트로 검증할 수 없는 것(iOS 상태바 실제 색, 홈 화면 앱 저장소 분리, share target, 설치 앱 파일 연결)은 구현만 하고,
  사용자가 원할 때 실제 기기에서 가볍게 확인한다. 확인용 짧은 체크리스트를 README에 둔다.

## 12. 단계

기능은 모두 v1에 포함하되 다음 순서로 구현한다. 각 단계는 끝날 때 동작하는 상태여야 한다.

| 단계 | 내용 | 종료 조건 |
|---|---|---|
| **P1 핵심** | 프로젝트 골격, `zip`·`filename`·`html-meta`·`text-extract`·`importer`, `storage`, `path`·`mime`·`range`·`inject`·`sw`, 서재(목록·가져오기·삭제), 리더(iframe·SW 준비 확인), agent 가드·핸드셰이크·진행률·이어 읽기, iOS 상단 영역, 앱 업데이트 정책, 호스팅 설정 | 성공 기준 1·2·5·6 충족 |
| **P2 읽기 UI** | 오버레이·탭 판별·진행 바·진행선, 빠른 스크롤 핸들, 책갈피 탭·첫 실행 안내, 파일·북마크 패널(PC 폭 조절·접기), 이전/다음, 단축키, 확대, 리소스 이슈 배지, 앱 테마(라이트/다크) | 성공 기준 3·4 충족 |
| **P3 편의** | 문서 전체 검색, 북마크, 재가져오기 교체, 문서명 지정·수정, 서재 검색·정렬 | §7.1–7.3, §7.6–7.7 동작 |
| **P4 연동** | `file_handlers`·`launchQueue`, `share_target` | §7.5 동작 |

**P1의 첫 검증 항목**: 구조 전체가 기대는 가정 — "SW가 iframe 안의 문서와 그 안의 페이지 이동을 제어하고, 루트 절대경로 네비게이션 302 리다이렉트와
서브리소스 매핑이 동작한다" — 을 P1 초반에 최소 구현과 Playwright(Chromium·WebKit) 테스트로 먼저 확인한다. 실패하면 이후 작업을 멈추고 설계를 다시 검토한다.

## 13. 디자인

시안: https://claude.ai/artifact/W7Erodej4SavuNij6VFt8M — "확정안" 두 줄(모바일 7장, PC 1장)이 기준이다. 시안 A·B·C 줄은 참고용이다.

### 13.1 방향
- **B(유리) 베이스 + 화면 끝에 붙은 바**: 오버레이 상단·하단 바는 플로팅 캡슐이 아니라 화면 가장자리에 붙는다.
  바 배경은 반투명 + 블러(`backdrop-filter: blur(22px) saturate(1.6)`), 경계는 1px 헤어라인.
- 글꼴: `Noto Sans KR`(웹폰트를 앱 셸에 번들, 오프라인 동작), 폴백 `system-ui`.
- 아이콘: 인라인 스트로크 SVG(1.8px), 이모지 사용 안 함.
- 터치 대상은 44px 이상. 숫자·텍스트 대비는 WCAG AA(4.5:1) 이상.

### 13.2 토큰

| 토큰 | 라이트 | 다크 |
|---|---|---|
| `bg-app`(서재 배경) | `#EEF0F4` | `#101216` |
| `bg-reader`(리더 상단 띠) | `#FFFFFF` | `#000000` |
| `surface`(카드·시트) | `#FFFFFF` | `#1A1D23` |
| `bar`(오버레이 바) | `rgba(250,251,253,0.86)` | `rgba(24,26,32,0.88)` |
| `hairline` | `rgba(21,24,30,0.08)` | `rgba(255,255,255,0.08)` |
| `text` | `#15181E` | `#F2F4F7` |
| `text-2` | `#3A404C` | `#C9CED8` |
| `text-3`(보조) | `#5B6270` | `#A3AAB8` |
| `accent` | `#2F6FEB` | `#6EA0FF` |
| `accent-soft`(현재 행) | `#EAF0FD` | `rgba(110,160,255,0.16)` |
| `ok`(읽음) | `#1F7A45` | `#4FC27F` |
| `warn-bg`/`warn-fg`(누락) | `#FFF1E0`/`#8A4B00` | `rgba(240,136,62,0.16)`/`#F5A262` |
| `info-bg`/`info-fg`(온라인 필요) | `#E8EEFB`/`#1F4FB0` | `rgba(110,160,255,0.16)`/`#9BBDFF` |
| `scrim`(시트 뒤) | `rgba(21,24,30,0.38)` | `rgba(0,0,0,0.5)` |

반경: 카드 22px, 시트 상단 22px, 버튼·입력 12px, 칩 18px(완전 둥글게). 그림자: 카드 `0 1px 2px rgba(21,24,30,.06), 0 6px 18px rgba(21,24,30,.05)`.

### 13.3 앱 테마
- 설정: `시스템(기본) / 라이트 / 다크`. 서재 상단의 설정 버튼 → 설정 화면에서 바꾸고 `settings`에 저장한다.
- 앱 크롬(서재, 바, 패널, 시트, 토스트)에만 적용한다. **문서 내용은 원본 색을 그대로 둔다.**

### 13.4 화면
- **서재**: 큰 제목 "서재", 정렬 칩 가로 행(최근 읽음/이름/진행률/가져온 날짜), 문서 카드(진행률 링 + 제목 + `sourceName · 날짜` + `7/12쪽` + 배지 + ⋯).
  하단에 붙은 바에 검색 입력과 "가져오기" 버튼. 설정 버튼은 제목 행 오른쪽.
- **리더 평상시**: 문서 + 하단 2px 진행선 + 책갈피 탭. 첫 실행 시 안내 토스트.
- **리더 오버레이**: §6.2. 스크롤 핸들은 30×64px 반투명 캡슐(위아래 화살표), 말풍선은 어두운 반투명 캡슐.
- **패널(모바일)**: 바텀시트(화면 높이의 약 70%), 그래버, `파일/북마크` 세그먼트, 파일 트리.
- **검색(모바일)**: 전체 화면. 상단 검색 입력 + 취소, 결과는 페이지별 그룹과 `<mark>` 강조 스니펫, 하단 한계 안내.
- **PC**: 상단 바 하나 + 우측 사이드 패널(§6.2 PC 레이아웃).
