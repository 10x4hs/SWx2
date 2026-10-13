-- 모든 글에 한국어 제목(title_ko). 요약보다 먼저, 싼 일괄 번역(AI 한 번에 25~30편)으로 채워요.
ALTER TABLE news_items ADD COLUMN title_ko TEXT;
CREATE INDEX IF NOT EXISTS news_items_title_todo ON news_items(published_at DESC) WHERE title_ko IS NULL;

-- AI 면이 주간 뉴스레터뿐이라 비는 날이 많았어요 → 매일 나오는 AI 산업 뉴스(모델 출시 · 회사 소식).
-- 2026-10-13 에 curl 로 전부 글이 들어오는 걸 확인했어요. src/feeds.js SEED 와 같은 목록 (url 이 같으면 건너뛰어요).
INSERT OR IGNORE INTO news_feeds (id, url, name, topic, lang, note, created_at) VALUES
  ('feed-verge-ai', 'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml', 'The Verge AI', 'ai', 'en', '모델 출시 · 빅테크 AI 소식 일간', 1791849600000),
  ('feed-techcrunch-ai', 'https://techcrunch.com/category/artificial-intelligence/feed/', 'TechCrunch AI', 'ai', 'en', 'AI 스타트업 · 투자 · 출시 일간', 1791849600000),
  ('feed-mittr-ai', 'https://www.technologyreview.com/topic/artificial-intelligence/feed', 'MIT Technology Review AI', 'ai', 'en', 'AI 연구 · 산업 해설', 1791849600000),
  ('feed-decoder', 'https://the-decoder.com/feed/', 'The Decoder', 'ai', 'en', 'AI 모델 · 회사 소식을 매일 여러 편', 1791849600000),
  ('feed-simonw', 'https://simonwillison.net/atom/everything/', 'Simon Willison', 'ai', 'en', 'LLM 신모델을 직접 써 보고 바로 쓰는 블로그', 1791849600000),
  ('feed-ars-ai', 'https://arstechnica.com/ai/feed/', 'Ars Technica AI', 'ai', 'en', 'AI 산업 · 정책 일간', 1791849600000),
  ('feed-openai', 'https://openai.com/news/rss.xml', 'OpenAI News', 'ai', 'en', 'OpenAI 공식 발표', 1791849600000),
  ('feed-hf-blog', 'https://huggingface.co/blog/feed.xml', 'Hugging Face Blog', 'ai', 'en', '오픈 모델 · 도구 발표', 1791849600000),
  ('feed-google-ai', 'https://blog.google/technology/ai/rss/', 'Google AI Blog', 'ai', 'en', 'Google · DeepMind 공식 AI 발표', 1791849600000);
