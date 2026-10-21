-- 개인 API 키: 바깥 웹사이트가 내 계획을 읽는 열쇠 (/api/v1, 읽기만). MCP 토큰(api_tokens)과는 따로 — 서로의 주소에서 못 써요
-- 키 자체는 저장하지 않고 sha256 만. prefix = 목록에서 알아보는 앞 몇 글자. win · n = 분 단위 요청 수 (분당 60번까지)
CREATE TABLE user_api_keys (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  prefix TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_used_at INTEGER,
  win INTEGER NOT NULL DEFAULT 0,
  n INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX user_api_keys_user ON user_api_keys(user_id);
