-- 자동 집중: 계획 시작 시각에 집중 타이머가 저절로 켜져요. auto_focus = 집중 분 (NULL = 꺼짐) · focus_sent_at = 그 시각 알림을 보낸 때 (두 번 안 보내게)
ALTER TABLE plans ADD COLUMN auto_focus INTEGER;
ALTER TABLE plans ADD COLUMN focus_sent_at INTEGER;
CREATE INDEX plans_auto_focus ON plans(period) WHERE auto_focus IS NOT NULL;
