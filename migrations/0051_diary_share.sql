-- 일기 함께 보기 (2026-10-16): '일기 모임'(users.diary_circle = 1)끼리 서로의 공개 일기를 읽어요. 지금은 HSK · GYK 둘.
-- 지금까지 쓴 일기는 '나만 본다'고 생각하고 쓴 글이라 모두 비공개(shared = 0)로 시작해요. 새 일기의 기본 공개는 일기 편집기가 정해요.
ALTER TABLE diaries ADD COLUMN shared INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN diary_circle INTEGER NOT NULL DEFAULT 0;
UPDATE users SET diary_circle = 1 WHERE lower(username) IN ('hsk', 'gyk');
