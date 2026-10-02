-- 앱 노트에 넣어 준 공부 구역(📄 논문 공부 · 🇺🇸 영어)을 기억해요 — 다시 넣지 않고, 10-06 에 논문 구역만 지우려고
CREATE TABLE study_seed_notes (
  note_id TEXT PRIMARY KEY REFERENCES notes(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,                -- papers | english
  created_at INTEGER NOT NULL
);
CREATE INDEX study_seed_kind ON study_seed_notes(kind, user_id);
