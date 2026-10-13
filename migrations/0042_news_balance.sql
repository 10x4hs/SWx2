-- 러시아 기사가 너무 많아요: 매일 쏟아내는 Meduza 를 끄고(기존 글은 그대로), 하루 신문은 매체마다 5편까지만 보여요 (src/news.js FEED_CAP)
UPDATE news_feeds SET active = 0 WHERE url LIKE '%meduza.io%';
