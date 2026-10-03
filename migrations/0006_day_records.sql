-- 하루 기록: 그날 세운 계획·실행 기록·점수를 그대로 얼려 둔 사본 (본인만 봄)
-- 직접 저장(auto = 0)하거나, 자정이 지나면 서버가 자동으로 저장(auto = 1)해요.
CREATE TABLE day_records (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day TEXT NOT NULL,                 -- 'YYYY-MM-DD'
  data TEXT NOT NULL,                -- JSON: plans, logs, 점수 계산값
  score INTEGER,
  done INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL DEFAULT 0,
  auto INTEGER NOT NULL DEFAULT 0,
  saved_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, day)
);
