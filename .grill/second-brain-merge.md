# Grill: Second Brain merge (Notion + notes + study)
Date: 2026-10-13

## Intent
Turn dsm-mafia into the user's single "second brain": one view, Notion-like nested pages, abstracted graph that shows only top concepts first and drills down.

## Constraints
- App is the source of truth; Notion is a one-time import and stays untouched.
- Graph must be readable: 5 top concepts on the first screen.

## Key decisions
- Decision: one-time Notion → app import. Reason: no sync conflicts. Alternative considered: two-way sync, Notion as source.
- Decision: "delete" = skip on import, report the skipped list. Reason: reversible. Alternative considered: trash pages in Notion.
- Decision: top concepts = Business & Finance, AI & Dev, Records, Language, Life. Reason: user chose 5 over 8.
- Decision: study content (AI books, papers, English) becomes child pages of top concepts; terms stay as lists, not nodes; study screens still open.
- Decision: concept names and brain UI text in English; imported bodies stay original.
- Decision: build on existing notes (parent_id, [[links]], backlinks). Alternative considered: new node/edge tables, study pages.

## Surfaced assumptions
- Notes are private per user, so personal Diary content is fine to import.
- Cross-links between concepts are judged by Claude and stored as [[links]].
