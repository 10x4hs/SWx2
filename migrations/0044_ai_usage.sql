-- AI 호출 한 번 = 한 줄 (뉴스 요약 · 번역 · 브리핑 · 1면 · 깊게 · 반박 · 이야기). 토큰은 회사가 알려 준 값, 없으면 어림(estimated=1)
CREATE TABLE IF NOT EXISTS ai_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER NOT NULL,
  day TEXT NOT NULL,                 -- 한국 날짜 YYYY-MM-DD
  feature TEXT NOT NULL,
  provider TEXT,
  model TEXT,
  in_tokens INTEGER NOT NULL DEFAULT 0,
  out_tokens INTEGER NOT NULL DEFAULT 0,
  estimated INTEGER NOT NULL DEFAULT 0,
  ok INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS ai_usage_day ON ai_usage(day);
