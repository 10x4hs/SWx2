# Study Trio

세 명이 함께 쓰는 공부 플래너 + 옵시디언식 노트. Cloudflare Workers + D1.

- **오늘**: '오늘의 목표' 창과 '시간표' 창을 나눔, 06–24시 시간 블록 플래너, 체크하면 실행 기록에 시간순으로 남음, 데일리 노트, 오늘 점수(계획 40 + 실행 60), 어제 못 한 일 가져오기, 내일로 미루기, 연속 달성일
- **계획**: 연간 / 월간 / 주간 체크리스트, 이전·다음 기간 이동(미리 계획), 완료율 vs 기간 경과, 1년 히트맵, 월 달력, 주간 보드
- **노트**: 마크다운, `[[위키링크]]` 자동완성, 백링크, `#태그`, 편집·분할·보기, 공유 토글(기본 비공개)
- **그래프**: 노트 연결 force 그래프(드래그·휠 확대·눌러서 열기, 없는 노트는 빈 원)
- **디자인**: 흑·백·회색 무채색 테마(배경 사진도 흑백), 다크/라이트
- **홈**: 무채색 링 차트 하나(바깥부터 올해·이번 달·이번 주·오늘). 링을 끊는 홈 = 흘러간 시간, 바깥에 `D-94`(올해 남은 날)와 지금 시각, 아래에 오늘·올해 경과 막대. 올해 링은 목표마다 고른 톤(먹·흑연·슬레이트·스틸·실버·모래·상아·샴페인)으로 칸이 나뉨. 링이나 줄을 누르면 그 기간 계획 화면으로. 아래에 다른 두 사람의 링·지금 하는 일·최근 기록
- **일기**: 하루 한 편 + 기분(5단계), 자동 저장, 본인만 봄(AI에도 안 보냄). 일기장은 깃허브 잔디처럼 한 해를 칸으로 보여주고, 쓴 날은 채워지며, 칸을 누르면 그날 일기를 씀(날짜는 2026.09.28 형식)
- **AI 튜터**: Gemini · Xiaomi MiMo 채팅(스트리밍). 기본은 **전체 비교**(두 모델 답을 나란히). 내 계획·기록·관련 노트를 읽고 답하고, `[[노트]]` 를 쓰면 그 노트를 읽어요. 대화방별 저장(본인만), 답을 노트로 저장
- 공통: `⌘K` 검색·명령 팔레트, 집중 타이머(끝나면 공부 시간이 기록에 저장), 다크/라이트
- 입장: 구름 위 유리 입력창 하나(아이디 → 비밀번호). 가입 화면 없음 — 계정은 명령어로 만들어요

## 디자인 고치기

- 규칙서: [`DESIGN.md`](DESIGN.md) — 분위기, 색, 글꼴, 컴포넌트 규칙, 하지 말 것
- 값: [`public/css/tokens.css`](public/css/tokens.css) — 색·반경·그림자·유리·링 톤을 여기서만 바꿔요
- 3D: [`public/js/three/ring3d.js`](public/js/three/ring3d.js) (홈 3D 링), [`public/js/three/brain3d.js`](public/js/three/brain3d.js) (Second Brain 그래프)
- 차트(대비책): [`public/js/chart.js`](public/js/chart.js) — WebGL이 없을 때 쓰는 SVG 점토 링
- 참고: `docs/design-md/` (Apple · Vercel · Raycast DESIGN.md 원본), `docs/refs/web-design-source/` (영상 레퍼런스 장면)

## 로컬에서 실행 (가입 없이, 오프라인 가능)

```bash
npm install
npm run db:init        # 로컬 D1에 테이블 만들기
npm run dev            # http://localhost:8787
npm run seed           # (선택) 예시 데이터 — dev 실행 중에
npm test               # (선택) API+AI 테스트 — 임시 계정을 만들었다가 지워요 (AI 빼려면 SKIP_AI=1)
```

- 계정: `gyk` · `chj` · `hsk` — **아이디만 입력하면 들어가요** (`wrangler.jsonc` 의 `PASSWORDLESS: "1"`, 끄면 비밀번호를 물어요)
- `npm run seed` 를 실행하면 세 계정에 예시 데이터가 들어가요
- AI 키: `.dev.vars` 에 `GEMINI_API_KEY`, `MIMO_API_KEY` (git에 올라가지 않아요)

## 계정 만들기 (가입 화면 대신)

```bash
npm run user:add -- <아이디> <이름> <비밀번호>            # 로컬
npm run user:add -- <아이디> <이름> <비밀번호> --remote   # 배포된 DB
# 같은 아이디로 다시 실행하면 이름·비밀번호가 바뀌고 기존 로그인은 끊겨요
```
- 처음부터 다시: dev 서버를 끄고 `npm run db:reset`

## Cloudflare에 배포

1. https://dash.cloudflare.com/sign-up 에서 무료 가입 (카드 필요 없음)
2. `npx wrangler login`
3. `npx wrangler d1 create study-trio` → 출력된 `database_id` 를 `wrangler.jsonc` 에 붙여넣기
4. `npm run db:init:remote`
5. AI 키 등록: `npx wrangler secret put GEMINI_API_KEY`, `npx wrangler secret put MIMO_API_KEY`
6. `npm run deploy` → `https://study-trio.<내 서브도메인>.workers.dev`
7. 세 사람 계정 만들기: `npm run user:add -- <아이디> <이름> <비밀번호> --remote` × 3

## AI 키 (무료)

| 서비스 | 받는 곳 | 메모 |
|---|---|---|
| Google Gemini | https://aistudio.google.com → Get API key | 무료, 카드 없음, 한국어 최고. 새 키는 `AQ.` 로 시작 |
| Xiaomi MiMo | 샤오미 MiMo 개발자 플랫폼 (API: `api.xiaomimimo.com`) | `sk-…` 키, OpenAI 호환, 추론 과정 표시 |
| Groq (예비) | https://console.groq.com | 무료 하루 1천 회 수준, 매우 빠름 (연동하려면 `src/ai.js` 에 추가) |

키는 브라우저로 나가지 않고 Worker 비밀값에만 있어요. 사람당 하루 200개 질문 제한(`src/ai.js` 의 `DAILY_LIMIT`).

## 구조

```
src/worker.js          API (인증·계획·기록·노트·그래프·검색)
src/ai.js              AI 채팅 (Gemini·MiMo 스트리밍, 기록 참고, 대화 저장)
migrations/            D1 스키마
public/                정적 프론트엔드 (빌드 없음, ES 모듈)
  js/app.js            셸 · 라우팅 · ⌘K · 집중 타이머
  js/views/*.js        오늘 · 계획 · 노트 · 그래프 · 우리 셋 · 로그인
  vendor/              marked, DOMPurify
  css/tokens.css       디자인 토큰 (DESIGN.md 참고)
  js/chart.js          점토 유리 링 차트 · HUD
  assets/fonts, bg     Geist, Pretendard, Instrument Serif · 배경 사진
scripts/               smoke.mjs(API+AI 테스트), seed.mjs(예시 데이터), add-user.mjs(계정)
legacy/                이전 단일 파일 버전
```

## 보안 메모

- 가입 API는 기본으로 닫혀 있어요 (`ALLOW_SIGNUP=1` 일 때만 열림)
- 비밀번호: PBKDF2-SHA256 100,000회 + 솔트. 5번 틀리면 5분 잠금
- 세션: 무작위 토큰의 SHA-256만 DB에 저장, HttpOnly · SameSite=Lax 쿠키(https에서는 Secure)
- 쓰기 요청은 `x-trio` 헤더 필수(CSRF 방지), 노트 HTML은 DOMPurify로 정리

## 크레딧

사진 출처와 라이선스는 `public/assets/bg/credits.json`, `public/assets/login/credits.json` 에 있어요. 지금 쓰는 사진은 Golden Gate above the fog (Frank Schulenburg, CC BY-SA 3.0)이에요.
