-- 자주 부르는 화면 쿼리가 표 전체를 훑지 않게 하는 색인들 (모두 IF NOT EXISTS — 여러 번 돌려도 괜찮아요)

-- GET /notes: 내 노트를 최근 고친 순으로 (WHERE user_id = ? ORDER BY updated_at DESC) · 캘린더의 '그날 쓴 노트'(updated_at 범위)
CREATE INDEX IF NOT EXISTS notes_user_updated ON notes(user_id, updated_at);

-- GET /home/pad: 오늘 셋의 다짐 (WHERE day = ?) — 기본 키 (user_id, day) 로는 day 만으로 못 찾아요
CREATE INDEX IF NOT EXISTS pledges_day ON pledges(day);

-- GET /logs/focus (셋 다 · 기간) · 주간 회고: WHERE kind = 'focus' AND day BETWEEN ? AND ? — user_id 없이 날짜로만 찾아요
CREATE INDEX IF NOT EXISTS logs_day ON logs(day);

-- GET /pages: WHERE user_id = ? OR shared = 1 — OR 의 두 쪽 모두 색인이 있어야 표 전체를 안 훑어요
CREATE INDEX IF NOT EXISTS user_pages_shared ON user_pages(shared);
