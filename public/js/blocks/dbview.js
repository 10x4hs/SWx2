// Database view logic — pure functions shared by the browser (db.js) and the worker (md.js validateDb, src/reminders.js).
// Contract: docs/blocks-schema.md ("Views" and "Reminders"). No DOM, no imports.

export const VIEW_TYPES = ["table", "board", "calendar"];
const GROUPABLE = ["status", "select", "multi_select"];
// op → which property types allow it. "title" (the implicit Name column) behaves like text.
export const OPS = {
  is: ["text", "url", "title", "number", "status", "select", "date", "checkbox"],
  is_not: ["text", "url", "title", "number", "status", "select"],
  contains: ["text", "url", "title", "multi_select"],
  not_contains: ["text", "url", "title", "multi_select"],
  gt: ["number"], lt: ["number"],
  before: ["date"], after: ["date"],
  empty: ["text", "url", "title", "number", "status", "select", "multi_select", "date"],
  not_empty: ["text", "url", "title", "number", "status", "select", "multi_select", "date"],
};
export const OP_LABEL = { is: "is", is_not: "is not", contains: "contains", not_contains: "does not contain", gt: ">", lt: "<", before: "is before", after: "is after", empty: "is empty", not_empty: "is not empty" };
export const opsFor = (type) => Object.keys(OPS).filter((op) => OPS[op].includes(type));
export const noValue = (op) => op === "empty" || op === "not_empty";
const TITLE = { key: "title", type: "title", name: "Name" };
const s = (v, max) => (typeof v === "string" ? v.slice(0, max) : "");

// Validate one view against the (already validated) props. Unknown props / ops are dropped, not errors,
// so deleting a property never makes an old view unsavable.
export function cleanView(v, i, props) {
  const o = { id: /^[\w-]{1,20}$/.test(v?.id || "") ? v.id : "v" + (i + 1), name: s(v?.name, 40).trim() || "View", type: VIEW_TYPES.includes(v?.type) ? v.type : "table" };
  const byKey = (k) => (k === "title" ? TITLE : props.find((p) => p.key === k));
  const groupable = (k) => props.find((p) => p.key === k && GROUPABLE.includes(p.type));
  if (o.type === "board") { const g = groupable(v.group_by) || props.find((p) => p.type === "status" || p.type === "select"); if (g) o.group_by = g.key; }
  else if (o.type === "table" && v?.group_by && groupable(v.group_by)) o.group_by = v.group_by;
  if (o.type === "calendar") { const d = props.find((p) => p.key === v.date_prop && p.type === "date") || props.find((p) => p.type === "date"); if (d) o.date_prop = d.key; }
  const filters = (Array.isArray(v?.filters) ? v.filters : []).slice(0, 10).map((f) => {
    const p = byKey(f?.prop); if (!p || !OPS[f.op]?.includes(p.type)) return null;
    const x = { prop: p.key, op: f.op };
    if (noValue(f.op)) return x;
    if (p.type === "checkbox") x.value = !!f.value;
    else if (p.type === "number") { const n = Number(f.value); if (!Number.isFinite(n)) return null; x.value = n; }
    else if (p.type === "date") { if (!/^\d{4}-\d{2}-\d{2}$/.test(f.value || "")) return null; x.value = f.value; }
    else x.value = s(String(f.value ?? ""), 200);
    return x;
  }).filter(Boolean);
  if (filters.length) o.filters = filters;
  const seen = new Set();
  const sorts = (Array.isArray(v?.sorts) ? v.sorts : []).slice(0, 5).filter((x) => byKey(x?.prop) && !seen.has(x.prop) && seen.add(x.prop)).map((x) => ({ prop: x.prop, dir: x.dir === "desc" ? "desc" : "asc" }));
  if (sorts.length) o.sorts = sorts;
  return o;
}

const valOf = (r, key) => (key === "title" ? r.title : (r.props || {})[key]);
const isEmpty = (v) => v === undefined || v === null || v === "" || (Array.isArray(v) && !v.length);
function test(r, f, p) {
  const v = valOf(r, f.prop);
  switch (f.op) {
    case "empty": return isEmpty(v);
    case "not_empty": return !isEmpty(v);
    case "is": return p.type === "checkbox" ? !!v === !!f.value : p.type === "number" ? Number(v) === f.value && !isEmpty(v) : String(v ?? "").toLowerCase() === String(f.value).toLowerCase();
    case "is_not": return p.type === "number" ? Number(v) !== f.value || isEmpty(v) : String(v ?? "").toLowerCase() !== String(f.value).toLowerCase();
    case "contains": return Array.isArray(v) ? v.includes(f.value) : String(v ?? "").toLowerCase().includes(String(f.value).toLowerCase());
    case "not_contains": return Array.isArray(v) ? !v.includes(f.value) : !String(v ?? "").toLowerCase().includes(String(f.value).toLowerCase());
    case "gt": return !isEmpty(v) && Number(v) > f.value;
    case "lt": return !isEmpty(v) && Number(v) < f.value;
    case "before": return !isEmpty(v) && v < f.value;
    case "after": return !isEmpty(v) && v > f.value;
  }
  return true;
}
// rows: [{ id, title, props }] → filtered (AND) + sorted copy. Empty values sort last in both directions.
export function applyView(rows, db, view) {
  const props = db?.props || [];
  const byKey = (k) => (k === "title" ? TITLE : props.find((p) => p.key === k));
  const fs = (view?.filters || []).map((f) => [f, byKey(f.prop)]).filter(([, p]) => p);
  let out = rows.filter((r) => fs.every(([f, p]) => test(r, f, p)));
  const ss = (view?.sorts || []).map((x) => [x, byKey(x.prop)]).filter(([, p]) => p);
  if (ss.length) {
    const rank = (p, v) => {
      if (p.type === "status" || p.type === "select") { const i = (p.options || []).findIndex((o) => o.name === v); return i < 0 ? 1e9 : i; }
      if (p.type === "multi_select") return (v || []).join(",").toLowerCase();
      if (p.type === "number") return Number(v);
      if (p.type === "checkbox") return v ? 1 : 0;
      return String(v).toLowerCase();
    };
    out = out.map((r, i) => ({ r, i })).sort((a, b) => {
      for (const [x, p] of ss) {
        const va = valOf(a.r, x.prop), vb = valOf(b.r, x.prop), ea = isEmpty(va) && p.type !== "checkbox", eb = isEmpty(vb) && p.type !== "checkbox";
        if (ea || eb) { if (ea && eb) continue; return ea ? 1 : -1; }
        const ra = rank(p, va), rb = rank(p, vb);
        if (ra < rb) return x.dir === "desc" ? 1 : -1;
        if (ra > rb) return x.dir === "desc" ? -1 : 1;
      }
      return a.i - b.i;
    }).map((x) => x.r);
  }
  return out;
}
// Group rows by a status/select/multi_select prop → [{ name, color, rows }]; "" = no value (first, only when non-empty).
// multi_select: a row appears in every group it has.
export function groupRows(rows, p) {
  const cols = (p.options || []).map((x) => ({ name: x.name, color: x.color, rows: [] }));
  const none = { name: "", color: "default", rows: [] };
  for (const r of rows) {
    const v = (r.props || {})[p.key];
    const names = Array.isArray(v) ? v : v ? [v] : [];
    // values that aren't (yet) options still get their own group, after the known ones
    const hit = names.map((n) => cols.find((c) => c.name === n) || (cols.push({ name: n, color: "default", rows: [] }), cols[cols.length - 1]));
    if (hit.length) hit.forEach((c) => c.rows.push(r)); else none.rows.push(r);
  }
  return none.rows.length ? [none, ...cols] : cols;
}

// ---------- reminders ----------
// Row props may carry `_remind: { prop: "<date key>", time: "HH:MM" }` (KST). The reminder fires at that date + time.
export function cleanRemind(v, db) {
  if (!v || typeof v !== "object") return null;
  const p = (db?.props || []).find((x) => x.key === v.prop && x.type === "date");
  if (!p) return null;
  const t = /^([01]\d|2[0-3]):([0-5]\d)$/.test(v.time || "") ? v.time : "09:00";
  return { prop: p.key, time: t };
}
// → epoch ms (UTC) when the reminder is due, or null. KST = UTC+9, no DST.
export function remindAt(props) {
  const r = props?._remind; if (!r) return null;
  const d = props[r.prop];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d || "")) return null;
  const ms = Date.parse(`${d}T${r.time || "09:00"}:00+09:00`);
  return Number.isFinite(ms) ? ms : null;
}
// Cron runs hourly: a reminder is due once remind_at <= now, not yet sent, and not older than `maxLateMs`
// (so turning on a reminder for a date long past doesn't fire).
export function isDue(row, now, maxLateMs = 26 * 3600e3) {
  return row.remind_at != null && !row.reminded_at && row.remind_at <= now && row.remind_at > now - maxLateMs;
}
