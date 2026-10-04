# Grill: 링 조각 카드 · 공부 탭 통합 · Dock 사용자 페이지(AI 생성)
Date: 2026-10-04

## Intent
- 홈 링 차트: 조각 하나 = 계획 하나. 조각을 누르면 그 계획 카드가 바로 떠서 끝냄/못함을 체크. 페이지 이동 없이.
- 영어·논문 페이지를 Dock 아이콘 하나 '공부' 아래 탭으로 모은다. 노트는 따로.
- Dock 에서 페이지를 추가·수정·삭제할 수 있고, 추가한 페이지의 기능·구성·디자인은 내장 AI 또는 MCP 로 연결된 AI(Claude Code)가 만든다.

## Constraints
- 페이지 코드는 앱 API 전체(읽기·쓰기)를 쓸 수 있어야 한다 — 단 내 페이지만. 친구가 만든 공유 페이지는 내 계정으로 읽기만.
- 기본 페이지(홈·캘린더·노트·공부·대화)는 고정. 편집(순서·수정·삭제)은 내가 추가한 페이지만.
- 생성 AI 는 지금 내장 모델(Gemini·MiMo 등) 그대로. 추가 비용 없음.

## Key decisions
- Decision: 조각 카드는 보기 + 끝냄/못함 토글. Reason: 글 수정은 기간 페이지에서. Alternative considered: 카드 안 전체 편집(기각 — 카드가 무거워짐).
- Decision: 친구 링 조각도 open 이면 내용 보기만. Reason: 공개 스위치가 이미 있음.
- Decision: '공부' = 영어 | 논문 탭, 기존 화면 재사용. Alternative considered: 노트까지 합치기(기각), 공부 홈 요약 화면(기각).
- Decision: 사용자 페이지는 sandboxed iframe 에서 돌고, postMessage 브리지로 앱 API 호출. 소유자 페이지는 쓰기 허용, 남의 공유 페이지는 읽기만. Reason: 공유 페이지 코드가 보는 사람 권한으로 실행되는 위험.
- Decision: 만드는 흐름 = Dock '+' → 무엇을 만들지 적기 → 미리보기 → 옆 대화로 고치기 + 코드 편집기 탭. 버전 되돌리기.
- Decision: 기본은 내 Dock 에만, 공유 스위치로 셋에게. MCP 에 page 도구(list/read/write) 추가해 Claude Code 에서도 만들고 고침.
- Decision: 세 가지를 한 번에 진행.

## Surfaced assumptions
- "차트를 눌러 계획 확인" 은 기간 페이지로 이동이 아니라 제자리 카드였다.
- "MCP 로 연결된 AI" = 지금 쓰는 Claude Code(dsm-mafia MCP).

## Open questions
- 내장 모델이 짠 페이지 코드 품질. 실패 시 "코드 편집기 / MCP 로 Claude 에게" 안내.

## Out of scope
- Claude API 키 추가. 기본 페이지 숨기기·순서 바꾸기.
