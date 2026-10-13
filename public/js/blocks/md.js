// Blocks ⇄ markdown — pure functions shared by the browser editor and the worker (src/notes.js imports this file).
// Contract: docs/blocks-schema.md. No DOM, no imports, so both sides can load it.

export const MAX_BLOCKS_JSON = 400_000;
export const MAX_BLOCKS = 5000;
export const BLOCK_TYPES = ["paragraph", "h1", "h2", "h3", "bullet", "number", "todo", "toggle", "callout", "quote", "divider", "code", "image", "file", "bookmark", "embed", "equation", "table", "page", "database"];
const TYPESET = new Set(BLOCK_TYPES);
const NESTABLE = new Set(["bullet", "number", "todo", "toggle", "callout", "quote"]);
const LISTY = new Set(["bullet", "number", "todo"]);
export const canNest = (b) => NESTABLE.has(b.type) || (/^h[123]$/.test(b.type) && !!b.props?.toggle);
export const COLORS = ["default", "gray", "brown", "orange", "yellow", "green", "blue", "purple", "pink", "red"];
const TEXTY = new Set(["paragraph", "h1", "h2", "h3", "bullet", "number", "todo", "toggle", "callout", "quote"]);
const BLOCK_COLORS = new Set(["gray", "brown", "orange", "yellow", "green", "blue", "purple", "pink", "red"].flatMap((c) => [c, c + "_background"]));
export const PROP_TYPES = ["status", "select", "multi_select", "date", "text", "number", "checkbox", "url"];

export function bid() {
  const a = "abcdefghijklmnopqrstuvwxyz0123456789";
  let s = "b_";
  for (let i = 0; i < 8; i++) s += a[Math.floor(Math.random() * a.length)];
  return s;
}
export const block = (type, text = "", props = {}, children = []) => ({ id: bid(), type, text, props, children });

// ---------- validation (server trusts nothing) ----------
const str = (v, max) => (typeof v === "string" ? v.slice(0, max) : "");
function cleanProps(type, p) {
  p = p && typeof p === "object" && !Array.isArray(p) ? p : {};
  const o = {};
  if (/^h[123]$/.test(type) && p.toggle) o.toggle = true;
  if (type === "todo") o.checked = !!p.checked;
  if (TEXTY.has(type) && typeof p.color === "string" && BLOCK_COLORS.has(p.color)) o.color = p.color;
  if (type === "callout") o.icon = str(p.icon, 16) || "💡";
  if (type === "code") o.lang = str(p.lang, 30);
  if (type === "image") { o.src = str(p.src, 2000); o.caption = str(p.caption, 500); }
  if (type === "file") { o.src = str(p.src, 2000); o.name = str(p.name, 200); }
  if (type === "bookmark" || type === "embed") { o.url = str(p.url, 2000); if (p.caption) o.caption = str(p.caption, 500); }
  if (type === "equation") o.expr = str(p.expr, 5000);
  if (type === "table") {
    o.header = !!p.header;
    const rows = Array.isArray(p.rows) ? p.rows.slice(0, 500) : [];
    o.rows = rows.map((r) => (Array.isArray(r) ? r.slice(0, 40).map((c) => str(String(c ?? ""), 2000)) : []));
  }
  if (type === "page" || type === "database") { o.note_id = str(p.note_id, 64); o.title = str(p.title, 120); }
  return o;
}
export function validateDoc(doc) {
  if (!doc || typeof doc !== "object" || doc.v !== 1 || !Array.isArray(doc.blocks)) throw new Error("blocks 는 { v: 1, blocks: [] } 모양이어야 해요.");
  let count = 0;
  const walk = (list, depth) => {
    if (depth > 12) throw new Error("블록이 너무 깊게 들어가 있어요.");
    return list.map((b) => {
      if (!b || typeof b !== "object" || !TYPESET.has(b.type)) throw new Error("모르는 블록 종류예요: " + String(b?.type).slice(0, 20));
      if (++count > MAX_BLOCKS) throw new Error("블록이 너무 많아요.");
      const out = { id: typeof b.id === "string" && /^[\w-]{1,40}$/.test(b.id) ? b.id : bid(), type: b.type, text: str(b.text, 20000), props: cleanProps(b.type, b.props), children: [] };
      if (Array.isArray(b.children) && b.children.length) {
        if (!canNest(out)) throw new Error(`'${b.type}' 블록에는 안쪽 블록을 둘 수 없어요.`);
        out.children = walk(b.children, depth + 1);
      }
      return out;
    });
  };
  return { v: 1, blocks: walk(doc.blocks, 0) };
}

// ---------- blocks → markdown ----------
const cell = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
function tableMd(rows, header) {
  const w = Math.max(1, ...rows.map((r) => r.length));
  const line = (r) => "| " + Array.from({ length: w }, (_, i) => cell(r[i])).join(" | ") + " |";
  const head = header && rows.length ? rows[0] : Array(w).fill("");
  const body = header && rows.length ? rows.slice(1) : rows;
  return [line(head), "| " + Array(w).fill("---").join(" | ") + " |", ...body.map(line)];
}
function renderList(blocks) {
  const out = [];
  let prev = null, num = 0;
  for (const b of blocks) {
    if (b.type === "paragraph" && !b.text.trim() && !b.children?.length) { prev = null; continue; } // empty lines are only spacing
    num = b.type === "number" ? (prev?.type === "number" ? num + 1 : 1) : 0;
    const lines = renderOne(b, num);
    if (!lines.length) continue;
    if (out.length) { if (!(prev && LISTY.has(prev.type) && LISTY.has(b.type))) out.push(""); }
    out.push(...lines);
    prev = b;
  }
  return out;
}
const pad = (lines, p) => lines.map((l) => (l ? p + l : l));
const textLines = (t) => String(t || "").split("\n");
function renderOne(b, num) {
  const kids = b.children?.length ? renderList(b.children) : [];
  const t = b.text || "", p = b.props || {};
  switch (b.type) {
    case "paragraph": return textLines(t);
    case "h1": case "h2": case "h3": {
      const h = "#".repeat(+b.type[1]) + " " + t.replace(/\n/g, " ");
      return p.toggle ? [`<details><summary>${h}</summary>`, "", ...kids, ...(kids.length ? [""] : []), "</details>"] : [h];
    }
    case "bullet": case "number": case "todo": {
      const mark = b.type === "bullet" ? "- " : b.type === "number" ? `${num || 1}. ` : p.checked ? "- [x] " : "- [ ] ";
      const [first, ...rest] = textLines(t);
      return [mark + first, ...pad(rest, "  "), ...pad(kids, "  ")];
    }
    case "toggle": return [`<details><summary>${t.replace(/\n/g, " ")}</summary>`, "", ...kids, ...(kids.length ? [""] : []), "</details>"];
    case "callout": {
      const [first, ...rest] = textLines(t);
      return [`> [!note] ${p.icon || "💡"} ${first}`.trimEnd(), ...rest.map((l) => "> " + l), ...(kids.length ? [">", ...kids.map((l) => (l ? "> " + l : ">"))] : [])];
    }
    case "quote": return [...textLines(t).map((l) => "> " + l), ...(kids.length ? [">", ...kids.map((l) => (l ? "> " + l : ">"))] : [])];
    case "divider": return ["---"];
    case "code": {
      const fence = /```/.test(t) ? "~~~~" : "```";
      return [fence + (p.lang || ""), ...textLines(t), fence];
    }
    case "image": return p.src ? [`![${(p.caption || "").replace(/[\[\]\n]/g, " ")}](${p.src})`] : [];
    case "file": return p.src ? [`[📎 ${(p.name || "file").replace(/[\[\]\n]/g, " ")}](${p.src})`] : [];
    case "bookmark": case "embed": return p.url ? [`[${(p.caption || p.url).replace(/[\[\]\n]/g, " ")}](${p.url})`] : [];
    case "equation": return p.expr ? ["$$" + p.expr.replace(/\n/g, " ") + "$$"] : [];
    case "table": return p.rows?.length ? tableMd(p.rows, p.header) : [];
    case "page": case "database": return p.title ? [`[[${p.title}]]`] : [];
    default: return textLines(t);
  }
}
export function blocksToMd(doc) {
  const list = Array.isArray(doc) ? doc : doc?.blocks || [];
  const s = renderList(list).join("\n").replace(/\s+$/, "");
  return s ? s + "\n" : "";
}

// ---------- markdown → blocks (old notes · Notion import) ----------
const indentOf = (l) => { const m = /^[ \t]*/.exec(l)[0]; return m.replace(/\t/g, "    ").length; };
function dedent(lines) {
  const n = Math.min(...lines.filter((l) => l.trim()).map(indentOf), 99);
  return lines.map((l) => { let i = 0, k = 0; while (k < l.length && i < n && (l[k] === " " || l[k] === "\t")) { i += l[k] === "\t" ? 4 : 1; k++; } return l.slice(k); });
}
const LIST_RE = /^([ \t]*)([-*+]|\d{1,3}[.)])[ \t]+(\[[ xX]\][ \t]+)?(.*)$/;
const splitRow = (l) => {
  let s = l.trim(); if (s.startsWith("|")) s = s.slice(1); if (s.endsWith("|") && !s.endsWith("\\|")) s = s.slice(0, -1);
  const out = []; let cur = "";
  for (let i = 0; i < s.length; i++) { if (s[i] === "\\" && s[i + 1] === "|") { cur += "|"; i++; } else if (s[i] === "|") { out.push(cur.trim()); cur = ""; } else cur += s[i]; }
  out.push(cur.trim());
  return out;
};
const isSep = (l) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l || "");
const EMOJI_RE = /^(\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic})*)\s*/u;

export function mdToBlocks(md) {
  return { v: 1, blocks: parse(String(md || "").replace(/\r\n?/g, "\n").split("\n"), 0) };
}
function parse(lines, depth) {
  const out = [];
  let i = 0;
  const childrenFrom = (rows) => (depth > 10 ? [block("paragraph", rows.join("\n"))] : parse(rows, depth + 1));
  while (i < lines.length) {
    const line = lines[i], trim = line.trim();
    if (!trim) { i++; continue; }
    // fenced code
    let m = /^[ \t]*(```+|~~~+)\s*([\w+#.-]*)/.exec(line);
    if (m) {
      const fence = m[1], body = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith(fence)) body.push(lines[i++]);
      i++;
      out.push(block("code", dedent(body).join("\n"), { lang: m[2] || "" }));
      continue;
    }
    // <details> toggle (nested ok)
    if (/^<details\b[^>]*>/i.test(trim)) {
      let rest = trim.replace(/^<details\b[^>]*>/i, "").trim(), summary = "", inner = [], d = 1;
      i++;
      const sm = /^<summary>([\s\S]*?)<\/summary>(.*)$/i.exec(rest);
      if (sm) { summary = sm[1].trim(); rest = sm[2].trim(); }
      else if (!rest) { while (i < lines.length && !lines[i].trim()) i++; const s2 = /^\s*<summary>([\s\S]*?)<\/summary>(.*)$/i.exec(lines[i] || ""); if (s2) { summary = s2[1].trim(); rest = s2[2].trim(); i++; } }
      if (rest && /<\/details>\s*$/i.test(rest)) { inner.push(rest.replace(/<\/details>\s*$/i, "")); d = 0; }
      else if (rest) inner.push(rest);
      while (d > 0 && i < lines.length) {
        const t = lines[i].trim();
        if (/^<details\b/i.test(t)) d++;
        if (/<\/details>\s*$/i.test(t)) { d--; if (d === 0) { const before = t.replace(/<\/details>\s*$/i, ""); if (before) inner.push(before); i++; break; } }
        inner.push(lines[i]); i++;
      }
      const hm = /^(#{1,3})\s+(.*)$/.exec(summary);
      out.push(hm ? block("h" + hm[1].length, hm[2], { toggle: true }, childrenFrom(dedent(inner))) : block("toggle", summary.replace(/<[^>]+>/g, ""), {}, childrenFrom(dedent(inner))));
      continue;
    }
    // "▸ " toggle line with indented children (old Notion import)
    m = /^([ \t]*)▸\s?(.*)$/.exec(line);
    if (m) {
      const ind = indentOf(line), kids = [];
      i++;
      while (i < lines.length && (!lines[i].trim() || indentOf(lines[i]) > ind)) kids.push(lines[i++]);
      while (kids.length && !kids.at(-1).trim()) { kids.pop(); }
      const hm = /^(#{1,3})\s+(.*)$/.exec(m[2]);
      out.push(hm ? block("h" + hm[1].length, hm[2], { toggle: true }, childrenFrom(dedent(kids))) : block("toggle", m[2], {}, childrenFrom(dedent(kids))));
      continue;
    }
    m = /^(#{1,3})\s+(.*)$/.exec(trim);
    if (m && indentOf(line) < 4) { out.push(block("h" + m[1].length, m[2].replace(/\s+#+\s*$/, ""))); i++; continue; }
    if (/^#{4,6}\s+/.test(trim)) { out.push(block("h3", trim.replace(/^#+\s+/, ""))); i++; continue; }
    if (/^([-*_])(\s*\1){2,}$/.test(trim)) { out.push(block("divider")); i++; continue; }
    // blockquote / callout
    if (trim.startsWith(">")) {
      const q = [];
      while (i < lines.length && lines[i].trim().startsWith(">")) q.push(lines[i++].trim().replace(/^>\s?/, ""));
      const cm = /^\[!(\w+)\][+-]?\s*(.*)$/.exec(q[0]);
      if (cm) {
        let text = cm[2], icon = "💡";
        const em = EMOJI_RE.exec(text); if (em) { icon = em[1]; text = text.slice(em[0].length); }
        const restLines = q.slice(1);
        const firstPara = []; let k = 0;
        while (k < restLines.length && restLines[k].trim() && !/^([-*+]|\d+[.)]|#|```|>|\||!\[)/.test(restLines[k].trim())) firstPara.push(restLines[k++]);
        out.push(block("callout", [text, ...firstPara].filter((x, j) => j > 0 || x).join("\n"), { icon }, childrenFrom(restLines.slice(k))));
      } else {
        const inner = parse(q, depth + 1);
        if (inner[0]?.type === "paragraph") out.push(block("quote", inner[0].text, {}, inner.slice(1)));
        else out.push(block("quote", "", {}, inner));
      }
      continue;
    }
    // table
    if (trim.startsWith("|") && isSep(lines[i + 1])) {
      const rows = [splitRow(trim)];
      i += 2;
      while (i < lines.length && lines[i].trim().startsWith("|")) rows.push(splitRow(lines[i++]));
      out.push(block("table", "", { header: true, rows }));
      continue;
    }
    // list item (+ indented children)
    m = LIST_RE.exec(line);
    if (m) {
      const ind = indentOf(line), kids = [];
      i++;
      while (i < lines.length) {
        const l = lines[i];
        if (!l.trim()) { // blank: belongs to the item only if more indented content follows
          let j = i; while (j < lines.length && !lines[j].trim()) j++;
          if (j < lines.length && indentOf(lines[j]) > ind) { while (i < j) kids.push(lines[i++]); continue; }
          break;
        }
        if (indentOf(l) > ind) { kids.push(l); i++; continue; }
        break;
      }
      const type = m[3] ? "todo" : /\d/.test(m[2]) ? "number" : "bullet";
      out.push(block(type, m[4], type === "todo" ? { checked: /x/i.test(m[3]) } : {}, kids.length ? childrenFrom(dedent(kids)) : []));
      continue;
    }
    // image / equation lines
    m = /^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)$/.exec(trim);
    if (m) { out.push(block("image", "", { src: m[2], caption: m[1] })); i++; continue; }
    m = /^\$\$(.+)\$\$$/.exec(trim);
    if (m) { out.push(block("equation", "", { expr: m[1] })); i++; continue; }
    if (trim === "$$") { const ex = []; i++; while (i < lines.length && lines[i].trim() !== "$$") ex.push(lines[i++]); i++; out.push(block("equation", "", { expr: ex.join(" ").trim() })); continue; }
    // paragraph: consecutive plain lines
    const para = [trim];
    i++;
    while (i < lines.length) {
      const l = lines[i], t = l.trim();
      if (!t || /^(```|~~~|<details|▸|#{1,6}\s|>|\|)/.test(t) || LIST_RE.test(l) || /^([-*_])(\s*\1){2,}$/.test(t) || /^!\[[^\]]*\]\([^)]+\)$/.test(t) || /^<!--.*-->$/.test(t) || /^<!--.*-->$/.test(para[0])) break;
      para.push(t); i++;
    }
    out.push(block("paragraph", para.join("\n")));
  }
  return out;
}

// ---------- databases ----------
const KEY_RE = /^[a-z0-9_]{1,30}$/;
export const VIEW_TYPES = ["table", "board", "calendar"];
export const FILTER_OPS = ["is", "is_not", "contains", "not_contains", "is_empty", "is_not_empty", "before", "after", "checked", "unchecked"];
const GROUPABLE = new Set(["status", "select", "multi_select"]);
// rows → filtered (AND) + sorted, for a view. Shared so the server could reuse it later.
export function applyView(rows, view, db) {
  const val = (r, k) => (k === "title" ? r.title : (r.props || {})[k]);
  const ptype = (k) => (k === "title" ? "text" : db.props.find((p) => p.key === k)?.type || "text");
  const empty = (v) => v === undefined || v === null || v === "" || (Array.isArray(v) && !v.length);
  const test = (r, f) => {
    const v = val(r, f.prop), q = String(f.value || "").toLowerCase(), arr = Array.isArray(v) ? v.map((x) => String(x).toLowerCase()) : null, s = empty(v) ? "" : String(v).toLowerCase();
    switch (f.op) {
      case "is": return arr ? arr.includes(q) : s === q;
      case "is_not": return arr ? !arr.includes(q) : s !== q;
      case "contains": return arr ? arr.some((x) => x.includes(q)) : s.includes(q);
      case "not_contains": return arr ? !arr.some((x) => x.includes(q)) : !s.includes(q);
      case "is_empty": return empty(v);
      case "is_not_empty": return !empty(v);
      case "before": return !empty(v) && String(v) < f.value;
      case "after": return !empty(v) && String(v) > f.value;
      case "checked": return !!v;
      case "unchecked": return !v;
      default: return true;
    }
  };
  let out = rows.filter((r) => (view.filters || []).every((f) => test(r, f)));
  const sorts = view.sorts || [];
  if (sorts.length) out = [...out].sort((a, b) => {
    for (const s of sorts) {
      const t = ptype(s.prop); let x = val(a, s.prop), y = val(b, s.prop);
      if (empty(x) && empty(y)) continue; if (empty(x)) return 1; if (empty(y)) return -1;
      if (t === "status" || t === "select") { const o = db.props.find((p) => p.key === s.prop)?.options || []; x = o.findIndex((z) => z.name === x); y = o.findIndex((z) => z.name === y); }
      else if (Array.isArray(x)) { x = x.join(","); y = Array.isArray(y) ? y.join(",") : y; }
      const c = typeof x === "number" && typeof y === "number" ? x - y : typeof x === "boolean" ? (x === y ? 0 : x ? -1 : 1) : String(x).localeCompare(String(y));
      if (c) return s.dir === "desc" ? -c : c;
    }
    return 0;
  });
  return out;
}
export function defaultDb() {
  return {
    props: [
      { key: "status", name: "Status", type: "status", options: [{ name: "시작 전", color: "gray" }, { name: "진행 중", color: "blue" }, { name: "완료", color: "green" }] },
      { key: "date", name: "Date", type: "date" },
      { key: "tags", name: "Tags", type: "multi_select", options: [] },
    ],
    views: [{ id: "v1", name: "Table", type: "table" }, { id: "v2", name: "Board", type: "board", group_by: "status" }],
  };
}
export function validateDb(db) {
  if (!db || typeof db !== "object" || !Array.isArray(db.props)) throw new Error("db.props 가 필요해요.");
  const seen = new Set();
  const props = db.props.slice(0, 30).map((p) => {
    const key = str(p?.key, 30);
    if (!KEY_RE.test(key) || seen.has(key)) throw new Error("속성 key 는 영문 소문자·숫자·_ 로, 겹치지 않게 써 주세요.");
    seen.add(key);
    if (!PROP_TYPES.includes(p.type)) throw new Error("모르는 속성 종류예요: " + String(p.type).slice(0, 20));
    const o = { key, name: str(p.name, 60) || key, type: p.type };
    if (["status", "select", "multi_select"].includes(p.type)) {
      const names = new Set();
      o.options = (Array.isArray(p.options) ? p.options : []).slice(0, 60).map((x) => ({ name: str(x?.name, 60).trim(), color: COLORS.includes(x?.color) ? x.color : "gray" })).filter((x) => x.name && !names.has(x.name) && names.add(x.name));
    }
    return o;
  });
  const views = (Array.isArray(db.views) ? db.views : []).slice(0, 10).map((v, i) => {
    const o = { id: /^[\w-]{1,20}$/.test(v?.id || "") ? v.id : "v" + (i + 1), name: str(v?.name, 40) || "View", type: VIEW_TYPES.includes(v?.type) ? v.type : "table" };
    const groupable = (p) => GROUPABLE.has(p.type);
    if (o.type === "board") { const g = props.find((p) => p.key === v.group_by && groupable(p)) || props.find((p) => p.type === "status" || p.type === "select"); if (g) o.group_by = g.key; }
    else if (o.type === "table" && props.some((p) => p.key === v?.group_by && groupable(p))) o.group_by = v.group_by;
    if (o.type === "calendar") { const d = props.find((p) => p.key === v?.date_by && p.type === "date") || props.find((p) => p.type === "date"); if (d) o.date_by = d.key; }
    const known = (k) => k === "title" || props.some((p) => p.key === k);
    const f = (Array.isArray(v?.filters) ? v.filters : []).slice(0, 20).filter((x) => known(x?.prop) && FILTER_OPS.includes(x.op)).map((x) => ({ prop: x.prop, op: x.op, value: str(String(x.value ?? ""), 200) }));
    if (f.length) o.filters = f;
    const so = (Array.isArray(v?.sorts) ? v.sorts : []).slice(0, 5).filter((x) => known(x?.prop)).map((x) => ({ prop: x.prop, dir: x.dir === "desc" ? "desc" : "asc" }));
    if (so.length) o.sorts = so;
    return o;
  });
  if (!views.length) views.push({ id: "v1", name: "Table", type: "table" });
  return { props, views };
}
export function cleanRowProps(input, db, prev = {}) {
  const out = { ...(prev && typeof prev === "object" ? prev : {}) };
  if (!input || typeof input !== "object") return out;
  for (const p of db?.props || []) {
    if (!(p.key in input)) continue;
    const v = input[p.key];
    if (v === null || v === "" || v === undefined) { delete out[p.key]; continue; }
    if (p.type === "checkbox") out[p.key] = !!v;
    else if (p.type === "number") { const n = Number(v); if (Number.isFinite(n)) out[p.key] = n; else delete out[p.key]; }
    else if (p.type === "date") { const s = String(v).slice(0, 10); if (/^\d{4}-\d{2}-\d{2}$/.test(s)) out[p.key] = s; }
    else if (p.type === "multi_select") out[p.key] = (Array.isArray(v) ? v : [v]).map((x) => String(x).slice(0, 60)).filter(Boolean).slice(0, 30);
    else out[p.key] = String(v).slice(0, p.type === "text" || p.type === "url" ? 2000 : 60);
  }
  return out;
}
export function propText(p, v) {
  if (v === undefined || v === null) return "";
  if (p.type === "checkbox") return v ? "✓" : "";
  if (Array.isArray(v)) return v.join(", ");
  return String(v);
}
export function dbToMd(db, rows) {
  const props = db?.props || [];
  if (!rows.length) return "";
  const head = ["Name", ...props.map((p) => p.name)];
  const body = rows.map((r) => [`[[${r.title}]]`, ...props.map((p) => propText(p, (r.props || {})[p.key]))]);
  return tableMd([head, ...body], true).join("\n") + "\n";
}
