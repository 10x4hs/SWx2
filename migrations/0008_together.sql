-- v5 같이 하기: 첫 로그인 비밀번호 바꾸기 · 할 일별 공부 시간 · 지금 공부 중 · 응원 · 주간 회고

-- 스터디장이 정해 준 비밀번호(지금 셋 다 12345)는 첫 로그인 때 꼭 바꾸게 해요
ALTER TABLE users ADD COLUMN must_change_pw INTEGER NOT NULL DEFAULT 0;
UPDATE users SET must_change_pw = 1;

-- 집중 기록이 어느 할 일(내 계획)에 쌓였는지. 계획을 지우면 기록은 남고 연결만 풀려요
ALTER TABLE logs ADD COLUMN plan_id TEXT REFERENCES plans(id) ON DELETE SET NULL;
CREATE INDEX logs_plan ON logs(plan_id);

-- 지금 공부 중: 한 사람에 한 줄. 무엇을 하는지는 저장하지 않아요 (상태·시각만)
CREATE TABLE presence (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  state TEXT NOT NULL CHECK (state IN ('focus', 'idle')),
  started_at INTEGER,                -- ms, focus 일 때만
  ends_at INTEGER,                   -- ms, 이 시각이 지나면 focus 가 아닌 걸로 봐요
  updated_at INTEGER NOT NULL
);

-- 응원: 한 사람에게 하루(한국 시간) 한 번
CREATE TABLE cheers (
  from_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day TEXT NOT NULL,                 -- 'YYYY-MM-DD' (KST)
  created_at INTEGER NOT NULL,
  PRIMARY KEY (from_id, to_id, day),
  CHECK (from_id != to_id)
);
CREATE INDEX cheers_to_day ON cheers(to_id, day);

-- 주간 회고: AI가 내 기록만으로 쓴 글 (본인만 봄). week = 'YYYY-Www' (ISO 주)
CREATE TABLE weekly_reviews (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  week TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, week)
);
