-- 하루 점수: 자동 점수(score) 옆에 내가 매긴 점수(0~100)
ALTER TABLE day_records ADD COLUMN self INTEGER CHECK (self BETWEEN 0 AND 100);
