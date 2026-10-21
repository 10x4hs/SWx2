-- 온톨로지 과정 (#/sw/onto) · Palantir AIP 과정 (#/sw/aip): Vector & Graph(vg_*)와 같은 모양의 사람별 기록. 내용은 정적 파일(public/onto · public/aip).
-- 카드: 읽은 날 · 간격 복습 단계 (1 → 3 → 7 → 21 → 60일 → 끝)
CREATE TABLE IF NOT EXISTS onto_reads (
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
CREATE INDEX IF NOT EXISTS idx_onto_reads_due ON onto_reads(user_id, due_day);

-- 하루 기록: 공부한 분 · '내일 한 줄'
CREATE TABLE IF NOT EXISTS onto_days (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  minutes INTEGER NOT NULL DEFAULT 0,
  plan TEXT,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, day)
);

-- 끝낸 것: 사례 · 회의실 문제 · 강의
CREATE TABLE IF NOT EXISTS onto_done (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  module TEXT NOT NULL,
  item TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('case', 'problem', 'lecture')),
  score INTEGER, total INTEGER,
  done_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, module, item)
);
CREATE INDEX IF NOT EXISTS idx_onto_done_user ON onto_done(user_id, done_at);

-- 카드: 읽은 날 · 간격 복습 단계 (1 → 3 → 7 → 21 → 60일 → 끝)
CREATE TABLE IF NOT EXISTS aip_reads (
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
CREATE INDEX IF NOT EXISTS idx_aip_reads_due ON aip_reads(user_id, due_day);

-- 하루 기록: 공부한 분 · '내일 한 줄'
CREATE TABLE IF NOT EXISTS aip_days (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  minutes INTEGER NOT NULL DEFAULT 0,
  plan TEXT,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, day)
);

-- 끝낸 것: 사례 · 회의실 문제 · 강의
CREATE TABLE IF NOT EXISTS aip_done (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  module TEXT NOT NULL,
  item TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('case', 'problem', 'lecture')),
  score INTEGER, total INTEGER,
  done_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, module, item)
);
CREATE INDEX IF NOT EXISTS idx_aip_done_user ON aip_done(user_id, done_at);
