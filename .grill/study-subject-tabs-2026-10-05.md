# Grill: 공부 안에 과목 탭 추가 — 셋이 바로, AI 로 구성·디자인
Date: 2026-10-05

## Intent
- '공부' 스위처(영어 | 논문)에 수학 · 코딩 · 자격증 같은 과목 탭을 나와 친구들이 바로 추가한다.
- 탭 내용과 디자인은 빈 페이지에서 AI 와 대화로 처음부터 만든다.

## Key decisions
- Decision: 과목 탭 = Dock 페이지와 같은 엔진(파일 여러 개 · sandbox · trio 브리지) 에 place=study 를 붙인 것. Reason: 생성 · AI 고치기 · 버전 · 공유가 이미 있음. Alternative: 영어 페이지 틀 복제(기각 — 사용자가 "빈 페이지에서 AI 와").
- Decision: 기본은 나만, 공개 스위치를 켜면 셋의 공부 탭에 보임. 고치기는 만든 사람만, 친구는 '복사해서 내 걸로'. Reason: 사용자 답 "보이게 할 수도, 나 혼자만 쓸 수도".
- Decision: trio.store 를 기기별(localStorage)에서 사람별 서버 저장(user_page_state)으로. 공개 페이지에선 trio.others() 로 친구들의 저장값(진도)을 읽을 수 있음. Reason: 각자 진도가 폰 · 노트북에서 같아야 하고, 친구 진도 나란히 보기가 과목 페이지의 핵심.
- Decision: 주소 #/study/<id> · #/study/new. Dock 에는 안 뜨고 공부 스위처에만.

## Out of scope
- 공동 편집(여럿이 같은 페이지 코드 고치기). 영어 · 논문 기본 탭 수정.
