-- 대화방 사진 · 영상: room_messages.kind 에 'image' · 'video' 추가 (ref_id = R2 키 room-<uuid>.<ext>, body = 캡션 · 비어도 돼요)
-- SQLite 는 CHECK 를 못 고쳐서 표를 새로 만들어 옮겨요. room_messages 를 가리키는 표는 없어요
PRAGMA defer_foreign_keys = true;
CREATE TABLE room_messages_new (
  id TEXT PRIMARY KEY,
  room TEXT NOT NULL DEFAULT 'all',
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  kind TEXT NOT NULL DEFAULT 'text' CHECK (kind IN ('text', 'ai', 'share', 'system', 'image', 'video')),
  body TEXT NOT NULL,
  ref_id TEXT,
  reply_to TEXT,
  created_at INTEGER NOT NULL
);
INSERT INTO room_messages_new (id, room, user_id, kind, body, ref_id, reply_to, created_at)
  SELECT id, room, user_id, kind, body, ref_id, reply_to, created_at FROM room_messages;
DROP TABLE room_messages;
ALTER TABLE room_messages_new RENAME TO room_messages;
CREATE INDEX room_messages_room_created ON room_messages(room, created_at);
