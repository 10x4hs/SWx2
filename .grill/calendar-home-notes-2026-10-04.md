# Grill: 캘린더 한 화면 · 홈 색감 · 친구 계획 내용 · 노트 AI 페이지
Date: 2026-10-04

## Intent
- 캘린더: 달력과 그날이 좌우로 같이 뜨는 걸 없애고, 날짜를 누르면 그날 계획표가 전체 화면으로.
- 친구 계획표: 블록 내용(2시 책읽기 같은 항목)이 보이고, 누르면 상세 카드. 홈 차트에서도 라벨·띠를 누르면 상세.
- 홈 차트 색감: 링 조각 = 종류 색(영어·논문·휴식·사업·기타), 라벨 점 = 우선순위 색. AI 튜터는 Dock 에서 제거.
- 노트: 사용 목적을 적으면 AI 가 Notion 풍 페이지를 만들고, 옆 대화로 계속 고쳐 나감. 영어·논문 공부를 한 페이지로 엮기.

## Key decisions
- Decision: `#/calendar` = 달력만, `#/calendar/YYYY-MM-DD` = 그날 전체 화면 (‹ 달력으로 돌아가기). Dock 캘린더 아이콘은 오늘로.
- Decision: 서버가 친구 계획 text 를 비우던 규칙 삭제 — open/not open 이 그 역할. Reason: "서로는 차트만" 은 공개 스위치가 없던 시절 규칙.
- Decision: AI 계정 로그인(ChatGPT·Claude·Grok·Google)은 이번에 안 함. Reason: Anthropic·Google 은 약관 금지, OpenAI 는 호스팅 앱 승인 대기, xAI 는 비공식. 사용자가 "이번에는 빼기" 선택.

## Out of scope
- 각자 API 키 넣기(BYOK), Sign in with ChatGPT 신청.
