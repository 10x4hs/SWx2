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

## Colors (v2)
Notion colors: gray, brown, orange, yellow, green, blue, purple, pink, red.
- Inline text color: `<span class="c-red">text</span>`; inline highlight: `<mark class="bg-yellow">text</mark>` (inside `text`; kept in the markdown mirror as-is, DOMPurify keeps class).
- Block color: `props.color = "red" | "red_background" | …` on any text block (whole-block color / background, like Notion).
