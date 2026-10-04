# Grill: 내장 브라우저 — iframe 을 막는 사이트(YouTube)를 앱 안에서 (프록시 실험)
Date: 2026-10-04

## Intent
- 앱을 "내 모든 걸 하는 한 곳"으로. Aside 처럼 왼쪽 앱 · 오른쪽 사이트. YouTube 등 끼워 넣기를 막는 사이트도 Dock URL 페이지로 보고 싶다.
- 데스크톱 앱은 싫다 — 웹만 유지.

## Constraints
- 웹만. 별도 서버 없음. Cloudflare Workers 무료 요금제(CPU 10ms/요청).
- 프록시로 받아온 외부 코드가 우리 앱 쿠키·데이터에 손대면 안 된다.

## Key decisions
- Decision: 사용자가 모순(웹만 + YouTube 안에서)을 알고도 "프록시 브라우저 실험" 선택. 한계 고지: 구글·네이버 로그인 불가, 사이트마다 깨질 수 있음, 무료 요금제라 느리거나 끊길 수 있음.
- Decision: 1단계는 Worker 의 HTMLRewriter 스트리밍 재작성 프록시(/px/<토큰>/<주소>) + 페이지 안 shim(fetch · XHR · open 패치). Ultraviolet/Scramjet(wisp 서버 필요) 은 2단계 후보. Reason: 무료 요금제 CPU 한도에 HTMLRewriter 가 가장 가볍고, 기존 sw.js 와 충돌 없음.
- Decision: 끼워 넣기 가능 여부를 서버가 먼저 확인(/api/embed-check: X-Frame-Options · CSP frame-ancestors) → 되면 직접, 막히면 프록시. 프록시 응답은 CSP sandbox(allow-same-origin 없음) + iframe sandbox 이중 격리, 인증은 쿠키 대신 1시간짜리 HMAC 토큰(URL 안). Reason: 외부 코드가 우리 오리진 권한을 못 얻게.
- Decision: 프록시는 로그인 사용자만, 사설 IP·자기 자신 금지, 쿠키 전달 안 함(무상태).

## Surfaced assumptions
- "Aside 처럼" = 브라우저 엔진이 있는 데스크톱 앱이라는 점을 사용자는 전제하지 않았음 → 웹 프록시로 흉내.

## Open questions
- 이전 턴의 두 요청(AI 이미지 검색·다운로드, 코드 탭 IDE식 파일 트리)은 이 작업 뒤 별도 인터뷰.
- YouTube 재생이 프록시로 실제로 되는지는 배포 후 검증.

## Out of scope
- 데스크톱 앱(Electron/Tauri). 원격 브라우저 스트리밍(neko). 프록시 안 로그인 유지.
