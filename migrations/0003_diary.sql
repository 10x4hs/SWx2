-- 일기: 하루 한 편, 본인만 봄
CREATE TABLE diaries (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day TEXT NOT NULL,                 -- 'YYYY-MM-DD'
  mood INTEGER CHECK (mood BETWEEN 1 AND 5),
  body TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, day)
);
