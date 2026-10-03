-- 영어 공부 (ENGLISH-OS 연동): 하루 4블록 기록 · 내가 막힌 표현 · 복습 카드 (전부 본인만 봄)

-- 하루 기록: 블록별 분(JSON), 체크리스트(JSON), 합계는 서버가 계산해서 같이 저장
CREATE TABLE english_days (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day TEXT NOT NULL,                 -- 'YYYY-MM-DD'
  blocks TEXT NOT NULL DEFAULT '{}', -- {"words":55,"sound":35,"speak":70,"recall":20,"pattern":0,"review":0}
  checks TEXT NOT NULL DEFAULT '[]', -- [true,false,...] 서식 체크리스트 순서대로
  minutes INTEGER NOT NULL DEFAULT 0,  -- 블록 합계
  spoken INTEGER NOT NULL DEFAULT 0,   -- 소리 + 말하기
  newwords INTEGER NOT NULL DEFAULT 0,
  mistakes INTEGER NOT NULL DEFAULT 0,
  mood TEXT,                         -- 좋음 | 보통 | 나쁨
  sentence TEXT,                     -- 오늘의 한 문장
  note TEXT,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, day)
);

-- 내가 막힌 표현: 한국어로만 떠오른 말 → 영어 → 통째로 외울 덩어리
CREATE TABLE english_phrases (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day TEXT,
  ko TEXT NOT NULL,
  en TEXT,
  chunk TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_english_phrases_user ON english_phrases(user_id, created_at DESC);

-- 복습 카드 (라이트너 상자 1~5): card_id 는 프론트가 정하는 짧은 문자열 (s:12, p:5-3, f:f2, ph:<id> …)
CREATE TABLE english_cards (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  card_id TEXT NOT NULL,
  box INTEGER NOT NULL DEFAULT 0,
  due TEXT NOT NULL,                 -- 'YYYY-MM-DD'
  reps INTEGER NOT NULL DEFAULT 0,
  last INTEGER,                      -- 마지막 복습 시각 (ms)
  PRIMARY KEY (user_id, card_id)
);
CREATE INDEX idx_english_cards_due ON english_cards(user_id, due);
