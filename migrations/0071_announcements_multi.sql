-- 공지 여러 개 (0055 의 announcements 표를 그대로 써요): 순서 · 끝나는 때 · 고친 때 · 지운 때를 더해요.
-- 예전에는 새 공지를 올리면 앞 공지가 active = 0 으로 내려갔어요 → 그런 예전 기록은 목록에서 빼요 (deleted_at).
-- 지금 떠 있던 공지 하나(active = 1)는 그대로 목록의 첫 줄이 돼요.
ALTER TABLE announcements ADD COLUMN sort INTEGER NOT NULL DEFAULT 0;
ALTER TABLE announcements ADD COLUMN ends_at INTEGER;     -- 이때가 지나면 자동으로 안 보여요 (NULL = 계속)
ALTER TABLE announcements ADD COLUMN updated_at INTEGER;  -- 글 · 끝나는 때를 고치면 바뀌어요 → 닫았던 사람에게 다시 떠요
ALTER TABLE announcements ADD COLUMN deleted_at INTEGER;  -- 지운 공지 (목록에서 빠져요)
UPDATE announcements SET updated_at = created_at;
UPDATE announcements SET deleted_at = created_at WHERE active = 0;
CREATE INDEX IF NOT EXISTS announcements_live ON announcements(deleted_at, active, sort);
