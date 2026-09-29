# Grill: ENGLISH-OS 연동 — 영어 공부 페이지
Date: 2026-09-29

## Intent
`/Users/prime/Documents/ENGLISH-OS`(6개월 프리토킹 옵시디언 볼트: 매일 기록 YAML, 단계별 일정, 생존 문장 60·기초 패턴 91·시간 벌기·압박 표현·스몰토크 대본·헷갈리는 표현, AI 프롬프트 11종, 체크포인트 13개)를 Dsm-mafia 안에서 공부할 수 있게.

## Key decisions
- Decision: **둘 다** — 앱에 '영어' 페이지를 새로 만들고, 볼트와는 스크립트로 양방향 연결. Reason: 웹(배포됨)은 어디서나 기록·연습, 볼트는 사용자의 원본 자료·대시보드. Alternative considered: 링크만 걸기(연습·기록이 앱에 안 남음), 볼트를 앱 노트로 통째 가져오기(구조화 안 됨).
- Decision: 볼트 → 앱: `npm run english:import` 가 마크다운 표를 파싱해 `public/english/data.json` 생성(자료가 바뀌면 다시 실행).
- Decision: 앱 → 볼트: `npm run english:sync` 가 앱의 영어 기록을 `01 매일 기록/YYYY-MM-DD.md`(YAML: minutes·spoken·newwords·mistakes·mood·week·sprint)와 `05 표현/내가 막힌 표현.md` 에 써넣음 — 옵시디언 대시보드가 그대로 동작.
- Decision: 페이지 구성 = 오늘(4블록 링 차트 + 오늘 일정·문장 + 입력) · 연습(카드: 한국어 보고 떠올리기 → 영어·발음 듣기 → 따라 말하기, 간격 반복) · AI 대화(프롬프트 11종 → AI 튜터로 바로 시작) · 진도(650시간 링, 잔디, 체크포인트) · 막힌 표현.
- Decision: 기록은 본인만(다른 멤버는 못 봄). UI 무채색, 색은 차트에만.
- Decision: 입 연 시간 = 소리 + 말하기 블록(볼트의 S1 60% 비중과 일치).

## Surfaced assumptions
- 볼트 파일은 사용자의 원본 — 테스트는 복사본에서만, 실제 볼트 쓰기는 사용자가 sync를 실행할 때.
- 볼트 git 커밋은 하지 않음.

## Open questions
- 세 멤버 모두 영어 페이지를 쓸지 — 기본값(누구나 쓰고 기록은 각자)으로 배포함. 바꾸려면 사용자 확인.

## Result (2026-09-29)
- 배포: 0007_english 원격 적용, `#/english` 5탭, 스모크 71 PASS.
- 알려진 점: 볼트의 2단계 주차 날짜(W5=10-14)가 스프린트(S2=10-26)와 어긋남 — 볼트 날짜를 따름. sync 첫 실행 시 Day 0 노트 `week: 0 → 1`.
