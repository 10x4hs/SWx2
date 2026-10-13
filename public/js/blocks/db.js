// Database views (docs/blocks-schema.md): a database is a note (kind = 'database', db = { props, views }),
// its rows are child notes with props. Views: table (inline edit, optional grouping) · board (drag cards between groups).
// Each view keeps its own filters (AND) · sorts · group in db.views. Property / view menus rename, recolor, delete.
import { api } from "../api.js";
import { esc, toast } from "../util.js";
import { COLORS, PROP_TYPES, FILTER_OPS, applyView } from "./md.js";
import { touchDrag } from "./touchdrag.js";

const parse = (t) => { try { return t ? JSON.parse(t) : null; } catch { return null; } };
const VIEW_KEY = "trio-db-view";
function lastView(id) { try { return JSON.parse(localStorage.getItem(VIEW_KEY) || "{}")[id]; } catch { return null; } }
function rememberView(id, v) { try { const m = JSON.parse(localStorage.getItem(VIEW_KEY) || "{}"); m[id] = v; localStorage.setItem(VIEW_KEY, JSON.stringify(m)); } catch {} }
const TYPE_LABEL = { status: "Status", select: "Select", multi_select: "Multi-select", date: "Date", text: "Text", number: "Number", checkbox: "Checkbox", url: "URL" };
const TYPE_IC = { status: "◐", select: "▾", multi_select: "☰", date: "▦", text: "≡", number: "#", checkbox: "☑", url: "🔗" };
const VIEW_IC = { table: "▤", board: "▥", calendar: "▦" };
const OP_LABEL = { is: "is", is_not: "is not", contains: "contains", not_contains: "does not contain", is_empty: "is empty", is_not_empty: "is not empty", before: "is before", after: "is after", checked: "is checked", unchecked: "is unchecked" };
const NO_VALUE = new Set(["is_empty", "is_not_empty", "checked", "unchecked"]);
const GROUPABLE = new Set(["status", "select", "multi_select"]);

export function pill(name, color, status) {
  return `<span class="db-pill c-${esc(COLORS.includes(color) ? color : "gray")}${status ? " st" : ""}">${status ? '<i class="db-dot"></i>' : ""}${esc(name)}</span>`;
}

// el: container · id: database note id · o: { onOpen(id), inline, readOnly }
export function mountDatabase(el, id, o = {}) {
  const S = { note: null, db: null, rows: [], view: null, month: null };
  el.classList.add("db-host");
  el.innerHTML = `<div class="db-loading faint">Loading database…</div>`;
  let pop = null;
  const ro = !!o.readOnly;

  async function load() {
    try {
      const d = await api.note(id);
      S.note = d.note; S.db = parse(d.note.db) || { props: [], views: [{ id: "v1", name: "Table", type: "table" }] };
      S.rows = d.children.map((c) => ({ id: c.id, title: c.title, props: parse(c.props) || {} }));
      const want = lastView(id); S.view = S.db.views.find((v) => v.id === want) || S.db.views[0];
      draw();
    } catch (e) { el.innerHTML = `<div class="db-loading faint">Database unavailable (${esc(e.message)})</div>`; }
  }
  const prop = (k) => S.db.props.find((p) => p.key === k);
  const propName = (k) => (k === "title" ? "Name" : prop(k)?.name || k);
  const opt = (p, name) => p.options?.find((x) => x.name === name);
  const rows = () => applyView(S.rows, S.view, S.db);

  function cellHtml(p, v) {
    if (p.type === "status" || p.type === "select") return v ? pill(v, opt(p, v)?.color, p.type === "status") : "";
    if (p.type === "multi_select") return (v || []).map((x) => pill(x, opt(p, x)?.color)).join("");
    if (p.type === "checkbox") return `<input type="checkbox" class="db-cb" ${v ? "checked" : ""} ${ro ? "disabled" : ""} aria-label="${esc(p.name)}">`;
    if (p.type === "date") return v ? esc(fmtDate(v)) : "";
    if (p.type === "url") return v ? `<a href="${esc(v)}" target="_blank" rel="noopener">${esc(v.replace(/^https?:\/\//, ""))}</a>` : "";
    return esc(v ?? "");
  }
  function draw() {
    closePop();
    const v = S.view, nf = (v.filters || []).length, ns = (v.sorts || []).length, g = prop(v.group_by);
    el.innerHTML = `
      <div class="db-head">
        ${o.inline ? `<a class="db-title" href="#/notes/${esc(id)}">${esc(S.note.title)}</a>` : ""}
        <div class="db-tabs" role="tablist">${S.db.views.map((x) => `<button type="button" role="tab" data-view="${esc(x.id)}" aria-selected="${x.id === v.id}" title="${x.id === v.id && !ro ? "Click again to rename or delete" : ""}">${VIEW_IC[x.type] || "▤"} ${esc(x.name)}</button>`).join("")}${ro ? "" : `<button type="button" class="db-addview" title="Add view" aria-label="Add view">+</button>`}</div>
        <div class="db-tools">
          <button type="button" class="db-tool${nf ? " on" : ""}" data-tool="filter">Filter${nf ? " · " + nf : ""}</button>
          <button type="button" class="db-tool${ns ? " on" : ""}" data-tool="sort">Sort${ns ? " · " + ns : ""}</button>
          ${v.type !== "calendar" ? `<button type="button" class="db-tool${g ? " on" : ""}" data-tool="group">Group${g ? " · " + esc(g.name) : ""}</button>` : `<button type="button" class="db-tool on" data-tool="datefield">${esc(prop(v.date_by)?.name || "Date")}</button>`}
          ${ro ? "" : `<button type="button" class="btn sm accent db-new">+ New</button>`}
        </div>
      </div>
      ${nf ? `<div class="db-chips">${v.filters.map((f, i) => `<button type="button" class="db-chip" data-tool="filter" data-i="${i}">${esc(propName(f.prop))} ${esc(OP_LABEL[f.op])}${NO_VALUE.has(f.op) ? "" : ` <b>${esc(f.value)}</b>`}</button>`).join("")}</div>` : ""}
      <div class="db-view">${v.type === "board" ? board() : v.type === "calendar" ? calendar() : table()}</div>`;
  }
  function tableRows(list) {
    const ps = S.db.props;
    return list.map((r) => `<tr data-row="${esc(r.id)}"><td class="db-name"><a href="#/notes/${esc(r.id)}" class="db-open">${esc(r.title)}</a></td>${ps.map((p) => `<td data-prop="${esc(p.key)}" class="db-c db-t-${p.type}">${cellHtml(p, r.props[p.key])}</td>`).join("")}${ro ? "" : "<td></td>"}</tr>`).join("");
  }
  function table() {
    const ps = S.db.props, gs = groups(), span = ps.length + (ro ? 1 : 2);
    const body = gs ? gs.cols.map((c) => `<tbody data-group="${esc(c.name)}"><tr class="db-grow"><td colspan="${span}">${c.name ? pill(c.name, c.color, gs.g.type === "status") : `<span class="db-pill c-default">No ${esc(gs.g.name)}</span>`}<span class="db-count">${c.rows.length}</span></td></tr>${tableRows(c.rows)}</tbody>`).join("") : `<tbody>${tableRows(rows())}</tbody>`;
    return `<div class="db-scroll"><table class="db-table">
      <thead><tr><th class="db-name">Aa Name</th>${ps.map((p) => `<th data-prop="${esc(p.key)}" class="${ro ? "" : "db-ph"}"><span class="db-pi">${TYPE_IC[p.type] || ""}</span>${esc(p.name)}</th>`).join("")}${ro ? "" : `<th class="db-addprop" title="Add property"><button type="button" class="db-addp" aria-label="Add property">+</button></th>`}</tr></thead>
      ${body}
    </table></div>${ro ? "" : `<button type="button" class="db-newrow">+ New</button>`}`;
  }
  function groups() {
    const g = prop(S.view.group_by);
    if (!g || !GROUPABLE.has(g.type)) return null;
    const cols = (g.options || []).map((x) => ({ name: x.name, color: x.color, rows: [] }));
    const none = { name: "", color: "default", rows: [] };
    for (const r of rows()) {
      const v = r.props[g.key], vals = Array.isArray(v) ? v : v ? [v] : [];
      let hit = false;
      for (const x of vals) { const c = cols.find((y) => y.name === x); if (c) { c.rows.push(r); hit = true; } }
      if (!hit) none.rows.push(r);
    }
    return { g, cols: none.rows.length ? [none, ...cols] : cols };
  }
  function card(r, skip) {
    return `<article class="db-card" data-row="${esc(r.id)}" ${ro ? "" : 'draggable="true"'}>
      <a href="#/notes/${esc(r.id)}" class="db-open"><b>${esc(r.title)}</b></a>
      ${S.db.props.filter((p) => p.key !== skip).map((p) => { const h = cellHtml(p, r.props[p.key]); return h && p.type !== "checkbox" ? `<div class="db-cp">${h}</div>` : ""; }).join("")}
    </article>`;
  }
  function board() {
    const gs = groups();
    if (!gs) return `<div class="faint" style="padding:12px">Pick a Status, Select or Multi-select property in Group.</div>`;
    return `<div class="db-board">${gs.cols.map((c) => `
      <section class="db-col" data-group="${esc(c.name)}">
        <header>${c.name ? pill(c.name, c.color, gs.g.type === "status") : `<span class="db-pill c-default">No ${esc(gs.g.name)}</span>`}<span class="db-count">${c.rows.length}</span></header>
        <div class="db-cards">${c.rows.map((r) => card(r, gs.g.key)).join("")}</div>
        ${ro ? "" : `<button type="button" class="db-newrow" data-group="${esc(c.name)}">+ New</button>`}
      </section>`).join("")}</div>`;
  }
  function calendar() { return `<div class="faint" style="padding:12px">Calendar view needs a date property.</div>`; }

  // ---------- writes ----------
  async function newRow(group, extra = {}) {
    const props = { ...extra };
    const g = prop(S.view.group_by);
    if (g && group) props[g.key] = g.type === "multi_select" ? [group] : group;
    for (const f of S.view.filters || []) if (f.op === "is" && f.prop !== "title" && !(f.prop in props)) { const p = prop(f.prop); props[f.prop] = p?.type === "multi_select" ? [f.value] : f.value; } // new rows stay visible
    try {
      const { note } = await api.addNote({ title: "Untitled", parent_id: id, props, unique_title: true });
      S.rows.push({ id: note.id, title: note.title, props: parse(note.props) || {} });
      draw();
      const a = el.querySelector(`[data-row="${note.id}"] .db-open`);
      if (a) renameRow(note.id, a);
    } catch (e) { toast(e.message, "err"); }
  }
  async function setProp(rowId, key, value) {
    const r = S.rows.find((x) => x.id === rowId); if (!r) return;
    const prev = r.props[key];
    if (value === null || value === "" || (Array.isArray(value) && !value.length)) delete r.props[key]; else r.props[key] = value;
    draw();
    try { const { note } = await api.saveNote(rowId, { props: { [key]: value ?? null } }); r.props = parse(note.props) || {}; }
    catch (e) { r.props[key] = prev; draw(); toast(e.message, "err"); }
  }
  async function saveDb() {
    try { const { note } = await api.saveNote(id, { db: S.db }); S.db = parse(note.db) || S.db; S.view = S.db.views.find((v) => v.id === S.view.id) || S.db.views[0]; draw(); }
    catch (e) { toast(e.message, "err"); load(); }
  }
  function renameRow(rowId, a) {
    const r = S.rows.find((x) => x.id === rowId);
    const inp = document.createElement("input"); inp.className = "db-rename"; inp.value = r.title; inp.maxLength = 120;
    a.replaceWith(inp); inp.focus(); inp.select();
    let done = false;
    const finish = async (save) => {
      if (done) return; done = true;
      const t = inp.value.replace(/[\[\]|#]/g, "").trim();
      if (save && t && t !== r.title) {
        try { const { note } = await api.saveNote(rowId, { title: t }); r.title = note.title; } catch (e) { toast(e.message, "err"); }
      }
      draw();
    };
    inp.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); finish(true); } if (e.key === "Escape") finish(false); });
    inp.addEventListener("blur", () => finish(true));
  }
  // moving a card into another group (board drag · touch drag)
  function moveToGroup(rowId, to, from) {
    const g = prop(S.view.group_by), r = S.rows.find((x) => x.id === rowId); if (!g || !r) return draw();
    if (g.type === "multi_select") {
      const cur = (r.props[g.key] || []).filter((x) => x !== from);
      if (to && !cur.includes(to)) cur.push(to);
      return setProp(r.id, g.key, cur);
    }
    if ((r.props[g.key] || null) !== (to || null)) setProp(r.id, g.key, to || null); else draw();
  }

  // ---------- popovers ----------
  function closePop() { if (pop) { pop.remove(); pop = null; } }
  function openPop(anchor, html, bind, wide) {
    closePop();
    pop = document.createElement("div"); pop.className = "db-pop" + (wide ? " wide" : ""); pop.innerHTML = html; document.body.appendChild(pop);
    const r = anchor.getBoundingClientRect(), w = wide ? 340 : 250;
    pop.style.left = Math.max(8, Math.min(r.left, innerWidth - w - 8)) + "px";
    pop.style.top = Math.min(r.bottom + 4, innerHeight - 60) + "px";
    bind(pop);
    const me = pop;
    setTimeout(() => addEventListener("mousedown", function off(e) { if (pop !== me) return removeEventListener("mousedown", off); if (!me.contains(e.target)) { closePop(); removeEventListener("mousedown", off); } }), 0);
  }
  function editCell(td) {
    const rowId = td.closest("[data-row]").dataset.row, p = prop(td.dataset.prop), r = S.rows.find((x) => x.id === rowId);
    const v = r.props[p.key];
    if (p.type === "checkbox") return;
    if (p.type === "status" || p.type === "select" || p.type === "multi_select") {
      const multi = p.type === "multi_select", cur = new Set(multi ? v || [] : v ? [v] : []);
      openPop(td, `<input class="input db-pop-q" placeholder="Search or create an option"><div class="db-opts">${(p.options || []).map((x) => `<button type="button" data-o="${esc(x.name)}" aria-pressed="${cur.has(x.name)}">${pill(x.name, x.color, p.type === "status")}${cur.has(x.name) ? '<span class="db-tick">✓</span>' : ""}</button>`).join("")}</div>${!multi && v ? `<button type="button" class="db-clear" data-o="">Clear</button>` : ""}`, (pp) => {
        const q = pp.querySelector(".db-pop-q"); q.focus();
        const choose = (name) => {
          if (multi) { if (cur.has(name)) cur.delete(name); else cur.add(name); setProp(rowId, p.key, [...cur]); }
          else setProp(rowId, p.key, name || null);
          closePop();
        };
        pp.addEventListener("click", (e) => { const b = e.target.closest("[data-o]"); if (b) choose(b.dataset.o); });
        q.addEventListener("input", () => { const s = q.value.trim().toLowerCase(); pp.querySelectorAll(".db-opts [data-o]").forEach((b) => { b.hidden = !!s && !b.dataset.o.toLowerCase().includes(s); }); });
        q.addEventListener("keydown", async (e) => {
          if (e.key !== "Enter" || e.isComposing) return;
          e.preventDefault(); const name = q.value.trim().slice(0, 60); if (!name) return;
          if (!opt(p, name)) { (p.options ||= []).push({ name, color: COLORS[1 + ((p.options.length * 3) % (COLORS.length - 1))] }); await saveDb(); }
          choose(name);
        });
      });
      return;
    }
    const inputType = p.type === "date" ? "date" : p.type === "number" ? "number" : p.type === "url" ? "url" : "text";
    openPop(td, `<input class="input db-pop-in" type="${inputType}" value="${esc(v ?? "")}" aria-label="${esc(p.name)}">${p.type === "date" ? `<div class="row" style="gap:6px;margin-top:6px"><button type="button" class="btn ghost sm" data-today>Today</button><button type="button" class="btn ghost sm" data-clear>Clear</button></div>` : ""}`, (pp) => {
      const inp = pp.querySelector("input"); inp.focus();
      const commit = () => { const val = inp.value.trim(); if (String(v ?? "") !== val) setProp(rowId, p.key, p.type === "number" && val ? Number(val) : val || null); closePop(); };
      inp.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); commit(); } if (e.key === "Escape") closePop(); });
      if (p.type === "date") inp.addEventListener("change", commit);
      pp.querySelector("[data-today]")?.addEventListener("click", () => { inp.value = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10); commit(); });
      pp.querySelector("[data-clear]")?.addEventListener("click", () => { inp.value = ""; commit(); });
    });
  }
  function addProp(anchor) {
    openPop(anchor, `<input class="input" id="db-pn" placeholder="Property name" maxlength="60"><div class="db-opts">${PROP_TYPES.map((t) => `<button type="button" data-t="${t}"><span class="db-pi">${TYPE_IC[t]}</span>${TYPE_LABEL[t]}</button>`).join("")}</div>`, (pp) => {
      pp.querySelector("#db-pn").focus();
      pp.addEventListener("click", (e) => {
        const b = e.target.closest("[data-t]"); if (!b) return;
        const name = pp.querySelector("#db-pn").value.trim() || TYPE_LABEL[b.dataset.t];
        let key = name.toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 24) || "p";
        if (/^\d/.test(key)) key = "p_" + key;
        let k = key, i = 2; while (prop(k) || k === "title") k = key + "_" + i++;
        const np = { key: k, name, type: b.dataset.t };
        if (GROUPABLE.has(np.type)) np.options = np.type === "status" ? [{ name: "시작 전", color: "gray" }, { name: "진행 중", color: "blue" }, { name: "완료", color: "green" }] : [];
        S.db.props.push(np); closePop(); saveDb();
      });
    });
  }
  // property header: rename · option colors · delete
  function propMenu(th) {
    const p = prop(th.dataset.prop); if (!p) return;
    const colorSel = (x, i) => `<select class="db-ocol" data-oi="${i}" aria-label="Color of ${esc(x.name)}">${COLORS.filter((c) => c !== "default").map((c) => `<option value="${c}" ${x.color === c ? "selected" : ""}>${c}</option>`).join("")}</select>`;
    openPop(th, `<input class="input" id="db-prn" value="${esc(p.name)}" maxlength="60" aria-label="Property name">
      <div class="faint db-sub">${TYPE_IC[p.type]} ${TYPE_LABEL[p.type]}</div>
      ${GROUPABLE.has(p.type) ? `<div class="db-sub faint">Options</div><div class="db-olist">${(p.options || []).map((x, i) => `<div class="db-orow">${pill(x.name, x.color, p.type === "status")}${colorSel(x, i)}<button type="button" class="db-x" data-odel="${i}" aria-label="Delete option">×</button></div>`).join("") || '<span class="faint">No options yet</span>'}</div>` : ""}
      <button type="button" class="db-danger" data-pdel>Delete property</button>`, (pp) => {
      const nm = pp.querySelector("#db-prn"); nm.focus(); nm.select();
      const rename = () => { const v = nm.value.trim(); if (v && v !== p.name) { p.name = v.slice(0, 60); saveDb(); } };
      nm.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); rename(); closePop(); } });
      nm.addEventListener("change", rename);
      pp.addEventListener("change", (e) => { const s = e.target.closest(".db-ocol"); if (s) { p.options[+s.dataset.oi].color = s.value; saveDb().then(() => propMenu(el.querySelector(`th[data-prop="${p.key}"]`) || th)); } });
      pp.addEventListener("click", (e) => {
        const od = e.target.closest("[data-odel]"); if (od) { p.options.splice(+od.dataset.odel, 1); saveDb(); return; }
        if (e.target.closest("[data-pdel]")) {
          if (!confirm(`Delete property "${p.name}"? Values in rows stay hidden.`)) return;
          S.db.props = S.db.props.filter((x) => x.key !== p.key);
          for (const v of S.db.views) { if (v.group_by === p.key) delete v.group_by; v.filters = (v.filters || []).filter((f) => f.prop !== p.key); v.sorts = (v.sorts || []).filter((f) => f.prop !== p.key); }
          closePop(); saveDb();
        }
      });
    });
  }
  function addView(anchor) {
    openPop(anchor, `<div class="db-opts"><button type="button" data-v="table">▤ Table</button><button type="button" data-v="board">▥ Board</button><button type="button" data-v="calendar">▦ Calendar</button></div>`, (pp) => {
      pp.addEventListener("click", (e) => {
        const b = e.target.closest("[data-v]"); if (!b) return;
        const t = b.dataset.v, g = S.db.props.find((p) => p.type === "status" || p.type === "select"), d = S.db.props.find((p) => p.type === "date");
        const nv = { id: "v" + Date.now().toString(36).slice(-6), name: t[0].toUpperCase() + t.slice(1), type: t };
        if (t === "board" && g) nv.group_by = g.key;
        if (t === "calendar" && d) nv.date_by = d.key;
        S.db.views.push(nv); S.view = nv; rememberView(id, nv.id); closePop(); saveDb();
      });
    });
  }
  function viewMenu(tab) {
    const v = S.view;
    openPop(tab, `<input class="input" id="db-vn" value="${esc(v.name)}" maxlength="40" aria-label="View name"><button type="button" class="db-danger" data-vdel ${S.db.views.length < 2 ? "disabled" : ""}>Delete view</button>`, (pp) => {
      const nm = pp.querySelector("#db-vn"); nm.focus(); nm.select();
      const rename = () => { const t = nm.value.trim(); if (t && t !== v.name) { v.name = t; saveDb(); } };
      nm.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); rename(); closePop(); } });
      nm.addEventListener("change", rename);
      pp.querySelector("[data-vdel]").addEventListener("click", () => { S.db.views = S.db.views.filter((x) => x.id !== v.id); S.view = S.db.views[0]; closePop(); saveDb(); });
    });
  }
  const propOptions = (sel, withTitle = true) => (withTitle ? [`<option value="title" ${sel === "title" ? "selected" : ""}>Name</option>`] : []).concat(S.db.props.map((p) => `<option value="${esc(p.key)}" ${sel === p.key ? "selected" : ""}>${esc(p.name)}</option>`)).join("");
  function filterMenu(anchor) {
    const v = S.view, fs = v.filters || [];
    const valueInput = (f, i) => {
      if (NO_VALUE.has(f.op)) return "";
      const p = prop(f.prop);
      if (p && GROUPABLE.has(p.type)) return `<select class="db-fv" data-i="${i}">${["", ...(p.options || []).map((x) => x.name)].map((n) => `<option ${n === f.value ? "selected" : ""}>${esc(n)}</option>`).join("")}</select>`;
      return `<input class="input db-fv" data-i="${i}" type="${p?.type === "date" ? "date" : "text"}" value="${esc(f.value || "")}" placeholder="Value">`;
    };
    openPop(anchor, `<div class="db-sub faint">Filters (all must match)</div>${fs.map((f, i) => `<div class="db-frow"><select class="db-fp" data-i="${i}">${propOptions(f.prop)}</select><select class="db-fo" data-i="${i}">${FILTER_OPS.map((x) => `<option value="${x}" ${x === f.op ? "selected" : ""}>${OP_LABEL[x]}</option>`).join("")}</select>${valueInput(f, i)}<button type="button" class="db-x" data-fdel="${i}" aria-label="Remove filter">×</button></div>`).join("")}
      <button type="button" class="db-newrow" data-fadd>+ Add filter</button>`, (pp) => {
      const save = () => { v.filters = fs; saveDb().then(() => filterMenu(el.querySelector('[data-tool="filter"]'))); };
      pp.addEventListener("change", (e) => {
        const t = e.target, i = +t.dataset.i; if (Number.isNaN(i)) return;
        if (t.classList.contains("db-fp")) { fs[i].prop = t.value; fs[i].value = ""; }
        if (t.classList.contains("db-fo")) fs[i].op = t.value;
        if (t.classList.contains("db-fv")) fs[i].value = t.value;
        save();
      });
      pp.addEventListener("click", (e) => {
        const d = e.target.closest("[data-fdel]"); if (d) { fs.splice(+d.dataset.fdel, 1); save(); }
        if (e.target.closest("[data-fadd]")) { const p = S.db.props.find((x) => GROUPABLE.has(x.type)); fs.push({ prop: p?.key || "title", op: p ? "is" : "contains", value: "" }); save(); }
      });
    }, true);
  }
  function sortMenu(anchor) {
    const v = S.view, ss = v.sorts || [];
    openPop(anchor, `<div class="db-sub faint">Sort (first rule wins)</div>${ss.map((s, i) => `<div class="db-frow"><select class="db-sp" data-i="${i}">${propOptions(s.prop)}</select><select class="db-sd" data-i="${i}"><option value="asc" ${s.dir === "asc" ? "selected" : ""}>Ascending</option><option value="desc" ${s.dir === "desc" ? "selected" : ""}>Descending</option></select><button type="button" class="db-x" data-sdel="${i}" aria-label="Remove sort">×</button></div>`).join("")}
      <button type="button" class="db-newrow" data-sadd>+ Add sort</button>`, (pp) => {
      const save = () => { v.sorts = ss; saveDb().then(() => sortMenu(el.querySelector('[data-tool="sort"]'))); };
      pp.addEventListener("change", (e) => { const t = e.target, i = +t.dataset.i; if (t.classList.contains("db-sp")) ss[i].prop = t.value; if (t.classList.contains("db-sd")) ss[i].dir = t.value; save(); });
      pp.addEventListener("click", (e) => { const d = e.target.closest("[data-sdel]"); if (d) { ss.splice(+d.dataset.sdel, 1); save(); } if (e.target.closest("[data-sadd]")) { ss.push({ prop: "title", dir: "asc" }); save(); } });
    }, true);
  }
  function groupMenu(anchor) {
    const v = S.view, cands = S.db.props.filter((p) => GROUPABLE.has(p.type));
    openPop(anchor, `<div class="db-sub faint">Group by</div><div class="db-opts">${v.type === "table" ? `<button type="button" data-g="" aria-pressed="${!v.group_by}">None${!v.group_by ? '<span class="db-tick">✓</span>' : ""}</button>` : ""}${cands.map((p) => `<button type="button" data-g="${esc(p.key)}" aria-pressed="${v.group_by === p.key}"><span><span class="db-pi">${TYPE_IC[p.type]}</span>${esc(p.name)}</span>${v.group_by === p.key ? '<span class="db-tick">✓</span>' : ""}</button>`).join("") || '<span class="faint">Add a Status, Select or Multi-select property first.</span>'}</div>`, (pp) => {
      pp.addEventListener("click", (e) => { const b = e.target.closest("[data-g]"); if (!b) return; if (b.dataset.g) v.group_by = b.dataset.g; else delete v.group_by; closePop(); saveDb(); });
    });
  }
  function dateFieldMenu(anchor) {
    const v = S.view, cands = S.db.props.filter((p) => p.type === "date");
    openPop(anchor, `<div class="db-sub faint">Show by</div><div class="db-opts">${cands.map((p) => `<button type="button" data-d="${esc(p.key)}">${esc(p.name)}${v.date_by === p.key ? '<span class="db-tick">✓</span>' : ""}</button>`).join("") || '<span class="faint">Add a Date property first.</span>'}</div>`, (pp) => {
      pp.addEventListener("click", (e) => { const b = e.target.closest("[data-d]"); if (!b) return; v.date_by = b.dataset.d; closePop(); saveDb(); });
    });
  }

  // ---------- events ----------
  el.addEventListener("click", (e) => {
    const t = e.target;
    const tab = t.closest("[data-view]");
    if (tab) { if (tab.dataset.view === S.view.id && !ro) return viewMenu(tab); S.view = S.db.views.find((v) => v.id === tab.dataset.view); rememberView(id, S.view.id); draw(); return; }
    const a = t.closest(".db-open"); if (a) { e.preventDefault(); o.onOpen ? o.onOpen(a.closest("[data-row]").dataset.row) : (location.hash = a.getAttribute("href")); return; }
    if (t.closest(".db-title")) { e.preventDefault(); o.onOpen ? o.onOpen(id) : (location.hash = "#/notes/" + id); return; }
    const tool = t.closest("[data-tool]");
    if (tool) { if (ro && tool.dataset.tool !== "filter" && tool.dataset.tool !== "sort") return; return ({ filter: filterMenu, sort: sortMenu, group: groupMenu, datefield: dateFieldMenu })[tool.dataset.tool](tool); }
    if (ro) return;
    if (t.closest(".db-new")) return newRow();
    const nr = t.closest(".db-newrow"); if (nr) return newRow(nr.dataset.group || undefined, nr.dataset.date && prop(S.view.date_by) ? { [S.view.date_by]: nr.dataset.date } : {});
    if (t.closest(".db-addp")) return addProp(t.closest("th"));
    const ph = t.closest("th.db-ph"); if (ph) return propMenu(ph);
    if (t.closest(".db-addview")) return addView(t.closest(".db-addview"));
    if (t.classList.contains("db-cb")) { const td = t.closest("td"); setProp(td.closest("[data-row]").dataset.row, td.dataset.prop, t.checked); return; }
    const td = t.closest("td.db-c"); if (td && !t.closest("a")) return editCell(td);
    const nm = t.closest("td.db-name"); if (nm && !t.closest("a")) { const a2 = nm.querySelector(".db-open"); if (a2) renameRow(nm.closest("[data-row]").dataset.row, a2); }
  });
  el.addEventListener("dblclick", (e) => { const a = e.target.closest("td.db-name .db-open"); if (a && !ro) { e.preventDefault(); renameRow(a.closest("[data-row]").dataset.row, a); } });
  // drop targets: board column (data-group) · calendar day (data-date)
  const target = (x, y) => document.elementFromPoint(x, y)?.closest?.(".db-col, .db-day");
  function dropOn(rowId, tgt, fromEl) {
    if (!tgt || !el.contains(tgt)) return draw();
    if (tgt.classList.contains("db-day")) { const k = S.view.date_by; return k ? setProp(rowId, k, tgt.dataset.date) : draw(); }
    moveToGroup(rowId, tgt.dataset.group || null, fromEl?.closest(".db-col")?.dataset.group || null);
  }
  let drag = null, dragFrom = null;
  el.addEventListener("dragstart", (e) => { const c = e.target.closest?.(".db-card"); if (!c) return; drag = c.dataset.row; dragFrom = c; e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", drag); c.classList.add("dragging"); e.stopPropagation(); });
  el.addEventListener("dragover", (e) => { if (!drag) return; const col = e.target.closest?.(".db-col, .db-day"); if (!col) return; e.preventDefault(); e.stopPropagation(); el.querySelectorAll(".over").forEach((x) => x !== col && x.classList.remove("over")); col.classList.add("over"); });
  el.addEventListener("drop", (e) => {
    if (!drag) return; const col = e.target.closest?.(".db-col, .db-day"); if (!col) return;
    e.preventDefault(); e.stopPropagation();
    const r = drag; drag = null; dropOn(r, col, dragFrom);
  });
  el.addEventListener("dragend", () => { drag = null; el.querySelectorAll(".dragging, .over").forEach((x) => x.classList.remove("dragging", "over")); });
  if (!ro) touchDrag(el, ".db-card", {
    over: (x, y) => { const t = target(x, y); el.querySelectorAll(".over").forEach((z) => z !== t && z.classList.remove("over")); t?.classList.add("over"); },
    drop: (x, y, card) => dropOn(card.dataset.row, target(x, y), card),
    end: () => el.querySelectorAll(".over").forEach((z) => z.classList.remove("over")),
  });

  load();
  return { reload: load, destroy: () => { closePop(); el.innerHTML = ""; } };
}

function fmtDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s); if (!m) return s;
  const M = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${M[+m[2] - 1]} ${+m[3]}, ${m[1]}`;
}
