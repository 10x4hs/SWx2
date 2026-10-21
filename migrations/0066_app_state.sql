-- 앱별 사람별 저장소: 내장 Dock 앱(지금은 CIM 투자자산운용사 #/cim)의 진도 · 기록을 JSON 한 덩어리로.
-- 폰 · 노트북 어디서나 같게. 덮어쓰기는 updated_at 이 같을 때만 (다른 기기가 먼저 썼으면 409 → 화면이 합쳐서 다시 보내요)
CREATE TABLE user_app_state (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  app TEXT NOT NULL,
  data TEXT NOT NULL DEFAULT '{}',
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, app)
);
