# 뉴스 백엔드

- 글마다 `day`(한국 날짜, 날짜 없는 글은 처음 본 날) · `section`(ai · geopolitics · tech · economy — 피드 주제로 정하고 AI 가 고치면 따라요) · `summary`(2~3줄 한국어). 요약은 글 5편을 AI 한 번에 묶어요.
- `news_editions`: 하루 한 부. 08:00 초안(draft) → 23:10 마감(closed). 마감 뒤 들어온 글은 API 의 `late`.
- 지난 60일 되채우기: 매시 크론이 한 걸음씩(마감 안 된 가장 오래된 날 10편 요약 → 다 되면 그날 마감). 손으로: `POST /api/news/backfill`, 상태: `GET /api/news/backfill`.
- API: `GET /api/news/editions?from&to`, `GET /api/news/edition/:day|today`.
- 크론 5개와 바깥 요청 예산(호출마다 40개, `src/lib/budget.js`)은 `src/cron.js` 맨 위. 로컬 시험: `POST /api/cron/run?cron=hourly|am|close` (PASSWORDLESS=1 일 때만).
