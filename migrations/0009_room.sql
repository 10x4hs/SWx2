-- v6 대화방 + 공통 창고: 셋이 같이 쓰는 방 하나, 이름을 부르면 끼어드는 AI, 책·링크·영상 창고

-- 방 설정 (키-값). 'ai_name' → AI 이름, 'ai_last:<user_id>' → 그 사람이 마지막으로 AI 답을 다시 시도한 시각(ms)
CREATE TABLE room_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
INSERT INTO room_settings (key, value) VALUES ('ai_name', '마피아');

-- 방 메시지. room = 'all'(셋 다) 또는 'dm:<uidA>:<uidB>'(1:1, 두 아이디를 정렬해서). user_id 가 NULL 이면 AI(kind 'ai') 또는 시스템(kind 'system') 메시지
-- share: 창고 항목을 방에 올린 것 (ref_id = library_items.id). 항목을 지워도 메시지는 남고 카드만 비어요
CREATE TABLE room_messages (
  id TEXT PRIMARY KEY,
  room TEXT NOT NULL DEFAULT 'all',
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  kind TEXT NOT NULL DEFAULT 'text' CHECK (kind IN ('text', 'ai', 'share', 'system')),
  body TEXT NOT NULL,
  ref_id TEXT,
  reply_to TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX room_messages_room_created ON room_messages(room, created_at);

-- 방마다 마지막으로 읽은 시각 (안 읽은 개수 = 이 시각 뒤에 온 남의 메시지 수)
CREATE TABLE room_reads (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  room TEXT NOT NULL,
  last_read_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, room)
);

-- 공통 창고: 책 · 링크 · 영상. 넣은 사람이 탈퇴해도 항목은 남아요
CREATE TABLE library_items (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('book', 'link', 'video')),
  url TEXT,
  title TEXT NOT NULL,
  author TEXT,
  thumb TEXT,
  description TEXT,
  isbn TEXT,
  video_id TEXT,
  added_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX library_items_url ON library_items(url) WHERE url IS NOT NULL;
CREATE INDEX library_items_created ON library_items(created_at);

-- 멤버별 표시(읽을래요 · 읽는 중 · 다 읽었어요)와 공개 한 줄 메모. 메모만 남기고 표시는 없을 수도(state NULL)
CREATE TABLE library_marks (
  item_id TEXT NOT NULL REFERENCES library_items(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  state TEXT CHECK (state IN ('todo', 'doing', 'done')),
  note TEXT,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (item_id, user_id)
);
