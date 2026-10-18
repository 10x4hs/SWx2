-- 관리자 공지: 모든 사람 화면 위에 떠요 (가장 최근 것 하나, 닫으면 그 사람 화면에서만 숨어요)
CREATE TABLE announcements (
  id TEXT PRIMARY KEY,
  body TEXT NOT NULL,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  active INTEGER NOT NULL DEFAULT 1
);
