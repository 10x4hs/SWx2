-- 하루 계획표 그룹: 여러 계획을 하나로 묶어요 (같은 group_id = 한 묶음). 묶음 이름 · 줄은 따로 없어요 — 묶인 계획들만
ALTER TABLE plans ADD COLUMN group_id TEXT;
CREATE INDEX IF NOT EXISTS plans_group ON plans(group_id);
