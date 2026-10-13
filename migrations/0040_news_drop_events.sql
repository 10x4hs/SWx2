-- 행사 안내(PIIE /events/ 등)는 기사가 아니라서 지워요 (읽음 · 메모는 ON DELETE CASCADE)
DELETE FROM news_items WHERE url LIKE '%/events/%' OR url LIKE '%/event/%';
-- 최근 이틀 기사는 요약을 비워서 새 4~5문장 요약으로 다시 만들어요 (제목 번역은 그대로)
UPDATE news_items SET summary = NULL, sum_skip = 0 WHERE published_at > (strftime('%s','now') - 2*86400) * 1000;
