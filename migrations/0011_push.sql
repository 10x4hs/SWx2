-- 웹 푸시 구독: 브라우저(기기)마다 하나. endpoint 가 곧 기기 주소예요.
CREATE TABLE push_subs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX push_subs_user ON push_subs(user_id);
