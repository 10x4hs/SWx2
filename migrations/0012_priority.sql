-- 할 일 우선순위: low · medium · high · xhigh · max (없으면 NULL = 보통 취급 안 함)
ALTER TABLE plans ADD COLUMN priority TEXT CHECK (priority IN ('low', 'medium', 'high', 'xhigh', 'max'));
