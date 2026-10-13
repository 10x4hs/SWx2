# News — daily edition design direction (from refs.gallery, 2026-10-13)

Seen on refs.gallery (agency/SaaS-heavy; no news readers — borrow patterns): Website Headlines (readable grid), Rows (keyboard-first, archive of items over time, j/k), Notion (reading typography), Campsite (clean threaded discussion), Pull Systems (insight in seconds), Config (dense structured lists), Copilot Money (one-screen overview), The Browser Company (motion that never distracts), Spotify.Design (editorial headline scale), LogoArchive (daily archive browsing). Anti-reference: Superlist motion.

## Layout
- Desktop: left rail 220px (Today · Editions calendar · Threads · Starred) | edition column (front page + sections, max ~680px measure) | reading pane (rest). Phone: edition → article push, 16px gutters. 4/8px spacing.
- Edition = newspaper issue for one KST day: masthead (date, "Vol./No.", prev/next) → headline + lede → 3–5 front stories → "Threads today" (how each moved) → sections AI / Geopolitics / Chips & Tech / Economy → "You're all caught up".

## Type
Pretendard (KR + Latin), tabular numerals for times. 12 meta / 14 summary / 16 list title 600 / 17 body / 22 article title / 28–34 headline. Body line-height 1.7 (KR), titles 1.35. Measure 34–40 KR chars (~640px). `word-break: keep-all`.

## Color
Light: bg #FAFAF7, surface #FFF, text #1A1A1A, muted #6B6B6B, line #E6E4DF. Dark: bg #111214, surface #1A1B1E, text #E8E6E1, muted #9A9893, line #2A2B2F. One accent (#2F6FEB / dark #6EA0FF). Agree green, rebut amber, star yellow. Unread = dot + bold, never color alone.

## List item
Unread dot · source · KST time (12 muted) / title (16, 2 lines) / 1-line KR summary (14 muted) / chips: thread, 💬 n, ⚡, friend avatars / star on the right. ~76px.

## Reading pane
Title + meta → "요약" box (2–3 bullets) → source link + excerpt → discussion (memo / rebut / agree, 🤖 AI rebut; Campsite-style thread).

## Motion
120–180ms opacity/color only; read rows fade slightly. No parallax, autoplay or scroll-linked effects. Respect prefers-reduced-motion. Globe: optional collapsed panel, off by default.
