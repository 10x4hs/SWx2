# Grill: SW 공간 + Vector & Graph 과정
Date: 2026-10-19

## Intent
#/dev 를 'SW' 공간으로 바꾸고, Dev Flow 는 그 안의 과정 하나로. 벡터 데이터와 그래프(벡터DB · 지식그래프 · GraphRAG)를 처음부터 끝까지 공부할 과정을 새로 만든다. 디자인은 activetheory.net 느낌 — 미니멀, 그러나 가독성.

## Key decisions
- Decision: #/sw 홈 + 과정 카드 목록, #/dev → #/sw/dev 로 이동. Reason: 과정 추가가 쉬움. Alternative considered: #/dev 유지·이름만 변경.
- Decision: 범위 = 임베딩 · 유사도 · ANN 인덱스 · 벡터DB → 그래프DB · 지식그래프 → GraphRAG. Alternative considered: 순수 선형대수/그래프 이론.
- Decision: Dev Flow 와 같은 모듈 형식(카드 20 · 사례 2 · 문제 15 · 강의) — 엔진 재사용, 기록은 vg_* 표.
- Decision: SW 공간 전체에 검정 바탕 · 얇은 큰 제목 · 넓은 여백 · 은은한 입자 배경 1개, 본문은 읽기 쉬운 크기.

## Out of scope
- 회전하는 3D 차트 (학습 그림은 정적 2D).
