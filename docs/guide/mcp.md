# MCP 서버


앱을 MCP(Model Context Protocol) 서버로도 열어 뒀어요. Cloudflare 에서 앱과 같이 돌아서 내 컴퓨터를 켜 둘 필요가 없어요.
주소 `https://swx2.swx2.workers.dev/mcp` · Streamable HTTP(POST, JSON 응답) · `Authorization: Bearer <토큰>`. 코드 `src/mcp.js`, 표 `migrations/0018_mcp.sql`.

- **토큰** (연결마다 하나, 원문은 저장 안 하고 SHA-256 만): `node scripts/mcp-token.mjs <아이디> <연결 이름> --remote [--out ~/.config/swx2/mcp.json]` · 목록 `--list` · 끊기 `--revoke`. 연결 이름이 작업판에 "누가 했는지"로 남아요.
- **도구 14개**: `whoami` · 논문 `papers_overview` `paper_read`(summary · deep[+section] · terms) `paper_check` · 노트 `notes_search` `note_read` `note_write`(create · append · replace, 덧붙일 땐 연결 이름으로 서명) · 계획 `plans_list` `plan_add` · **작업판** `tasks_list` `task_get` `task_add` `task_claim` `task_update`
- **작업판**: 한 사람의 여러 에이전트가 같이 보는 할 일. 올리기 → 맡기(다른 에이전트가 하는 중이면 막혀요, `force` 로만) → 기록(누구나) → 끝(맡은 쪽만 상태 변경, `result` 에 결과·노트 제목). 서버가 `initialize` 의 `instructions` 로 이 순서를 알려 줘요.
- 도구는 앱 API 를 안에서 그대로 불러서 검증·권한이 웹과 같아요(`internalCall`). 논문 스프린트가 끝나면 `paper_check` 는 앱과 똑같이 막혀요.
- 연결 예: Claude Code `claude mcp add --transport http swx2 https://swx2.swx2.workers.dev/mcp --header "Authorization: Bearer $TOKEN"` · Cursor/VS Code `mcp.json` 의 `{"url": "…/mcp", "headers": {"Authorization": "Bearer …"}}` · stdio 만 되는 앱은 `npx mcp-remote …/mcp --header "Authorization: Bearer …"`
- 테스트: `scripts/smoke.mjs` 의 MCP 구역(토큰 없음/틀림 401 · initialize · 알림 202 · 도구 · 작업판 보호 · 노트 서명 · 끊은 토큰 401)

