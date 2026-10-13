# Grill: Obsidian + Notion block pages inside Brain
Date: 2026-10-13

## Intent
Brain pages should read like the user's original Notion workspace (toggles, tables, databases with board/table views, callouts) while keeping Obsidian's links, graph and markdown. The Notion import flattened all of that.

## Constraints
- Links, graph, search, AI tidy and MCP must keep working → keep a markdown copy (`body`) alongside blocks.
- Vanilla JS, no bundler; UI mostly English, minimal.
- Back up prod before any overwrite.

## Key decisions
- Decision: block editor (Notion-style blocks JSON). Reason: user wants Notion readability/editing. Alternative considered: markdown + Notion-like rendering (rejected by user).
- Decision: v1 = toggles, DB table + board views (status/date/tags props, row opens page), callout/quote/divider/table/code/image blocks, "/" insert + drag reorder, sub-page blocks, re-convert Notion dump into blocks and overwrite HSK notes.
- Decision: overwrite allowed; notes edited in the app after the import are skipped.

## Out of scope (v2)
Cover/icon, columns, DB filter/sort/calendar views, synced blocks.
