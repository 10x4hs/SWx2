CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name TEXT NOT NULL,
  color TEXT NOT NULL,
  day_goal INTEGER NOT NULL DEFAULT 240,
  pw_hash TEXT NOT NULL,
  pw_salt TEXT NOT NULL,
  fail_count INTEGER NOT NULL DEFAULT 0,
  locked_until INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,               -- SHA-256 of the cookie token
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE INDEX sessions_user ON sessions(user_id);

-- scope/period: year 'Y:2026' · month 'M:2026-09' · week 'W:2026-W40' · day 'D:2026-09-28'
CREATE TABLE plans (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scope TEXT NOT NULL CHECK (scope IN ('year', 'month', 'week', 'day')),
  period TEXT NOT NULL,
  text TEXT NOT NULL,
  done INTEGER NOT NULL DEFAULT 0,
  start TEXT,                        -- 'HH:MM', day plans only
  mins INTEGER,                      -- planned minutes, day plans only
  sort REAL NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  done_at INTEGER
);
CREATE INDEX plans_user_period ON plans(user_id, period);
CREATE INDEX plans_period ON plans(period);

-- 실행 타임라인: 한 일·메모·집중 기록
CREATE TABLE logs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day TEXT NOT NULL,                 -- 'YYYY-MM-DD'
  at TEXT NOT NULL,                  -- 'HH:MM'
  text TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'note' CHECK (kind IN ('note', 'done', 'focus')),
  created_at INTEGER NOT NULL
);
CREATE INDEX logs_user_day ON logs(user_id, day);

CREATE TABLE notes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  shared INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX notes_user_title ON notes(user_id, title COLLATE NOCASE);

CREATE TABLE note_links (
  src_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  dst_title TEXT NOT NULL COLLATE NOCASE,
  PRIMARY KEY (src_id, dst_title)
);
CREATE INDEX note_links_dst ON note_links(dst_title);

CREATE TABLE note_tags (
  note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  tag TEXT NOT NULL COLLATE NOCASE,
  PRIMARY KEY (note_id, tag)
);
CREATE INDEX note_tags_tag ON note_tags(tag);
