-- 사용자 페이지: Dock 에 내가 추가하는 화면. 코드(HTML 한 파일)는 sandbox iframe 에서 돌고 trio.api 브리지로 앱 API 를 써요.
-- shared=1 이면 셋의 Dock 에 보여요 (남의 페이지는 읽기만). 고칠 때마다 이전 코드는 user_page_versions 에 남아 되돌릴 수 있어요.
CREATE TABLE user_pages (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT '✨',
  purpose TEXT NOT NULL DEFAULT '',
  code TEXT NOT NULL DEFAULT '',
  shared INTEGER NOT NULL DEFAULT 0,
  sort INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX user_pages_user ON user_pages(user_id, sort);
CREATE TABLE user_page_versions (
  id TEXT PRIMARY KEY,
  page_id TEXT NOT NULL REFERENCES user_pages(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE INDEX user_page_versions_page ON user_page_versions(page_id, created_at);
