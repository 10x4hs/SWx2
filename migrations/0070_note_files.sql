-- 노트 첨부 파일 · 사진 (2026-10-26). 실제 내용은 R2 FILES 의 키 nf-<uuid>.<ext>, 여기는 주인 · 크기 (사람마다 1GB 까지)
-- 블록이나 노트를 지워도 파일은 남아요 (되돌리기 · 노트 되살리기로 다시 살릴 수 있게). 남은 파일 정리는 나중에.
CREATE TABLE note_files (
  key TEXT PRIMARY KEY,                 -- R2 키 'nf-<uuid>.<ext>'
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  note_id TEXT NOT NULL,                -- 처음 올린 노트
  name TEXT NOT NULL,                   -- 올린 파일 이름 (내려받을 때 이 이름으로)
  type TEXT NOT NULL,                   -- 올릴 때 알려 준 content-type
  size INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX note_files_user ON note_files(user_id);
CREATE INDEX note_files_note ON note_files(note_id);
