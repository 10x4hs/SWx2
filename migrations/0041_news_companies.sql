-- 회사 구독 (사람마다 따로). 구독한 회사는 '회사' 화면 탭이 되고 오늘판 위쪽에 먼저 떠요.
CREATE TABLE IF NOT EXISTS news_company_subs (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company TEXT NOT NULL,          -- src/news.js COMPANIES 의 key
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, company)
);
-- 회사 공식 블로그 (url 이 같으면 건너뛰어요)
INSERT OR IGNORE INTO news_feeds (id, url, name, topic, lang, note, created_at) VALUES
  ('feed-deepmind', 'https://deepmind.google/blog/rss.xml', 'Google DeepMind', 'ai', 'en', 'DeepMind 공식 블로그', 1791849600000),
  ('feed-nvidia', 'https://blogs.nvidia.com/feed/', 'NVIDIA Blog', 'ai', 'en', 'NVIDIA 공식 블로그', 1791849600000);
