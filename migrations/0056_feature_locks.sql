-- 기능 잠금: 관리자 말고는 뉴스 · 대화방 · 계획만 기본으로 열려요. 나머지는 기능별로 '사용 신청' → 관리자 한 명이 승인하면 열려요
CREATE TABLE user_features (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  feature TEXT NOT NULL,
  granted_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  at INTEGER NOT NULL,
  PRIMARY KEY (user_id, feature)
);
CREATE TABLE feature_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  feature TEXT NOT NULL,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'pending',   -- 'pending' | 'approved' | 'denied'
  created_at INTEGER NOT NULL,
  decided_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  decided_at INTEGER
);
CREATE INDEX feature_requests_status ON feature_requests(status, created_at);
