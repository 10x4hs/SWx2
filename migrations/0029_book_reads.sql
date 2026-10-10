-- AI 공부책 (#/books): 장 단위로 다 읽은 날과 간격 복습 단계 (본인만). easy_reads 와 같은 규칙 — stage 1 = 읽음 → 1일 뒤, 2 → 3일 뒤, 3 → 7일 뒤, 4 = 끝
CREATE TABLE book_reads (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  book TEXT NOT NULL,
  chapter TEXT NOT NULL,
  stage INTEGER NOT NULL DEFAULT 1,
  due_day TEXT NOT NULL,                 -- YYYY-MM-DD (한국 시간) — 이날부터 복습할 차례
  read_at INTEGER NOT NULL,
  recall INTEGER, recall_total INTEGER,  -- 마지막 '책 덮고 말해 보기'에서 떠올린 핵심 수
  reviews INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, book, chapter)
);
-- 이번 주 실습 체크 (task = "<book>/<chapter>/<n>")
CREATE TABLE book_tasks (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task TEXT NOT NULL,
  done_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, task)
);
