-- 하루 계획 공개 (open / not open): 1 이면 친구가 내 계획표를 볼 수 있어요. 기본은 공개
ALTER TABLE users ADD COLUMN plans_open INTEGER NOT NULL DEFAULT 1;
