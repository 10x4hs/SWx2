-- 사용자 페이지 v2: 페이지 하나 = 여러 파일(index.html · style.css · app.js · 다른 html …). 서버가 /pf/<id>/<path> 로 서빙해요.
-- kind: code(파일들) | url(바깥 사이트를 Dock 안에 띄우기). code 컬럼은 index.html 과 같은 뜻으로 남겨요(MCP page_write 호환).
CREATE TABLE user_page_files (
  page_id TEXT NOT NULL REFERENCES user_pages(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (page_id, path)
);
ALTER TABLE user_pages ADD COLUMN kind TEXT NOT NULL DEFAULT 'code';
ALTER TABLE user_pages ADD COLUMN url TEXT NOT NULL DEFAULT '';
INSERT INTO user_page_files (page_id, path, content, updated_at) SELECT id, 'index.html', code, updated_at FROM user_pages WHERE code <> '';
