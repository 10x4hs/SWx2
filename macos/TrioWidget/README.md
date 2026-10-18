# TrioWidget — Mac 바탕화면 계획 위젯

메뉴 막대 앱 + WidgetKit 위젯. 계획 목록 · 하루 시계 · 지금/다음 · 이번 주, 내 계획은 체크 · 추가 · 수정, 웹에서 고치면 몇 초 안에 반영.

## 설치 (Xcode 가 있는 Mac)
1. `brew install xcodegen`
2. `macos/TrioWidget/build.sh` — 빌드해서 /Applications 에 넣고 실행해요.
3. 웹 → 프로필 → MCP 연결 → **Mac 위젯** → 위젯 연결 만들기 → **TrioWidget 에 연결**.
4. 바탕화면 오른쪽 클릭 → 위젯 편집 → TrioWidget 을 끌어다 놓기. 위젯 오른쪽 클릭 → 위젯 편집에서 누구 · 모양 · 날짜.

## 구조
- 서명: 무료(ad-hoc). 앱 그룹 대신 위젯 샌드박스의 shared-preference 예외로 `dev.dsmmafia.trio.shared` 설정을 같이 읽어요.
- 실시간: 앱이 5초마다 `GET /api/widget/stamp` → 바뀌면 `WidgetCenter.reloadAllTimelines()`.
- 서버는 `/api/me · /users · /plans · /widget/stamp` 에서 `Authorization: Bearer <토큰>` 을 받아요.
