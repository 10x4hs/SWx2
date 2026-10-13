-- 데이터베이스 행 알림 (docs/blocks-schema.md "Reminders"). props._remind 에서 계산해 저장해요 — 크론이 인덱스로 빨리 찾게.
ALTER TABLE notes ADD COLUMN remind_at INTEGER;   -- 알림 시각 (epoch ms, UTC) · NULL = 알림 없음
ALTER TABLE notes ADD COLUMN reminded_at INTEGER; -- 크론이 푸시를 보낸 시각 · NULL = 아직
ALTER TABLE notes ADD COLUMN remind_seen INTEGER; -- 서비스 워커가 알림을 띄운 시각 · NULL = 아직
CREATE INDEX IF NOT EXISTS idx_notes_remind ON notes (remind_at) WHERE remind_at IS NOT NULL;
