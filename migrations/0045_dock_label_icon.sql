-- Dock 우클릭 → Rename & icon: 내 계정에서만 바뀌는 이름 · 아이콘 (icon = "app:home" | "emoji:🔥" | "url:https://…")
ALTER TABLE view_custom ADD COLUMN label TEXT;
ALTER TABLE view_custom ADD COLUMN icon TEXT;
