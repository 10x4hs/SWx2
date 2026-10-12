# Second Brain — one nested, abstracted brain (2026-10-13)

## Goal
Merge the notes "Second Brain" view and the Study tabs into one view, and import the whole Notion workspace into it.
First screen = 5 top concepts. Click a node → go inside it (Notion-like nested pages).

## Decisions
- App (D1 `notes`) is the source of truth. Notion = one-time import; Notion is never modified.
- Top concepts (English names): **Business & Finance**, **AI & Dev**, **Records**, **Language**, **Life**.
- Brain UI text in English. Imported bodies stay as written.
- Empty pages, template leftovers and duplicates are skipped on import, and listed in an import report.
- Study content (AI books 0–7, papers sprint, English course) appears as child nodes of concepts and opens the existing study screens. Terms are not nodes.

## Data
Reuse existing tables — no new schema.
- Concept = root note (`parent_id NULL`) with fixed title. Imported pages = notes with `parent_id`.
- Cross-links = `[[title]]` under a `## Links` heading (existing `note_links`).
- Study screens = virtual nodes added client-side (`kind: "study"`, `href: "#/books"` …), parented to a concept.

## Graph (drill-down)
- State: `focus` (note id or null = root).
- Visible nodes: children of `focus` (+ virtual study nodes for that concept).
- Edge A–B between visible nodes if any link exists between their subtrees; width ∝ count.
- Breadcrumb on top to go back up. Double-click/open button → note page.
- One renderer: extend `public/js/graph/obsidian.js`; remove duplication with `views/graph.js` where cheap.

## Navigation
- Dock: notes + study icons → one "Brain" entry (`#/brain`). Old routes still work (note pages, study screens open from nodes).

## Import
- `scripts/notion-import/` builds a plan from the Notion dump: mapping page → concept/parent, skip list, cross-links.
- Applied to production D1 with `wrangler d1 execute --remote` after a `wrangler d1 export` backup, idempotent by title (+ `notion:<id>` marker in body).
- Output `IMPORT-REPORT.md`: imported, skipped (with reason), links added.

## Testing
- `npm run e2e`: brain root shows 5 concepts, drill in/out, study node opens study screen, desktop + phone.
- `npm test` smoke stays green.
