# 캘린더 · 같이 하기 · 대화방 API

## 캘린더

`#/calendar` — 한 달 달력에서 날짜를 누르면 그날 한 페이지가 열려요. 앞으로 할 일을 날짜에 미리 적어 두고, 지난날은 일기와 그날 한 공부(끝낸 일 · 집중 시간 · 영어 · 노트 · 하루 점수)를 같이 봐요. API: `GET /api/calendar?from=&to=` (43일까지, 날마다 요약), `GET /api/calendar/day?day=` (그날 전부). 할 일 쓰기는 기존 `/api/plans` (scope `day`). 본인 것만 보여요. 날마다 `study_mins`(집중 기록 + 영어 분)도 같이 와요.

하루 계획표는 **그 칸만 스크롤**돼요(데스크톱은 그날 판이 화면에 붙어 있음). 겹치는 계획은 실제 시각으로 따져 나란히 놓고, 10분 뒤에 이어지는 계획은 위아래로 딱 붙어요. 짧은 계획은 뒤 계획 앞까지 늘려 한 줄로 보여요. 체크 옆 **빨간 ✕ = 못함**: 누르면 계획이 빨갛게 바뀌고(`PATCH /plans/:id {missed}` · 끝냄과 동시에 켜지지 않음 · 다른 날로 미루면 지워짐), 체크리스트 · 우클릭 메뉴 · AI 비서("못 했어로 표시해 줘")에서도 돼요.

## 같이 하기 (내용은 비공개, 숫자·상태만)

`src/together.js` · 표는 `migrations/0008_together.sql`. 서로에게는 **숫자와 상태만** 보이고, 계획 제목·일기·노트 내용은 여전히 본인만 봐요.

- **지금 공부 중**: `PUT /api/presence { state: "focus", ends_at, started_at? }` 또는 `{ state: "idle" }` (시각은 ms). `GET /api/presence` → `{ now, members: [{ user_id, focus, started_at, ends_at }] }` — `ends_at` 이 지나면 `focus: false`. 무엇을 공부하는지는 저장도 전송도 안 해요
- **응원 👏**: `POST /api/cheers { to }` → 201 · 오늘(한국 시간) 이미 했으면 409 · 나에게는 400 · 없는 사람은 404. `GET /api/cheers?day=` (기본 오늘) → `{ day, received: [{ from_id, created_at }], sent: [to_id] }`
- **할 일별 공부 시간**: `POST /api/logs` 에 `plan_id`(내 계획만, 남의 것 403 · 없는 것 400)를 달면 `GET /api/plans` 의 행마다 `focus_mins` 로 쌓여요. 계획을 지우면 기록은 남고 연결만 풀려요
- **하루 공부 시간** `study_mins` = 집중 기록 분 + 영어 분. 캘린더 · 회고 · 홈이 같은 정의를 써요
- **주간 회고**: `GET /api/review/week?week=2026-W40` (ISO 주, 월~일, 기본 이번 주) → `{ week, from, to, members: [{ user_id, plans_done, plans_total, focus_mins, english_mins, study_mins, diary_days, active_days, score_avg, cheers }], mine }` — 숫자는 셋 다, 회고 글(`mine`)은 나만
  - `POST /api/review/week/ai { week }` → `{ review: { body, created_at } }`. AI가 **내 기록만**(계획 제목·완료, 실행 기록, 영어, 하루 점수, 노트 제목)으로 4~8줄 회고를 써요. **일기는 읽지도 않아요.** 기록이 없는 주는 400, AI 키가 없으면 503, 30초 안에 다시 누르면 429
  - 일요일 22:00 (한국 시간, 크론 `0 13 * * SUN`)에 그 주 활동이 있는 사람 것을 미리 만들어 둬요. 그날 직접 만든 게 있으면 덮어쓰지 않아요

## 대화방 · 창고 (셋이 같이 쓰는 방 하나)

`#/room` · `src/room.js`, `src/library.js` · 표는 `migrations/0009_room.sql`. 방은 셋 다 들어 있는 `all` 하나와 둘만의 1:1 방 `dm:<uidA>:<uidB>`(두 아이디를 정렬). 실시간은 폴링(보일 때 3초, 숨기면 30초)이고 `since` 로 새 것만 받아요. `all` 은 **셋이 다 보는 것**, dm 방은 아이디가 든 둘만(남의 dm 방은 403). 모든 `/room*` 은 `room` 을 받고(GET 은 쿼리, 쓰기는 body), 없으면 `all` 이에요.

- **메시지**: `GET /api/room?room=&since=<ms>&limit=50` → `{ room, messages, ai_name, unread, rooms, now }`. `since` 없으면 최근 50개(오래된 것부터), 있으면 그 뒤 것만. `unread` 는 그 방, `rooms` 는 내가 들어갈 수 있는 방 전부의 안 읽음(`{ all: n, "dm:..": n }`). 메시지는 `{ id, room, user_id, kind, body, ref_id, reply_to, created_at }` 이고 kind 는 `text`(사람) · `ai`(AI, user_id null) · `share`(창고 항목, `item:{id,kind,title,thumb,url,video_id}` 가 같이 붙음 — 항목을 지웠으면 `item: null`) · `system`(이름 바꿈 알림)
  - `POST /api/room { room?, body, reply_to? }` → 201 `{ message, ai?, ai_error? }` (본문 1~2000자). 내 메시지는 먼저 저장되고, AI 이름이나 `@ai` 를 불렀으면 AI 답을 만들어 같은 방에 저장하고 `ai` 로 같이 줘요 (dm 방에서도 부를 수 있어요). AI 가 실패해도 201 이고 `ai_error` 문자열만 와요 (20초 넘으면 시간 초과)
  - `POST /api/room/ai { message_id }` → `{ ai }` AI 답 다시 시도. AI 를 부른 사람 메시지에만(아니면 400), 한 사람이 30초 안에 다시 누르면 429, 실패는 502/504
  - `DELETE /api/room/:id` → 내 것만 (남의 것·AI·system 은 403, 없으면 404). 수정은 없어요
  - `PUT /api/room/read { room?, at? }` → `{ room, unread, rooms }` 여기까지 읽음(뒤로는 안 감, 방마다 따로). `GET /api/room/unread?room=` → `{ room, unread, rooms, total }` Dock 배지는 `total`, 방 목록 배지는 `rooms`. 안 읽음 = 마지막으로 읽은 시각 뒤에 온 **남의** 메시지 수(AI·system 포함)
  - `GET /api/room/settings` → `{ ai_name }` · `PUT /api/room/settings { ai_name }` → `{ ai_name, message }`. 2~12자, `@`·띄어쓰기 불가. 셋 중 누구나 바꿀 수 있고(방 공통) `all` 방에 system 메시지가 남아요
- **AI 가 보는 것**: 부른 그 방의 최근 40개 메시지(이름 붙여서, dm 이면 그 둘의 것만) + 창고 목록(종류 · 제목 · 넣은 사람). **개인 노트·일기·계획·기록은 절대 보내지 않아요.** 회사 순서는 Groq → Gemini → Cohere → MiMo (`aiText` in `src/ai.js`). 기본 이름은 '마피아'
- **창고** `#/room/library`: 책 · 링크 · 영상(`kind`: `book | link | video`)
  - `POST /api/library/preview { url?, title?, kind? }` → 저장 없이 `{ kind, url, title, author, thumb, description, isbn, video_id, candidates?, warning? }`. 유튜브(watch · youtu.be · shorts · music)는 oEmbed 로 제목·채널·썸네일, 주소는 `https://www.youtube.com/watch?v=<id>` 로 통일. 일반 주소는 `<title>` · og:title/image/description 을 앞 200KB 만 3초 안에 읽어요. 제목만 주면 책 검색(Google Books → 안 되면 Open Library) 후보 3개. 바깥 서비스가 죽어도 200 + `warning` 이고 제목만으로 저장할 수 있어요
  - `GET /api/library?kind=&q=` → `{ items:[{ …item, marks:[{user_id,state,note}], my:{state,note}|null }] }` 최신순. `q` 는 제목·저자·설명 부분 일치
  - `POST /api/library { kind, url?, title, author?, thumb?, description?, isbn?, note?, share? }` → 201 `{ item, message? }`. 제목 200자, 주소 http(s) 2000자, 썸네일은 https 만. 같은 주소가 있으면 409 `{ error, item }`. `share: true` 면 `room`(기본 `all`)에 share 메시지도 (`message`), `share: "dm:..."` 처럼 방 아이디를 바로 줘도 돼요 — 들어갈 수 없는 방이면 저장 없이 403
  - `PUT /api/library/:id/mark { state|null, note? }` → `{ mark }`. state 는 `todo | doing | done`(읽을래요 · 읽는 중 · 다 읽었어요). state 만 보내면 메모는 그대로, `state: null` 이고 메모도 없으면 표시를 지워요(`{ mark: null }`). 메모만 남기는 것(state null + note)도 돼요
  - `POST /api/library/:id/share { room? }` → 201 `{ message }` (item 포함, 기본 `all`) · `DELETE /api/library/:id` → 넣은 사람만 (403), 지워도 방의 share 메시지는 남고 카드만 비어요
- 사설 주소 차단: Workers 는 DNS 를 못 풀어서 `localhost` · `127.x` · `10.x` · `192.168.x` · `172.16~31.x` · `169.254.x` · `::1` · `.internal` 은 호스트 이름 문자열로만 막아요 (아래 보안 메모)

