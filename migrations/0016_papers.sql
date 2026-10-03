-- 논문 스프린트 (2026-10-01 → 10-05): 16편 × 3단계 체크 · 한 줄 정리 · 옵시디언 임베드 토큰
-- 셋이 서로의 체크와 한 줄 정리를 봐요 (쓰기는 본인만)

CREATE TABLE paper_checks (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  paper TEXT NOT NULL,               -- yolov10 · bytetrack …
  step TEXT NOT NULL,                -- read | quiz | explain
  score INTEGER,                     -- quiz: 맞힌 수(0~5) · explain: AI 점수(0~100)
  done_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, paper, step)
);

CREATE TABLE paper_notes (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  paper TEXT NOT NULL,
  body TEXT NOT NULL,                -- 내가 이해한 한 줄 (300자)
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, paper)
);

-- 옵시디언 노트의 <iframe> 이 로그인 없이 여는 개인 주소. 원문은 저장하지 않고 SHA-256 만.
CREATE TABLE paper_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL
);
