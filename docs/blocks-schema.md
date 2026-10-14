# Note blocks schema (v1)

Stored in `notes.blocks` (JSON text). `notes.body` stays the markdown mirror (generated from blocks on every save) so links / tags / graph / search / AI / MCP keep working.

```json
{ "v": 1, "blocks": [Block] }
```

Block = `{ "id": "b_xxxxxxxx", "type": "...", "text": "inline md", "props": {}, "children": [Block] }`
- `text` is inline markdown: **bold**, *italic*, `code`, ~~strike~~, [label](url), [[Wiki link]].
- `children` only for: bullet, number, todo, toggle, callout, quote, columns, column, and headings with `props.toggle: true`.
- `text` may hold inline math `$...$` (KaTeX, rendered when the block isn't being edited; `$5 and $6` is not math — the content must not start/end with a space).

| type | props | markdown mirror |
|---|---|---|
| paragraph | — | text |
| h1 / h2 / h3 | toggle?: bool | `#`…; toggle heading → `<details><summary>## text</summary>` children `</details>` |
| bullet / number | — | `- ` / `1. ` (children indented 2 spaces) |
| todo | checked: bool | `- [ ] ` / `- [x] ` |
| toggle | — | `<details><summary>text</summary>\n\nchildren\n\n</details>` |
| callout | icon: "💡" | `> [!note] icon text` + children quoted |
| quote | — | `> text` |
| divider | — | `---` |
| code | lang | fenced block, text = code |
| image | src, caption | `![caption](src)` |
| file | src, name | `[📎 name](src)` |
| bookmark / embed | url, caption? | `[caption or url](url)` |
| equation | expr (LaTeX) | `$$expr$$` |
| columns | — (children: 2–3 `column`) | each column's contents, one after another |
| column | — (children: blocks; only directly inside `columns`) | its children |
| table | header: bool, rows: [[cell inline md]] | GFM table |
| page | note_id, title | `[[title]]` (sub-page) |
| database | note_id, title | `[[title]]` (inline DB, rendered as its default view) |

## Columns & math
- `columns` → `column` → blocks. A `column` may only sit directly in `columns`; `columns` can't be nested inside a column; max 3 columns (`MAX_COLS` in md.js). The editor dissolves a column that becomes empty and unwraps `columns` left with one column.
- Insert: "/" → "2 columns" / "3 columns", or drag a block's ⋮⋮ to the left/right edge of another block (inside a column this adds a column next to it). Columns stack under 600px width.
- KaTeX 0.16.11 (`public/js/blocks/math.js`) loads from cdn.jsdelivr.net only when the rendered note contains an equation block or inline `$...$`.

## Databases
A database is a note with `notes.kind = 'database'` and `notes.db` JSON:
```json
{ "props": [ { "key": "status", "name": "여부", "type": "status|select|multi_select|date|text|number|checkbox|url|relation|rollup|formula",
               "options": [ { "name": "시작 전", "color": "gray|blue|green|yellow|red|purple|pink|orange|brown" } ] } ],
  "views": [ { "id": "v1", "name": "Table", "type": "table|board", "group_by": "status" } ] }
```
Rows are its child notes (`parent_id` = database note id) with `notes.props` JSON `{ "<key>": value }` (multi_select = array, date = "YYYY-MM-DD", checkbox = bool). Row title = note title. The title column is implicit.

Database markdown mirror (`body`): a GFM table of rows (title as [[link]] + props) so search/AI still see it.

## Colors (v2)
Notion colors: gray, brown, orange, yellow, green, blue, purple, pink, red.
- Inline text color: `<span class="c-red">text</span>`; inline highlight: `<mark class="bg-yellow">text</mark>` (inside `text`; kept in the markdown mirror as-is, DOMPurify keeps class).
- Block color: `props.color = "red" | "red_background" | …` on any text block (whole-block color / background, like Notion).

## Views (v1.1, backward compatible — every field optional)
```json
{ "id": "v1", "name": "Table", "type": "table|board|calendar|gallery|list",
  "group_by": "<status|select|multi_select key>",   // board (required, auto-picked) · table (optional)
  "date_prop": "<date key>",                        // calendar (auto-picked: first date prop)
  "show": ["<key>"],                                // gallery · list: visible props (max 8; default first 3 / first 2)
  "cover": "page|none|<url or text key>",           // gallery: card cover (page = first image block in the row page)
  "filters": [ { "prop": "<key>|title", "op": "is", "value": "완료" } ],   // AND, max 10
  "sorts":   [ { "prop": "<key>|title", "dir": "asc|desc" } ] }           // multi-level, max 5
```
Ops per type (`public/js/blocks/dbview.js` `OPS`): `is` (text/url/title/number/select/status/date/checkbox) · `is_not` · `contains` / `not_contains` (text/url/title/multi_select) · `gt` / `lt` (number) · `before` / `after` (date) · `empty` / `not_empty` (no value).
Single implementation: `dbview.js` (`cleanView` validates, `applyView(rows, db, view)` filters + sorts); `md.js` only re-exports `VIEW_TYPES` / `applyView`.
Legacy input (early block-editor views) is accepted and normalized on save, never stored: ops `is_empty`→`empty`, `is_not_empty`→`not_empty`, `checked`→`is true`, `unchecked`→`is false`; calendar `date_by`→`date_prop`.
The server (`validateDb` → `cleanView`) silently drops filters/sorts on unknown props, wrong ops or bad values, so deleting a property never breaks a saved view. Sorting puts empty values last; select/status sort by option order. Grouping by multi_select puts a row in every group it has; values that aren't options get their own group.

## Relation · Rollup · Formula (v1.2, no migration — all inside `notes.db` / `notes.props`)
```json
{ "key": "proj", "type": "relation", "target": "<database note id>" }              // row value: ["<row note id>", …] (max 100)
{ "key": "hours", "type": "rollup", "relation": "proj", "target": "<prop key>|title",
  "fn": "count|count_values|sum|avg|min|max|show_original|percent_checked" }
{ "key": "left", "type": "formula", "expr": "dateBetween(prop(\"Due\"), now(), \"days\")" }
```
- **relation** is one-way: only this database stores the link (no back-link column on the target — two-way would need writes to the other database's rows on every change). Target may be the same database. Picked with a search popover, shown as chips.
- **rollup / formula** are computed in the browser on every draw (`dbview.js` `computeRows`), never stored (`cleanRowProps` drops them; the markdown mirror skips relation/rollup/formula columns). A rollup follows a relation one hop (a rollup over another rollup stops at the second hop to avoid cycles).
- **formula** (`public/js/blocks/formula.js`, own parser, no eval): `prop("Name")` (by name, or key; `"Name"` = title), numbers, `"strings"`, `true/false`, `+ - * / %` (`+` joins text), `== != < > <= >=`, `and or not`, `if(c,a,b)`, `concat(…)`, `length(x)`, `round(x[,digits])`, `abs`, `min`, `max`, `empty(x)`, `dateBetween(a,b,"minutes|hours|days|weeks|months|years")`, `now()`. Date props become dates; a date result is shown as `YYYY-MM-DD`. Errors (bad syntax, unknown prop, cycles, ÷0) show inline as `⚠ message`.
- Filters on rollup/formula: `is · is_not · contains · not_contains · gt · lt · empty · not_empty` (gt/lt compare as numbers); relation: `empty · not_empty`. Sorts work on all three (relation sorts by link count).

## Templates
A template is a hidden row: a child note of the database with `props._tpl = true` (title = template name, other props = preset values, blocks = starter blocks). Hidden from views and the markdown mirror. "+ New ▾" lists Blank / each template / "+ New template" / "✎ Edit templates" (a table of templates; click a title to edit its blocks in the normal row page editor). New-from-template copies props (minus `_tpl` / `_remind`) and blocks.

## Gallery cover
`GET /api/notes/:id` children carry `cover` = `props.src` of the first `image` block (any depth) in that row's blocks (SQLite `json_tree`), or null.

## Reminders
A row may carry `props._remind = { "prop": "<date key>", "time": "HH:MM" }` (KST). Old rows simply have no `_remind`; the date value itself stays a plain `"YYYY-MM-DD"` string.
- On save the worker derives `notes.remind_at` (epoch ms UTC, migration 0036) = date + time in KST; changing it clears `reminded_at` / `remind_seen` so it can fire again. A non-date prop or a bad time is rejected (cleared / `09:00`).
- Cron `10 * * * *` (`src/cron.js` → `src/reminders.js`, shared with the hourly news job) sends a contentless web push (`src/push.js`) to the **row owner** for rows with `remind_at <= now`, not sent yet, and at most 26 h late. **Hourly granularity**: a 09:30 reminder arrives at 10:10.
- The service worker then calls `POST /api/reminders/take` (marks `remind_seen`) and shows "⏰ title · database · date · time"; clicking opens the row.
- Local testing: `POST /api/reminders/run?now=<ms>` runs the cron once (only when `PASSWORDLESS=1`, i.e. `.dev.vars`).

## Notes list
Rows of a database are hidden from the left notes list (they show inside their database); typing in the list filter or global search still finds them.
