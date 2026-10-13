-- 뉴스 = 하루 한 부 신문 (.grill/news-daily-edition-2026-10-13.md)
-- 글마다 2~3줄 한국어 요약(summary) · 신문 면(section) · 한국 날짜(day). one_liner 는 그대로 둬요.
ALTER TABLE news_items ADD COLUMN summary TEXT;
ALTER TABLE news_items ADD COLUMN section TEXT;   -- ai | geopolitics | tech | economy
ALTER TABLE news_items ADD COLUMN day TEXT;
ALTER TABLE news_items ADD COLUMN sum_miss INTEGER NOT NULL DEFAULT 0; -- AI 가 이 글에 답을 안 준 횟수
ALTER TABLE news_items ADD COLUMN sum_skip INTEGER NOT NULL DEFAULT 0; -- 1 = 요약 건너뜀 (summary 비움) — 그날 신문은 이 글 없이 마감해요
-- Tech Policy Press 는 AI 보다 언론·선거·플랫폼 규제 글이 많아요 → 지정학 면
UPDATE news_feeds SET topic = 'geopolitics' WHERE url = 'https://techpolicy.press/rss/feed.xml';       -- YYYY-MM-DD (한국) = published_at 의 날짜. 날짜 없는 글은 처음 본 날
UPDATE news_items SET day = strftime('%Y-%m-%d', published_at / 1000 + 9 * 3600, 'unixepoch');
UPDATE news_items SET section = CASE (SELECT topic FROM news_feeds f WHERE f.id = news_items.feed_id)
  WHEN 'ai' THEN 'ai' WHEN 'semi' THEN 'tech' WHEN 'energy' THEN 'economy' WHEN 'macro' THEN 'economy' ELSE 'geopolitics' END;
CREATE INDEX IF NOT EXISTS news_items_day ON news_items(day, published_at DESC);

-- 하루 한 부. draft = 그날 모으는 중(아침 8시에 새로 짜요), closed = 23:10 에 마감.
CREATE TABLE IF NOT EXISTS news_editions (
  day TEXT PRIMARY KEY,
  headline TEXT NOT NULL,
  lede TEXT NOT NULL DEFAULT '',
  front TEXT NOT NULL DEFAULT '[]',     -- [{item_id, why}] 3~5개
  threads TEXT NOT NULL DEFAULT '[]',   -- [{thread_id, move}]
  sections TEXT NOT NULL DEFAULT '{}',  -- {ai:[item_id], geopolitics:[], tech:[], economy:[]}
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','closed')),
  item_count INTEGER NOT NULL DEFAULT 0,
  built_at INTEGER NOT NULL
);

-- 오래 걸리는 일의 진행 상황 (지난 60일 되채우기 등). KV 없이 D1 한 줄.
CREATE TABLE IF NOT EXISTS news_jobs (
  name TEXT PRIMARY KEY,
  state TEXT NOT NULL DEFAULT '{}',
  updated_at INTEGER NOT NULL
);
