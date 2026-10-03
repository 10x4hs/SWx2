# 논문 스프린트 (10.1 – 10.5) 설계

인터뷰 기록: `.grill/papers-sprint.md`

## 목표
셋이 16편을 10월 5일까지 끝낸다. 끝났다는 기준은 **편당 3분 설명**(문제 → 아이디어 → 결과 → 우리 파이프라인에서 쓰이는 곳)이다. 공부 자료는 앱이 제공하고, 진도는 셋이 서로 본다. 옵시디언에서는 현황만 본다.

## 구성
| 조각 | 위치 | 설명 |
|---|---|---|
| 공부 자료 | `public/papers/index.json` (목록·일정·파이프라인), `public/papers/content/<id>.json` (편별), `public/papers/fig/<id>/` (원문 그림 + 직접 그린 `diagram.svg`), `public/papers/pdf/<id>-ko.pdf` (한국어 번역 6편) | 정적 파일. 제작 규칙은 `scripts/papers/CONTENT_SPEC.md` |
| 기록 | D1 `paper_checks` (사람 × 논문 × 단계), `paper_notes` (내 한 줄 정리), `paper_tokens` (옵시디언 임베드용 개인 토큰, 해시로 저장) — `migrations/0016_papers.sql` | 셋이 서로 봄 |
| API | `src/papers.js` → `/api/papers/*` | 아래 참고 |
| 웹 구역 | `#/papers` (현황판) · `#/papers/<id>` (공부 페이지) — `public/js/views/papers.js`, `public/js/papers/*`, `public/css/papers.css` | Dock에 '논문' |
| 옵시디언 현황 | `public/papers/embed.html` — 토큰으로 여는 가벼운 페이지. 옵시디언 노트에 `<iframe>`으로 넣음 | 체크 + 셋 진도 |
| 내 볼트 | `~/Documents/STUDY-OS/` = `🏠 홈.md` + `논문 공부/` + `영어 공부/`(옛 ENGLISH-OS) | launchd가 10-06에 `논문 공부/`를 휴지통으로 |

## 단계 (논문마다 3칸, 총 48칸)
1. **읽기**: 쉬운 설명, 그림, 영상을 보고 '다 읽었어요'를 누른다.
2. **퀴즈**: 5문제 중 4개 이상 맞히면 자동으로 체크된다.
3. **3분 설명**: 내 말로 쓰면 AI가 핵심어 기준으로 채점하고, 70점 이상이면 체크된다. 직접 체크해도 된다.

## API
- `GET /papers/progress` → `{ until, ended, members:[{ user_id, checks:{ [paper]:{ read, quiz, explain, quiz_score, explain_score } }, notes:{ [paper]: text } }] }`
- `PUT /papers/check { paper, step, done, score? }` — 본인만
- `PUT /papers/note { paper, text }` — 한 줄 정리(300자)
- `POST /papers/explain { paper, text }` → `{ score, good[], missing[], tip }`, 70점 이상이면 explain 체크
- `POST /papers/ask { paper, messages }` → `{ text }` 논문 튜터(자료 JSON을 시스템 프롬프트로)
- `POST /papers/obsidian` → `{ filename, markdown }` 새 토큰을 만들고 옛 토큰은 무효가 된다
- 토큰(로그인 없음): `GET /papers/t/:token` → 진도 + 내 정보, `PUT /papers/t/:token/check`
- 10-06 00:00 KST부터(`until = 2026-10-05`) 쓰기는 410, 토큰 페이지는 '끝났어요'와 최종 결과만 보여 준다. 웹 Dock에서도 사라진다.

## 일정
| 날 | 논문 |
|---|---|
| 10.1 (수) | YOLOv10 · ByteTrack |
| 10.2 (목) | FDTA · SAM · SAM 3 |
| 10.3 (금) | DINO · DINOv3 · RT-DETRv4 · C-RADIOv4 |
| 10.4 (토) | VideoMAE · V-JEPA 2.1 · AdaptFormer |
| 10.5 (일) | CMX · M-SpecGene · Integer-only Quantization · IPTQ-ViT |

## 디자인
DESIGN.md를 따른다. 무채색 유리를 쓰고, 색은 파이프라인 단계 7개(차트 색 `--c-*`)와 멤버 색에만 쓴다. 공부 페이지는 한 칼럼 읽기 폭(68ch)에 오른쪽 목차를 두고, 좁은 화면에서는 위쪽 칩으로 바꾼다. 그림은 누르면 크게 보고, 영상은 누르기 전까지 썸네일만 불러온다.

## 오류 처리
- 자료 JSON이 없는 논문은 '자료 준비 중' 카드로 보여 준다.
- AI가 실패하면 토스트를 띄우고, 직접 체크하는 버튼은 늘 남겨 둔다.
- 토큰이 틀리거나 만료되면 임베드가 안내 문구를 보여 준다.

## 테스트
`scripts/smoke.mjs`에 추가: 체크 on/off, 모르는 논문·단계 400, 셋 진도 조회, 한 줄 정리, 토큰 발급·조회·체크, 옛 토큰 무효, 만료 후 410(서버의 `PAPERS_NOW` 테스트 훅).
