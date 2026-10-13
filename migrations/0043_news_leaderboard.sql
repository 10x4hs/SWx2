-- 읽기 대결: 처음 읽은 때(read_at)와 사람별 하루 몫(quota)
ALTER TABLE news_reads ADD COLUMN read_at INTEGER;
UPDATE news_reads SET read_at = updated_at WHERE read = 1 AND read_at IS NULL;
CREATE INDEX IF NOT EXISTS news_reads_read_at ON news_reads(read_at) WHERE read_at IS NOT NULL;
CREATE TABLE IF NOT EXISTS news_prefs (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  quota INTEGER NOT NULL DEFAULT 5,
  updated_at INTEGER NOT NULL
);
