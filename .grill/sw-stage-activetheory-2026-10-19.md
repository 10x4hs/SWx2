# Grill: SW 공간을 Active Theory 처럼 — 인터랙티브하지만 읽기 쉽게
Date: 2026-10-19

## Intent
첫 SW 디자인(검정 + 얇은 글씨 + 희미한 점)은 요청을 놓쳤어요. activetheory.net 의 핵심인 화면 전체 인터랙티브 WebGL 을 SW 공간에 넣고, 글은 읽기 쉽게 둬요.

## Key decisions
- Decision: 홈(SW · 과정)은 전체 화면 장면, 주 · 카드 화면은 같은 장면이 흐리게 깔리고 불투명 읽기 패널. Alternative considered: 모든 화면 장면 중심(긴 글 가독성 나쁨), 홈만.
- Decision: SW 홈 = 유리 고리 + 커서 · 스크롤에 반응하는 입자. VG 홈 = 카드 160장 임베딩 점구름(모듈 색 무리, 커서 근처 kNN 선, 누르면 그 무리로). Dev = 12 정거장 ∞ 고리(같은 엔진).
- Decision: 오른쪽 위 알약 메뉴 + 아래 << 이름 >> 넘기기 (휠 · 스와이프 · ← →).
- Decision: Dev Flow 도 같은 엔진으로.

## Constraints
- 움직임 줄이기 = 멈춘 장면. WebGL 없으면 2D 대체. 폰 390px 에서 넘침 없음. three.js r128 (/vendor/three.min.js).
