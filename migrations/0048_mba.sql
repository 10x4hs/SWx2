-- 경영 마이크로디그리 (#/mba): 카드 단위로 읽은 날과 간격 복습 단계 (본인만).
-- stage 1 = 읽음 → 1일 뒤, 2 → 3일 뒤, 3 → 7일 뒤, 4 → 21일 뒤, 5 → 60일 뒤, 6 = 끝 (Cepeda 2008 의 '목표 기간 대비 간격' 에 맞춘 제안)
CREATE TABLE IF NOT EXISTS mba_reads (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  module TEXT NOT NULL,
  card TEXT NOT NULL,
  stage INTEGER NOT NULL DEFAULT 1,
  due_day TEXT NOT NULL,                 -- YYYY-MM-DD (한국 시간) — 이날부터 복습할 차례
  read_at INTEGER NOT NULL,
  correct INTEGER, total INTEGER,        -- 마지막 확인 퀴즈 결과
  reviews INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, module, card)
);
CREATE INDEX IF NOT EXISTS idx_mba_reads_due ON mba_reads(user_id, due_day);

-- 하루 기록: 그날 공부한 분 · '내일 한 줄' (실행 의도) — 본인만
CREATE TABLE IF NOT EXISTS mba_days (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day TEXT NOT NULL,                     -- YYYY-MM-DD (한국 시간)
  minutes INTEGER NOT NULL DEFAULT 0,
  plan TEXT,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, day)
);
