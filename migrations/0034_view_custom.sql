-- Dock 아이콘 우클릭 → 내 입맛대로 바꾸기 (CSS · HTML · JS). 계정마다 따로, 원본 파일은 그대로
CREATE TABLE IF NOT EXISTS view_custom (
  user_id TEXT NOT NULL,
  slot TEXT NOT NULL,
  css TEXT NOT NULL DEFAULT '',
  html TEXT NOT NULL DEFAULT '',
  js TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, slot)
);
