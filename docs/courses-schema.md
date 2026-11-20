# Course schema survey (2026-11-20)

Five "course" shapes were found. This doc records each one and what the shared schema
(`scripts/lib/course-schema.mjs`) now covers.

| Course | Content on disk | Index | Card fields | Client loader | Server | Progress storage | Index script |
|---|---|---|---|---|---|---|---|
| MBA `#/mba` | `public/mba/<module>.json` (12) + company/words/kit | `public/mba/index.json` v2: module intro (no, title, sub, phase, schools, what) from the script, cards `{id,title,min,day}`, cases, problems `{id,day,card,type}`, lectures | id · title · idea[] · recall.q · quiz[{choices,answer}] · visual{type} | `js/mba/data.js` | `src/mba.js registerCourse("mba")` → `/api/mba/state·read·review·day·done·ask` | D1 tables `mba_reads` · `mba_days` · `mba_done` | was `scripts/mba-index.mjs` |
| SW space Dev Flow / VG / Onto / AIP `#/sw/<key>` | `public/<key>/<module>.json` (12/8/8/8) + dev `docs.json` | `public/<key>/index.json` v1: module (no, title, short, q, sub, doc, goals, story) from the file, cards `{id,title,day}`, cases, problems `{id,title,day,mixed}`, lectures | id · title · lead · idea[] · recall.q · sources[] · quiz[{options,answer}] · code{text,read} · day | `js/dev/data.js` (COURSES table, one open at a time) | same `registerCourse(key)` → `/api/<key>/…` | `<key>_reads` · `<key>_days` · `<key>_done` | was `scripts/dev-index.mjs ["" vg onto aip]` |
| CIM `#/cim` + CBT | `public/cim/s<n>c<n>.json` textbook chapters + `cbt.json` | none (chapter list in `js/cim/data.js`) | textbook blocks + exam questions | `js/cim/*` | `/apps/cim/ask` (`src/cimask.js`, RAG) | `user_app_state` app `cim` (+ localStorage copy) | none |
| Psychology `#/psy` | `public/psy/cards.json` (407) · `books.json` · `spar.json` | single file | card + SRS/quiz | `js/psy/*` | `/apps/psy/spar` (`src/psy.js`) | `user_app_state` app `psy` | none |
| Books / Papers `#/books` `#/papers` | `public/books/*.json`, `public/papers/content/` | `index.json` each | chapter / paper blocks | `js/books/books.js`, `js/papers/ez-core.js` | none (static) | localStorage (`store`) | none |

## What is unified

MBA and the four SW courses already share one server (`registerCourse`) and one progress model
(`<module>/<item>` keys in `_reads` / `_done`). They now also share:

- **One schema + adapters** — `scripts/lib/course-schema.mjs`. Shared rules (id format, unique ids,
  reserved route words, core card fields, quiz answer range, https lectures) plus one adapter per
  course family (`mba`, SW `dev|vg|onto|aip`). Each adapter reads the existing module files as they are
  and emits the existing index entry shape, so `index.json` is byte-identical apart from the `note`.
- **One index builder/check** — `node scripts/course-index.mjs [course…] [--check]` (all courses when
  none named). Replaces `mba-index.mjs` and `dev-index.mjs`; wired into `package.json test`,
  `scripts/deploy.sh` and `.github/workflows/ci.yml`.
- **One client loader** — `public/js/course/load.js` (`getJSON` cache, `courseIndex`, `courseModule`,
  `readSet`, `doneSet`). `js/mba/data.js` and `js/dev/data.js` use it and re-export the same names.

No content file, URL, endpoint, D1 table or saved progress changed.

## Left alone, and why

- **CIM** — a textbook + CBT exam, not modules of cards/cases/problems; progress is one JSON blob in
  `user_app_state` with an offline copy. Forcing it into the module index would mean a progress
  migration, which this task forbids.
- **Psychology** — one flat card deck with SRS + AI spar, progress in `user_app_state`; no modules.
- **Books / Papers** — reading material without per-user server progress; different block format.
- The two index shapes (MBA v2 vs SW v1) stay different on purpose: the client screens read their
  own fields (MBA `phase/schools/what`, SW `story/q/doc`). The adapter is where they meet.
