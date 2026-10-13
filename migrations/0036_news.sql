-- 뉴스 기본 테이블은 예전 배포(0029_news, 로컬 main)로 운영 DB 에 이미 있어요 → IF NOT EXISTS. 새 칸은 아래 ALTER 로.
-- 뉴스: 지정학·AI·첨단기술 소식을 모아 한국어로 요약해 셋이 같이 읽어요.
-- 피드와 글은 **공유**(한 명이 추가하면 모두 보임), 읽음·저장·메모만 사람별로 갈려요.

CREATE TABLE IF NOT EXISTS news_feeds (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  topic TEXT NOT NULL,                       -- china europe ai semi energy macro geopolitics
  lang TEXT NOT NULL DEFAULT 'en',
  note TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  fail_count INTEGER NOT NULL DEFAULT 0,     -- 5회 넘으면 쉬게 해요
  last_error TEXT,
  last_fetched_at INTEGER,
  last_item_at INTEGER,                      -- 90일 넘으면 죽은 피드로 봐요
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS news_items (
  id TEXT PRIMARY KEY,
  feed_id TEXT NOT NULL REFERENCES news_feeds(id) ON DELETE CASCADE,
  url TEXT NOT NULL UNIQUE,                  -- 같은 글이 두 번 쌓이지 않게
  title TEXT NOT NULL,
  author TEXT,
  published_at INTEGER NOT NULL,
  raw TEXT,                                  -- 피드가 준 본문
  one_liner TEXT,                            -- 얕은 요약: 들어오는 전부에 한 줄 (한국어)
  deep TEXT,                                 -- 깊은 요약: 누가 열었을 때만 (JSON)
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS news_items_pub ON news_items(published_at DESC);
CREATE INDEX IF NOT EXISTS news_items_feed ON news_items(feed_id);
CREATE INDEX IF NOT EXISTS news_items_todo ON news_items(published_at DESC) WHERE one_liner IS NULL;

-- 사람별 상태. flagged 는 "이거 봐" 표시라 셋에게 보여요.
CREATE TABLE IF NOT EXISTS news_reads (
  item_id TEXT NOT NULL REFERENCES news_items(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  read INTEGER NOT NULL DEFAULT 0,
  saved INTEGER NOT NULL DEFAULT 0,
  flagged INTEGER NOT NULL DEFAULT 0,
  note TEXT,                                 -- 내 말로 쓴 한 줄. AI 요약보다 이게 남아요.
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (item_id, user_id)
);
CREATE INDEX IF NOT EXISTS news_reads_user ON news_reads(user_id, read);

-- 오늘의 브리핑. 하루 한 번만 만들어요 — 볼 때마다 문장이 바뀌면 "오늘"이 아니라
-- "방금 만든 것"처럼 느껴져요.
CREATE TABLE IF NOT EXISTS news_briefs (
  day TEXT PRIMARY KEY,                      -- YYYY-MM-DD (한국)
  headline TEXT NOT NULL,
  body TEXT NOT NULL,
  weights TEXT NOT NULL,                     -- [{topic, n}] JSON
  item_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
ALTER TABLE news_items ADD COLUMN dated INTEGER NOT NULL DEFAULT 1;  -- 0 = 피드에 날짜가 없어서 published_at 은 처음 본 시각

-- ---------- Signal Map (2026-10-13) ----------
-- 줄기(thread): 같은 이야기를 시간순으로 꿰어요. key 는 AI 가 붙인 짧은 영어 태그(소문자) — 같은 태그면 같은 줄기.
CREATE TABLE news_threads (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,                       -- 화면 제목 (한국어)
  keywords TEXT NOT NULL DEFAULT '[]',       -- 제목·한 줄 요약에 이 말이 들어가면 붙여요 (JSON 배열)
  story TEXT,                                -- "지금까지의 이야기" (AI, 한국어)
  story_at INTEGER,
  created_by TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
ALTER TABLE news_items ADD COLUMN thread_id TEXT REFERENCES news_threads(id) ON DELETE SET NULL;
ALTER TABLE news_items ADD COLUMN geo TEXT;  -- 나라 코드 JSON 배열 ["US","CN"] → 지구본 좌표는 화면이 알아요
CREATE INDEX news_items_thread ON news_items(thread_id, published_at);

-- 토론: 메모(맨 위) → 반박(빨강) · 동의(초록) 답글, 2단까지. ai=1 은 🤖 반박.
CREATE TABLE news_comments (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES news_items(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_id TEXT REFERENCES news_comments(id) ON DELETE CASCADE,
  stance TEXT NOT NULL CHECK (stance IN ('memo','rebut','agree')),
  body TEXT NOT NULL,
  ai INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX news_comments_item ON news_comments(item_id, created_at);
CREATE INDEX news_comments_parent ON news_comments(parent_id);

-- 내 메모에 달린 답을 어디까지 봤는지 (푸시 알림 내용용)
CREATE TABLE news_inbox_seen (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  at INTEGER NOT NULL
);
