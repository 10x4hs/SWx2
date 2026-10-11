-- 나만의 Dock: 아이콘 순서(JSON 배열 "nav:home" · "page:<id>")와 내 화면에서 숨긴 친구 페이지(JSON 배열 page id). 본인만 봐요
ALTER TABLE users ADD COLUMN dock_order TEXT;
ALTER TABLE users ADD COLUMN hidden_pages TEXT;
