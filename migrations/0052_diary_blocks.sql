-- 일기를 Notion 블록으로 (blocks = { v: 1, size?, blocks } JSON). NULL 이면 예전 글 일기 — body 만
ALTER TABLE diaries ADD COLUMN blocks TEXT;
