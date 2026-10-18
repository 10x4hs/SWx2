-- 팀: 누구나 만들고 초대 코드로 들어와요. 한 사람이 여러 팀에 들어갈 수 있어요.
-- 다른 사람의 계획 · 채팅 · 논문 체크 · 공유 페이지 등은 같은 팀 사람끼리만 보여요 (팀이 없으면 혼자 써요)
CREATE TABLE teams (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  owner_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  code TEXT NOT NULL UNIQUE,           -- 초대 코드 (팀장이 새로 만들 수 있어요)
  created_at INTEGER NOT NULL
);
CREATE TABLE team_members (
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at INTEGER NOT NULL,
  PRIMARY KEY (team_id, user_id)
);
CREATE INDEX team_members_user ON team_members(user_id);

-- 지금까지 쓰던 사람 모두 = 첫 팀 'SWx2' (팀장 hsk)
INSERT INTO teams (id, name, owner_id, code, created_at)
  VALUES ('swx2', 'SWx2', (SELECT id FROM users WHERE username = 'hsk'), lower(hex(randomblob(4))), CAST(strftime('%s','now') AS INTEGER) * 1000);
INSERT INTO team_members (team_id, user_id, joined_at)
  SELECT 'swx2', id, created_at FROM users WHERE state = 'active';

-- 창고: 팀마다 따로라서 같은 주소를 다른 팀도 넣을 수 있어요
DROP INDEX library_items_url;
CREATE INDEX library_items_url ON library_items(url);

-- AI 하루 사용량 (첫 팀 SWx2 밖의 사람만 세요 — 키 비용)
CREATE TABLE ai_quota (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  n INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);
