# SWx2

세 명이 함께 쓰는 공부 플래너 + 옵시디언식 노트. Cloudflare Workers + D1.

- **오늘**: '오늘의 목표' 창과 '시간표' 창을 나눔, 06–24시 시간 블록 플래너, 체크하면 실행 기록에 시간순으로 남음, 데일리 노트, 오늘 점수(계획 40 + 실행 60), 어제 못 한 일 가져오기, 내일로 미루기, 연속 달성일
- **캘린더 (계획 포함)**: 따로 있던 계획 페이지는 캘린더와 겹쳐서 없앴어요(`#/plans` 는 캘린더로 보내요). 그날 판에 **체크리스트**(시간 있는 계획도 시각 순으로 · 시간 칩), **목표**(이번 주 · 이번 달 · 올해 — 적기 · 체크 · 지우기, 홈 링이 이걸로 칸이 나뉘어요), **AI에게 시키기**, **일기** 카드가 있어요.
- **할 일 우선순위 · 5분 시간표**: 할 일마다 **Low · Medium · High · XHigh · Max** (색 다름, 알약을 누르면 다음 단계). 시간 없는 할 일은 높은 순으로. 시간표는 한 시간 96px(5분 = 8px), 마우스 위치의 5분 단위 시각으로 바로 추가, 시작 시각·걸리는 시간도 5분 단위.
- **하루 점수 (AI)**: 자정(00:05 크론)에 AI 가 그날 계획(우선순위 · 시간 · 끝냄)과 집중 시간을 보고 **0~100 점 + 한 줄 평**을 `day_records.ai_score / ai_note` 에 기록해요. AI 가 안 되면 계산식 점수(계획 35 + 실행 65, 우선순위 × 시간 무게)로 대신 기록. 크론이 못 돈 날은 다음에 앱을 열 때 뒤에서 채워요. 그날 판 '하루 점수' 카드: 유리 링(지난날 = AI 점수, 오늘 = 미리보기), **우선순위 색 차트**, AI 한 줄 평, 최근 14일 흐름.
- **캘린더 그날 판**: AI 입력창과 **하루 계획표**(5분 단위)만. 빈 시각을 누르면 그 자리에 떠 있는 추가 창(칸 높이는 그대로), 블록은 **잡고 끌면 옮기기**, **위·아래 가장자리를 끌면 길이 조절**(5분 단위, 놓으면 저장). 체크리스트 · 목표 · 점수 · 일기는 각자 자리(체크리스트 페이지 · 목표 페이지 · 홈 차트)에서.
- **홈 차트**: **All · Month · Week · Day · Trio · CheckList**. Month · Week 차트는 어디를 눌러도 그 기간 목표 페이지(달치만 · 주치만), Day 차트와 All 의 오늘 링은 시간 순 하루 계획표(캘린더), CheckList 는 체크리스트 페이지. 색은 OKLCH 로 밝기 · 채도를 맞춘 로즈 · 세이지 · 스카이 · 샌드(링)와 슬레이트 → 로즈 온도 계단(우선순위). 홈은 계획을 요청 한 번(`GET /plans?periods=…&days=from..to`)으로 받아요. 체크리스트 쪽 = 오늘 할 일을 우선순위 색 도넛으로(얼마나 했는지) + 단계별 막대 + 남은 할 일 + 이번 주 날마다 막대. 차트의 모든 부분을 누르면 편집하는 곳으로: 링 → 목표 페이지, 오늘 링 · 도넛 · 날짜 칸 → 그날 체크리스트. 색은 애플 활동 링처럼(올해 #FA114F · 이번 달 #92E82A · 이번 주 #1EEAEF · 오늘 #FF9F0A), 트랙은 같은 색의 옅은 버전, 숫자는 둥근 시스템 글꼴.
- **All 의 체크리스트 링**: 가장 안쪽 링 = 오늘 할 일(칸 색 = 우선순위, 끝낸 칸은 진하게), 오른쪽 줄에 '체크리스트 2/5 · Max 1/1'. 누르면 체크리스트. 링이 5개일 땐 조금 가늘게, 숫자 줄은 46px 간격.
- **AI 어디서나**: 체크리스트 · 주 · 월 · 년 목표 페이지마다 AI 입력창. 그 페이지 기준으로 알아들어요('이번 주 목표 3개 짜 줘' → 이번 주 목표 3개, '자격증 1회독 넣어 줘 급해' → 이번 달 목표 Max). `POST /ai/command` 에 `scope`·`period` 를 넘겨요.
- **뒤로 가기**: 체크리스트 · 목표 · 캘린더 왼쪽 위 ‹ (앱 안에서 왔으면 이전 화면, 바로 들어왔으면 홈).
- **체크리스트 ≠ 하루 계획**: 하루 계획 = 시각이 있는 일정(캘린더 계획표 · 홈 '오늘' 링 · Day 차트), 체크리스트 = 시각 없는 해야 할 일(체크리스트 페이지 · 홈 CheckList · 체크리스트 링). AI 비서도 '9시 반에 ○○' 는 계획표, '할 일로 ○○' 는 체크리스트로 넣어요.
- **우클릭 메뉴**: 계획표 블록 · 체크리스트 · 목표 목록에서 우클릭 → 편집(계획표는 이름·시각·길이·우선순위를 떠 있는 창에서) · 끝냄 · 우선순위 알약 · 다음 날로 · 삭제 (`public/js/ctxmenu.js`).
  **노트 · Brain**(왼쪽 노트 목록 · Brain 그래프 점 · Brain 목록, 폰은 길게 누르기, 키보드 Shift+F10): Open · Rename(내 다른 노트의 `[[링크]]` · `[[링크|별칭]]` 도 새 제목으로, 기록은 남겨요) · Edit · New sub-note · Move to…(나와 하위는 빼고, 고리는 서버가 400) · Delete(바로 빠지고 5초 동안 Undo, 하위는 지운 노트의 부모 밑으로). 큰 개념 5개 · Unsorted 는 Open · New sub-note 만, 공부 점은 Open 만 (`public/js/note-menu.js`).
- **체크리스트 페이지** (`#/checklist[/날짜]`): 홈의 '오늘' 링을 누르면 열려요. **우선순위 색 유리 도넛**(단계마다 호 · 끝낸 몫은 진하게 · 가운데 끝낸 수/전체) + 단계별 막대, 목록(체크 · 시각 칩 · 지난 시각은 빨갛게 · 우선순위 알약 · 두 번 눌러 고치기 · 지우기), 입력 한 줄(시각 · 걸리는 시간 · 우선순위는 선택). **여러 줄을 붙여 넣으면 한 번에** (`- `, `1.`, `[ ]` 머리표는 떼요). 그날 판 체크리스트의 '크게 보기'로도 와요.
- **목표 페이지** (`#/goals/week|month|year[/기간]`): 홈 링을 누르면 열려요. 큰 제목 · 진행 막대(기간 경과 표시) · 목표 목록(체크 · 우선순위 · 두 번 눌러 고치기 · 지우기) · 아래 입력 한 줄. 이전·다음 기간으로 넘기기. 옛 `#/plans/*` 주소도 여기로 와요.
- **홈**: 링 차트가 유리 질감(반사광 · 테 · 가운데 원판), '오늘' 줄 아래에 **AI 챗봇**(묻거나 "9시 반에 영어 수업 넣어 줘" 처럼 시키기).
- **대화방 스크롤**: 인스타 DM 처럼 머리와 입력창은 제자리, 대화 목록만 스크롤(최신 메시지부터).
- **실시간 대화**: Durable Object `RoomHub`(`src/hub.js`) 가 브라우저마다 웹소켓 하나를 붙잡고, 메시지가 저장되면 그 방 사람에게 신호만 보내요 → 화면이 바로 새 메시지를 받아요(보통 0.1초). 끊기면 예전처럼 3초 폴링. **@친구이름** 으로 부르면 강조되고, 알림 제목이 "○○님이 불렀어요".
- **쓰던 글 유지**: AI 튜터 · 계획 AI · AI에게 시키기 · 대화방(방마다) · AI로 만들기 입력창은 다른 화면에 갔다 와도 그대로 (`public/js/draft.js`, 보내면 지워요).
- **배포 반영**: 서비스 워커가 js·css·html 을 먼저 서버에서 받아요(ETag 304 라 가벼움) → 배포 후 새로 고침 한 번이면 새 버전.
- **일기 페이지** (`#/calendar/diary/<날짜>`): 줄 공책 편집기(기분 5단계 · 자동 저장 · 나만 봄), 옆에 그날 계획 체크 상태와 지난 일기 목록. 전날·다음날로 넘기기.
- **노트**: Notion 식 블록 편집기(문서 전체가 한 편집 영역이라 여러 줄을 긁어 지우기·옮기기가 그대로 됨. 도구 막대 없이 `/` 메뉴만 — 제목1~3·목록·번호·할 일·인용·코드·구분선·페이지·노트 링크·AI, 글자를 긁으면 작은 서식 도구, `[[` 자동완성, URL 링크, 왼쪽 ⋮⋮ 끌어 순서 바꾸기), 하위 **페이지**(부모 › 자식 경로), 편집기 안 **AI에게 묻기**(답이 그 자리에 AI 블록으로), 백링크, `#태그`. 저장은 그대로 마크다운(원문 탭)
- **그래프 (Second Brain)**: 옵시디언식 2D 그래프. 단색 점·곧은 선, 주제별 색만. **한 번 누르면 고르고 다른 점을 누르면 연결**(첫 노트 본문 끝 `## 연결` 에 `[[제목]]`), **두 번 누르면 열기**, 선 위에 올리면 ✕ 로 끊기(이미 이어진 점을 다시 고르면 끊기 제안). **빈 곳을 누르면 그 자리에 새 노트**(점을 고른 채면 바로 이어짐), 고른 점 띠의 **지우기**로 내 노트 삭제. 점은 유리 구슬처럼 그려요. 왼쪽 찾기 패널은 ‹ 로 접었다 펼 수 있어요. 페이지 트리는 점선. 오른쪽 설정(찾기·보기·그룹·크기·힘)
- **AI 정리/생성**: 노트 목록의 **AI 정리** → 모든 노트에 주제·#태그·[[관련 노트]]를 써넣고 주제별 `MOC · 주제` 목차 노트를 만듦. **AI로 만들기**(주제) · **쪼개기**(노트 하나) · AI 튜터의 **노트로 정리**(대화) → 서로 링크된 개념 노트 여러 개
- **AI 공통 (v15)**: 어디서든 **모델 고르기**(자동 또는 Gemini·Groq·Cohere·MiMo·GLM·OpenRouter·Kilo·Ollama, 막히면 다음 회사로)와 **🌐 웹 검색** 토글. 웹을 켜면 AI 가 먼저 검색(Bing RSS → DuckDuckGo, 키 없음)하고 필요하면 페이지를 읽어(Jina Reader) 출처와 함께 답해요. 도구: `web_search` · `read_page` · `search_notes` · `read_note` · `my_plans` — 회사별 함수 호출 API 없이 글로만 주고받는 한 가지 방식(`src/agent.js`). **v20 — 모든 내장 AI 가 에이전트**: AI 채팅(비교 모드 포함) · 캘린더/체크리스트/목표 AI 입력줄 · 계획 AI · 노트 편집기 물어보기 · AI로 노트(노드) 만들기 · 대화방 @AI 가 전부 도구를 늘 쓸 수 있어요. 글에 링크가 있으면 먼저 읽고, "찾아봐 · 최신 · 뉴스 · 가격 · 일정" 같은 말이면 웹 토글을 안 켜도 먼저 검색하고, 모자라면 스스로 검색어를 바꿔 더 찾아요(AI 입력줄은 JSON `research` 단계로 최대 2번). 🌐 토글은 "질문마다 먼저 검색". 채팅은 모델 하나일 때 계획 넣기·고치기 도구도 써요. 채팅 글은 바로바로 흘러나오고, 중간에 도구를 부르면 그 글을 지우고 이어서 해요.
- **이미지 넣기 (v20)**: 위 AI 전부에 사진 버튼 · 붙여넣기(⌘V) · 끌어다 놓기로 4장까지. 브라우저에서 1600px JPEG 로 줄여 보내고, 서버(`src/vision.js`)가 이미지를 볼 수 있는 모델(Gemini Flash → OpenRouter 무료 Gemma)로 글자·표·문제를 그대로 옮겨 적은 뒤 그 글을 질문에 붙여요 — 그래서 이미지를 못 보는 모델(Groq · Cohere …)을 골라도 사진 질문을 풀어요. 시간표 · 공지 사진을 AI 입력줄에 넣으면 일정으로, 교재 사진을 "AI로 만들기"에 넣으면 개념 노트로. 채팅에서는 "AI 가 읽은 내용"을 접어서 저장해 이어지는 질문도 기억해요.
- **계획 AI** (`#/planner`): 유리 구슬 챗봇. 오늘·이번 주·이번 달 계획을 대화로 짜고, 제안된 항목을 체크해서 한 번에 계획에 넣어요. `POST /ai/plan`.
- **대화방 푸시 알림**: 대화 탭의 **🔔 알림 켜기**를 누르면 그 기기에 새 메시지 알림이 와요(웹 푸시, 내용 없이 깨우기만 → 서비스 워커가 안 읽음 수를 읽어 표시). 키는 `VAPID_PUBLIC_KEY`(공개, `wrangler.jsonc`) · `VAPID_PRIVATE_KEY`(비밀). 새 키 만들기: `node -e` 로 P-256 키 쌍 생성 후 `.dev.vars` 에 두 줄 추가.
- **업데이트 전파**: `deploy.sh` 가 배포마다 `sw.js` 의 VERSION 을 시각으로 찍어요. 친구들 브라우저는 다음에 열 때 새 서비스 워커를 받고 "새 버전이 있어요 · 새로 고침" 띠가 떠요. 따로 할 일은 없어요.
- **디자인**: 무채색 Apple식 유리 UI, 색은 차트 안에만(링·잔디·그래프). 로그인은 황금빛 구름 사진. 툴바는 iOS 다크 모드식 아이콘 — 규칙은 `DESIGN.md`
- **홈**: 링 4개(바깥부터 올해·이번 달·이번 주·오늘). 목표 하나 = 칸 하나(이룬 건 색), 오늘 링은 24시간 시계 위에 시간표 블록. 바깥 얇은 선 = 흘러간 시간. 옆에 달성%·D-day·밀림/앞섬. 링을 누르면 그 기간 계획으로
- **일기**: 하루 한 편 + 기분(5단계), 자동 저장, 본인만 봄(AI에도 안 보냄). 일기장은 깃허브 잔디처럼 한 해를 칸으로 보여주고, 쓴 날은 채워지며, 칸을 누르면 그날 일기를 씀(날짜는 2026.09.28 형식)
- **하루 기록**: 일기 페이지의 **기록** 탭. 그날 세운 계획·끝낸 것·실행 기록·점수·집중 시간을 날짜별로 저장(직접 저장 + **자정(한국 시간 00:05) 자동 저장**, Cloudflare Cron). 잔디는 점수만큼 초록
- **프라이버시**: 서로는 **차트만** 봐요. 다른 사람의 계획은 칸 모양(끝냄·시각·길이)만 오고 내용은 서버가 비워 보내요. 실행 기록·노트·일기·하루 기록은 본인만
- **AI 튜터**: Gemini · Xiaomi MiMo 채팅(스트리밍). 기본은 **전체 비교**(두 모델 답을 나란히). 내 계획·기록·관련 노트를 읽고 답하고, `[[노트]]` 를 쓰면 그 노트를 읽어요. 대화방별 저장(본인만), 답을 노트로 저장
- 공통: `⌘K` 검색·명령 팔레트, 집중 타이머(끝나면 공부 시간이 기록에 저장), 다크/라이트
- 입장: 황금빛 구름 사진 위 유리 입력창 하나(아이디 → 비밀번호). 가입 화면 없음 — 계정은 명령어로 만들어요
- 처음 쓰면: 홈 오른쪽 아래 **시작하기** 3단계(오늘 할 일 → 올해 목표 → 노트·AI 정리)를 따라가면 돼요

## 디자인 고치기

- 규칙서: [`DESIGN.md`](DESIGN.md) — 분위기, 색, 글꼴, 컴포넌트 규칙, 하지 말 것
- 값: [`public/css/tokens.css`](public/css/tokens.css) — 색·반경·그림자·유리·링 톤을 여기서만 바꿔요
- 홈 링: [`public/js/ringhud.js`](public/js/ringhud.js) · 그래프: [`public/js/views/graph.js`](public/js/views/graph.js) (옵시디언식 2D) · AI 정리 서버: [`src/brain.js`](src/brain.js)
- 계획 화면 링: [`public/js/chart.js`](public/js/chart.js)
- 참고: `docs/design-md/` (Apple · Vercel · Raycast DESIGN.md 원본), `docs/refs/web-design-source/` (영상 레퍼런스 장면)

## 로컬에서 실행 (가입 없이, 오프라인 가능)

```bash
npm install
npm run db:init        # 로컬 D1에 테이블 만들기
npm run dev            # http://localhost:8787
npm run seed           # (선택) 예시 데이터 — dev 실행 중에
npm test               # (선택) API+AI 테스트 — 임시 계정을 만들었다가 지워요 (AI 빼려면 SKIP_AI=1)
npm run e2e            # (선택) 화면 검사 — 과목 탭 높이 · 여러 파일 페이지 · AI 공부책 · 논문 쉽게 읽기, 컴퓨터 · 폰 크기 (처음 한 번 npx playwright install chromium)
```

- 계정: `gyk` · `chj` · `hsk` — 로컬에서는 **아이디만 입력하면 들어가요** (`.dev.vars` 의 `PASSWORDLESS=1`). 배포된 주소는 `wrangler.jsonc` 의 `PASSWORDLESS: "0"` 이라 비밀번호가 필요해요
- `npm run seed` 를 실행하면 세 계정에 예시 데이터가 들어가요
- AI 키: `.dev.vars` 에 `GEMINI_API_KEY`, `GROQ_API_KEY`, `COHERE_API_KEY`, `MIMO_API_KEY` (git에 올라가지 않아요, 자세한 건 아래 "AI 키")

## 테스트

한 곳에서 단계만 골라요. 서버(`wrangler dev`, 포트 8828)는 스크립트가 직접 켜고 끕니다.

```bash
npm run test:quick     # 바뀐 파일에 걸린 구역 + 바탕(로그인 · 홈 · 계획 넣기 · 노트 저장), 컴퓨터 화면만, 가짜 AI
npm run test:normal    # smoke 전부 + 바뀐 파일에 걸린 화면 구역, 컴퓨터 · 폰 같이, 가짜 AI
npm run test:full      # 예전 그대로 전부 (smoke + e2e 모든 구역, 컴퓨터 · 폰), 진짜 AI — 병합 전에
node scripts/test.mjs quick --dry   # 무엇을 돌릴지만 보기
```

- 바뀐 파일 = `git diff origin/main...HEAD` + 커밋 안 한 것 + 새 파일. 파일 → 구역은 `scripts/test-map.json` (경로 앞부분). 표에 없는 파일이 바뀌면 quick 이 normal 로 올라가요
- 구역: `smoke.mjs` · `e2e.mjs` 의 덩어리마다 `section("이름", …)`. 직접 고르기: `SECTIONS=diary,board node scripts/smoke.mjs` · 빼기: `SKIP_SECTIONS=…`. 아무것도 안 주면 예전처럼 전부 (`npm test` · `npm run e2e` 그대로)
- 화면 검사는 컴퓨터 · 폰을 **따로 프로세스로 같이** 돌려요 (임시 계정도 따로). `--shards=2` 면 화면마다 두 갈래 더
- 가짜 AI (`AI_MOCK=1`): 서버가 Groq · Gemini · Workers AI 를 부르지 않고 정해진 답을 줘요 (`src/lib/aimock.js`). **`PASSWORDLESS=1` + localhost 주소일 때만** 켜져서 배포본에서는 켤 수 없어요. 진짜 AI 답을 봐야 하는 구역(`ai-real`)은 full 에서만 돌아요
- 임시 계정(`t_…`)은 매번 시작 · 끝에 지워요 (시작 때는 2시간 넘은 것만 — 같이 도는 다른 검사 것은 남겨요). 손으로: `npm run test:clean`
- 끝나면 표가 나와요: 실행별 구역 수 · 통과 · 실패 · 시간, 오래 걸린 구역, 실패한 구역, 로그 폴더
- 이 컴퓨터에서 잰 시간 (2026-10-26): quick 1.5~2분 · normal(노트 하나 바꿈) 3분 · 전부 가짜 AI 13분 · full 14분 — 예전 smoke 9분 + e2e 20분 ≈ 30분
- 앞 구역이 만든 것을 쓰는 구역은 `test-map.json` 의 `needs` 에 적어 두면 같이 돌아요 (예: 노트 우클릭 → Brain)
- 이미 켜 둔 서버를 쓰려면 `--base=http://127.0.0.1:8787` (가짜 AI 는 그 서버를 `--var AI_MOCK:1` 로 켰을 때만). `.dev.vars` 가 다른 곳이면 `--env-file=…`

## 계정 만들기 (가입 화면 대신)

```bash
npm run user:add -- <아이디> <이름> <비밀번호>            # 로컬
npm run user:add -- <아이디> <이름> <비밀번호> --remote   # 배포된 DB
# 같은 아이디로 다시 실행하면 이름·비밀번호가 바뀌고 기존 로그인은 끊겨요
```
- 이 명령으로 정한 비밀번호는 "임시"예요. 그 사람은 **첫 로그인 때 새 비밀번호로 바꿔야** 다른 화면을 쓸 수 있어요 (`must_change_pw`, 아래 보안 메모)
- 처음부터 다시: dev 서버를 끄고 `npm run db:reset`

## Cloudflare에 배포

1. https://dash.cloudflare.com/sign-up 에서 무료 가입 (카드 필요 없음) → **가입 메일의 인증 링크를 꼭 누르기** (안 하면 배포가 `code: 10034` 로 막혀요)
2. `npx wrangler login`
3. `.dev.vars` 에 아래 'AI 키' 들과 `INVITE_CODE` 가 들어 있는지 확인
4. **`npm run deploy:all`** — 한 번에 끝나요 (`scripts/deploy.sh`, 여러 번 돌려도 괜찮아요)
   - D1 `dsm-mafia` 가 없으면 만들고 id 를 `wrangler.jsonc` 에 써 넣기
   - 원격 DB 마이그레이션 → `wrangler deploy`
   - `.dev.vars` 의 `GEMINI_API_KEY` `GROQ_API_KEY` `COHERE_API_KEY` `MIMO_API_KEY` `INVITE_CODE` 를 Worker 비밀값으로 올리기 (값은 화면에 안 찍혀요, `PASSWORDLESS` 는 안 올려요)
   - 마지막에 `https://swx2.<내 서브도메인>.workers.dev` 주소 출력
5. 세 사람 계정 만들기: `npm run user:add -- <아이디> <이름> <비밀번호> --remote` × 3

> **배포본은 비밀번호가 있어야 로그인돼요.** `wrangler.jsonc` 의 `PASSWORDLESS` 는 `"0"` 이고,
> 아이디만으로 들어가는 건 로컬에서만(`.dev.vars` 의 `PASSWORDLESS=1` 이 덮어써요).
> `wrangler.jsonc` 의 `preview_database_id`(0000…) 는 로컬 DB 파일을 가리켜요 — 지우거나 바꾸면 로컬 데이터가 안 보여요.

## AI 키 (무료)

`.dev.vars` (git에 안 올라가요) 에 한 줄씩:

```bash
GEMINI_API_KEY=AQ....
GROQ_API_KEY=gsk_...
COHERE_API_KEY=...
MIMO_API_KEY=sk-...        # 선택
ZHIPU_API_KEY=...          # 선택
OPENROUTER_API_KEY=sk-or-... # 선택
KILO_API_KEY=...           # 선택
OLLAMA_API_KEY=...         # 선택
INVITE_CODE=...
PASSWORDLESS=1             # 로컬 전용
```

| 키 | 받는 곳 | 쓰는 곳 · 메모 |
|---|---|---|
| `GEMINI_API_KEY` | https://aistudio.google.com → Get API key | 채팅(Gemini Flash/Pro), 노트 정리 1순위. 무료, 카드 없음. 새 키는 `AQ.` 로 시작 |
| `GROQ_API_KEY` | https://console.groq.com/keys | 채팅(GPT-OSS 120B → 20B → Qwen), 정리 2순위. 아주 빠름. 무료는 분당 약 8천 토큰이라 긴 정리는 다음 순서로 넘겨요 |
| `COHERE_API_KEY` | https://dashboard.cohere.com/api-keys | 채팅(Command A), 정리 3순위, **비슷한 노트 찾기(임베딩 `embed-multilingual-v3.0`)**. 무료(Trial) 키는 한 달 호출 수가 제한돼요 |
| `MIMO_API_KEY` | 샤오미 MiMo 개발자 플랫폼 (`api.xiaomimimo.com`) | 채팅(MiMo, 따로 선택), 정리 4순위. 추론 과정 표시 |
| `ZHIPU_API_KEY` | https://open.bigmodel.cn → API Keys | 채팅(GLM 4.5 Flash, 따로 선택), 정리 5순위. 무료지만 느려요(수십 초). 4.6 은 무료 키가 429 |
| `OPENROUTER_API_KEY` | https://openrouter.ai/keys | 채팅(`openrouter/free` — 그때그때 되는 무료 모델로 자동), 정리 6순위. 실제로 답한 모델은 상태 줄에 보여요 |
| `KILO_API_KEY` | https://app.kilo.ai → API Keys | 채팅(`kilo-auto/free` 자동 → `stepfun/step-3.7-flash:free`), 정리 7순위. 유료 모델은 크레딧 오류라 무료만 |
| `OLLAMA_API_KEY` | https://ollama.com → Settings → Keys | 채팅(`nemotron-3-ultra` → `gpt-oss:120b`), 정리 마지막 순서. 큰 모델이라 조금 느려요 |

- 채팅의 **전체 비교** = Gemini · Groq · Cohere 세 답을 나란히. 키가 없는 모델은 건너뛰어요.
- 노트 정리/생성(JSON)은 Gemini → Groq → Cohere → MiMo → Zhipu → OpenRouter → Kilo → Ollama 순서로 되는 곳을 써요. 대화방 AI(`aiText`)는 Groq → Gemini → Cohere → MiMo → Zhipu → OpenRouter → Kilo → Ollama. 뒤의 넷은 JSON 모드가 없어서 코드 펜스를 벗기고 `{ }` 만 골라 읽어요.
- `COHERE_API_KEY` 가 없거나 임베딩이 실패하면 '비슷한 노트 후보' 없이 예전처럼 정리해요.

키는 브라우저로 나가지 않고 Worker 비밀값에만 있어요. 사람당 하루 200개 질문 제한(`src/ai.js` 의 `DAILY_LIMIT`).

## 뜻으로 찾기 · 근거 달린 CIM 튜터 (`src/rag.js`)

글자 찾기(D1 FTS5 trigram)와 뜻 찾기(Workers AI `@cf/baai/bge-m3` 1024차원 + Vectorize cosine)를 RRF(k=60)로 섞어요.
D1 `chunks` 표가 원본이고 Vectorize 는 다시 만들 수 있는 색인이라, 벡터가 늦게 보이거나(쓰기 후 30초~몇 분) 실패해도 글자 찾기는 바로 돼요.

- **무엇을 넣나**: CIM 카드 399장(모두 같이, namespace `cim`) · 내 노트(namespace `u:<내 id>`, 서버가 세션 사람으로 정해요). CIM 문제 1,995개는 벡터 없이 글자 찾기만(맞으면 그 카드로). 일기는 안 넣어요.
- **어디에 보이나**: ⌘K 팔레트의 '뜻으로 찾기' 칸(`GET /api/search/semantic?q=`, 노트는 누구나 · CIM 카드는 cim 기능이 있는 사람만) · CIM AI 튜터의 [1] 근거 링크와 '근거' 칩(`POST /api/apps/cim/ask`).
- **벡터 색인 둘**: 배포본 `VECTORS` = `swx2-chunks`, `wrangler dev` = `VECTORS_DEV` = `swx2-chunks-dev`(`remote: true`). `VECTORS` 는 remote 가 아니라 로컬에서는 아예 닿지 않아요(로컬 표시 `PASSWORDLESS=1` 로 고름 — `vecIndex`). 두 색인 모두 메타데이터 색인 `kind` · `user_id` 가 있어요.
- **채우기**: 노트는 저장 · 지우기 때 뒤에서(`waitUntil`) 바뀐 조각만 다시 임베딩. 다른 길(Brain · MCP)로 바뀐 노트와 CIM 은 매시 크론(`ragCron`)이 천천히 — 처음엔 CIM 2장씩, 노트 40개 · 임베딩 96조각씩. 빨리 채우려면 `BASE=… node scripts/rag-index.mjs`(관리자).
- **무료 한도**: 저장 5M 차원(계정 전체) ≈ 4,880개 → 노트 벡터는 `RAG_NOTE_VEC_MAX`(기본 3000) · 사람마다 `RAG_USER_VEC_MAX`(1500)까지, 넘는 조각은 `skip`(글자 찾기만). 크론 임베딩은 하루 `RAG_DAILY_NEURONS`(4000, 무료 10,000 중) 어림값 안에서.
- **평가**: `BASE=http://127.0.0.1:8797 node scripts/rag-eval.mjs` — CIM 문제 → 그 카드 150개로 recall@1/5/10 · MRR. 2026-10-23 결과로 고른 기본값: 섞기(hybrid, RRF 같은 무게) · 글자 찾기는 낱말을 trigram 조각으로(어미가 붙어도 맞게) · 문제 행 벌점 2.0 · reranker 끔(`bge-reranker-base` 가 한국어에서 오히려 떨어뜨렸어요) · 노트 이웃(1-hop 링크) 끔 · '근거 있음' 기준 코사인 0.47 (상관없는 질문 최고 0.455, CIM 질문 하위 10% 0.556). 바꾸려면 `RAG_RERANK=1` · `RAG_NEIGHBORS=1` · `RAG_MIN_COS=…`.
- **개인 자료**: 튜터 근거에 내 노트가 들어가면 무료 데이터로 학습하지 않는 Groq 로만 보내요. 거기가 안 되면 노트를 빼고 CIM 근거로만 다시 물어요.
- **주의 — `wrangler d1 export`**: D1 내보내기는 가상 표(FTS5)가 있으면 실패해요. 내보내기 전에 `DROP TABLE chunks_fts;` → 내보내기 → `migrations/0067_chunks.sql` 의 `CREATE VIRTUAL TABLE` · 트리거 셋을 다시 실행하고 `INSERT INTO chunks_fts(chunks_fts) VALUES('rebuild');` (내용은 `chunks` 에 다 있어요).

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

## MCP 서버 (`/mcp`) — 어떤 MCP 클라이언트든

앱을 MCP(Model Context Protocol) 서버로도 열어 뒀어요. Cloudflare 에서 앱과 같이 돌아서 내 컴퓨터를 켜 둘 필요가 없어요.
주소 `https://swx2.swx2.workers.dev/mcp` · Streamable HTTP(POST, JSON 응답) · `Authorization: Bearer <토큰>`. 코드 `src/mcp.js`, 표 `migrations/0018_mcp.sql`.

- **토큰** (연결마다 하나, 원문은 저장 안 하고 SHA-256 만): `node scripts/mcp-token.mjs <아이디> <연결 이름> --remote [--out ~/.config/swx2/mcp.json]` · 목록 `--list` · 끊기 `--revoke`. 연결 이름이 작업판에 "누가 했는지"로 남아요.
- **도구 14개**: `whoami` · 논문 `papers_overview` `paper_read`(summary · deep[+section] · terms) `paper_check` · 노트 `notes_search` `note_read` `note_write`(create · append · replace, 덧붙일 땐 연결 이름으로 서명) · 계획 `plans_list` `plan_add` · **작업판** `tasks_list` `task_get` `task_add` `task_claim` `task_update`
- **작업판**: 한 사람의 여러 에이전트가 같이 보는 할 일. 올리기 → 맡기(다른 에이전트가 하는 중이면 막혀요, `force` 로만) → 기록(누구나) → 끝(맡은 쪽만 상태 변경, `result` 에 결과·노트 제목). 서버가 `initialize` 의 `instructions` 로 이 순서를 알려 줘요.
- 도구는 앱 API 를 안에서 그대로 불러서 검증·권한이 웹과 같아요(`internalCall`). 논문 스프린트가 끝나면 `paper_check` 는 앱과 똑같이 막혀요.
- 연결 예: Claude Code `claude mcp add --transport http swx2 https://swx2.swx2.workers.dev/mcp --header "Authorization: Bearer $TOKEN"` · Cursor/VS Code `mcp.json` 의 `{"url": "…/mcp", "headers": {"Authorization": "Bearer …"}}` · stdio 만 되는 앱은 `npx mcp-remote …/mcp --header "Authorization: Bearer …"`
- 테스트: `scripts/smoke.mjs` 의 MCP 구역(토큰 없음/틀림 401 · initialize · 알림 202 · 도구 · 작업판 보호 · 노트 서명 · 끊은 토큰 401)

## 논문 스프린트 (2026-10-01 → 10-05)

셋이 16편(탐지 · 인코더 · 분할 · 추적 · 영상 · RGB·열화상 융합 · 증류 · INT8/RKNN)을 5일 안에 "편당 3분 설명"까지. 설계: `docs/plans/2026-10-01-papers-sprint-design.md`.

- **현황판** `#/papers`: D-day · 오늘 할 논문 · 우리 셋 진도(칸 하나 = 논문 하나, 진할수록 많이) · 5일 지도 · 파이프라인 지도 · **옵시디언에 넣기**
- **공부 페이지** `#/papers/<id>`: 한눈에(비유) → 그림(직접 그린 설명 그림 + 원문 그림, 누르면 크게) → 핵심 아이디어 → 결과 → 우리 파이프라인 → 영상(누르면 재생) → 용어 → **읽기 체크** → **퀴즈 5문제**(4개 맞히면 체크) → **3분 설명**(AI 채점 70점 또는 직접 체크, 3분 타이머, 핵심어 표시) → 한 줄 정리(셋이 봄) → **AI 튜터**(그 논문 자료를 다 읽은 AI) → 원문(arXiv · 한국어 번역 PDF 6편 · 코드)
- 자료: `public/papers/index.json`(목록 · 일정 · 파이프라인), `public/papers/content/<id>.json`, `public/papers/fig/<id>/`. 규칙 `scripts/papers/CONTENT_SPEC.md`, 점검 `node scripts/papers/check.mjs`, 그림 자르기 `scripts/papers/fig.py`(PyMuPDF)
- 기록: D1 `paper_checks` · `paper_notes` · `paper_tokens` (`migrations/0016_papers.sql`), API `src/papers.js`
  - `GET /api/papers/progress` · `PUT /api/papers/check { paper, step, done }` · `POST /api/papers/quiz { paper, correct }` · `PUT /api/papers/note { paper, text }` · `POST /api/papers/explain { paper, text }` · `POST /api/papers/ask { paper, messages }` · `POST /api/papers/obsidian`
  - 로그인 없는 옵시디언 판: `GET /api/papers/t/:token` · `PUT /api/papers/t/:token/check` (토큰은 SHA-256 만 저장, 새로 받으면 옛 것은 무효)
  - **10-06(한국 시간)부터** 쓰기는 410, Dock 에서 '논문'이 빠지고 판은 "끝났어요" + 결과만. 로컬 테스트는 `x-papers-now: YYYY-MM-DD` 헤더(PASSWORDLESS=1 일 때만)
- **앱 노트(옵시디언식)에 넣은 공부 구역** — `node scripts/study-notes-seed.mjs [--remote] [--dry-run] [--only=papers|english]` 가 셋의 노트에 각각 넣어요(이미 넣었으면 건너뛰고, 같은 제목 노트는 안 덮어써요, `study_seed_notes` · `migrations/0017_study_seeds.sql`)
  - `📄 논문 공부`: 맨 위 `<!-- papers:board -->` 블록 = 셋 진도 · 체크 판(편집기가 `/papers/embed#mode=note` 를 끼워 넣음, 로그인 그대로) + 날짜별 16편 하위 페이지(내가 이해한 것 · 헷갈린 점 · 3분 설명 연습 · 핵심어 · [[연결]] · #논문스프린트 #단계). 하위 페이지 내용은 각자만 봐요. **10-06 00:05 크론이 이 구역(아래에 직접 만든 페이지까지)을 지워요** (`cleanupPaperNotes`)
  - `🇺🇸 영어`: ENGLISH-OS 자료 노트(폴더 = 페이지). 경로 링크 → 제목 링크, 콜아웃 → 굵은 머리, 표 → 목록, dataview → 영어 탭 안내. 개인 기록(매일 기록 · 내가 막힌 표현 · 내 진도) · 서식 · 첨부는 빼요 — 영어 탭에 있어요
- **진짜 옵시디언**: 앱의 '옵시디언 파일'(현황판 오른쪽 위) → `📊 논문 현황.md` (개인 토큰이 든 `<iframe>` = `public/papers/embed.html`). 각자 볼트에 넣으면 거기서 체크하고 셋 진도를 봐요.
  - 내 볼트는 `python3 scripts/papers/vault-restructure.py [--dry-run] [--note 받은파일.md]` 로 `~/Documents/STUDY-OS` (🏠 홈 · 논문 공부/ · 영어 공부/) 로 바꿨어요. 백업은 `~/Documents/_backup/`.
  - 정리 플러그인 `scripts/papers/obsidian-plugin/` (볼트에 `papers-sprint` 로 설치): 10-06 에 `논문 공부/` 를 시스템 휴지통으로, 홈의 논문 칸을 지우고 스스로 꺼져요.

## 영어 (ENGLISH-OS 연동)

옵시디언 볼트 `ENGLISH-OS`(6개월 영어 프로그램 2026-09-28 → 2027-03-28, 650시간)를 앱 안에서 매일 쓰는 페이지예요.
오늘이 며칠차·몇 주차·어느 스프린트인지 보여 주고, 그날 할 일(소리 블록·생존 문장·이번 주 패턴)과 하루 블록 기록(분·체크리스트·오늘의 한 문장), 내가 막힌 표현, 라이트너 복습 카드, AI 프롬프트 복사를 한곳에서 해요. 기록은 전부 본인만 봐요.

- 공부 내용: `public/english/data.json` (볼트에서 만든 정적 파일)
- 내 기록: D1 `english_days` · `english_phrases` · `english_cards` (`migrations/0007_english.sql`), API는 `src/english.js` (`/api/english/*`)

**볼트를 고쳤으면** 다시 만들어 주세요. 표를 못 읽으면 어느 파일이 문제인지 알려 주고 멈춰요.

```bash
npm run english:import                          # 기본 볼트: ~/Documents/STUDY-OS/영어 공부 (없으면 옛 ENGLISH-OS)
ENGLISH_OS=/다른/볼트 npm run english:import     # 볼트 위치가 다르면
```

**앱 기록을 볼트로 보내기** (앱 → 볼트 한 방향, 두 번 돌려도 똑같아요)

```bash
EN_USER=내아이디 EN_PASS=비밀번호 npm run english:sync -- --dry-run   # 무엇을 바꿀지만 보기
EN_USER=내아이디 EN_PASS=비밀번호 npm run english:sync                # 실제로 쓰기
API=http://localhost:8787 EN_USER=t_en ENGLISH_OS=/볼트사본 npm run english:sync   # 로컬 서버 (비밀번호 없이)
```

- `API` 기본값은 배포 주소, `ENGLISH_OS` 기본값은 위 볼트예요. `-- --to=YYYY-MM-DD` 로 끝 날짜를 바꿀 수 있어요 (기본: 오늘)
- 건드리는 곳은 딱 두 군데예요
  - `01 매일 기록/날짜.md` — 공부한 날(분 > 0)만. **YAML 프로퍼티**(date·week·sprint·minutes·spoken·newwords·mistakes·mood)만 고치고 본문은 그대로 둬요. 파일이 없을 때만 `서식/오늘 기록 서식.md` 로 새로 만들고 블록 표·체크리스트·오늘의 한 문장을 채워요
  - `05 표현/내가 막힌 표현.md` — 볼트에 아직 없는 표현만 `## 기록` 목록 끝에 `- [날짜] 한국어 → 영어 → 덩어리` 로 붙여요
- week 는 2026-09-28 을 1주차로 계산해요 (`📊 내 진도` 대시보드가 그대로 읽어요)

## 구조

```
src/worker.js          API (인증·계획·기록·노트·연결·페이지·그래프·검색)
src/ai.js              AI 채팅 (Gemini·Groq·Cohere·MiMo·GLM·OpenRouter·Kilo·Ollama 스트리밍, 기록 참고, 대화 저장) · aiJson/aiText 공용 호출
src/brain.js           AI 정리·생성 (주제·태그·링크 써넣기, MOC 목차, 개념 노트 만들기)
src/calendar.js        캘린더 (한 달 요약 · 하루 한 페이지)
src/english.js         영어 기록 · 표현 · 복습 카드
src/mcp.js             MCP 서버 (/mcp · 토큰 · 도구 14개 · 에이전트 작업판)
src/papers.js          논문 스프린트 체크 · 한 줄 정리 · AI 튜터/채점 · 옵시디언 토큰
src/together.js        같이 하기 (지금 공부 중 · 응원 · 주간 회고)
src/room.js            대화방 (all 방 + 1:1 dm 방 · 이름 부르면 답하는 AI · 방마다 안 읽음)
src/library.js         공통 창고 (책·링크·영상 · 미리보기 메타데이터 · 표시/메모)
migrations/            D1 스키마
public/                정적 프론트엔드 (빌드 없음, ES 모듈)
  js/app.js            셸 · 라우팅 · ⌘K · 집중 타이머
  js/views/*.js        오늘 · 계획 · 노트 · 그래프 · 우리 셋 · 대화방 · 로그인
  vendor/              marked, DOMPurify
  css/tokens.css       디자인 토큰 (DESIGN.md 참고)
  js/ringhud.js        홈 링 차트 (시간 호 + 달성 호 + 숫자 행)
  js/chart.js          계획 화면 링 차트 · HUD
  assets/fonts, login  Geist, Geist Mono, Pretendard · 로그인 구름 사진
scripts/               smoke.mjs(API+AI 테스트), e2e.mjs(브라우저 화면 검사), seed.mjs(예시 데이터), add-user.mjs(계정)
legacy/                이전 단일 파일 버전
```

## 보안 메모

- 가입 API는 기본으로 닫혀 있어요 (`ALLOW_SIGNUP=1` 일 때만 열림)
- 비밀번호: PBKDF2-SHA256 100,000회 + 솔트. 5번 틀리면 5분 잠금
- 비밀번호 바꾸기: 프로필 메뉴 → `POST /api/auth/password` (지금 비밀번호 확인, 새 것 8자 이상, 지금과 달라야 함). 틀리면 로그인과 같은 잠금에 셈. 바꾸면 그 기기만 남기고 다른 로그인은 모두 풀려요. 잊었을 땐 `npm run user:add -- <아이디> <이름> <새 비밀번호> --remote` 로 스터디장이 다시 정해요
- 첫 로그인 비밀번호 바꾸기: 스터디장이 정한 비밀번호(`user:add`)는 `users.must_change_pw = 1` 이에요. 마이그레이션 `0008` 이 기존 계정도 전부 1로 바꿔요 (지금 셋 다 스터디장이 정한 임시 비밀번호라서). 이 표시가 있으면 서버가 `/me` · `/users` · `/auth/*` 말고는 전부 `403 { error, must_change_password: true }` 로 막고, 화면은 닫을 수 없는 비밀번호 창을 띄워요. 비밀번호를 바꾸면 풀려요
  - 로컬(`PASSWORDLESS=1`)은 비밀번호를 안 쓰니 이 표시도 무시해요 (`must_change_pw` 는 항상 false). `npm test` 는 요청에 `x-trio-strict: 1` 헤더를 붙여 배포본처럼 검사해요 — 이 헤더는 검사를 **더 엄격하게만** 하고, 배포본에서는 원래 켜져 있어서 아무 차이가 없어요
- 세션: 무작위 토큰의 SHA-256만 DB에 저장, HttpOnly · SameSite=Lax 쿠키(https에서는 Secure)
- 쓰기 요청은 `x-trio` 헤더 필수(CSRF 방지), 노트 HTML은 DOMPurify로 정리
- 창고 미리보기(`/api/library/preview`)는 서버가 남의 주소를 대신 여는 기능이에요. http(s) 만, 3초 타임아웃, 앞 200KB 만 읽고, 사설 주소는 호스트 이름 문자열로 막아요 (Workers 는 DNS 를 못 풀어서 이름이 사설 IP 로 풀리는 경우까지는 못 잡아요 — Cloudflare 가 내부 주소 연결을 따로 막는 것에 의지). 썸네일은 https 주소만 저장해요
- 대화방: dm 방(`dm:<uidA>:<uidB>`)은 아이디가 든 둘만 읽고 쓸 수 있어요(서버가 403). AI 는 부른 그 방의 메시지 40개와 창고 목록만 프롬프트에 넣어요 — dm 에서 부르면 셋째 사람 메시지는 안 봐요. 개인 노트·일기·계획은 코드상 조회 자체를 안 해요 (`src/room.js` `buildPrompt`)

## 크레딧

사진 출처와 라이선스는 `public/assets/login/credits.json` 에 있어요. 로그인 화면과 앱 배경(흐리게)은 같은 황금빛 구름 사진을 써요.

## 뉴스 — 하루 한 부 신문 (백엔드)
- 글마다 `day`(한국 날짜, 날짜 없는 글은 처음 본 날) · `section`(ai · geopolitics · tech · economy — 피드 주제로 정하고 AI 가 고치면 따라요) · `summary`(2~3줄 한국어). 요약은 글 5편을 AI 한 번에 묶어요.
- `news_editions`: 하루 한 부. 08:00 초안(draft) → 23:10 마감(closed). 마감 뒤 들어온 글은 API 의 `late`.
- 지난 60일 되채우기: 매시 크론이 한 걸음씩(마감 안 된 가장 오래된 날 10편 요약 → 다 되면 그날 마감). 손으로: `POST /api/news/backfill`, 상태: `GET /api/news/backfill`.
- API: `GET /api/news/editions?from&to`, `GET /api/news/edition/:day|today`.
- 크론 5개와 바깥 요청 예산(호출마다 40개, `src/lib/budget.js`)은 `src/cron.js` 맨 위. 로컬 시험: `POST /api/cron/run?cron=hourly|am|close` (PASSWORDLESS=1 일 때만).
