-- 가벼운 온톨로지 (관계 종류가 있는 연결) + decide() 판정 기록 — src/onto.js · src/decide.js
--   note_rel     : 노트 두 개 사이의 관계 하나 = 행 하나. 방향은 사람이 읽는 대로 src → dst ("A 는 B 의 예시" = A → B, rel = example_of).
--                  rel   : is_a · part_of · example_of · causes · contrasts_with · prerequisite_of · defined_by · related(기본)
--                  status: suggested(AI 제안, 받은 편지함) · auto(AI 가 정함 — [[링크]] 가 이미 있는 쌍만, 화면에 'AI' 표시 · 바꾸기/되돌리기 가능)
--                          confirmed(사람이 정함) · rejected(거절 — 같은 쌍은 다시 제안하지 않아요)
--                  origin: human · ai · embedding
--                  본문의 [[링크]] 는 그대로 note_links 에 있어요. 행이 없는 [[링크]] 는 'related' 로 봐요. AI 는 노트 본문을 절대 고치지 않아요.
--                  같은 두 노트(방향 무관)에는 행 하나만 (ux_note_rel_pair).
--   decide_log   : decide() 가 내린 판정 하나 = 행 하나 (질문 종류 · 엔진 · 답 · 확신 · 나중의 사람 결과) → 문턱값을 확정/거절 결과로 맞춰요.
--                  노트 글은 저장하지 않아요 (subject 는 노트 id · 쌍 id 같은 열쇠만).
--   decide_proto : embed-proto 엔진의 원형 벡터 캐시 (사람마다 · 종류마다 · 라벨마다). 다시 만들 수 있는 값이에요.
--   onto_seen    : 노트마다 마지막으로 관계 제안을 돌린 내용 지문 · 시각 (같은 내용이면 다시 묻지 않아요)

CREATE TABLE IF NOT EXISTS note_rel (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  src_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  dst_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  rel TEXT NOT NULL DEFAULT 'related',
  status TEXT NOT NULL DEFAULT 'confirmed',
  origin TEXT NOT NULL DEFAULT 'human',
  confidence REAL,
  evidence TEXT,
  decide_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(user_id, src_id, dst_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_note_rel_pair ON note_rel(user_id, min(src_id, dst_id), max(src_id, dst_id));
CREATE INDEX IF NOT EXISTS idx_note_rel_user_status ON note_rel(user_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_note_rel_dst ON note_rel(dst_id);

CREATE TABLE IF NOT EXISTS decide_log (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  kind TEXT NOT NULL,             -- rel_type · concept_sort · route · test
  subject TEXT NOT NULL DEFAULT '',
  engine TEXT NOT NULL,           -- embed-proto · llm · rules · jev · laya
  answer TEXT NOT NULL,
  confidence REAL,
  probs TEXT,                     -- {"label": p} JSON (작게, 위 5개)
  shadow_engine TEXT,
  shadow_answer TEXT,
  shadow_conf REAL,
  outcome TEXT,                   -- NULL · 사람이 고른 답(라벨) — 맞았는지는 answer 와 비교해요
  outcome_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_decide_log_kind ON decide_log(kind, engine, created_at);
CREATE INDEX IF NOT EXISTS idx_decide_log_subject ON decide_log(user_id, kind, subject);

CREATE TABLE IF NOT EXISTS decide_proto (
  user_id TEXT NOT NULL,          -- '' = 모두 같이 (라벨 설명만으로 만든 원형)
  kind TEXT NOT NULL,
  label TEXT NOT NULL,
  vec TEXT NOT NULL,              -- 1024 개 수 JSON
  n INTEGER NOT NULL DEFAULT 0,   -- 원형에 섞은 노트 수
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, kind, label)
);

CREATE TABLE IF NOT EXISTS onto_seen (
  note_id TEXT PRIMARY KEY REFERENCES notes(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  hash TEXT NOT NULL DEFAULT '',
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_onto_seen_user ON onto_seen(user_id, at);
