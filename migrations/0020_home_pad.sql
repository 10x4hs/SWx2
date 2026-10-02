-- 홈 첫 화면: 오늘의 다짐(셋이 봄, 날마다 한 줄) · 메모장(나만 봄, 한 장)
CREATE TABLE pledges (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day TEXT NOT NULL,                  -- 'YYYY-MM-DD' (한국 시간)
  body TEXT NOT NULL,                 -- 120자
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, day)
);
CREATE TABLE home_memos (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL DEFAULT '',      -- 20,000자
  updated_at INTEGER NOT NULL
);
