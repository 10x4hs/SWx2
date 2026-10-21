-- Dock 폴더 (Discord 서버 폴더처럼): { id: { name, items: ["nav:room", "page:…"] } } JSON. 자리는 dock_order 의 "folder:<id>"
ALTER TABLE users ADD COLUMN dock_folders TEXT;
