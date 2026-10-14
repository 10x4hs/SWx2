// Database view logic — pure functions shared by the browser (db.js) and the worker (md.js validateDb, src/reminders.js).
// Contract: docs/blocks-schema.md ("Views", "Relation · Rollup · Formula", "Reminders"). No DOM; only imports formula.js.
import { compile, evalFormula, FormulaError, toDate } from "./formula.js";

export const VIEW_TYPES = ["table", "board", "calendar", "gallery", "list"];
export const ROLLUP_FNS = ["count", "count_values", "sum", "avg", "min", "max", "show_original", "percent_checked"];
const CALC = ["rollup", "formula"]; // 계산 속성: 값은 저장하지 않고 볼 때마다 계산
const GROUPABLE = ["status", "select", "multi_select"];
// op → which property types allow it. "title" (the implicit Name column) behaves like text.
// rollup · formula 는 결과가 숫자일 수도 글자일 수도 있어서 둘 다 받아요. relation 은 비었는지만.
export const OPS = {
  is: ["text", "url", "title", "number", "status", "select", "date", "checkbox", ...CALC],
  is_not: ["text", "url", "title", "number", "status", "select", ...CALC],
  contains: ["text", "url", "title", "multi_select", ...CALC],
  not_contains: ["text", "url", "title", "multi_select", ...CALC],
  gt: ["number", ...CALC], lt: ["number", ...CALC],
  before: ["date"], after: ["date"],
  empty: ["text", "url", "title", "number", "status", "select", "multi_select", "date", "relation", ...CALC],
  not_empty: ["text", "url", "title", "number", "status", "select", "multi_select", "date", "relation", ...CALC],
};
export const OP_LABEL = { is: "is", is_not: "is not", contains: "contains", not_contains: "does not contain", gt: ">", lt: "<", before: "is before", after: "is after", empty: "is empty", not_empty: "is not empty" };
export const opsFor = (type) => Object.keys(OPS).filter((op) => OPS[op].includes(type));
export const noValue = (op) => op === "empty" || op === "not_empty";
// Op names used by early editor-branch views (pre-merge) → canonical op (+ fixed value). Accepted on save, never stored.
const LEGACY_OPS = { is_empty: ["empty"], is_not_empty: ["not_empty"], checked: ["is", true], unchecked: ["is", false] };
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
  if (o.type === "calendar") { const d = props.find((p) => p.key === (v.date_prop ?? v.date_by) && p.type === "date") || props.find((p) => p.type === "date"); if (d) o.date_prop = d.key; }
  // gallery · list: 보여 줄 속성(show, 최대 8) · gallery 표지(cover = "page" 첫 이미지 | "none" | url/text 속성 key)
  if (o.type === "gallery" || o.type === "list") {
    if (Array.isArray(v?.show)) o.show = [...new Set(v.show.filter((k) => props.some((p) => p.key === k)))].slice(0, 8);
    if (o.type === "gallery") o.cover = v?.cover === "none" || props.some((p) => p.key === v?.cover && (p.type === "url" || p.type === "text")) ? v.cover : "page";
  }
  const filters = (Array.isArray(v?.filters) ? v.filters : []).slice(0, 10).map((f) => {
    const leg = LEGACY_OPS[f?.op]; if (leg) f = { ...f, op: leg[0], ...(leg.length > 1 ? { value: leg[1] } : {}) };
    const p = byKey(f?.prop); if (!p || !OPS[f.op]?.includes(p.type)) return null;
    const x = { prop: p.key, op: f.op };
    if (noValue(f.op)) return x;
    if (p.type === "checkbox") x.value = !!f.value;
    else if (p.type === "number" || (CALC.includes(p.type) && (f.op === "gt" || f.op === "lt"))) { const n = Number(f.value); if (!Number.isFinite(n)) return null; x.value = n; }
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
    case "is": return p.type === "checkbox" || typeof v === "boolean" ? !!v === (f.value === true || String(f.value).toLowerCase() === "true") : p.type === "number" ? Number(v) === f.value && !isEmpty(v) : String(v ?? "").toLowerCase() === String(f.value).toLowerCase();
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
      if (p.type === "number" || typeof v === "number") return Number(v);
      if (p.type === "relation") return v.length;
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
// ---------- relation · rollup · formula ----------
// rows 에 rollup / formula 값을 계산해 붙인 복사본을 돌려줘요 (r.props[key] = 값, r.errs[key] = 오류 글).
// rel: { [db id]: { db, rows } } — 관계가 가리키는 다른 데이터베이스들. selfId: 이 데이터베이스 id (자기 자신을 가리키는 관계).
// 다른(또는 같은) DB 의 rollup 은 한 단계만 따라가요 (그쪽의 rollup 은 비워서 끝없는 순환을 막아요).
export function computeRows(rows, db, rel = {}, selfId = "") {
  const props = db?.props || [];
  if (!props.some((p) => CALC.includes(p.type))) return rows;
  const self = { db, rows };
  const ctx = {};
  const target = (tid, depth) => {
    const src = !tid || tid === selfId ? self : rel[tid];
    if (!src) return null;
    const k = (tid || selfId) + ":" + depth;
    if (!ctx[k]) ctx[k] = { db: src.db, byId: new Map(src.rows.map((r) => [r.id, r])), ev: evaluator(src.db, depth + 1) };
    return ctx[k];
  };
  function evaluator(d, depth) {
    const ps = d?.props || [];
    const byName = (n) => (n === "Name" || n === "title" ? TITLE : ps.find((p) => p.name === n) || ps.find((p) => p.key === n));
    const memo = new WeakMap();
    return (r) => {
      if (memo.has(r)) return memo.get(r);
      const vals = {}, errs = {}, busy = new Set();
      const get = (p) => {
        if (p.key === "title") return r.title;
        if (!CALC.includes(p.type)) return (r.props || {})[p.key];
        if (p.key in vals) return vals[p.key];
        if (busy.has(p.key)) throw new FormulaError("수식이 서로를 부르고 있어요");
        busy.add(p.key);
        try { vals[p.key] = p.type === "formula" ? formula(p) : rollup(p); }
        catch (e) { vals[p.key] = null; errs[p.key] = e instanceof FormulaError ? e.message : "계산하지 못했어요"; }
        busy.delete(p.key);
        return vals[p.key];
      };
      const formula = (p) => {
        const c = compile(p.expr || ""); if (c.error) throw new FormulaError(c.error);
        const v = evalFormula(c.ast, (name) => {
          const q = byName(name); if (!q) throw new FormulaError(`없는 속성: ${name}`);
          const x = get(q);
          if (x === undefined || x === null) return q.type === "checkbox" ? false : null;
          if (q.type === "date") return toDate(x);
          return x;
        });
        return v instanceof Date ? v.toISOString().slice(0, 10) : v;
      };
      const rollup = (p) => {
        if (depth > 1) return null;
        const rp = ps.find((x) => x.key === p.relation && x.type === "relation");
        if (!rp) throw new FormulaError("관계 속성을 골라 주세요");
        const T = target(rp.target, depth); if (!T) return null; // 아직 못 불러옴
        const linked = ((r.props || {})[rp.key] || []).map((id) => T.byId.get(id)).filter(Boolean);
        const fn = ROLLUP_FNS.includes(p.fn) ? p.fn : "count";
        if (fn === "count") return linked.length;
        const tp = p.target === "title" ? TITLE : (T.db?.props || []).find((x) => x.key === p.target);
        if (!tp) throw new FormulaError("대상 속성을 골라 주세요");
        const raw = linked.map((x) => (tp.key === "title" ? x.title : CALC.includes(tp.type) ? T.ev(x).props[tp.key] : (x.props || {})[tp.key]));
        if (fn === "percent_checked") return linked.length ? Math.round((raw.filter(Boolean).length / linked.length) * 100) : null;
        const flat = raw.flat().filter((x) => !isEmpty(x) && x !== false);
        if (fn === "count_values") return flat.length;
        if (fn === "show_original") return flat.map((x) => (x === true ? "✓" : String(x))).join(", ");
        const ns = flat.map(Number).filter(Number.isFinite);
        if (!ns.length) return null;
        if (fn === "sum") return ns.reduce((a, b) => a + b, 0);
        if (fn === "avg") return Math.round((ns.reduce((a, b) => a + b, 0) / ns.length) * 1e6) / 1e6;
        return fn === "min" ? Math.min(...ns) : Math.max(...ns);
      };
      ps.filter((p) => CALC.includes(p.type)).forEach(get);
      const out = { ...r, props: { ...(r.props || {}), ...Object.fromEntries(Object.entries(vals).filter(([, v]) => v !== null && v !== undefined)) }, errs };
      for (const p of ps) if (CALC.includes(p.type) && (vals[p.key] === null || vals[p.key] === undefined)) delete out.props[p.key];
      memo.set(r, out);
      return out;
    };
  }
  const ev = evaluator(db, 0);
  return rows.map(ev);
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
