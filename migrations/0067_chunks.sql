-- 뜻으로 찾기 (semantic search) + 근거 달린 AI 튜터 — src/rag.js
-- D1 이 원본(source of truth)이고, Vectorize(swx2-chunks) 는 여기서 다시 만들 수 있는 색인이에요.
--   chunks      : 찾기 단위 하나 = 행 하나. id 는 정해진 규칙이라 다시 색인해도 같은 id 예요.
--                 note:<노트 id>:<순번> (내 노트 조각) · cim:<카드 key> (CIM 카드, 모두 같이) · cimq:<문제 id> (CIM 문제, 글자 찾기 전용)
--                 user_id NULL = 같이 쓰는 자료(CIM). 노트는 늘 주인 한 사람 것 (다른 사람에게 절대 안 보여요).
--                 vec_state: pending(임베딩 필요) · done · error(다시 시도, vec_tries) · skip(벡터 한도를 넘어 글자 찾기만) · none(벡터 안 씀: cimq)
--   chunks_fts  : 글자 찾기 — path(제목 경로) + text 를 (FTS5 trigram — 3글자 이상은 MATCH, 2글자는 LIKE). chunks 를 그대로 비추는 external content 표라 트리거로 맞춰요.
--   rag_docs    : 원본 문서(노트 하나 · CIM 장 파일 하나)를 마지막으로 색인한 때 — 크론이 바뀐 것만 골라요.
--   rag_tomb    : Vectorize 에서 지워야 할 벡터 id (지우기가 실패해도 다음 크론이 다시 지워요).
--   rag_meta    : 작은 상태값 (CIM 장 순번 · 하루 뉴런 어림값).
-- 주의: D1 의 `wrangler d1 export` 는 가상 표(FTS5)가 있으면 실패해요. 내보내기 전에
--   DROP TABLE chunks_fts;  → export →  아래 CREATE VIRTUAL TABLE + 트리거를 다시 만들고  INSERT INTO chunks_fts(chunks_fts) VALUES('rebuild');
--   (내용은 chunks 에 다 있어서 잃는 건 없어요)

CREATE TABLE IF NOT EXISTS chunks (
  rid INTEGER PRIMARY KEY,               -- FTS 가 가리키는 고정 번호 (VACUUM 해도 안 바뀌어요)
  id TEXT NOT NULL UNIQUE,
  user_id TEXT,                          -- NULL = 같이 쓰는 자료 (CIM)
  source_type TEXT NOT NULL,             -- 'note' | 'cim' | 'cimq'
  source_id TEXT NOT NULL,               -- 노트 id | 카드 key (cimq 도 자기 카드 key)
  title TEXT NOT NULL DEFAULT '',
  path TEXT NOT NULL DEFAULT '',         -- 'CIM > 1과목 1장 … > 카드 제목' · '노트 제목 > 절 제목'
  text TEXT NOT NULL DEFAULT '',
  content_hash TEXT NOT NULL,
  vec_state TEXT NOT NULL DEFAULT 'pending',
  vec_tries INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chunks_source ON chunks(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_chunks_user ON chunks(user_id, source_type);
CREATE INDEX IF NOT EXISTS idx_chunks_vec ON chunks(vec_state, source_type);

CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(path, text, content='chunks', content_rowid='rid', tokenize='trigram');
CREATE TRIGGER IF NOT EXISTS chunks_ai AFTER INSERT ON chunks BEGIN
  INSERT INTO chunks_fts(rowid, path, text) VALUES (new.rid, new.path, new.text);
END;
CREATE TRIGGER IF NOT EXISTS chunks_ad AFTER DELETE ON chunks BEGIN
  INSERT INTO chunks_fts(chunks_fts, rowid, path, text) VALUES ('delete', old.rid, old.path, old.text);
END;
CREATE TRIGGER IF NOT EXISTS chunks_au AFTER UPDATE OF path, text ON chunks BEGIN
  INSERT INTO chunks_fts(chunks_fts, rowid, path, text) VALUES ('delete', old.rid, old.path, old.text);
  INSERT INTO chunks_fts(rowid, path, text) VALUES (new.rid, new.path, new.text);
END;

CREATE TABLE IF NOT EXISTS rag_docs (
  key TEXT PRIMARY KEY,                  -- 'note:<id>' | 'cimch:<장 id>'
  user_id TEXT,
  src_updated_at INTEGER NOT NULL DEFAULT 0,
  hash TEXT NOT NULL DEFAULT '',
  indexed_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rag_docs_user ON rag_docs(user_id);

CREATE TABLE IF NOT EXISTS rag_tomb (
  id TEXT PRIMARY KEY,                   -- 지울 벡터 id
  ns TEXT NOT NULL,
  at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS rag_meta (
  k TEXT PRIMARY KEY,
  v TEXT NOT NULL
);
