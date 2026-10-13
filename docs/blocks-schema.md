# Note blocks schema (v1)

Stored in `notes.blocks` (JSON text). `notes.body` stays the markdown mirror (generated from blocks on every save) so links / tags / graph / search / AI / MCP keep working.

```json
{ "v": 1, "blocks": [Block] }
```

Block = `{ "id": "b_xxxxxxxx", "type": "...", "text": "inline md", "props": {}, "children": [Block] }`
- `text` is inline markdown: **bold**, *italic*, `code`, ~~strike~~, [label](url), [[Wiki link]].
- `children` only for: bullet, number, todo, toggle, callout, quote, and headings with `props.toggle: true`.

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
| equation | expr | `$$expr$$` |
| table | header: bool, rows: [[cell inline md]] | GFM table |
| page | note_id, title | `[[title]]` (sub-page) |
| database | note_id, title | `[[title]]` (inline DB, rendered as its default view) |

## Databases
A database is a note with `notes.kind = 'database'` and `notes.db` JSON:
```json
{ "props": [ { "key": "status", "name": "여부", "type": "status|select|multi_select|date|text|number|checkbox|url",
               "options": [ { "name": "시작 전", "color": "gray|blue|green|yellow|red|purple|pink|orange|brown" } ] } ],
  "views": [ { "id": "v1", "name": "Table", "type": "table|board", "group_by": "status" } ] }
```
Rows are its child notes (`parent_id` = database note id) with `notes.props` JSON `{ "<key>": value }` (multi_select = array, date = "YYYY-MM-DD", checkbox = bool). Row title = note title. The title column is implicit.

Database markdown mirror (`body`): a GFM table of rows (title as [[link]] + props) so search/AI still see it.

## Views (v1.1, backward compatible — every field optional)
```json
{ "id": "v1", "name": "Table", "type": "table|board|calendar",
  "group_by": "<status|select|multi_select key>",   // board (required, auto-picked) · table (optional)
  "date_prop": "<date key>",                        // calendar (auto-picked: first date prop)
  "filters": [ { "prop": "<key>|title", "op": "is", "value": "완료" } ],   // AND, max 10
  "sorts":   [ { "prop": "<key>|title", "dir": "asc|desc" } ] }           // multi-level, max 5
```
Ops per type (`public/js/blocks/dbview.js` `OPS`): `is` (text/url/title/number/select/status/date/checkbox) · `is_not` · `contains` / `not_contains` (text/url/title/multi_select) · `gt` / `lt` (number) · `before` / `after` (date) · `empty` / `not_empty` (no value).
The server (`validateDb` → `cleanView`) silently drops filters/sorts on unknown props, wrong ops or bad values, so deleting a property never breaks a saved view. Sorting puts empty values last; select/status sort by option order. Grouping by multi_select puts a row in every group it has; values that aren't options get their own group.

## Reminders
A row may carry `props._remind = { "prop": "<date key>", "time": "HH:MM" }` (KST). Old rows simply have no `_remind`; the date value itself stays a plain `"YYYY-MM-DD"` string.
- On save the worker derives `notes.remind_at` (epoch ms UTC, migration 0036) = date + time in KST; changing it clears `reminded_at` / `remind_seen` so it can fire again. A non-date prop or a bad time is rejected (cleared / `09:00`).
- Cron `0 * * * *` (`src/reminders.js`) sends a contentless web push (`src/push.js`) to the **row owner** for rows with `remind_at <= now`, not sent yet, and at most 26 h late. **Hourly granularity**: a 09:30 reminder arrives at 10:00.
- The service worker then calls `POST /api/reminders/take` (marks `remind_seen`) and shows "⏰ title · database · date · time"; clicking opens the row.
- Local testing: `POST /api/reminders/run?now=<ms>` runs the cron once (only when `PASSWORDLESS=1`, i.e. `.dev.vars`).

## Notes list
Rows of a database are hidden from the left notes list (they show inside their database); typing in the list filter or global search still finds them.
