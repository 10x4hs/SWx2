-- MCP: 어떤 MCP 클라이언트든 앱에 붙는 길 (/mcp, Cloudflare 에서 돌아요)
-- 토큰은 연결마다 하나(agent = 그 연결의 이름: claude-code · cursor · laptop …) — 누가 무엇을 했는지 남기려고. 원문은 저장하지 않고 SHA-256 만.
CREATE TABLE api_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  agent TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_used_at INTEGER,
  UNIQUE (user_id, agent)
);

-- 에이전트 공용 작업판: 한 사람(user)의 에이전트들이 같이 보는 할 일. 올리기 → 맡기 → 기록 → 끝
CREATE TABLE agent_tasks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  detail TEXT,
  assignee TEXT NOT NULL DEFAULT 'anyone',   -- 누가 하면 좋은지: 에이전트 이름 | anyone
  status TEXT NOT NULL DEFAULT 'todo',       -- todo | doing | blocked | done
  claimed_by TEXT,                           -- 실제로 맡은 에이전트
  result TEXT,                               -- 끝낼 때 남기는 결과 요약
  log TEXT NOT NULL DEFAULT '[]',            -- [{at, agent, text}] 진행 기록
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX agent_tasks_user ON agent_tasks(user_id, status, updated_at DESC);
