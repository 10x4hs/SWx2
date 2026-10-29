# 보안 메모


- 가입 API는 기본으로 닫혀 있어요 (`ALLOW_SIGNUP=1` 일 때만 열림)
- 비밀번호: PBKDF2-SHA256 100,000회 + 솔트. 5번 틀리면 5분 잠금
- 비밀번호 바꾸기: 프로필 메뉴 → `POST /api/auth/password` (지금 비밀번호 확인, 새 것 8자 이상, 지금과 달라야 함). 틀리면 로그인과 같은 잠금에 셈. 바꾸면 그 기기만 남기고 다른 로그인은 모두 풀려요. 잊었을 땐 `npm run user:add -- <아이디> <이름> <새 비밀번호> --remote` 로 스터디장이 다시 정해요
- 첫 로그인 비밀번호 바꾸기: 스터디장이 정한 비밀번호(`user:add`)는 `users.must_change_pw = 1` 이에요. 마이그레이션 `0008` 이 기존 계정도 전부 1로 바꿔요 (지금 셋 다 스터디장이 정한 임시 비밀번호라서). 이 표시가 있으면 서버가 `/me` · `/users` · `/auth/*` 말고는 전부 `403 { error, must_change_password: true }` 로 막고, 화면은 닫을 수 없는 비밀번호 창을 띄워요. 비밀번호를 바꾸면 풀려요
  - 로컬(`PASSWORDLESS=1`)은 비밀번호를 안 쓰니 이 표시도 무시해요 (`must_change_pw` 는 항상 false). `npm test` 는 요청에 `x-trio-strict: 1` 헤더를 붙여 배포본처럼 검사해요 — 이 헤더는 검사를 **더 엄격하게만** 하고, 배포본에서는 원래 켜져 있어서 아무 차이가 없어요
- 세션: 무작위 토큰의 SHA-256만 DB에 저장, HttpOnly · SameSite=Lax 쿠키(https에서는 Secure)
- 쓰기 요청은 `x-trio` 헤더 필수(CSRF 방지), 노트 HTML은 DOMPurify로 정리
- 창고 미리보기(`/api/library/preview`)는 서버가 남의 주소를 대신 여는 기능이에요. http(s) 만, 3초 타임아웃, 앞 200KB 만 읽고, 사설 주소는 호스트 이름 문자열로 막아요 (Workers 는 DNS 를 못 풀어서 이름이 사설 IP 로 풀리는 경우까지는 못 잡아요 — Cloudflare 가 내부 주소 연결을 따로 막는 것에 의지). 썸네일은 https 주소만 저장해요
- 대화방: dm 방(`dm:<uidA>:<uidB>`)은 아이디가 든 둘만 읽고 쓸 수 있어요(서버가 403). AI 는 부른 그 방의 메시지 40개와 창고 목록만 프롬프트에 넣어요 — dm 에서 부르면 셋째 사람 메시지는 안 봐요. 개인 노트·일기·계획은 코드상 조회 자체를 안 해요 (`src/room.js` `buildPrompt`)


## 크레딧

사진 출처와 라이선스는 `public/assets/login/credits.json` 에 있어요. 로그인 화면과 앱 배경(흐리게)은 같은 황금빛 구름 사진을 써요.

