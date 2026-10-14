-- 노트 페이지 기록: 저장 직전 상태를 10분에 한 번씩 남겨요 (노트마다 최신 30개)
CREATE TABLE IF NOT EXISTS note_versions (
  id TEXT PRIMARY KEY,
  note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  blocks TEXT,
  body TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_note_versions_note ON note_versions (note_id, created_at DESC);
