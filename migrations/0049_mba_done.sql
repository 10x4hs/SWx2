-- 경영 마이크로디그리 v2: 카드 말고 끝낸 것 — 케이스 · 연습문제 · 강의 (본인만). 간격 복습은 카드(mba_reads)만 해요.
CREATE TABLE IF NOT EXISTS mba_done (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  module TEXT NOT NULL,
  item TEXT NOT NULL,                    -- 케이스 · 문제 · 강의 id (모듈 안에서 하나)
  kind TEXT NOT NULL CHECK (kind IN ('case', 'problem', 'lecture')),
  score INTEGER, total INTEGER,          -- 문제: 맞히면 1/1, 틀리면 0/1 (마지막 시도)
  done_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, module, item)
);
CREATE INDEX IF NOT EXISTS idx_mba_done_user ON mba_done(user_id, done_at);
