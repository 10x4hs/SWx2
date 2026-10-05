-- 과목 탭: 페이지가 놓이는 자리 place = dock(기본) | study('공부' 스위처의 탭). 사용자별 서버 저장소(trio.store)도 여기서.
ALTER TABLE user_pages ADD COLUMN place TEXT NOT NULL DEFAULT 'dock';
CREATE TABLE user_page_state (
  page_id TEXT NOT NULL REFERENCES user_pages(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  data TEXT NOT NULL DEFAULT '{}',
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (page_id, user_id)
);
