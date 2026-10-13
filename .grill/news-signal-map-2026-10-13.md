# Grill: News page — Signal Map
Date: 2026-10-13

## Intent
One news page inside dsm-mafia (not the Prism SaaS) for the three of us: skim the world every morning, see connections (threads), argue about it. Design, dynamic motion, high-tech feel and features all matter.

## Constraints
- Morning skim of 5–10 min → intro must be short after the first view; highlight what changed today.
- Shared by the three: read / starred marks visible.
- The news backend (src/news.js, feeds, migration) exists only on local `main`; must be ported (migration renumbered — 0029 clashes with 0029_book_reads).

## Key decisions
- Decision: hero = B→A mix. A 3–5s cinematic briefing ("Today, N signals") whose words scatter into points that fly onto a globe; then the Signal Map is home (left: today's signals, center: globe with pulsing hotspots + thread arcs, right: live list). Click → thread timeline (articles over time, AI "story so far", memos). Repeat visits: 0.8s intro, skippable. Alternative considered: briefing-only, Bloomberg terminal.
- Decision: per-article discussion — memos by anyone, replies marked rebut (red) / agree (green), max 2 levels; 💬 counts and ⚡ "disputed" badge on cards and map points; read dots + ★ with member colors.
- Decision: "AI rebut" button on a memo → one counter-argument grounded in the article, marked 🤖. Not automatic. Alternative considered: humans only, AI on every memo.
- Decision: push notification when a friend rebuts/replies to my memo.
- Decision: built-in view (#/news, Dock icon) rather than a sandboxed user page — needs full API, push, and deploys with code.

## Out of scope
Prism SaaS (Clerk, plans, roles).
