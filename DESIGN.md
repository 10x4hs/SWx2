# DESIGN.md — SWx2

> UI 를 고치기 전에 먼저 읽는 짧은 규칙서예요. **지금 배포된 코드에서 뽑았어요** (2026-11-16, PR #206 기준).
> 값은 `public/css/tokens.css`, 공통 컴포넌트는 `public/styles.css` (아래로 갈수록 나중 규칙 — 맨 끝 "Readability" 구역이 이겨요),
> 앱마다의 색표는 `public/css/<앱>.css` (그 화면에 들어갈 때 `js/view-loader.js` 가 불러요).

## 1. 분위기
- **무채색 유리 위에 색은 조금.** 배경은 로그인의 황금빛 구름 사진을 흑백 · 흐리게(`--wall`, `--wall-filter`) 깔고, 본문 판(`.main.glass`)은 Apple 식 반투명 유리 한 장(`--glass` + `--blur` + 얇은 밝은 테 + 위쪽 하이라이트, 그림자는 거의 없음).
- 버튼 · 메뉴 · 탭 · 칩은 흑백. **주 버튼 = 글자색 바탕**(`--accent` = `--ink`, 다크에선 흰 버튼에 검은 글자). 색은 차트 · 잔디 · 링 · 멤버 · 상태 점에만.
- **다크가 기본**이에요. 라이트는 사용자가 고르거나 기기 설정이 밝을 때.
- 앱 안의 공부 화면은 "종이 교과서" 느낌 — 별 · 유리 광채 · 네온 · 띄엄띄엄 쓴 영문 모노 라벨은 "AI 느낌"이라 안 써요.
- 그림은 설명할 때만. 장식용 그림 · 3D 는 없어요.

## 2. 색 토큰 (`tokens.css`)
라이트는 `:root`, 다크는 두 번 적혀 있어요 — `@media (prefers-color-scheme: dark) :root:not([data-theme="light"])` 와 `:root[data-theme="dark"]` (기기 설정 · 토글 둘 다 먹게). 새 토큰을 테마마다 다르게 하려면 **세 곳 모두** 고쳐요.

| 역할 | 토큰 | 라이트 | 다크 |
|---|---|---|---|
| 글자 | `--ink` `--ink-2` `--ink-3` | #1D1D1F · #424245 · #636368 | #F5F5F7 · 74% · 60% |
| 선 · 칸 | `--line` `--line-2` `--track` `--hover` | 검정 8% · 14% · 회색 12% · 10% | 흰색 10% · 18% · 10% · 8% |
| 유리 · 판 | `--glass` `--glass-2` `--glass-3` `--panel` `--paper` `--paper-solid` `--page-bg` | 흰 유리 | 먹색 유리 (`--glass-3` = 메뉴 · 창의 거의 불투명 판) |
| 주 버튼 · 선택 | `--accent` `--accent-soft` `--on-accent` `--on-ink` | = `--ink` | = `--ink` (위 글자 #151517) |
| 차트 색 | `--c-amber/green/blue/rose/violet/teal` (+ `--c-yellow` in styles.css) | 진한 톤 | 옅은 톤 |
| 시스템 원색 | `--sys-*` | Apple light | Apple dark — UI 에 직접 칠하지 말고 경고 · 상태에만 |
| 홈 링 | `--r-year/month/week/day` | `styles.css` v18 에서 덮어씀 (활동 링: 빨강 · 연두 · 하늘 · 주황, 라이트는 한 단계 진하게) |
| 멤버 | `--m0~2` | blue · amber · violet |
| 잔디 | `--g0~g4` | 빈 칸 + 초록 4단계 |
| 반경 | `--r-xs 4` `--r-sm 8` `--r-md 12` `--r-lg 18` `--r-xl 24` `--r-pill` · 판 `--r 22px` |
| 그림자 | `--e-1..4`, `--shadow` (드물게) |
| 고정 상태색 (두 테마 같음) | `--ok` `--ok-hi` `--warn-hi` `--info` `--danger` `--danger-hi` `--notify` `--violet-hi` `--switch-on` | 관리 화면 버튼 · 배지, 업데이트 점(주황), 설정 스위치(초록) |

- **화면 꾸미기**(`css/theme.css`, `js/theme.js`): `<html data-accent|wall|glass|solid|fx|font|size|radius>` 로 강조 색 12개 · 배경화면 · 유리 세기 · 글꼴 · 글자 크기 · 모서리를 바꿔요. 기본값이면 속성이 없어서 아무 규칙도 안 걸려요. 계정에도 저장돼요(`/api/apps/ui/state`).
- hex 를 새로 쓰기 전에 토큰부터 찾아요. 두 테마에서 같은 뜻 · 같은 값일 때만 토큰으로 바꿔요(라이트 전용 hex 를 `--ink` 로 바꾸면 다크에서 뒤집혀요).

## 3. 글자
- 글꼴: `--font` (SF Pro Text → Pretendard → Geist), 제목 `--font-display`, 숫자는 `tabular-nums`, 모노 `--mono` 는 시간 배지 · 코드 정도만.
- 본문 `body { font: 400 15px/1.65 }`. 대문자 · 넓은 자간 라벨은 안 써요(한글).
- **크기 단계 (공통 시트는 이것만):**

| 토큰 | 값 | 쓰임 |
|---|---|---|
| `--fs-2xs` | 11px | 캡션 · 메타 · 배지 — **바닥** |
| `--fs-xs` | 12px | 작은 메타, 칩 숫자 |
| `--fs-sm` | 12.5px | 라벨 · 작은 본문 — **UI 글자의 바닥 (PR #198)** |
| `--fs-md` | 13px | 메뉴 · 목록 줄 |
| `--fs-base` | 14px | 기본 UI, 버튼 |
| `--fs-lg` | 15px | 읽는 본문 |
| `--fs-xl` | 16px | 구역 제목, 폰 입력칸(iOS 확대 방지) |
| `--fs-2xl` / `--fs-3xl` / `--fs-4xl` | 18 / 20 / 24px | 판 제목 · 화면 제목 · 페이지 제목 |

- **최소 크기 규칙:** 캡션 · 메타 ≥ 11px, UI · 본문 라벨 ≥ 12.5px. 홈 링 SVG 처럼 줄어 그려지는 곳은 화면에 보이는 크기로 따져요(`.rh-hour` 폰 21px).
- 단계 밖 크기(17 · 19 · 21 · 22 · 26 · 30px 이상의 큰 숫자 · 제목)는 일부러 둔 것 — 새로 만들 땐 단계부터 써요.
- 앱별 시트(news · mba · psy · dev · svm · cim · easy · papers)는 자기 활자 크기를 따로 가져요.

## 4. 간격 · 배치
- 간격은 4px 단위(4 · 8 · 12 · 16 · 20 · 24). 판 안 카드는 유리를 겹치지 않고 `--glass-3` / `--panel` / `--lg-fill`.
- 폭: 860px 이하 = 폰 배치(Dock 이 아래 가로줄), 1100px 이하 = 두 칸 → 한 칸.

## 5. 컴포넌트
- **Dock** (`.rail.dock`, `js/app.js` 의 `NAV`): 왼쪽 세로 · 폰은 아래 가로. 아이콘은 실제 앱 그림(`/assets/dock/*`), Plan 은 오늘 날짜 달력. **마우스를 올리면 이름 한 단어만**(설명 없음). 지금 화면 = 아이콘 아래 점 + 테두리. 자동 숨김 · 확대 · 폴더 · 끌어서 순서 바꾸기 · 더보기(못 여는 앱)는 각자 `js/dock-*.js`. Dock 앱은 마지막 화면 · 스크롤로 다시 열려요(Plan 은 늘 오늘).
- **카드 · 판**: `.glass`(본문 판) · v16 `--lg-fill / --lg-edge / --lg-top` 유리 질감을 달력 칸 · 카드 · 입력칸 · 버튼 · 탭에 똑같이.
- **버튼** `.btn`: 글자색 바탕 · 반경 12px. `.btn.ghost` 테두리만, `.btn.sm` 작게, `.btn.danger` 빨간 글자.
- **칩** `.chip`: 알약, `--fs-xs` 600. `.good`(먹 바탕) · `.warn` · `.bad`(테두리만) · `.accent`.
- **탭** `.seg`: 알약 묶음, 고른 것만 `--lg-fill-hi` + 살짝 그림자.
- **메뉴** `.cm`(우클릭 · 칸 메뉴) · `.me-menu`(프로필): `--glass-3` 판, 반경 14px, 줄 `--fs-md`.
- **⋯ 버튼** `.row-more` (`css/actions.css`, `js/row-more.js`): 컴퓨터는 칸에 올리거나 초점이 오면 보이고, 폰 · 터치는 늘 보여요.
- **시트**: 폰에서 아래에서 올라오는 판(`#dp-sheet`, `.slot-sheet`) + 뒤 검정 50% 막. 공지 창 `.ann-sheet`.
- **토스트** `.toast`: `--glass-3` 판, 오류는 `--err` 바탕 + 흰 글자.
- **집중 섬** (`css/island.css`): 맨 위 가운데 검은 알약 — 라이트 · 다크 모두 검정. 쌓는 순서: 사칭 띠 → 섬 → 공지 → 체험 띠.
- **포커스 고리**: 하나로 통일 — `outline: var(--focus-w) solid var(--focus-c)` (2px, 강조 색). 큰 글쓰기 칸 · 메뉴 줄은 안쪽(`outline-offset: -2px`). `outline: none` 만 하고 대신할 표시가 없으면 안 돼요.

## 6. 움직임
- `--ease` (cubic-bezier(.22,1,.36,1)), `--d-fast 120ms` · `--d-base 200ms` · `--d-slow 360ms`.
- 화면 바뀜 = 짧은 투명도 + 살짝 올라옴(흐림 없음). 끝없이 도는 장식 애니메이션 없음. 판 크기를 애니메이션하지 않아요.
- **`prefers-reduced-motion: reduce` 이면 모든 transition · animation 을 꺼요** (`styles.css` 의 전역 규칙) — JS 움직임(Dock 확대, 차트 넘기기)도 이걸 보고 바로 바꿔요.

## 7. 앱별 색표 (자기 바탕 · 자기 색, 앱 테마 · 꾸미기와 따로)
| 앱 | 시트 | 모양 |
|---|---|---|
| News `#/news` | `news.css` (`.gn`, `--g-*`) | **일부러 어두운 영어 신문** — 따뜻한 먹색 바탕, 청록 강조 하나, 점선 단 격자, 글꼴 하나. UI 글자도 영어. 라이트 테마 없음 |
| MBA `#/mba` | `mba.css` | 검정 바탕 · 흰 글자 · 진도와 데이터에만 라임 · 손실 빨강, Geist Mono 영문 라벨 |
| Psychology `#/psy` | `psy.css` (`.ps`) | 어두운 바탕 하나 · 가는 선 · 보라 `#9B87FF` · AI 수치 주황, IBM Plex Mono |
| Code Flow `#/sw` | `dev.css` (`.dv`) | 따뜻한 종이 교과서 · 먹색 글 · 잉크 파랑 + 형광펜 노랑, 명조 제목. [밤] 버튼으로만 어둡게 |
| SVM `#/svm` (관리자) | `svm.css` (`.sv`) | 검정 + 점 격자 · 라임, 머리줄 [DAY] 로만 밝게 |
| CIM `#/cim` | `cim.css` | 흑백 + 형광 라임은 '지금 누를 것'에만, 빨강은 오답. 이 앱만 앱 테마(라이트/다크)를 따라요 |
| 쉽게 읽기 · 논문 | `easy.css` (`.ezw`) · `papers.css` | 밝은 종이, 파이프라인 단계 색 |

- 이 화면들은 바탕이 불투명(`!important`)이라 배경화면 · 유리 · 강조 색 설정이 닿지 않아요.
- **MBA · News · Psy · Code Flow · SVM 에 라이트 테마를 새로 만들지 않아요** (사용자가 뺀 일).

## 8. 정해진 것 (바꾸기 전에 물어보기)
- Dock 이름표 = 이름만. News = 어두운 영어 신문. 공부 화면 = 종이 교과서, "AI 빛" 금지. 그림은 설명할 때만.
- `data-go` 속성 쓰지 않기. UI 글은 쉬운 한국어(해요체), 뉴스만 영어.
- 유리 위에 유리 겹치기 · 카드마다 그림자 · UI 에 채도 높은 원색 · 한 화면에 주인공 둘 — 하지 않아요.

## 9. 고칠 때 확인
- 색 · 크기 · 반경은 토큰으로. 공통 시트의 남은 hex 는 대부분 앱별 · 꾸미기 색표(`theme.css`, `blocks.css` 태그 색)예요.
- CSS 만 바꿨으면 `scripts/visual-diff.mjs` 로 전/후 픽셀 비교(홈 · Plan · 노트 · Obsidian · 설정 · Study · 뉴스 · Dock, 컴퓨터/폰 × 라이트/다크).
- 읽기 규칙 검사: `scripts/e2e-read.mjs` (read-type · read-focus · read-motion).
