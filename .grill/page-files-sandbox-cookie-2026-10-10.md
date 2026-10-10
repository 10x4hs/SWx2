# Grill: 과목 탭이 글자만 뜨는 문제 — 원인과 고치는 범위
Date: 2026-10-10

## Intent
- Foundation Model Study 탭이 실제 앱에서 제대로(스타일 · 스크립트 · 화면 높이) 보이게 한다.
- 같은 문제로 다른 여러 파일 페이지(친구 과목 탭, 빈 과목 템플릿)도 깨지지 않게 앱을 고친다.

## Key decisions
- Decision: 둘 다 — 탭은 지금 바로 index.html 한 파일로 합쳐 다시 올리고, 앱은 브랜치 · PR 로 고친다. Reason: 사용자 선택("둘 다"). Alternative considered: 탭만 한 파일로(다른 페이지는 계속 깨짐) · 앱만 고치기(배포 전까지 탭이 깨진 채).
- Decision: /pf 하위 요청은 페이지 하나에 묶인 12시간 HMAC 토큰을 주소에 넣는다(/pf/<id>/~<token>/…). Reason: sandbox iframe(allow-same-origin 없음)은 출처가 없어 SameSite=Lax 쿠키가 안 붙음 — 재현 실험으로 확인. 내장 브라우저(/px/<token>/)가 이미 같은 방식. 토큰을 페이지에 묶어서 공유 페이지 코드가 보는 사람의 다른 페이지를 못 읽게. Alternative considered: 페이지 파일을 쿠키 없이 공개(UUID 만으로 접근 — 비공개 페이지가 새어 나감), 서버에서 css/js 인라인(다른 html · 이미지 · fetch 는 여전히 깨짐).
- Decision: 공부 탭 안 페이지의 높이 사슬을 CSS 로 이어 준다(.host-page > .study-wrap). Reason: 측정 결과 Dock 789px vs 공부 탭 150px — iframe 기본 높이로 잘림.

## Surfaced assumptions
- 앞선 "확인했어요"는 file:// 미리보기와 내용 diff 뿐이었고 실제 러너(sandbox iframe + 쿠키)는 확인하지 않았음. 이후 검증은 앱과 같은 조건(로컬 wrangler dev + 진짜 러너)에서.

## Open questions
- 프로덕션 배포(npm run deploy:all)는 사용자 확인 후.
