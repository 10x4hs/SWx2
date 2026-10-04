-- 쉽게 읽기: 다 읽은 날과 간격 복습 단계 (본인만)
-- stage 1 = 처음 읽음 → 1일 뒤 복습, 2 → 3일 뒤, 3 → 7일 뒤, 4 = 복습 끝
CREATE TABLE easy_reads (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  paper TEXT NOT NULL,
  stage INTEGER NOT NULL DEFAULT 1,
  due_day TEXT NOT NULL,                 -- YYYY-MM-DD (한국 시간) — 이날부터 복습할 차례
  read_at INTEGER NOT NULL,
  recall INTEGER, recall_total INTEGER,  -- 마지막 '기억해서 말하기'에서 떠올린 핵심 수
  reviews INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, paper)
);
