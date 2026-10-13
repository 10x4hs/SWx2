# Grill: News as a daily newspaper
Date: 2026-10-13

## Intent
Read news like a newspaper, one issue per KST day ("what happened today", e.g. "Claude Fable 5.5 is coming"). Readability and ease of use for the three of us over flashy motion. The Signal Map design was rejected as hard to read.

## Constraints
- Workers free plan: ≤50 subrequests per invocation, ≤5 cron triggers.
- Built by hand in the app code (not the in-app AI page builder). References: refs.gallery.

## Key decisions
- Decision: one edition per KST day; closed at 23:10 KST with a "today's report". Morning view shows the latest edition + overnight additions.
- Decision: backfill the last 60 days as 60 editions (batched under the subrequest limit).
- Decision: edition = front page (headline + 3–5 key stories + how each thread moved today) → sections (AI / Geopolitics / Chips & Tech / Economy) with 2–3 line Korean summaries + source links → discussion (memo / rebut / agree / 🤖 AI rebut kept) → prev/next day + 60-day calendar. Globe shrunk to a small accent or removed.
- Decision: cron consolidation — hourly news pulse + reminders merged into one hourly cron, freeing a slot for 23:10 KST.
- Decision: deleted Project Manager/projects/news-reader/design.md (git 8039b1e).

## Open questions
- Paid sources (SemiAnalysis, Stratechery, Foreign Affairs) — user to decide; per-subscriber visibility vs shared summaries.
