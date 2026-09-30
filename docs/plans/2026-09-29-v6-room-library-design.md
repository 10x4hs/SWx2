# v6 — 대화방 + 공통 창고 (2026-09-29)

요청: 셋이 같이 쓰는 DM, 이름을 부르면 끼어드는 AI, 책·URL·유튜브를 나누는 공통 창고.

## 결정
- **방은 하나**(셋 다 들어 있는 단체 대화). 1:1 은 안 만듦 — 셋뿐이고 "다같이" 가 요청.
- **실시간은 폴링**: 화면이 보일 때 3초, 숨겨지면 30초. Durable Object/WebSocket 은 세 사람에겐 과함. `since` 로 새 것만 받음.
- **AI 이름은 방 설정에 저장, 기본 "마피아"** (`@마피아`, `마피아,` `@ai` 로 부름). 이름은 대화방 머리에서 바꿀 수 있음.
- **AI가 보는 것**: 그 방의 최근 40개 메시지 + 창고 목록(제목·종류·누가 넣었나)만. **개인 노트·일기·계획·기록은 절대 안 봄** — 방은 셋이 공유하는 곳이라 방 안의 것만.
- AI 답은 서버가 메시지를 저장할 때 바로 만들어(Groq 우선, 순서 Groq → Gemini → Cohere → MiMo) `user_id = NULL, kind = 'ai'` 메시지로 같이 저장. 스트리밍 없음(2~4초). 실패하면 kind 'ai' 에 "지금은 답을 못 만들었어요" 저장하지 않고 400/502 로만 알림 → 화면이 재시도 버튼.
- **창고 항목**: `book | link | video`. URL 을 넣으면 서버가 메타데이터를 채움 — 유튜브는 oEmbed(키 없음), 일반 URL 은 og:title/og:image/og:description(HTML 앞 200KB 만, 3초 타임아웃, http(s) 만, 사설 IP 차단), 책은 Google Books 검색(키 없음)으로 저자·표지·ISBN 추천. 채우기 실패해도 제목만 있으면 저장.
- 창고 항목마다 멤버별 **표시**(`todo | doing | done` — 읽을래요 · 읽는 중 · 다 읽었어요/봤어요)와 짧은 **한 줄 메모**(공개). 댓글 스레드는 안 만듦 — 대화방에서 하면 됨: 항목의 "대화로 보내기" 가 `kind='share', ref_id` 메시지를 만들고, 대화에 URL 을 붙이면 "창고에 넣기" 버튼.
- 안 읽은 개수: Dock `대화` 아이콘 배지. 브라우저 알림(푸시)은 이번에도 안 함.
- 지우기: 내 메시지·내가 넣은 창고 항목만. 수정은 안 함(YAGNI).

## 데이터 (`migrations/0009_room.sql`)
```
room_settings(key TEXT PK, value TEXT)                         -- 'ai_name' → '마피아'
room_messages(id PK, user_id TEXT NULL REFERENCES users ON DELETE SET NULL,
              kind TEXT CHECK(kind IN ('text','ai','share','system')) DEFAULT 'text',
              body TEXT NOT NULL, ref_id TEXT, reply_to TEXT, created_at INTEGER)  -- INDEX(created_at)
room_reads(user_id PK REFERENCES users ON DELETE CASCADE, last_read_at INTEGER)
library_items(id PK, kind TEXT CHECK(kind IN ('book','link','video')), url TEXT, title TEXT NOT NULL,
              author TEXT, thumb TEXT, description TEXT, isbn TEXT, video_id TEXT, added_by TEXT REFERENCES users ON DELETE SET NULL,
              created_at INTEGER)  -- UNIQUE(url) WHERE url IS NOT NULL
library_marks(item_id REFERENCES library_items ON DELETE CASCADE, user_id REFERENCES users ON DELETE CASCADE,
              state TEXT CHECK(state IN ('todo','doing','done')), note TEXT, updated_at INTEGER, PK(item_id,user_id))
```

## API (전부 로그인 필요; 셋이 공유하는 데이터라 user 필터 없음)
- `GET /api/room?since=<ms>&limit=50` → `{ messages:[{id,user_id,kind,body,ref_id,reply_to,created_at}], ai_name, unread, now }`
  - `since` 없으면 최근 50개(오래된 것부터). `since` 있으면 그 뒤 것만.
  - `ref_id` 가 있는 share 메시지는 `item:{id,kind,title,thumb,url}` 같이 붙임.
- `POST /api/room { body, reply_to? }` → 201 `{ message, ai?: message }` — body 1~2000자. 본문이 AI 이름/`@ai` 를 부르면 `ai` 도 같이 옴(AI 답 실패 시 `ai_error: "..."` 문자열, 내 메시지는 저장됨).
- `POST /api/room/ai { message_id }` → AI 답 다시 시도 (같은 규칙) → `{ ai }`.
- `DELETE /api/room/:id` → 내 것만 200, 남의 것 403.
- `PUT /api/room/read { at }` → 안 읽음 0으로. `GET /api/room/unread` → `{ unread }` (Dock 배지용, 가벼움).
- `PUT /api/room/settings { ai_name }` → 2~12자, 셋 중 누구나 바꿀 수 있음, 바꾸면 `system` 메시지 "GYK가 AI 이름을 '마피아'로 바꿨어요".
- `POST /api/library/preview { url? , title?, kind? }` → 저장 없이 메타데이터만 `{ kind, url, title, author, thumb, description, isbn, video_id, candidates?:[…책 후보 3개] }`
- `GET /api/library?kind=&q=` → `{ items:[{…item, marks:[{user_id,state,note}], my:{state,note}|null}] }` 최신순.
- `POST /api/library { kind, url?, title, author?, thumb?, description?, isbn?, note?, share?:bool }` → 201 `{ item }` (`share` 면 방에 share 메시지도). 같은 URL 이 있으면 409 `{ error, item }`.
- `PUT /api/library/:id/mark { state|null, note? }` → `{ mark }`.
- `POST /api/library/:id/share` → 방에 share 메시지 → 201 `{ message }`.
- `DELETE /api/library/:id` → 넣은 사람만.
- 폴링 부담: `GET /room?since` 는 인덱스 한 번. `unread` 는 `COUNT(*) WHERE created_at > last_read_at AND (user_id IS NULL OR user_id != me)`.

## 화면 (`#/room`, `#/room/library`)
- Dock 7번째 **대화**(말풍선 둘, 배지). 순서: 검색 | 홈 · 캘린더 · 계획 | 노트 · 영어 · AI · **대화** | 타이머 · 프로필.
- 머리: `대화 | 창고` 탭. 대화 탭 오른쪽에 "AI 이름: 마피아 ✎".
- **대화**: 날짜 구분선, 같은 사람 연속 메시지는 묶음, 내 것은 오른쪽, AI 는 반짝이 아바타 + `.md` 렌더(기존 md.js), share 메시지는 카드(썸네일·제목·종류·"창고에서 보기"). 아래 입력창(Enter 보냄, Shift+Enter 줄바꿈), `@` 를 치면 AI 이름 자동완성 칩. URL 이 든 메시지 옆 "창고에 넣기". 보내는 동안 AI 답 기다리면 "마피아가 쓰는 중…" 점 세 개. 안 읽은 첫 메시지 위에 "여기부터 새 메시지".
- **창고**: 위에 URL/제목 입력 한 줄 + "미리보기" → 카드 미리보기(종류 자동: 유튜브 → video, 책 후보 → book, 나머지 link) → 저장(+ "대화에도 알리기" 체크). 필터 칩 전체·책·링크·영상, 검색. 카드 격자: 썸네일(없으면 종류 아이콘), 제목, 저자/도메인, 넣은 사람 아바타, 셋의 표시 점(todo 회색 · doing 반쪽 · done 채움), 내 표시 토글, 한 줄 메모, 영상은 카드에서 바로 재생(클릭 시 iframe `youtube-nocookie.com`).
- 색: UI 무채색. 종류 아이콘의 상징 부분만 `--c-*`(책 amber · 링크 blue · 영상 rose). AI 아바타는 기존 AI 반짝이 그라디언트.

## 파일 경계
- 백엔드: `src/room.js`(방 + AI), `src/library.js`(창고 + 메타데이터), `src/worker.js` 등록 두 줄, `migrations/0009_room.sql`, `scripts/smoke.mjs`, `README.md` 해당 절.
- 화면: `public/js/views/room.js`, `public/js/room/*`, `app.js`(NAV·route·배지), `icons.js`(room 글리프), `api.js`, `styles.css` v13 레이어, `DESIGN.md`.

## 1:1 추가 (같은 날 범위 변경)
셋 다 있는 방 `'all'` 옆에 **둘만의 1:1 방**을 둔다. 새 표는 없고 `room` 열 하나.

### 데이터
- `room_messages.room TEXT NOT NULL DEFAULT 'all'` + `INDEX(room, created_at)` (`created_at` 단독 인덱스는 이걸로 대신).
- 방 아이디: `'all'` | `dm:<uidA>:<uidB>` — 두 user id(UUID)를 **문자열 정렬**해서 작은 것이 앞. 정렬이 틀리면 400.
- `room_reads` PK → `(user_id, room)`. 방마다 따로 읽음.
- `ai_name` 은 계속 전역(방 공통). 이름 바꿈 system 메시지는 `'all'` 에만.

### 권한
- `'all'` 은 로그인한 누구나. dm 방은 아이디에 **내 id 가 든** 방만 → 아니면 **403** `{ error }`. 형식이 틀리면 400. dm 상대가 없는 사람이면 POST 때 404.
- `DELETE /room/:id` 는 그대로 내 것만(내 것이면 당연히 내 방).

### API 변화 (나머지는 위와 같음)
- 모든 `/room*` 이 `room` 을 받는다. 없으면 `'all'`. GET 은 쿼리, 쓰기는 body.
- `GET /api/room?room=&since=&limit=` → `{ room, messages:[{ …, room }], ai_name, unread, rooms:{ all:n, "dm:..":n }, now }` — `unread` 는 그 방 것, `rooms` 는 내가 들어갈 수 있는 방 전부(`all` + 다른 멤버마다 dm 하나, 0 도 포함).
- `POST /api/room { room?, body, reply_to? }` → 201 `{ message, ai?, ai_error? }`. AI 는 dm 에서도 부를 수 있고, 그 방의 최근 40개 + 창고 목록만 본다. AI 답도 같은 방에 저장.
- `POST /api/room/ai { message_id }` → 그 메시지의 방 멤버가 아니면 403.
- `PUT /api/room/read { room?, at? }` → `{ room, unread, rooms }`.
- `GET /api/room/unread?room=` → `{ room, unread, rooms, total }` (Dock 배지는 `total`, 방 목록 배지는 `rooms`).
- `POST /api/library { …, share?: true | "<room id>", room? }` — `share: true` 면 `room`(기본 `'all'`)에, 문자열이면 그 방에 share 메시지. 들어갈 수 없는 방이면 저장도 안 하고 403.
- `POST /api/library/:id/share { room? }` → 201 `{ message }` (`message.room` 포함).

### 화면 메모 (프론트)
- 방 목록: `all` + 멤버 둘(`GET /api/users` 로 id → `dm:` 아이디는 `[me, other].sort().join(':')` 앞에 `dm:`).
- 폴링은 지금 보는 방만 `since` 로, 배지는 `GET /room/unread` 의 `rooms`/`total`.
