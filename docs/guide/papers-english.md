# 논문 스프린트 · 영어 (지난 프로젝트)

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

