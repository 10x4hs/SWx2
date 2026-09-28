-- AI 대화방 (본인만 봄)
CREATE TABLE chats (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  model TEXT NOT NULL,               -- 마지막으로 고른 모델 (gemini / mimo / all …)
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX chats_user ON chats(user_id, updated_at);

CREATE TABLE chat_messages (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  model TEXT,                        -- assistant: 답한 모델 id, user: 보낸 대상
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX chat_messages_chat ON chat_messages(chat_id, created_at);

-- 집중 타이머 기록에 공부 시간(분)
ALTER TABLE logs ADD COLUMN mins INTEGER;
