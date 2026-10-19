-- 24시간 무료체험: 두 관리자 승인으로 계정이 열리는 순간부터 24시간 동안 잠긴 기능을 모두 써요 (AI 하루 제한은 그대로)
ALTER TABLE users ADD COLUMN trial_until INTEGER;

-- 뉴스 출석 인정: 관리자가 인정한 날은 연속 출석이 끊기지 않아요 (그날이 연속 일수에 더해지지는 않아요)
CREATE TABLE news_excused (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day TEXT NOT NULL,                 -- YYYY-MM-DD (한국 시간)
  by TEXT REFERENCES users(id) ON DELETE SET NULL,
  at INTEGER NOT NULL,
  PRIMARY KEY (user_id, day)
);
