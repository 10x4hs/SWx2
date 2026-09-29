# Dsm-mafia

세 명이 함께 쓰는 공부 플래너 + 옵시디언식 노트. Cloudflare Workers + D1.

- **오늘**: '오늘의 목표' 창과 '시간표' 창을 나눔, 06–24시 시간 블록 플래너, 체크하면 실행 기록에 시간순으로 남음, 데일리 노트, 오늘 점수(계획 40 + 실행 60), 어제 못 한 일 가져오기, 내일로 미루기, 연속 달성일
- **계획**: 연간 / 월간 / 주간 체크리스트, 이전·다음 기간 이동(미리 계획), 완료율 vs 기간 경과, 1년 히트맵, 월 달력, 주간 보드
- **노트**: 마크다운, `[[위키링크]]` 자동완성, 백링크, `#태그`, 편집·분할·보기, 공유 토글(기본 비공개)
- **그래프 (Second Brain)**: 옵시디언식 2D 그래프. 점 아래 제목, AI가 정한 주제별 색, 가리키면 이웃만 밝게, 오른쪽 설정(찾기·보기·그룹·크기·힘)
- **AI 정리/생성**: 노트 목록의 **AI 정리** → 모든 노트에 주제·#태그·[[관련 노트]]를 써넣고 주제별 `MOC · 주제` 목차 노트를 만듦. **AI로 만들기**(주제) · **쪼개기**(노트 하나) · AI 튜터의 **노트로 정리**(대화) → 서로 링크된 개념 노트 여러 개
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
```

- 계정: `gyk` · `chj` · `hsk` — 로컬에서는 **아이디만 입력하면 들어가요** (`.dev.vars` 의 `PASSWORDLESS=1`). 배포된 주소는 `wrangler.jsonc` 의 `PASSWORDLESS: "0"` 이라 비밀번호가 필요해요
- `npm run seed` 를 실행하면 세 계정에 예시 데이터가 들어가요
- AI 키: `.dev.vars` 에 `GEMINI_API_KEY`, `GROQ_API_KEY`, `COHERE_API_KEY`, `MIMO_API_KEY` (git에 올라가지 않아요, 자세한 건 아래 "AI 키")

## 계정 만들기 (가입 화면 대신)

```bash
npm run user:add -- <아이디> <이름> <비밀번호>            # 로컬
npm run user:add -- <아이디> <이름> <비밀번호> --remote   # 배포된 DB
# 같은 아이디로 다시 실행하면 이름·비밀번호가 바뀌고 기존 로그인은 끊겨요
```
- 처음부터 다시: dev 서버를 끄고 `npm run db:reset`

## Cloudflare에 배포

1. https://dash.cloudflare.com/sign-up 에서 무료 가입 (카드 필요 없음) → **가입 메일의 인증 링크를 꼭 누르기** (안 하면 배포가 `code: 10034` 로 막혀요)
2. `npx wrangler login`
3. `.dev.vars` 에 아래 'AI 키' 들과 `INVITE_CODE` 가 들어 있는지 확인
4. **`npm run deploy:all`** — 한 번에 끝나요 (`scripts/deploy.sh`, 여러 번 돌려도 괜찮아요)
   - D1 `dsm-mafia` 가 없으면 만들고 id 를 `wrangler.jsonc` 에 써 넣기
   - 원격 DB 마이그레이션 → `wrangler deploy`
   - `.dev.vars` 의 `GEMINI_API_KEY` `GROQ_API_KEY` `COHERE_API_KEY` `MIMO_API_KEY` `INVITE_CODE` 를 Worker 비밀값으로 올리기 (값은 화면에 안 찍혀요, `PASSWORDLESS` 는 안 올려요)
   - 마지막에 `https://dsm-mafia.<내 서브도메인>.workers.dev` 주소 출력
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
INVITE_CODE=...
PASSWORDLESS=1             # 로컬 전용
```

| 키 | 받는 곳 | 쓰는 곳 · 메모 |
|---|---|---|
| `GEMINI_API_KEY` | https://aistudio.google.com → Get API key | 채팅(Gemini Flash/Pro), 노트 정리 1순위. 무료, 카드 없음. 새 키는 `AQ.` 로 시작 |
| `GROQ_API_KEY` | https://console.groq.com/keys | 채팅(GPT-OSS 120B → 20B → Qwen), 정리 2순위. 아주 빠름. 무료는 분당 약 8천 토큰이라 긴 정리는 다음 순서로 넘겨요 |
| `COHERE_API_KEY` | https://dashboard.cohere.com/api-keys | 채팅(Command A), 정리 3순위, **비슷한 노트 찾기(임베딩 `embed-multilingual-v3.0`)**. 무료(Trial) 키는 한 달 호출 수가 제한돼요 |
| `MIMO_API_KEY` | 샤오미 MiMo 개발자 플랫폼 (`api.xiaomimimo.com`) | 채팅(MiMo, 따로 선택), 정리 마지막 순서. 추론 과정 표시 |

- 채팅의 **전체 비교** = Gemini · Groq · Cohere 세 답을 나란히. 키가 없는 모델은 건너뛰어요.
- 노트 정리/생성(JSON)은 Gemini → Groq → Cohere → MiMo 순서로 되는 곳을 써요.
- `COHERE_API_KEY` 가 없거나 임베딩이 실패하면 '비슷한 노트 후보' 없이 예전처럼 정리해요.

키는 브라우저로 나가지 않고 Worker 비밀값에만 있어요. 사람당 하루 200개 질문 제한(`src/ai.js` 의 `DAILY_LIMIT`).

## 영어 (ENGLISH-OS 연동)

옵시디언 볼트 `ENGLISH-OS`(6개월 영어 프로그램 2026-09-28 → 2027-03-28, 650시간)를 앱 안에서 매일 쓰는 페이지예요.
오늘이 며칠차·몇 주차·어느 스프린트인지 보여 주고, 그날 할 일(소리 블록·생존 문장·이번 주 패턴)과 하루 블록 기록(분·체크리스트·오늘의 한 문장), 내가 막힌 표현, 라이트너 복습 카드, AI 프롬프트 복사를 한곳에서 해요. 기록은 전부 본인만 봐요.

- 공부 내용: `public/english/data.json` (볼트에서 만든 정적 파일)
- 내 기록: D1 `english_days` · `english_phrases` · `english_cards` (`migrations/0007_english.sql`), API는 `src/english.js` (`/api/english/*`)

**볼트를 고쳤으면** 다시 만들어 주세요. 표를 못 읽으면 어느 파일이 문제인지 알려 주고 멈춰요.

```bash
npm run english:import                          # 기본 볼트: /Users/prime/Documents/ENGLISH-OS
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
src/worker.js          API (인증·계획·기록·노트·그래프·검색)
src/ai.js              AI 채팅 (Gemini·MiMo 스트리밍, 기록 참고, 대화 저장)
src/brain.js           AI 정리·생성 (주제·태그·링크 써넣기, MOC 목차, 개념 노트 만들기)
migrations/            D1 스키마
public/                정적 프론트엔드 (빌드 없음, ES 모듈)
  js/app.js            셸 · 라우팅 · ⌘K · 집중 타이머
  js/views/*.js        오늘 · 계획 · 노트 · 그래프 · 우리 셋 · 로그인
  vendor/              marked, DOMPurify
  css/tokens.css       디자인 토큰 (DESIGN.md 참고)
  js/ringhud.js        홈 링 차트 (시간 호 + 달성 호 + 숫자 행)
  js/chart.js          계획 화면 링 차트 · HUD
  assets/fonts, login  Geist, Geist Mono, Pretendard · 로그인 구름 사진
scripts/               smoke.mjs(API+AI 테스트), seed.mjs(예시 데이터), add-user.mjs(계정)
legacy/                이전 단일 파일 버전
```

## 보안 메모

- 가입 API는 기본으로 닫혀 있어요 (`ALLOW_SIGNUP=1` 일 때만 열림)
- 비밀번호: PBKDF2-SHA256 100,000회 + 솔트. 5번 틀리면 5분 잠금
- 세션: 무작위 토큰의 SHA-256만 DB에 저장, HttpOnly · SameSite=Lax 쿠키(https에서는 Secure)
- 쓰기 요청은 `x-trio` 헤더 필수(CSRF 방지), 노트 HTML은 DOMPurify로 정리

## 크레딧

사진 출처와 라이선스는 `public/assets/bg/credits.json`, `public/assets/login/credits.json` 에 있어요. 로그인 화면과 앱 배경(흐리게)은 같은 황금빛 구름 사진을 써요.
