# Mac 바탕화면 위젯 — 설계

2026-10-18 · 승인: 사용자 ("이대로 만들고 PR까지", 유료 개발자 계정은 안 씀)

## 무엇을
- `macos/TrioWidget`: 메뉴 막대 앱 + WidgetKit 위젯 (Swift · SwiftUI, macOS 14+). XcodeGen(`project.yml`)으로 프로젝트를 만들어요.
- 위젯 편집에서 고르기: 누구(나 · 친구) · 모양(목록 · 하루 시계 · 지금/다음 · 이번 주) · 날짜(오늘 · 내일). 크기 셋.
- 내 계획: 동그라미로 바로 체크(AppIntent), ＋ · 줄 누르기 → 앱의 작은 추가 · 수정 창(위젯은 글자 입력이 안 돼요). 보기 → 웹의 그날 계획. 친구 계획은 보기만.
- 실시간: 앱이 5초마다 `GET /api/widget/stamp`(지난주~다음 주 계획 수 + 마지막 수정 시각)를 묻고, 바뀌면 `WidgetCenter.reloadAllTimelines()`. 로그인 항목으로 자동 실행.

## 서버
- `/api/me · /users · /plans · /plans/:id · /widget/stamp` 은 `Authorization: Bearer <api_tokens 토큰>` 도 받아요(그 밖의 주소는 여전히 쿠키만 — 일기 · 토큰 관리 등은 토큰으로 못 써요).
- 연결: 웹 프로필 → MCP 연결 → Mac 위젯 → 토큰 `mac-widget` 을 만들고 `triowidget://connect?base&token` 링크로 앱에 넘겨요.

## 배포
- 무료 Apple ID(개인 팀)로 서명 — 이 Mac 에서 빌드해서 써요. 친구 Mac 은 각자 빌드하거나 받은 앱을 시험해 봐야 해요.
