-- Notion 같은 블록 편집기 (docs/blocks-schema.md). body 는 블록에서 만든 마크다운 사본으로 계속 남아요 (링크 · 그래프 · 검색 · AI).
ALTER TABLE notes ADD COLUMN blocks TEXT;          -- { "v": 1, "blocks": [...] } · NULL 이면 예전 노트 (body 에서 바꿔 읽어요)
ALTER TABLE notes ADD COLUMN kind TEXT NOT NULL DEFAULT 'page'; -- 'page' | 'database'
ALTER TABLE notes ADD COLUMN props TEXT;           -- 데이터베이스 한 줄(행)의 속성 값 { key: value }
ALTER TABLE notes ADD COLUMN db TEXT;              -- 데이터베이스의 속성 · 보기 { props: [], views: [] }

-- 다른 길(AI 정리 · MCP · 연결 추가)이 body 만 고치면 낡은 블록을 버려요 → 다음에 열 때 body 에서 다시 만들어요
CREATE TRIGGER IF NOT EXISTS notes_body_drops_stale_blocks
AFTER UPDATE OF body ON notes
WHEN NEW.blocks IS NOT NULL AND NEW.blocks IS OLD.blocks AND NEW.body IS NOT OLD.body
BEGIN
  UPDATE notes SET blocks = NULL WHERE id = NEW.id;
END;
