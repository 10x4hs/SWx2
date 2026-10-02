-- MCP 용 OAuth 2.1 (ChatGPT · claude.ai 커넥터처럼 OAuth 로만 붙는 앱)
-- 클라이언트는 스스로 등록(RFC 7591), 로그인은 앱 계정, PKCE(S256) 필수. 비밀값 · 코드 · 토큰은 전부 SHA-256 만 저장해요.

CREATE TABLE oauth_clients (
  client_id TEXT PRIMARY KEY,
  client_secret_hash TEXT,                 -- token_endpoint_auth_method = none 이면 NULL
  client_name TEXT NOT NULL,
  redirect_uris TEXT NOT NULL,             -- JSON 배열 (정확히 같은 주소만 허용)
  created_at INTEGER NOT NULL
);

CREATE TABLE oauth_codes (
  code_hash TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES oauth_clients(client_id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  redirect_uri TEXT NOT NULL,
  code_challenge TEXT NOT NULL,
  scope TEXT NOT NULL,
  expires_at INTEGER NOT NULL,             -- 만든 뒤 5분
  used INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE oauth_tokens (
  access_hash TEXT PRIMARY KEY,
  refresh_hash TEXT NOT NULL UNIQUE,
  client_id TEXT NOT NULL REFERENCES oauth_clients(client_id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scope TEXT NOT NULL,
  access_expires INTEGER NOT NULL,         -- 1시간
  refresh_expires INTEGER NOT NULL,        -- 30일, 쓸 때마다 새로 바꿔요
  created_at INTEGER NOT NULL,
  last_used_at INTEGER
);
CREATE INDEX oauth_tokens_user ON oauth_tokens(user_id, client_id);
