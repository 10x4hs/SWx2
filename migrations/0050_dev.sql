-- 개발 흐름 마이크로디그리 (#/dev): 경영 과정(mba_*)과 같은 모양의 사람별 기록. 내용은 정적 파일(public/dev/*.json).
-- 카드: 읽은 날 · 간격 복습 단계 (1 → 3 → 7 → 21 → 60일 → 끝)
CREATE TABLE IF NOT EXISTS dev_reads (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  module TEXT NOT NULL,
  card TEXT NOT NULL,
  stage INTEGER NOT NULL DEFAULT 1,
  due_day TEXT NOT NULL,                 -- YYYY-MM-DD (한국 시간)
  read_at INTEGER NOT NULL,
  correct INTEGER, total INTEGER,
  reviews INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, module, card)
);
CREATE INDEX IF NOT EXISTS idx_dev_reads_due ON dev_reads(user_id, due_day);

-- 하루 기록: 공부한 분 · '내일 한 줄'
CREATE TABLE IF NOT EXISTS dev_days (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  minutes INTEGER NOT NULL DEFAULT 0,
  plan TEXT,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, day)
);

-- 끝낸 것: 사례 · 회의실 문제 · 강의
CREATE TABLE IF NOT EXISTS dev_done (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  module TEXT NOT NULL,
  item TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('case', 'problem', 'lecture')),
  score INTEGER, total INTEGER,
  done_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, module, item)
);
CREATE INDEX IF NOT EXISTS idx_dev_done_user ON dev_done(user_id, done_at);
