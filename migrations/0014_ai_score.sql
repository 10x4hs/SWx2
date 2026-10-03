-- 하루 점수는 자정에 AI 가 매겨요: 점수(0~100) + 한 줄 평. score 는 계산식 점수(AI 에 주는 재료 · AI 가 안 될 때 대신)
ALTER TABLE day_records ADD COLUMN ai_score INTEGER CHECK (ai_score BETWEEN 0 AND 100);
ALTER TABLE day_records ADD COLUMN ai_note TEXT;
ALTER TABLE day_records ADD COLUMN ai_model TEXT;
