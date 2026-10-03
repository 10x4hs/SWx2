# v5 — 정리 + 같이 하기 (2026-09-29)

사용자 승인: 제안 1~5 진행, 6(내보내기) 제외.

## 1. 첫 로그인 때 비밀번호 바꾸기
- `users.must_change_pw INTEGER NOT NULL DEFAULT 0`. 마이그레이션에서 기존 사용자 전부 1 (지금 셋 다 임시 비밀번호).
- `scripts/add-user.mjs` 로 스터디장이 비밀번호를 정하면 1. `POST /api/auth/password` 성공하면 0.
- `publicUser` 에 `must_change_pw: boolean`. `PASSWORDLESS=1`(로컬)이면 항상 false.
- 서버 강제: must_change_pw=1 이면 인증 API 중 `/me`, `/users`, `/auth/*` 말고는 `403 { error, must_change_password: true }`.
- 화면: 들어오자마자 닫을 수 없는 비밀번호 창(취소 대신 "로그아웃"만). API 403 must_change_password 를 받아도 이 창.

## 2. 툴바 정리 (10 → 6)
- Dock: 검색 | 홈 · 캘린더 · 계획 | 노트 · 영어 · AI | 타이머 · 프로필.
- 오늘 · 일기 · 기록은 캘린더로: `#/today[/d]`, `#/diary[/d]`, `#/records[/d]` → `#/calendar/d` (기록·일기 잔디는 캘린더의 `연` 보기).
- 캘린더 그날 페이지 = 예전 오늘 화면 전부(목표 · 시간표 · 실행 기록 · 일기 · 점수) + 그날 한 공부 요약 + 하루 기록 저장. 앞으로 올 날은 할 일·시간표만.
- 캘린더 머리: `월 | 연` 전환. 연 = 한 해 잔디(일기 | 기록 탭, 누르면 그날로).
- 그래프는 노트 안의 탭(`노트 | 그래프`). `#/graph` 는 그대로 쓰되 Dock 에선 노트가 켜짐.
- 홈 링을 누르면 가던 `#/today` 도 캘린더로.

## 3. 같이 하기 (내용은 계속 비공개, 숫자·상태만)
- **지금 공부 중**: `presence(user_id PK, state 'focus'|'idle', started_at, ends_at, updated_at)`.
  - `PUT /api/presence { state: 'focus', ends_at }` | `{ state: 'idle' }` — 타이머 시작·일시정지·끝·처음으로 에서.
  - `GET /api/presence` → `{ now, members: [{ user_id, focus: bool, started_at, ends_at }] }` (ends_at 지나면 focus=false). 무엇을 하는지는 안 보냄.
  - 홈 멤버 칩에 "공부 중 · 32분째" (60초마다 새로고침).
- **응원 👏**: `cheers(from_id, to_id, day, created_at, PK(from_id,to_id,day))`.
  - `POST /api/cheers { to }` → 201 / 409(오늘 이미) / 400(나에게). `GET /api/cheers?day=` → `{ received: [{ from_id, created_at }], sent: [to_id] }`.
  - 다른 사람 차트를 볼 때 👏 버튼(하루 한 번). 받은 응원은 홈에 작게.
- **주간 회고**: 홈 차트 넘기기에 5쪽 "우리 셋".
  - `GET /api/review/week?week=2026-W40` → `{ week, from, to, members: [{ user_id, plans_done, plans_total, focus_mins, english_mins, study_mins, diary_days, active_days, score_avg, cheers }], mine: { body, created_at } | null }` — 숫자는 셋 다, 글은 나만.
  - `POST /api/review/week/ai { week }` → AI가 **내 기록만**으로 한 주 회고(계획 제목·완료, 실행 기록, 영어, 노트 제목). **일기 본문은 절대 안 보냄**(일기 화면이 약속한 것). `weekly_reviews(user_id, week, body, created_at, PK)` 에 저장.
  - 크론 일요일 22:00 KST(`0 13 * * SUN`)에 활동 있는 사람 것 미리 만들기. 기존 `5 15 * * *` 과 같이 `scheduled` 에서 `event.cron` 으로 나눔.

## 4. 공부 시간 하나로
- `logs.plan_id TEXT` (내 계획만). `POST /api/logs` 가 `plan_id` 받음.
- `GET /api/plans` 행마다 `focus_mins` (그 계획에 쌓인 집중 합).
- 할 일 옆 ▶ → 타이머가 그 할 일 이름·id 로 시작, 끝나면 `plan_id` 달린 집중 기록.
- 하루 공부 시간 = 집중 기록 + 영어 블록 분. 캘린더·회고·홈이 같은 정의(`study_mins`).

## 5. 폰 앱처럼 (PWA)
- `manifest.webmanifest`, 아이콘 PNG(192·512·maskable·apple 180), `sw.js`, `js/pwa.js`, `_headers`.
- 서비스 워커: 정적 파일 stale-while-revalidate, `/api` GET 은 network-first + 캐시 대체, 쓰기·`/api/auth` 는 절대 캐시 안 함.
- 로그아웃하면 API 캐시 삭제 — 앱이 `window` 에 `trio:signed-out` 이벤트를 쏘고 pwa.js 가 SW 에 알림.
- 오프라인이면 위에 "오프라인 · 마지막으로 본 내용" 띠.
- 알림(Web Push)은 이번에 안 함.

## 파일 경계 (에이전트)
- 백엔드: `src/**`, `migrations/0008_together.sql`, `scripts/smoke.mjs`, `scripts/add-user.mjs`, `wrangler.jsonc`(크론), `README.md`(해당 부분).
- 화면: `public/js/**`(pwa.js 제외), `public/styles.css`, `DESIGN.md`.
- PWA: `public/manifest.webmanifest`, `public/sw.js`, `public/icons/**`, `public/js/pwa.js`, `public/css/pwa.css`, `public/index.html`(head + 스크립트 한 줄), `public/_headers`.

## 결과 (2026-09-29 배포)
- 스모크 136 PASS / 0 FAIL. 0008 원격 적용, 크론 `5 15 * * *` + `0 13 * * SUN`.
- 배포 확인: 세 계정 must_change_pw=1(첫 로그인 때 변경), 임시 계정으로 차단 403 → 변경 → 200 확인 후 삭제.
- 남은 것: 예전 뷰 CSS 정리, 일시정지 후 "n분째" 다시 셈, ▶ 는 오늘만, 노트 머리 버튼 줄바꿈, iOS 라이트 테마 상태바 대비.
