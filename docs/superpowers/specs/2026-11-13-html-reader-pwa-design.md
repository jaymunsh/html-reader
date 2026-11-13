# HTML Reader PWA — 설계 스펙

- 작성일: 2026-11-13
- 상태: 사용자 검토 대기

## 1. 목적과 범위

### 목적
ZIP으로 묶인 HTML 문서 묶음(사내문서, 리포트, 오프라인 웹 교재, 직접 만든 HTML 산출물 등)을
PC(macOS·Windows)와 모바일(iOS·Android)에서 **일반 브라우저와 동일하게 동작**시키며 읽는 PWA.
단일 HTML이 아니라 디렉터리 단위로 페이지 이동, JS·CSS·JSON·폰트·이미지·미디어 등
상대경로 리소스가 모두 동작해야 한다.

### 성공 기준
1. ZIP 안의 여러 HTML 페이지 사이 링크 이동, `fetch()`로 JSON 로드, ES module import,
   CSS `url()`/`@font-face`가 원본 그대로 동작한다.
2. 페이지별 읽기 진행률과 이어 읽기가 동작한다.
3. 긴 문서에서 목차·빠른 스크롤로 원하는 위치를 쉽게 찾는다.
4. 평상시 리더 UI는 문서 공간을 차지하지 않는다.
5. iOS 26 홈 화면 앱에서 상단 상태바 영역이 문서와 자연스럽게 이어진다(의도치 않은 blur·겹침 없음).
6. 최초 1회 접속 후 완전 오프라인으로 동작한다.

### 범위 밖 (명시적 제외)
- 기기 간 동기화(서버 필요) — 문서와 진행률은 각 기기에만 저장된다.
- 폴더 직접 선택, URL로 불러오기 — 가져오기는 ZIP만 지원.
- 설치 폰트를 이름으로만 참조하는 문서의 감지·대체.
- 네이티브 래퍼(Capacitor/Tauri), 앱스토어 배포.
- 문서 간 격리 보안(§8 참조).

## 2. 플랫폼·배포

- 정적 호스팅(Vercel 등)에 배포, 서버 코드 없음. HTTPS 필수(Service Worker 조건).
- 문서는 서버로 업로드되지 않고 기기 내부에만 저장된다.
- 지원 대상: Chrome/Edge(Windows·macOS), Safari(macOS), iOS 26 Safari 및 홈 화면 앱, Android Chrome.
- iOS는 Safari 탭 사용 시 장기 미사용 데이터 삭제 정책이 있으므로 **홈 화면 추가 사용을 전제**로
  최초 실행 시 안내 화면을 표시하고, `navigator.storage.persist()`를 요청한다.

## 3. 기술 스택

| 영역 | 선택 | 이유 |
|---|---|---|
| 빌드 | Vite + TypeScript | 표준, 빠른 빌드 |
| UI | Svelte 5 | 런타임이 작아 초기 로딩에 유리 |
| PWA | `vite-plugin-pwa` (injectManifest) | 앱 셸 프리캐시 + 커스텀 SW 로직 |
| ZIP | `fflate` (스트리밍 `Unzip`) | 작고 빠르며 스트리밍 해제 지원 |
| 단위 테스트 | Vitest | |
| E2E | Playwright (Chromium, WebKit) | |

## 4. 아키텍처

```
┌─ 리더 셸 (앱 UI, 최상위 문서) ─────────────────────┐
│ 서재 화면 / 리더 화면 / 오버레이 / 목차·페이지 패널 │
│        ▲ postMessage (위치·목차·탭·누락 리소스)     │
│  ┌─ iframe: /book/<id>/<entry>.html ────────────┐  │
│  │  원본 HTML + SW가 주입한 reader-agent.js       │  │
│  └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
        │ 모든 네트워크 요청
┌─ Service Worker ────────────────────────────────────┐
│ /book/<id>/...      → Cache Storage에서 파일 응답     │
│ HTML 응답            → reader-agent 스크립트 태그 주입  │
│ 앱 셸               → 프리캐시                        │
└─────────────────────────────────────────────────────┘
┌─ Import Worker ─┐   ┌─ 저장소 ───────────────────────────┐
│ ZIP 스트리밍 해제 │ → │ Cache Storage: 파일 본문(Response) │
└─────────────────┘   │ IndexedDB: 문서 메타·진행률·누락 목록 │
                      └────────────────────────────────────┘
```

### 4.1 컴포넌트

각 단위는 하나의 책임과 명확한 인터페이스를 가진다.

| 단위 | 책임 | 의존 |
|---|---|---|
| `importer` (Worker) | ZIP 스트리밍 해제, 파일명 디코딩, 저장, 진행률 보고, 실패 시 롤백 | fflate, `storage` |
| `storage` | Cache Storage(파일)·IndexedDB(메타/진행률) 접근 API | 없음 |
| `path` | URL ↔ 문서 내 경로 정규화, 루트 절대경로 매핑, 디렉터리 index 해석 | 없음(순수 함수) |
| `mime` | 확장자 → Content-Type | 없음(순수 함수) |
| `sw` | 요청 라우팅, 파일 응답, Range 처리, HTML 주입, 404 기록 | `path`, `mime`, `storage` |
| `reader-agent` | iframe 내부: 스크롤 컨테이너 탐지, 진행률, 탭 판별, 목차 추출, 현재 섹션 추적, 배경색 보고 | 없음(셸과 postMessage) |
| `progress` | 페이지별/문서별 진행률 계산·디바운스 저장 | `storage` |
| `scanner` | 가져오기 시 HTML/CSS 참조 스캔 → 누락 리소스 목록 | `path` |
| UI(Svelte) | 서재, 리더, 오버레이, 패널, 안내 화면 | 위 단위들 |

### 4.2 데이터 모델

**Cache Storage** — 캐시 이름 `book-<id>`, 키 `/book/<id>/<정규화된 경로>`, 값 `Response(blob, {Content-Type})`.

**IndexedDB `html-reader`**
- `books`: `{ id, title, entryPath, htmlPaths[], fileCount, totalBytes, importedAt, lastOpenedAt, lastPath, hasExternalRefs, missing[] }`
- `progress`: 키 `[bookId, path]`, `{ maxPct (0–100), lastScrollY, read (boolean), updatedAt }`

### 4.3 주요 흐름

**가져오기**
1. 사용자가 ZIP 선택(PC는 드래그앤드롭도 가능).
2. `storage.estimate()`로 여유 공간 확인. ZIP 크기의 약 2배가 부족하면 중단하고 안내.
3. Import Worker가 `File.stream()` → fflate `Unzip`으로 파일 단위 해제, 각 파일을 즉시 Cache Storage에 저장. UI에 진행률 표시.
4. 시작 페이지 결정: 루트 `index.html` → 단일 최상위 폴더 안의 `index.html` → 없으면 HTML 목록에서 사용자가 선택.
   단일 최상위 폴더면 그 폴더를 문서 루트로 삼는다.
5. `scanner`가 HTML/CSS 참조를 스캔해 누락 목록과 외부 리소스 여부를 기록.
6. `books` 레코드 작성으로 완료. 도중에 실패하면 해당 캐시와 레코드를 삭제(롤백).

**읽기**
1. 리더 화면이 iframe에 `/book/<id>/<lastPath 또는 entryPath>` 로드.
2. SW가 Cache Storage에서 응답한다. HTML이면 `<head>` 직후에 `<script src="/__reader/agent.js"></script>`를 주입한다.
3. agent가 셸에 `ready{path, title, bgColor, outline}`을 보내고, 스크롤 시 `scroll{pct}`, 탭 시 `tap`, 섹션 변경 시 `section{id}`를 보낸다.
4. 셸이 진행률을 갱신하고(1초 디바운스, `pagehide` 시 즉시 저장), 상단 띠 색을 `bgColor`로 맞춘다.
5. 이어 읽기: 문서를 열면 `lastPath`를 로드하고 agent에 `restore{scrollY}`를 보낸다.

## 5. Service Worker 라우팅 규칙

1. `/book/<id>/<path>`: 경로를 정규화(퍼센트 디코딩, `.`/`..` 처리, 루트 밖 탈출 차단)한 뒤 Cache Storage에서 조회.
   - 경로가 `/`로 끝나거나 디렉터리면 `<path>/index.html`로 응답.
   - 없으면 404 응답(간단한 안내 HTML)을 보내고 `missing` 기록을 갱신.
2. **루트 절대경로** (`/css/a.css` 등, 앱 경로가 아닌 요청): `event.clientId`로 요청한 클라이언트 URL을 조회한다.
   클라이언트가 `/book/<id>/` 아래 문서라면 `/book/<id>/css/a.css`로 매핑한다.
   네비게이션 요청이라 clientId가 없으면 `resultingClientId`/Referer로 판별한다.
3. **Range 요청**(동영상·오디오, iOS 필수): `206 Partial Content`와 `Content-Range`를 직접 생성한다.
4. **외부 출처 요청**: 그대로 네트워크로 통과시킨다(오프라인이면 실패, 서재에 경고 아이콘).
5. 앱 셸·`/__reader/*`: 프리캐시에서 응답.

MIME은 `mime` 단위에서 결정한다. `woff2/woff/ttf/otf`, `mjs`, `json`, `svg`, `wasm`, 미디어 형식을 반드시 정확히 지정한다.

## 6. 리더 UI

### 6.1 원칙
평상시에는 문서만 보인다. 리더 UI는 문서 위에 겹쳐 뜨는 오버레이이며 레이아웃을 밀지 않는다.

### 6.2 상태
- **평상시**: 문서 전체 화면 + 화면 가장자리의 2px 진행선(설정에서 끄기 가능, 기본값 켬).
- **원터치 시**: 다음 요소들을 표시한다.
  - 상단 바: ◀ 서재, 문서명, `p.3/12`, ☰
  - 진행 바: 현재 페이지의 %
  - 빠른 스크롤 핸들: 우측 가장자리. 드래그하면 현재 섹션 제목을 말풍선으로 표시
  - 하단 바: ⤒ 맨 위, ◀ 이전 페이지, 다음 페이지 ▶, ⤓ 맨 아래

  다시 탭하거나 3초 동안 조작이 없으면 숨긴다(드래그·패널 사용 중에는 숨기지 않음).
- **☰ 패널**: 목차 탭과 페이지 탭으로 구성한다. 모바일은 바텀시트, PC는 우측 사이드 패널로 표시한다.
  - 목차: 현재 페이지의 h1–h4. 누르면 해당 위치로 이동하고, 현재 섹션을 강조한다.
  - 페이지: `htmlPaths` 목록과 각 페이지 상태(`✓ 읽음 / 45% / 안 읽음`). 누르면 이동한다.
- 이전/다음 페이지 순서는 `htmlPaths`의 경로 자연 정렬 순서를 따른다.
- **PC 단축키**: `Space`(오버레이 토글), `T`(목차), `[`/`]`(이전/다음 페이지), `Home`/`End`
- **누락 리소스 배지**: 누락이 있으면 상단 바와 서재 카드에 `⚠ 누락 N` 배지를 표시한다. 누르면 경로와 원인을 보여준다.
  원인은 "ZIP에 없음" 또는 "ZIP 루트 밖 참조 — 상위 폴더째로 압축하세요" 둘 중 하나다.

### 6.3 탭 판별 (reader-agent)
문서 자체의 상호작용을 방해하지 않는 것이 최우선이다.
- 다음 조건을 **모두** 만족할 때만 `tap`으로 판정한다.
  - 포인터 이동 10px 이하, 300ms 이하
  - 선택된 텍스트 없음
  - 대상과 조상 중에 `a, button, input, select, textarea, label, summary, video, audio, iframe, [role=button|link|tab|menuitem|checkbox], [contenteditable], [onclick], [tabindex]` 없음
  - 대상의 computed `cursor`가 `pointer` 아님
  - 이벤트가 document까지 전파된 뒤에도 `defaultPrevented`가 false
- 판별이 실패하는 문서를 위해 **우회 수단을 항상 둔다**: 우측 가장자리의 작은 반투명 핸들 탭, PC 단축키.

### 6.4 스크롤 컨테이너 탐지
`document.scrollingElement`가 실제로 스크롤 가능하면 그것을 쓴다. 아니면 `overflow-y: auto|scroll`이면서
`scrollHeight > clientHeight`인 요소 중 화면 면적이 가장 큰 것을 고른다.
DOM 변경(`ResizeObserver` + 지연 재탐지)에 대응하며, 진행률·핸들·목차 이동은 모두 이 컨테이너를 기준으로 한다.

### 6.5 진행률 규칙
- 페이지 진행률은 `(scrollTop + clientHeight) / scrollHeight`의 **최댓값**으로 한다. 스크롤이 없는 페이지는 표시 즉시 100%다.
- 98% 이상에 도달하면 `read = true`.
- 문서 진행률은 전체 `htmlPaths` 페이지 진행률의 평균이다(방문하지 않은 페이지는 0).
- 서재 카드에는 문서 진행률, 읽은 페이지 수/전체, 마지막으로 연 시각을 표시한다.

### 6.6 iOS 상단 영역 (Liquid Glass 대응)
배경: iOS 26 Safari는 상단 바 색을 정할 때 `theme-color`를 사실상 무시한다. 대신 화면 상단 가장자리에 닿은 fixed 요소의
배경색을 쓰고, 그런 요소가 없으면 콘텐츠 위에 반투명 blur를 적용한다. 이는 Apple 공식 문서가 아니라 커뮤니티에서 확인한 동작이며 버전마다 다를 수 있다.

대응:
- `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`
- `<meta name="apple-mobile-web-app-capable" content="yes">`, `apple-mobile-web-app-status-bar-style="black-translucent"`
- 셸이 **첫 렌더부터** `position: fixed; top: 0; height: env(safe-area-inset-top)` 띠를 둔다(z-index 최상위).
  띠의 배경색은 agent가 보고한 현재 문서의 `body` 배경색(투명하면 `html`, 그것도 투명하면 흰색)으로 맞추고, 페이지 이동 시마다 갱신한다.
- iframe은 `top: env(safe-area-inset-top)`부터 `bottom: env(safe-area-inset-bottom)`까지 배치해 문서 내용이 띠나 홈 인디케이터에 가려지지 않게 한다.
  하단 safe-area 영역도 상단과 같은 방식으로 문서 배경색 띠를 깐다.
- `theme-color` 메타도 함께 갱신한다(다른 브라우저와 구버전 대응).
- 초기 페인트 시점에 색이 고정되는 문제가 보고되어 있으므로 실기기 검증 항목으로 둔다(§9).

## 7. 성능

| 지점 | 방법 | 목표 |
|---|---|---|
| ZIP 가져오기 | Worker에서 스트리밍 해제, 파일 단위로 즉시 저장, ZIP 전체를 메모리에 올리지 않음 | 수백 MB ZIP에서도 UI가 멈추지 않음 |
| 파일 응답 | Cache Storage의 `Response`를 그대로 스트리밍 응답, base64 변환 없음 | 로컬 파일 수준의 응답 속도 |
| HTML 주입 | 첫 `<head>` 위치만 찾아 문자열 삽입. HTML 파일에만 적용 | 주입 오버헤드 무시할 수준 |
| 스크롤 | passive 리스너, rAF 스로틀, `IntersectionObserver`로 섹션 추적 | 60fps 유지 |
| 오버레이 | `transform`/`opacity`만 애니메이션 | 레이아웃 재계산 없음 |
| 진행률 저장 | 메모리 갱신 + 1초 디바운스 + `pagehide` 시 즉시 저장 | IDB 쓰기 최소화 |
| 앱 시작 | 앱 셸 프리캐시, 서재는 `books` 메타만 읽음 | 오프라인 재실행 시 1초 이내 표시 |
| 번들 | Svelte + 코드 분할(리더/서재) | 초기 JS 50KB(gzip) 이하 |

## 8. 에러 처리와 제약

- **파일명 인코딩**: ZIP 엔트리의 UTF-8 플래그(bit 11)를 확인한다. 플래그가 없으면 UTF-8 디코딩을 먼저 시도하고, 실패하면 `TextDecoder('euc-kr')`로 해석한다.
- **경로 탈출**: `..`로 문서 루트 밖을 가리키면 404를 반환하고 누락 목록에 "ZIP 루트 밖 참조"로 기록한다.
- **손상 ZIP / 중간 실패**: 롤백하고 오류 메시지를 표시한다.
- **용량 부족**(사전 확인 또는 `QuotaExceededError`): 롤백하고 안내한다.
- **시작 페이지 없음**: HTML이 하나도 없으면 가져오기를 거부한다.
- **외부 링크**: 다른 출처로 가는 링크(`target` 무관)는 agent가 가로채 셸을 통해 새 브라우저 탭으로 연다.
  같은 문서 안의 `target=_blank` 링크는 iframe 안에서 연다.
- **`window.top` 접근 문서**: 프레임 탈출을 시도하는 스크립트(`top.location = ...`)는 막지 않는다. 대신 셸이 `beforeunload`를 감지해 리더 밖으로 이동하는 것을 확인하게 한다.
- **보안(수용한 위험)**: 문서의 JS는 앱과 같은 출처에서 실행되므로 다른 문서의 데이터에 접근할 수 있다.
  사용자가 직접 가져온 신뢰할 수 있는 문서용이라는 전제로 이 위험을 수용하며, 첫 가져오기 화면에 한 줄로 고지한다.

## 9. 테스트

### 단위 (Vitest)
`path`(정규화, 탈출 차단, 디렉터리 index, 루트 절대경로 매핑), `mime`, 파일명 디코딩(UTF-8/CP949),
진행률 계산, 시작 페이지 결정, `scanner`(누락·루트 밖 참조 감지), Range 헤더 파싱.

### E2E (Playwright: Chromium, WebKit)
테스트용 ZIP 세트를 저장소에 둔다.
1. 여러 페이지와 상대·루트 절대 링크로 구성된 문서
2. `fetch('./data.json')`, ES module import
3. `@font-face` 상대경로 폰트
4. 내부 `div` 스크롤 컨테이너 문서
5. CP949 한글 파일명 ZIP
6. 동영상(Range)
7. 누락 리소스가 있는 문서(배지 표시)
8. 클릭 핸들러가 붙은 `div`·탭 메뉴가 있는 문서(오버레이가 잘못 토글되지 않음)

공통 시나리오: 가져오기 → 읽기 → 진행률 저장 → 재실행 후 이어 읽기 → 오프라인 모드 재실행.

### 실기기 체크리스트 (수동)
- iOS 26 홈 화면 앱: 상단 띠 색이 문서 배경과 일치하는지, blur·겹침이 없는지, 페이지 이동 후 색이 갱신되는지, 노치·홈 인디케이터 영역 처리
- iOS 26 Safari 탭, Android Chrome(설치/미설치), Windows·macOS Chrome/Edge, macOS Safari
- 각 기기에서 대용량 ZIP(200MB 이상) 가져오기와 오프라인 재실행
