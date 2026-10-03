-- 페이지: 노트 안에 하위 노트를 두는 트리 (Notion 페이지처럼). 부모가 지워지면 아이는 최상위로 올라와요.
ALTER TABLE notes ADD COLUMN parent_id TEXT REFERENCES notes(id) ON DELETE SET NULL;
CREATE INDEX notes_parent ON notes(user_id, parent_id);
