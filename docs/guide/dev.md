# 개발 · 테스트 · 배포

## 디자인 고치기

- 규칙서: [`DESIGN.md`](../../DESIGN.md) — 분위기, 색, 글꼴, 컴포넌트 규칙, 하지 말 것
- 값: [`public/css/tokens.css`](../../public/css/tokens.css) — 색·반경·그림자·유리·링 톤을 여기서만 바꿔요
- 홈 링: [`public/js/ringhud.js`](../../public/js/ringhud.js) · 그래프: [`public/js/views/graph.js`](../../public/js/views/graph.js) (옵시디언식 2D) · AI 정리 서버: [`src/brain.js`](../../src/brain.js)
- 계획 화면 링: [`public/js/chart.js`](../../public/js/chart.js)
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

