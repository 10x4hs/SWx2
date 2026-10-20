-- 기능 신청은 관리자 모두(HSK · GYK)가 승인해야 열려요 — 관리자마다 한 줄 (가입 승인 signup_approvals 와 같은 모양)
CREATE TABLE feature_request_approvals (
  request_id TEXT NOT NULL REFERENCES feature_requests(id) ON DELETE CASCADE,
  admin_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  at INTEGER NOT NULL,
  PRIMARY KEY (request_id, admin_id)
);

-- 기능별 시간 제한: expires_at 이 있으면 그 시각까지만 열려요 (NULL = 계속)
ALTER TABLE user_features ADD COLUMN expires_at INTEGER;

-- 추천인: 가입할 때 적은 친구 아이디 → 계정이 열리면 그 친구에게 체험 24시간
ALTER TABLE users ADD COLUMN referred_by TEXT REFERENCES users(id) ON DELETE SET NULL;

-- 뉴스가 잠금 기능이 됐어요: 지금 회원(관리자 빼고)은 계속 쓰게 열어 둬요
INSERT OR IGNORE INTO user_features (user_id, feature, granted_by, at)
  SELECT id, 'news', NULL, CAST(strftime('%s','now') AS INTEGER) * 1000 FROM users WHERE role IS NOT 'admin';

-- 일기는 이제 누구나 (잠금 기능에서 빠졌어요)
DELETE FROM user_features WHERE feature = 'diary';
UPDATE feature_requests SET status = 'denied' WHERE feature = 'diary' AND status = 'pending';
