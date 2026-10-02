-- 프로필 사진: 브라우저가 256px 정사각 JPEG 로 줄여 보낸 data URL (약 20KB) — 따로 저장소 없이 DB 에
ALTER TABLE users ADD COLUMN avatar TEXT;
