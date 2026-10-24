-- 할 일 보드 (#/checklist 의 '보드' 보기, 2026-10-24). 체크리스트 할 일(plans, scope='day', start 없음)을 칸(할 일 · 진행 중 · 완료 …)으로 나눠 봐요.
-- 새 칸은 모두 비어 있어도(NULL) 예전과 똑같이 움직여요: status NULL = done 이면 '완료', 아니면 '할 일' 칸.
ALTER TABLE plans ADD COLUMN status TEXT;    -- 보드 칸 id ('todo' · 'doing' · 'done' · 내가 만든 칸 'c-…'). 'done' 은 언제나 done = 1 과 같이 가요 (서버가 맞춰요)
ALTER TABLE plans ADD COLUMN project TEXT;   -- 프로젝트 태그 (자유 글, 30자까지). 색은 task_board.tags
ALTER TABLE plans ADD COLUMN due TEXT;       -- 마감일 'YYYY-MM-DD'. period(D:…) 는 '하는 날', due 는 '끝내야 하는 날' — 따로예요
ALTER TABLE plans ADD COLUMN subtasks TEXT;  -- 작은 할 일 JSON [{"t": "글", "d": 0|1}] 최대 20개
ALTER TABLE plans ADD COLUMN note TEXT;      -- 메모 (2000자까지)
CREATE INDEX plans_user_open ON plans(user_id, scope, done);

-- 사람마다 보드 칸 설정 · 프로젝트 색 (없으면 기본 세 칸: 할 일 · 진행 중 · 완료)
CREATE TABLE task_board (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  cols TEXT NOT NULL,                  -- JSON [{"id": "todo", "name": "할 일"}, …] — 'todo' · 'done' 은 꼭 있어요 (이름만 바꿀 수 있어요)
  tags TEXT NOT NULL DEFAULT '{}',     -- JSON {"프로젝트 이름": "blue" | "green" | …}
  updated_at INTEGER NOT NULL
);
