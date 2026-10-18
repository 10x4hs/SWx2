-- 누구나 가입 신청 → 관리자 모두(HSK · GYK) 승인하면 들어와요. 관리자는 정지 · 삭제 · 임시 비밀번호 · 이 회원으로 들어가기
ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'member';   -- 'member' | 'admin'
ALTER TABLE users ADD COLUMN state TEXT NOT NULL DEFAULT 'active';  -- 'pending' | 'active' | 'suspended'
ALTER TABLE users ADD COLUMN last_seen_at INTEGER;
ALTER TABLE users ADD COLUMN pw_changed_at INTEGER;
UPDATE users SET role = 'admin' WHERE username IN ('hsk', 'gyk');

CREATE TABLE signup_approvals (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  admin_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  at INTEGER NOT NULL,
  PRIMARY KEY (user_id, admin_id)
);

-- 관리자가 '이 회원으로 들어가기' 한 세션: imp_by = 관리자 id (돌아갈 때 씀)
ALTER TABLE sessions ADD COLUMN imp_by TEXT;
