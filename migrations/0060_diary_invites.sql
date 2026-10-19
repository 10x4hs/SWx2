-- 일기 친구: 아이디로 초대 → 상대가 수락하면 둘이 서로의 '공개' 일기를 읽어요. 팀과 상관없이, 둘이 동의한 사이만
CREATE TABLE diary_links (
  a TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,          -- 두 사람 id 중 작은 쪽
  b TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,          -- 큰 쪽
  inviter TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  state TEXT NOT NULL DEFAULT 'pending',                           -- 'pending' | 'accepted'
  created_at INTEGER NOT NULL,
  accepted_at INTEGER,
  PRIMARY KEY (a, b)
);
CREATE INDEX diary_links_b ON diary_links(b);
-- 예전 일기 모임(diary_circle = 1, HSK · GYK)은 서로 수락한 일기 친구로 옮겨요
INSERT OR IGNORE INTO diary_links (a, b, inviter, state, created_at, accepted_at)
  SELECT x.id, y.id, x.id, 'accepted', CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000
  FROM users x JOIN users y ON x.id < y.id WHERE x.diary_circle = 1 AND y.diary_circle = 1;
