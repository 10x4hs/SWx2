-- AI 정리: 노트마다 주제 하나, 주제마다 한두 문장 요약 (목차 노트와 그래프 성운 색에 써요)
ALTER TABLE notes ADD COLUMN topic TEXT;
CREATE INDEX notes_user_topic ON notes(user_id, topic);
CREATE TABLE topics (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL COLLATE NOCASE,
  summary TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, name)
);
