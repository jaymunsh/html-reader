<p align="center">
  <img src="public/__app/icons/icon.svg" width="112" height="112" alt="HTML Reader 아이콘">
</p>

<h1 align="center">HTML Reader</h1>

<p align="center">ZIP으로 묶인 HTML 문서를 브라우저에서 연 것처럼 그대로 읽는 오프라인 PWA</p>

<p align="center"><a href="https://html-reader-kohl.vercel.app"><b>앱 열기 →</b></a></p>

<p align="center"><a href="README.md">English</a> · <b>한국어</b></p>

---

ZIP으로 묶인 HTML 문서 묶음(사내문서, 리포트, 오프라인 웹 교재, 직접 만든 HTML 산출물 등)을 PC(macOS·Windows)와 모바일(iOS·Android)에서 일반 브라우저와 동일하게 동작시키며 읽는 PWA입니다. 단일 HTML이 아니라 디렉터리 단위로 페이지 이동, JS·CSS·JSON·폰트·이미지·미디어 등 상대경로 리소스가 모두 동작합니다. 한 번 접속하면 오프라인에서도 쓸 수 있습니다. 스택은 Svelte 5 + Vite, Service Worker, IndexedDB입니다.

## 주요 기능

- **원본 그대로 동작**: 페이지 간 링크, `fetch()`로 읽는 JSON, ES module, CSS `url()`·`@font-face`, 루트 절대경로(`/css/a.css`), EUC-KR 문서까지 그대로 동작합니다.
- **이어 읽기**: 페이지별 읽기 진행률을 저장하고, 마지막으로 읽던 위치에서 다시 엽니다.
- **찾기**: 파일 목록 패널, 빠른 스크롤 핸들, 문서 전체 텍스트 검색.
- **읽기 편의**: 북마크(삭제 되돌리기), 글자 크기 조절, 라이트·다크 앱 테마, 키보드 단축키(PC).
- **뒤로 가기**: 브라우저·Android 뒤로 가기는 한 번에 리더에서 서재로 나옵니다(열린 시트가 있으면 먼저 닫음). 문서 자체의 이전 링크는 문서 안에서 움직입니다.
- **서재 관리**: 수정본 재가져오기(교체), 문서명 수정, 서재 검색·정렬.
- **바로 열기**: PC 설치 앱은 파일 연결, Android 설치 앱은 공유로 바로 가져옵니다.
- **오프라인·로컬 전용**: 한 번 접속하면 오프라인에서도 동작하고, 문서는 서버로 올라가지 않고 기기에만 저장됩니다.
- **화면 공간**: 모바일에서는 평소에 문서만 보이고, PC(폭 768px 이상)는 상단 바와 파일 패널을 상시 표시합니다(`T`로 패널 접기). iOS 26 상단 상태바에 문서가 비치지 않도록 단색으로 칠합니다. 리더에서는 기본으로 문서 배경색을 따르고, 설정 → 리더 상단 색에서 앱 색으로 바꿀 수 있습니다.

## 개발 명령

| 용도 | 명령 |
|---|---|
| 단위 테스트 | `npm test` (= `vitest run`), 단일 파일 `npx vitest run tests/unit/<name>.test.ts` |
| 타입 검사 | `npm run check` (= `svelte-check && tsc --noEmit`) |
| 빌드 | `npm run build` (agent → 앱), `npm run build:v2` (업데이트 테스트용 두 번째 빌드) |
| 픽스처 생성 | `npm run fixtures` (= `node scripts/make-fixtures.ts`, Node 26 타입 스트리핑) |
| E2E | `npm run e2e` (= `playwright test`), 단일 `npx playwright test tests/e2e/<name>.spec.ts --project=chromium` |
| 번들 예산 | `npm run size` (= `node scripts/check-size.mjs`) |
| 앱 아이콘 | `node scripts/make-icons.mjs` (`public/__app/icons/icon.svg`로 PNG 생성) |
| 글꼴 조각 | `python3 scripts/subset-fonts.py` (`fonttools`, `brotli` 필요. `scripts/font-src/PretendardVariable.woff2`를 `public/__app/fonts/`의 unicode-range 파일들로 나눔) |

E2E는 항상 프로덕션 빌드를 `tests/server/static-server.mjs`로 띄워서 돌립니다(dev 서버 사용 안 함). 이 서버는 `vercel.json`의 rewrite를 똑같이 흉내 냅니다.

Playwright 프로젝트: `chromium`(Desktop Chrome), `webkit`(Desktop Safari), `mobile-chromium`(Pixel 7), `mobile-webkit`(iPhone 15), `update`(Chromium, 포트 4174, 직렬). 스펙 파일명에 `.desktop.`이 있으면 데스크톱 2개, `.mobile.`이 있으면 모바일 2개 프로젝트에서만 돌고, 그 외는 4개 모두에서 돕니다.

## 배포

Vercel 정적 배포입니다. `npm run build`가 `dist/`를 만들고, 그 폴더를 배포합니다. Service Worker와 PWA 설치는 HTTPS가 필수입니다(localhost 제외).

`vercel.json`:
- rewrite `/book/:path*` → `/__app/no-sw.html`: Service Worker가 아직 제어하지 않는 상태에서 문서 주소로 들어오면 안내 폴백 페이지를 보여 줍니다.
- rewrite `/(.*)` → `/index.html`: 그 외 모든 경로는 앱 셸로 보냅니다.
- 헤더: `/sw.js`와 `/index.html`에 `Cache-Control: no-cache`. 새 버전을 배포했을 때 브라우저가 SW와 앱 셸을 항상 다시 확인하도록 하기 위함입니다.

## 알려진 제약

범위 밖:
- 기기 간 동기화 없음. 문서와 진행률은 각 기기에만 저장됩니다.
- 진행률·북마크 백업 내보내기/가져오기 없음.
- 폴더 직접 선택, URL로 불러오기 없음. 가져오기는 ZIP과 단일 HTML 파일만 지원합니다.
- 강제 다크모드, 하이라이트 없음.
- 설치 폰트를 이름으로만 참조하는 문서의 감지·대체 없음.
- 가져오기 시점의 정적 참조 검사 없음. 누락 리소스는 읽는 중 실제 요청 결과로만 보고합니다.
- ZIP 파일명 인코딩은 UTF-8·CP949만 지원합니다(Shift-JIS 등 제외). 암호화 ZIP, Deflate64 압축도 지원하지 않습니다.
- 해시 라우팅 SPA 문서는 화면 단위가 아니라 HTML 파일 1개 = 페이지 1개로만 진행률을 추적합니다.
- 네이티브 래퍼(Capacitor/Tauri), 앱스토어 배포 없음.
- 문서 간 완전한 보안 격리 없음(아래 참고).

수용한 제약:
- 영상은 "재생되면 된다" 수준입니다. Range 요청은 지원하지만(다중 범위는 첫 범위만 응답) 대용량 영상 최적화는 하지 않으며, 수백 MB 이상의 영상은 iOS에서 느리거나 재생이 실패할 수 있습니다.
- 가장 큰 단일 엔트리(예: 수백 MB 동영상)는 메모리에 모이므로, iOS에서 메모리 부족으로 가져오기가 실패할 수 있습니다. 이 경우 가져오기를 롤백하고 원인을 안내합니다.
- 문서의 JS는 앱과 같은 출처에서 실행됩니다. 앱은 문서가 실수로 리더를 망가뜨리지 못하게 막는 가드(SW 등록·해제, localStorage/sessionStorage 접두사, 앱 소유 Cache Storage·IndexedDB 접근 차단)만 설치합니다. 악의적인 문서는 가드를 우회해 다른 문서의 데이터에 접근할 수 있으므로 직접 가져온 신뢰할 수 있는 문서에만 쓰세요(첫 가져오기 화면에도 고지). 쿠키는 격리하지 않아 문서끼리 공유될 수 있습니다.
- iOS는 Safari 탭과 홈 화면 앱의 저장소가 분리됩니다.

## 실기기 확인 체크리스트

자동 테스트로 검증할 수 없는 항목입니다.

- [ ] iOS Safari 탭: 서재 화면에서 상단 바 색이 앱 배경색(#EEF0F4 / 다크 #101216)이고 스크롤해도 내용이 비치지 않는다
- [ ] iOS Safari 탭: 리더 화면에서 상단 바 색이 문서 배경색과 같고(배경이 없으면 흰색/다크 검정, 설정 → 리더 상단 색 → 앱 색이면 앱 배경색) 문서 내용이 상태바 아래로 비치지 않는다
- [ ] iOS 홈 화면 앱: 위 두 항목이 같고, 상태바 글자(시계)가 라이트·다크 모두에서 보인다
- [ ] iOS 홈 화면 앱: 하단 홈 인디케이터가 문서 위에 겹쳐 보이고 별도 여백 띠가 없다
- [ ] iOS Safari 탭에서 가져오기를 누르면 홈 화면 추가 안내가 먼저 뜬다
- [ ] iOS: Safari 탭에서 가져온 문서가 홈 화면 앱에는 보이지 않는다(저장소 분리 — 정상)
- [ ] iOS·Android: 두 손가락 확대(핀치)가 문서에서 동작한다
- [ ] iOS·Android: 동영상이 든 문서에서 영상이 재생되고 탐색(seek)이 된다
- [ ] 비행기 모드에서 앱을 다시 열어 문서를 읽을 수 있다
- [ ] Android: 파일 패널이나 검색이 열린 상태에서 뒤로 가기를 누르면 그것부터 닫히고, 다음 뒤로 가기에 서재로 돌아온다
- [ ] Android(설치 앱): 파일 관리자에서 ZIP을 공유 → HTML Reader를 고르면 가져오기가 진행된다 (파일 관리자 2종 이상)
- [ ] Android(설치 앱): 큰 ZIP 공유가 실패하면 "앱에서 직접 가져오기를 이용하세요" 안내가 뜬다
- [ ] Windows/macOS Chrome·Edge(설치 앱): .zip/.html 파일을 "연결 프로그램 → HTML Reader"로 열면 가져오기가 진행된다
- [ ] 새 버전을 배포한 뒤: 리더를 읽는 동안에는 바뀌지 않고, 서재로 돌아오면 적용된다
