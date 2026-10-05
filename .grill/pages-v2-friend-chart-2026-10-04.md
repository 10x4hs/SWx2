# Grill: 친구 차트 → 하루 계획표 · 페이지 v2 (여러 파일 · 외부 자원 · URL 페이지 · AI 모델 선택)
Date: 2026-10-04

## Intent
- 친구 홈에서 오늘 링을 누르면 친구의 하루 계획표가 전체 화면으로(보기만). 올해·달·주 링은 친구의 그 기간 목표 목록.
- Dock 페이지로 https://ando55.vercel.app 같은 손으로 짠 정적 사이트 수준을 만들고, 배포 없이 셋이 본다.
- 페이지 패널에서 내장 AI 모델을 고른다 (노트와 같은 선택기, 기본 Gemini).
- 외부 사이트 URL 을 Dock 페이지로 띄운다.

## Constraints
- 외부 자원(CDN · 폰트 · 이미지 · 외부 API fetch) 제한 없음. 앱 데이터는 여전히 브리지로만 (sandbox).
- 남이 공유한 페이지는 읽기만 — 그대로.

## Key decisions
- Decision: 페이지 = 여러 파일(index.html · style.css · app.js · 다른 html …). 서버가 /pf/<id>/<path> 로 그대로 서빙하고 html 에는 브리지 스크립트를 끼워 넣는다. iframe 은 sandbox(allow-same-origin 없음). Reason: 상대 경로 · 여러 장 사이트가 그대로 돌아야 함. Alternative: srcdoc 한 파일(기각 — 다른 html 로 못 넘어감).
- Decision: 기존 code 컬럼 = index.html 과 같은 뜻으로 유지 (MCP page_write 호환). 버전은 파일 묶음 JSON 스냅샷.
- Decision: URL 페이지(kind=url) 는 iframe src 로 띄우고, 막히면 '새 창으로' 안내.
- Decision: 친구 링 클릭 시 토스트 대신 이동/목록. 하루 → #/calendar/<day>/u/<id>.

## Out of scope
- GitHub 저장소 가져오기 (사용자가 "다음에"). 이미지 업로드.
