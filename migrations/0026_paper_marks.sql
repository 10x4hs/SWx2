-- 논문 공부 페이지 형광펜 · 메모 (본인만 봐요). 본문의 어느 글자인지는 '섹션 + 인용문 + 앞뒤 글자' 로 기억해요
CREATE TABLE paper_marks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  paper TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'page',   -- page(공부 페이지) | easy(쉽게 읽기)
  sec TEXT NOT NULL,                   -- 섹션 id (glance · deep-3 · ez-s2 …)
  quote TEXT NOT NULL,                 -- 칠한 글자 그대로
  prefix TEXT NOT NULL DEFAULT '',     -- 바로 앞 글자 (같은 문장이 여러 번 나올 때 구분)
  suffix TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT 'yellow',-- yellow | green | blue | rose
  memo TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX paper_marks_user ON paper_marks(user_id, paper);
