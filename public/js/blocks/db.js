// Database views (docs/blocks-schema.md): a database is a note (kind = 'database', db = { props, views }),
// its rows are child notes with props. Table · Board · Calendar views, each with saved filters / sorts / group.
// Pure filtering · sorting · grouping lives in dbview.js (the worker validates views with the same file).
import { api } from "../api.js";
import { esc, safeHref, toast } from "../util.js";
import { COLORS, PROP_TYPES } from "./md.js";
import { applyView, groupRows, opsFor, OP_LABEL, noValue, computeRows, ROLLUP_FNS } from "./dbview.js";
import { fmtValue } from "./formula.js";

const parse = (t) => { try { return t ? JSON.parse(t) : null; } catch { return null; } };
const VIEW_KEY = "trio-db-view";
function lastView(id) { try { return JSON.parse(localStorage.getItem(VIEW_KEY) || "{}")[id]; } catch { return null; } }
function rememberView(id, v) { try { const m = JSON.parse(localStorage.getItem(VIEW_KEY) || "{}"); m[id] = v; localStorage.setItem(VIEW_KEY, JSON.stringify(m)); } catch {} }
const TYPE_LABEL = { status: "Status", select: "Select", multi_select: "Multi-select", date: "Date", text: "Text", number: "Number", checkbox: "Checkbox", url: "URL", relation: "Relation", rollup: "Rollup", formula: "Formula", title: "Name" };
const TYPE_IC = { status: "◐", select: "▾", multi_select: "☰", date: "▦", text: "≡", number: "#", checkbox: "☑", url: "🔗", relation: "↗", rollup: "∑", formula: "ƒ", title: "Aa" };
const VIEW_IC = { table: "▤", board: "▥", calendar: "▦", gallery: "▦", list: "☰" };
const VIEW_ALL = ["table", "board", "calendar", "gallery", "list"];
const FN_LABEL = { count: "Count all", count_values: "Count values", sum: "Sum", avg: "Average", min: "Min", max: "Max", show_original: "Show original", percent_checked: "Percent checked" };
const CALC = ["rollup", "formula"];
const IMG_RE = /^(https?:\/\/|\/)[^\s"'<>]+$/i;
const GROUPABLE = ["status", "select", "multi_select"];
const HOLD_MS = 350;
const kstToday = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const isPhone = () => matchMedia("(max-width: 640px)").matches;

export function pill(name, color, status) {
  return `<span class="db-pill c-${esc(COLORS.includes(color) ? color : "gray")}${status ? " st" : ""}">${status ? '<i class="db-dot"></i>' : ""}${esc(name)}</span>`;
}

// el: container · id: database note id · o: { onOpen(id), inline, readOnly }
export function mountDatabase(el, id, o = {}) {
  // rows: 보통 행 · tpls: 템플릿 행 (props._tpl) · rel: 관계가 가리키는 다른 DB { id: { db, rows, title } } · tplMode: 템플릿 편집 중
  const S = { note: null, db: null, rows: [], tpls: [], rel: {}, view: null, month: kstToday().slice(0, 7), dirty: false, tplMode: false };
  el.classList.add("db-host");
  el.innerHTML = `<div class="db-loading faint">Loading database…</div>`;
  let pop = null, popClose = null;
  const ro = !!o.readOnly;

  async function load() {
    try {
      const d = await api.note(id);
      S.note = d.note; S.db = parse(d.note.db) || { props: [], views: [{ id: "v1", name: "Table", type: "table" }] };
      const all = d.children.map((c) => ({ id: c.id, title: c.title, props: parse(c.props) || {}, cover: c.cover || "" }));
      S.rows = all.filter((r) => !r.props._tpl); S.tpls = all.filter((r) => r.props._tpl);
      const want = lastView(id); S.view = S.db.views.find((v) => v.id === want) || S.db.views[0];
      draw();
      loadRel();
    } catch (e) { el.innerHTML = `<div class="db-loading faint">Database unavailable (${esc(e.message)})</div>`; }
  }
  // 관계가 가리키는 다른 데이터베이스의 행을 불러와요 (rollup 계산 · 칩 제목용). 자기 자신은 S.rows 를 그대로 써요.
  async function loadRel(force) {
    const ids = [...new Set(S.db.props.filter((p) => p.type === "relation" && p.target && p.target !== id).map((p) => p.target))].filter((t) => force || !S.rel[t]);
    if (!ids.length) return;
    await Promise.all(ids.map(async (t) => {
      try { const d = await api.note(t); S.rel[t] = { title: d.note.title, db: parse(d.note.db) || { props: [] }, rows: d.children.map((c) => ({ id: c.id, title: c.title, props: parse(c.props) || {} })).filter((r) => !r.props._tpl) }; }
      catch { S.rel[t] = { title: "?", db: { props: [] }, rows: [] }; }
    }));
    if (!pop) draw();
  }
  const relRows = (p) => (!p.target || p.target === id ? S.rows : S.rel[p.target]?.rows || []);
  const relTitle = (p, rid) => relRows(p).find((r) => r.id === rid)?.title;
  const computed = () => computeRows(S.tplMode ? S.tpls : S.rows, S.db, S.rel, id);
  const prop = (k) => (k === "title" ? { key: "title", name: "Name", type: "title" } : S.db.props.find((p) => p.key === k));
  const opt = (p, name) => p.options?.find((x) => x.name === name);
  const visible = () => (S.tplMode ? computed() : applyView(computed(), S.db, S.view));

  function cellHtml(p, v, r) {
    if (p.type === "relation") return (v || []).map((rid) => { const t = relTitle(p, rid); return t === undefined ? "" : `<span class="db-rel">↗ ${esc(t)}</span>`; }).join("");
    if (CALC.includes(p.type)) return r?.errs?.[p.key] ? `<span class="db-err" title="${esc(r.errs[p.key])}">⚠ ${esc(r.errs[p.key])}</span>` : esc(v === true ? "✓" : v === false ? "" : fmtValue(v));
    if (p.type === "status" || p.type === "select") return v ? pill(v, opt(p, v)?.color, p.type === "status") : "";
    if (p.type === "multi_select") return (v || []).map((x) => pill(x, opt(p, x)?.color)).join("");
    if (p.type === "checkbox") return `<input type="checkbox" class="db-cb" ${v ? "checked" : ""} ${ro ? "disabled" : ""} aria-label="${esc(p.name)}">`;
    if (p.type === "date") return v ? esc(fmtDate(v)) + (r?.props?._remind?.prop === p.key ? ` <span class="db-bell" title="Reminder ${esc(r.props._remind.time)}">⏰</span>` : "") : "";
    if (p.type === "url") return v ? `<a href="${esc(safeHref(v))}" target="_blank" rel="noopener">${esc(v.replace(/^https?:\/\//, ""))}</a>` : "";
    return esc(v ?? "");
  }
  function draw() {
    closePop(true);
    const v = S.view;
    el.innerHTML = `
      <div class="db-head">
        ${o.inline ? `<a class="db-title" href="#/notes/${esc(id)}">${esc(S.note.title)}</a>` : ""}
        <div class="db-tabs" role="tablist">${S.db.views.map((x) => `<button type="button" role="tab" data-view="${esc(x.id)}" aria-selected="${x.id === v.id}">${VIEW_IC[x.type] || "▤"} ${esc(x.name)}</button>`).join("")}${ro ? "" : `<button type="button" class="db-addview" title="Add view" aria-label="Add view">+</button>`}</div>
        ${ro ? "" : `<span class="db-newgrp"><button type="button" class="btn sm accent db-new">+ New</button><button type="button" class="btn sm accent db-newmenu" aria-label="New from template" title="Templates">▾</button></span>`}
      </div>
      ${S.tplMode ? `<div class="db-tplbar"><b>Templates</b><span class="faint">Preset values here; open a template to write its starter blocks.</span><button type="button" class="btn sm" data-tpl-done>Done</button></div>` : toolbar()}
      <div class="db-view">${viewHtml()}</div>`;
  }
  function viewHtml() {
    if (S.tplMode) return tableHtml(visible());
    const t = S.view.type;
    return t === "board" ? board() : t === "calendar" ? calendar() : t === "gallery" ? gallery() : t === "list" ? list() : table();
  }

  // ---------- filter / sort / group chips ----------
  function filterLabel(f) {
    const p = prop(f.prop); if (!p) return "";
    let val = "";
    if (!noValue(f.op)) val = p.type === "checkbox" ? (f.value ? "checked" : "unchecked") : p.type === "date" ? fmtDate(f.value) : String(f.value ?? "");
    return `<b>${esc(p.name)}</b> ${esc(OP_LABEL[f.op])}${val ? " " + esc(val) : ""}`;
  }
  function toolbar() {
    const v = S.view, fs = v.filters || [], ss = v.sorts || [];
    const g = v.group_by && (v.type === "table" || v.type === "board") ? prop(v.group_by) : null;
    const dp = v.type === "calendar" ? prop(v.date_prop) : null;
    const chips = [
      ...fs.map((f, i) => `<span class="db-chip on" data-fi="${i}"><button type="button" class="db-chip-b" data-edit-filter="${i}">${filterLabel(f)}</button>${ro ? "" : `<button type="button" class="db-chip-x" data-del-filter="${i}" aria-label="Remove filter">×</button>`}</span>`),
      ss.length ? `<button type="button" class="db-chip on" data-sorts>${ss.map((x) => `${x.dir === "desc" ? "↓" : "↑"} ${esc(prop(x.prop)?.name || x.prop)}`).join(", ")}</button>` : "",
      g ? `<button type="button" class="db-chip on" data-group-menu>Group: ${esc(g.name)}</button>` : "",
      dp ? `<button type="button" class="db-chip on" data-date-menu>By ${esc(dp.name)}</button>` : "",
    ].filter(Boolean).join("");
    return `<div class="db-bar">
      ${ro ? "" : `<button type="button" class="db-tool" data-add-filter>Filter</button><button type="button" class="db-tool" data-sorts>Sort</button>${v.type === "table" || v.type === "board" ? `<button type="button" class="db-tool" data-group-menu>Group</button>` : ""}${v.type === "gallery" || v.type === "list" ? `<button type="button" class="db-tool" data-show-menu>Properties</button>` : ""}`}
      ${chips ? `<span class="db-chips">${chips}</span>` : ""}
      ${(fs.length || ss.length) ? `<span class="db-shown faint">${visible().length}/${S.rows.length}</span>` : ""}
    </div>`;
  }

  // ---------- table ----------
  function tableRows(rows, ps) {
    return rows.map((r) => `<tr data-row="${esc(r.id)}"><td class="db-name"><a href="#/notes/${esc(r.id)}" class="db-open">${esc(r.title)}</a></td>${ps.map((p) => `<td data-prop="${esc(p.key)}" class="db-c db-t-${p.type}">${cellHtml(p, r.props[p.key], r)}</td>`).join("")}${ro ? "" : "<td></td>"}</tr>`).join("");
  }
  function tableHtml(rows, group) {
    const ps = S.db.props;
    return `<div class="db-scroll"><table class="db-table">
      <thead><tr><th class="db-name">Aa Name</th>${ps.map((p) => `<th data-prop="${esc(p.key)}" class="${ro ? "" : "db-th"}"><span class="db-pi">${TYPE_IC[p.type] || ""}</span>${esc(p.name)}</th>`).join("")}${ro ? "" : `<th class="db-addprop" title="Add property"><button type="button" class="db-addp" aria-label="Add property">+</button></th>`}</tr></thead>
      <tbody>${tableRows(rows, ps)}</tbody>
    </table></div>${ro ? "" : `<button type="button" class="db-newrow"${group !== undefined ? ` data-group="${esc(group)}"` : ""}>+ New</button>`}`;
  }
  function table() {
    const rows = visible(), g = S.view.group_by ? prop(S.view.group_by) : null;
    if (!g || !GROUPABLE.includes(g.type)) return tableHtml(rows);
    return groupRows(rows, g).map((c) => `<section class="db-tgroup" data-group="${esc(c.name)}">
      <header>${c.name ? pill(c.name, c.color, g.type === "status") : `<span class="db-pill c-default">No ${esc(g.name)}</span>`}<span class="db-count">${c.rows.length}</span></header>
      ${tableHtml(c.rows, c.name)}</section>`).join("");
  }

  // ---------- board ----------
  function board() {
    const g = prop(S.view.group_by);
    if (!g || !GROUPABLE.includes(g.type)) return `<div class="faint" style="padding:12px">Add a Status or Select property to group this board.</div>`;
    const others = S.db.props.filter((p) => p.key !== g.key);
    return `<div class="db-board">${groupRows(visible(), g).map((c) => `
      <section class="db-col" data-group="${esc(c.name)}" data-drop="${esc(c.name)}">
        <header>${c.name ? pill(c.name, c.color, g.type === "status") : `<span class="db-pill c-default">No ${esc(g.name)}</span>`}<span class="db-count">${c.rows.length}</span></header>
        <div class="db-cards">${c.rows.map((r) => `<article class="db-card" data-row="${esc(r.id)}" data-from="${esc(c.name)}" ${ro ? "" : 'draggable="true"'}>
          <a href="#/notes/${esc(r.id)}" class="db-open"><b>${esc(r.title)}</b></a>
          ${others.map((p) => { const h = cellHtml(p, r.props[p.key], r); return h && p.type !== "checkbox" ? `<div class="db-cp">${h}</div>` : ""; }).join("")}
        </article>`).join("")}</div>
        ${ro ? "" : `<button type="button" class="db-newrow" data-group="${esc(c.name)}">+ New</button>`}
      </section>`).join("")}</div>`;
  }

  // ---------- gallery · list ----------
  // 보여 줄 속성: view.show 가 있으면 그것, 없으면 앞의 3개 (갤러리) / 2개 (목록)
  const shown = (n) => (S.view.show ? S.view.show.map(prop).filter(Boolean) : S.db.props.slice(0, n));
  function coverOf(r) {
    const c = S.view.cover || "page";
    if (c === "none") return "";
    const src = c === "page" ? r.cover : String(r.props[c] || "");
    return src && IMG_RE.test(src) ? src : "";
  }
  function gallery() {
    const ps = shown(3), rows = visible(), noCover = S.view.cover === "none";
    return `<div class="db-gallery">${rows.map((r) => { const src = coverOf(r); return `<article class="db-gcard" data-row="${esc(r.id)}">
        ${noCover ? "" : `<a href="#/notes/${esc(r.id)}" class="db-open db-gcover">${src ? `<img src="${esc(src)}" alt="" loading="lazy">` : ""}</a>`}
        <div class="db-gbody"><a href="#/notes/${esc(r.id)}" class="db-open"><b>${esc(r.title)}</b></a>
        ${ps.map((p) => { const h = cellHtml(p, r.props[p.key], r); return h && p.type !== "checkbox" ? `<div class="db-cp">${h}</div>` : ""; }).join("")}</div>
      </article>`; }).join("")}${ro ? "" : `<button type="button" class="db-gcard db-gnew db-newrow">+ New</button>`}</div>`;
  }
  function list() {
    const ps = shown(2), rows = visible();
    return `<div class="db-list">${rows.map((r) => `<div class="db-li" data-row="${esc(r.id)}"><a href="#/notes/${esc(r.id)}" class="db-open">📄 ${esc(r.title)}</a><span class="db-li-p">${ps.map((p) => { const h = cellHtml(p, r.props[p.key], r); return h && p.type !== "checkbox" ? `<span class="db-cp">${h}</span>` : ""; }).join("")}</span></div>`).join("") || `<div class="faint" style="padding:12px">No items.</div>`}</div>${ro ? "" : `<button type="button" class="db-newrow">+ New</button>`}`;
  }
  function showMenu(anchor) {
    const v = S.view, cur = new Set(shown(v.type === "gallery" ? 3 : 2).map((p) => p.key));
    const covers = S.db.props.filter((p) => p.type === "url" || p.type === "text");
    openPop(anchor, `<div class="db-sec">Show</div><div class="db-opts">${S.db.props.map((p) => `<button type="button" data-show="${esc(p.key)}" aria-pressed="${cur.has(p.key)}"><span><span class="db-pi">${TYPE_IC[p.type]}</span>${esc(p.name)}</span>${cur.has(p.key) ? '<span class="db-tick">✓</span>' : ""}</button>`).join("")}</div>
      ${v.type === "gallery" ? `<div class="db-sec">Cover</div><select class="input" data-cover><option value="page">First image in page</option>${covers.map((p) => `<option value="${esc(p.key)}" ${v.cover === p.key ? "selected" : ""}>${esc(p.name)}</option>`).join("")}<option value="none" ${v.cover === "none" ? "selected" : ""}>None</option></select>` : ""}`, (pp) => {
      pp.addEventListener("click", (e) => {
        const b = e.target.closest("[data-show]"); if (!b) return;
        if (cur.has(b.dataset.show)) cur.delete(b.dataset.show); else cur.add(b.dataset.show);
        v.show = S.db.props.map((p) => p.key).filter((k) => cur.has(k)); S.dirty = true;
        b.setAttribute("aria-pressed", cur.has(b.dataset.show)); b.querySelector(".db-tick")?.remove(); if (cur.has(b.dataset.show)) b.insertAdjacentHTML("beforeend", '<span class="db-tick">✓</span>');
        refreshLive();
      });
      pp.querySelector("[data-cover]")?.addEventListener("change", (e) => { v.cover = e.target.value; S.dirty = true; refreshLive(); });
    });
  }

  // ---------- templates ----------
  function newMenu(anchor) {
    openPop(anchor, `<div class="db-opts"><button type="button" data-tpl=""><span>📄 Blank</span></button>${S.tpls.map((t) => `<button type="button" data-tpl="${esc(t.id)}"><span>⧉ ${esc(t.title)}</span></button>`).join("")}</div>
      <div class="db-opts db-opts-sep"><button type="button" data-tpl-new><span>+ New template</span></button>${S.tpls.length ? `<button type="button" data-tpl-edit><span>✎ Edit templates</span></button>` : ""}</div>`, (pp) => {
      pp.addEventListener("click", (e) => {
        const b = e.target.closest("[data-tpl]");
        if (b) { closePop(true); return b.dataset.tpl ? fromTemplate(b.dataset.tpl) : newRow(); }
        if (e.target.closest("[data-tpl-new]")) { closePop(true); S.tplMode = true; return newRow({ _tpl: true }, "New template"); }
        if (e.target.closest("[data-tpl-edit]")) { closePop(true); S.tplMode = true; draw(); }
      });
    });
  }
  // 템플릿으로 새 행: 속성 값 + 시작 블록을 복사해요
  async function fromTemplate(tid) {
    try {
      const { note: t } = await api.note(tid);
      const props = { ...(parse(t.props) || {}) }; delete props._tpl; delete props._remind;
      const blocks = parse(t.blocks);
      const { note } = await api.addNote({ title: t.title, parent_id: id, props, unique_title: true, ...(blocks ? { blocks } : {}) });
      S.rows.push({ id: note.id, title: note.title, props: parse(note.props) || {}, cover: "" });
      draw();
      const a = el.querySelector(`[data-row="${note.id}"] .db-open:not(.db-gcover)`);
      if (a) renameRow(note.id, a);
    } catch (e) { toast(e.message, "err"); }
  }

  // ---------- calendar ----------
  function calendar() {
    const dp = prop(S.view.date_prop);
    if (!dp || dp.type !== "date") return `<div class="faint" style="padding:12px">Add a Date property to use the calendar.</div>`;
    const [y, m] = S.month.split("-").map(Number);
    const first = new Date(Date.UTC(y, m - 1, 1)), days = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const by = {};
    for (const r of visible()) { const d = r.props[dp.key]; if (d && d.startsWith(S.month)) (by[d] ||= []).push(r); }
    const today = kstToday();
    const iso = (d) => `${S.month}-${String(d).padStart(2, "0")}`;
    const card = (r) => `<div class="db-cal-card" data-row="${esc(r.id)}" ${ro ? "" : 'draggable="true"'}><a href="#/notes/${esc(r.id)}" class="db-open">${esc(r.title)}</a>${r.props._remind?.prop === dp.key ? '<span class="db-bell">⏰</span>' : ""}</div>`;
    const head = `<div class="db-cal-head"><button type="button" class="db-tool" data-month="-1" aria-label="Previous month">‹</button><b class="db-cal-m">${first.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })}</b><button type="button" class="db-tool" data-month="1" aria-label="Next month">›</button><button type="button" class="db-tool" data-month="0">Today</button></div>`;
    if (isPhone()) {
      // phone: agenda list (days that have cards + today)
      const list = [...new Set([...Object.keys(by), ...(today.startsWith(S.month) ? [today] : [])])].sort();
      return head + `<div class="db-agenda">${list.length ? list.map((d) => `<section class="db-ag-day${d === today ? " today" : ""}" data-drop="${d}">
          <header><span>${esc(fmtDay(d))}</span>${ro ? "" : `<button type="button" class="db-cal-add" data-add="${d}" aria-label="New on ${d}">+</button>`}</header>
          ${(by[d] || []).map(card).join("") || `<div class="faint db-ag-empty">Nothing yet</div>`}</section>`).join("") : `<div class="faint" style="padding:12px">No items this month.</div>`}
        </div>${ro ? "" : `<button type="button" class="db-newrow" data-add="${today.startsWith(S.month) ? today : iso(1)}">+ New</button>`}`;
    }
    const lead = first.getUTCDay(), cells = [];
    for (let i = 0; i < lead; i++) cells.push(`<div class="db-cal-cell out"></div>`);
    for (let d = 1; d <= days; d++) {
      const k = iso(d);
      cells.push(`<div class="db-cal-cell${k === today ? " today" : ""}" data-drop="${k}" data-day="${k}">
        <div class="db-cal-n"><span>${d}</span>${ro ? "" : `<button type="button" class="db-cal-add" data-add="${k}" aria-label="New on ${k}">+</button>`}</div>
        ${(by[k] || []).map(card).join("")}</div>`);
    }
    while (cells.length % 7) cells.push(`<div class="db-cal-cell out"></div>`);
    return head + `<div class="db-cal"><div class="db-cal-wd">${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((w) => `<span>${w}</span>`).join("")}</div><div class="db-cal-grid">${cells.join("")}</div></div>`;
  }

  // ---------- writes ----------
  async function newRow(props = {}, title = "Untitled") {
    if (S.tplMode) props = { ...props, _tpl: true };
    try {
      const { note } = await api.addNote({ title, parent_id: id, props, unique_title: true });
      (S.tplMode ? S.tpls : S.rows).push({ id: note.id, title: note.title, props: parse(note.props) || {}, cover: "" });
      draw();
      const a = el.querySelector(`[data-row="${note.id}"] .db-open:not(.db-gcover)`);
      if (a) renameRow(note.id, a);
    } catch (e) { toast(e.message, "err"); }
  }
  function groupProps(group) {
    const g = S.view.group_by ? prop(S.view.group_by) : null;
    if (!g || !group) return {};
    return { [g.key]: g.type === "multi_select" ? [group] : group };
  }
  async function setProp(rowId, key, value) {
    const r = S.rows.find((x) => x.id === rowId) || S.tpls.find((x) => x.id === rowId); if (!r) return;
    const prev = r.props[key];
    if (value === null || value === "" || (Array.isArray(value) && !value.length)) delete r.props[key]; else r.props[key] = value;
    draw();
    try { const { note } = await api.saveNote(rowId, { props: { [key]: value ?? null } }); r.props = parse(note.props) || {}; draw(); }
    catch (e) { if (prev === undefined) delete r.props[key]; else r.props[key] = prev; draw(); toast(e.message, "err"); }
  }
  async function saveDb() {
    S.dirty = false;
    try { const { note } = await api.saveNote(id, { db: S.db }); S.db = parse(note.db) || S.db; S.view = S.db.views.find((v) => v.id === S.view.id) || S.db.views[0]; draw(); loadRel(); }
    catch (e) { toast(e.message, "err"); load(); }
  }
  function renameRow(rowId, a) {
    const r = S.rows.find((x) => x.id === rowId) || S.tpls.find((x) => x.id === rowId);
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
  // drop a card: board → group value, calendar → date value
  function dropRow(rowId, to, from) {
    const r = S.rows.find((x) => x.id === rowId); if (!r) return draw();
    if (S.view.type === "calendar") { const dp = prop(S.view.date_prop); if (dp && r.props[dp.key] !== to) return setProp(rowId, dp.key, to); return draw(); }
    const g = prop(S.view.group_by); if (!g) return draw();
    if (g.type === "multi_select") {
      if ((from || "") === (to || "")) return draw();
      const cur = new Set(r.props[g.key] || []); if (from) cur.delete(from); if (to) cur.add(to);
      return setProp(rowId, g.key, [...cur]);
    }
    if ((r.props[g.key] || null) !== (to || null)) setProp(rowId, g.key, to || null); else draw();
  }

  // ---------- popovers ----------
  function closePop(silent) {
    if (pop) { pop.remove(); pop = null; }
    const c = popClose; popClose = null;
    if (c && !silent) c();
    else if (S.dirty && !silent) saveDb();
  }
  function openPop(anchor, html, bind, onClose) {
    closePop();
    pop = document.createElement("div"); pop.className = "db-pop"; pop.innerHTML = html; document.body.appendChild(pop);
    popClose = onClose || null;
    const r = anchor.getBoundingClientRect();
    pop.style.left = Math.max(8, Math.min(r.left, innerWidth - 268)) + "px";
    pop.style.top = Math.max(8, Math.min(r.bottom + 4, innerHeight - Math.min(pop.offsetHeight, 360) - 8)) + "px";
    bind(pop);
    const me = pop;
    setTimeout(() => addEventListener("pointerdown", function off(e) { if (pop !== me) { removeEventListener("pointerdown", off); return; } if (!me.contains(e.target)) { removeEventListener("pointerdown", off); closePop(); } }), 0);
  }
  function optionPicker(p, cur, multi, choose) {
    return `<input class="input db-pop-q" placeholder="Search or create an option"><div class="db-opts">${(p.options || []).map((x) => `<button type="button" data-o="${esc(x.name)}" aria-pressed="${cur.has(x.name)}">${pill(x.name, x.color, p.type === "status")}${cur.has(x.name) ? '<span class="db-tick">✓</span>' : ""}</button>`).join("")}</div>`;
  }
  function editCell(td) {
    const rowId = td.closest("[data-row]").dataset.row, p = prop(td.dataset.prop), r = S.rows.find((x) => x.id === rowId) || S.tpls.find((x) => x.id === rowId);
    const v = r.props[p.key];
    if (p.type === "checkbox") return;
    if (CALC.includes(p.type)) return;
    if (p.type === "relation") return relPicker(td, rowId, p, v || []);
    if (GROUPABLE.includes(p.type)) {
      const multi = p.type === "multi_select", cur = new Set(multi ? v || [] : v ? [v] : []);
      openPop(td, optionPicker(p, cur, multi) + (!multi && v ? `<button type="button" class="db-clear" data-o="">Clear</button>` : ""), (pp) => {
        const q = pp.querySelector(".db-pop-q"); q.focus();
        const choose = (name) => {
          if (multi) { if (cur.has(name)) cur.delete(name); else cur.add(name); setProp(rowId, p.key, [...cur]); }
          else setProp(rowId, p.key, name || null);
          closePop(true);
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
    const rm = p.type === "date" && r.props._remind?.prop === p.key ? r.props._remind : null;
    openPop(td, `<input class="input db-pop-in" type="${inputType}" value="${esc(v ?? "")}" aria-label="${esc(p.name)}">${p.type === "date" ? `<div class="row" style="gap:6px;margin-top:2px"><button type="button" class="btn ghost sm" data-today>Today</button><button type="button" class="btn ghost sm" data-clear>Clear</button></div>
      <label class="db-remind"><input type="checkbox" data-remind ${rm ? "checked" : ""}> Remind me at <input type="time" class="input db-rtime" step="3600" value="${esc(rm?.time || "09:00")}"></label>
      <div class="faint db-hint">Push notification to you, checked hourly.</div>` : ""}`, (pp) => {
      const inp = pp.querySelector("input"); inp.focus();
      const commit = () => { const val = inp.value.trim(); if (String(v ?? "") !== val) setProp(rowId, p.key, p.type === "number" && val ? Number(val) : val || null); closePop(true); };
      inp.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); commit(); } if (e.key === "Escape") closePop(true); });
      if (p.type === "date") inp.addEventListener("change", commit);
      pp.querySelector("[data-today]")?.addEventListener("click", () => { inp.value = kstToday(); commit(); });
      pp.querySelector("[data-clear]")?.addEventListener("click", () => { inp.value = ""; commit(); });
      const cb = pp.querySelector("[data-remind]"), tm = pp.querySelector(".db-rtime");
      const saveRemind = () => setProp(rowId, "_remind", cb.checked ? { prop: p.key, time: tm.value || "09:00" } : null);
      cb?.addEventListener("change", saveRemind);
      tm?.addEventListener("change", () => { if (cb.checked) saveRemind(); });
    });
  }
  // 관계 고르기: 대상 DB 의 행을 검색해서 켜고 끄기 (닫을 때 한 번 저장)
  function relPicker(anchor, rowId, p, cur0) {
    const cur = new Set(cur0);
    const render = (q) => relRows(p).filter((x) => x.id !== rowId).filter((x) => !q || x.title.toLowerCase().includes(q)).slice(0, 50)
      .map((x) => `<button type="button" data-rel="${esc(x.id)}" aria-pressed="${cur.has(x.id)}"><span>↗ ${esc(x.title)}</span>${cur.has(x.id) ? '<span class="db-tick">✓</span>' : ""}</button>`).join("") || `<div class="faint db-hint">No rows.</div>`;
    openPop(anchor, `<input class="input db-pop-q" placeholder="Search ${esc(p.target && p.target !== id ? S.rel[p.target]?.title || "" : S.note.title)}"><div class="db-opts" data-rel-list>${render("")}</div>`, (pp) => {
      const q = pp.querySelector(".db-pop-q"); q.focus();
      q.addEventListener("input", () => { pp.querySelector("[data-rel-list]").innerHTML = render(q.value.trim().toLowerCase()); });
      q.addEventListener("keydown", (e) => { if (e.key === "Escape" || (e.key === "Enter" && !e.isComposing)) { e.preventDefault(); closePop(); } });
      pp.addEventListener("click", (e) => {
        const b = e.target.closest("[data-rel]"); if (!b) return;
        if (cur.has(b.dataset.rel)) cur.delete(b.dataset.rel); else cur.add(b.dataset.rel);
        pp.querySelector("[data-rel-list]").innerHTML = render(q.value.trim().toLowerCase());
      });
    }, () => { if ([...cur].join() !== cur0.join()) setProp(rowId, p.key, [...cur]); });
  }
  function addProp(anchor) {
    openPop(anchor, `<input class="input" id="db-pn" placeholder="Property name" maxlength="60"><div class="db-opts">${PROP_TYPES.map((t) => `<button type="button" data-t="${t}"><span><span class="db-pi">${TYPE_IC[t]}</span>${TYPE_LABEL[t]}</span></button>`).join("")}</div>`, (pp) => {
      pp.querySelector("#db-pn").focus();
      pp.addEventListener("click", (e) => {
        const b = e.target.closest("[data-t]"); if (!b) return;
        const name = pp.querySelector("#db-pn").value.trim() || TYPE_LABEL[b.dataset.t];
        let key = name.toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 24) || "p";
        if (/^\d/.test(key)) key = "p_" + key;
        let k = key, i = 2; while (S.db.props.some((p) => p.key === k) || k === "title") k = key + "_" + i++;
        const np = { key: k, name, type: b.dataset.t };
        if (GROUPABLE.includes(np.type)) np.options = np.type === "status" ? [{ name: "시작 전", color: "gray" }, { name: "진행 중", color: "blue" }, { name: "완료", color: "green" }] : [];
        if (np.type === "relation") np.target = id;
        if (np.type === "rollup") { const rp = S.db.props.find((p) => p.type === "relation"); np.relation = rp?.key || ""; np.target = "title"; np.fn = "count"; }
        if (np.type === "formula") np.expr = "";
        S.db.props.push(np); closePop(true);
        if (["relation", "rollup", "formula"].includes(np.type)) { draw(); const th = el.querySelector(`th[data-prop="${np.key}"]`); if (th) { S.dirty = true; return propMenu(th); } }
        saveDb();
      });
    });
  }
  // property menu: rename · option colors · delete
  function propMenu(th) {
    const p = prop(th.dataset.prop); if (!p) return;
    const opts = GROUPABLE.includes(p.type) ? (p.options || []) : [];
    openPop(th, `<input class="input" data-pname value="${esc(p.name)}" maxlength="60" aria-label="Property name">
      <div class="faint db-hint">${TYPE_IC[p.type]} ${TYPE_LABEL[p.type]}</div>
      ${calcConfig(p)}
      ${opts.length ? `<div class="db-sec">Options</div><div class="db-optrows">${opts.map((x, i) => `<div class="db-optrow" data-oi="${i}">${pill(x.name, x.color, p.type === "status")}<span class="db-swatches">${COLORS.slice(1).map((c) => `<button type="button" class="db-sw c-${c}${c === x.color ? " on" : ""}" data-color="${c}" title="${c}" aria-label="${esc(x.name)} ${c}"></button>`).join("")}</span><button type="button" class="db-chip-x" data-del-opt="${i}" aria-label="Delete option">×</button></div>`).join("")}</div>` : ""}
      <div class="db-opts" style="margin-top:6px"><button type="button" data-sort-prop="asc">↑ Sort ascending</button><button type="button" data-sort-prop="desc">↓ Sort descending</button><button type="button" data-filter-prop>Filter by ${esc(p.name)}</button><button type="button" class="db-danger" data-del-prop>Delete property</button></div>`, (pp) => {
      const nm = pp.querySelector("[data-pname]");
      const rename = () => { const t = nm.value.trim().slice(0, 60); if (t && t !== p.name) { p.name = t; S.dirty = true; } };
      nm.addEventListener("input", rename);
      bindCalcConfig(pp, p);
      nm.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); closePop(); } });
      pp.addEventListener("click", (e) => {
        const sw = e.target.closest("[data-color]");
        if (sw) { const x = opts[+sw.closest("[data-oi]").dataset.oi]; x.color = sw.dataset.color; S.dirty = true; sw.parentElement.querySelectorAll(".on").forEach((b) => b.classList.remove("on")); sw.classList.add("on"); sw.closest(".db-optrow").firstElementChild.outerHTML = pill(x.name, x.color, p.type === "status"); return; }
        const dx = e.target.closest("[data-del-opt]");
        if (dx) { p.options.splice(+dx.dataset.delOpt, 1); S.dirty = true; closePop(); return; }
        const sp = e.target.closest("[data-sort-prop]");
        if (sp) { rename(); S.view.sorts = [{ prop: p.key, dir: sp.dataset.sortProp }]; S.dirty = true; closePop(); return; }
        if (e.target.closest("[data-filter-prop]")) { rename(); closePop(); return addFilter(p.key); }
        if (e.target.closest("[data-del-prop]")) {
          if (!confirm(`Delete property "${p.name}"? Values in rows will be hidden.`)) return;
          S.db.props = S.db.props.filter((x) => x.key !== p.key); S.dirty = true; closePop();
        }
      });
    });
  }
  // relation 대상 DB · rollup (관계 · 대상 속성 · 계산) · formula 식 설정 — 속성 메뉴 안에 보여요
  let dbList = null;
  function calcConfig(p) {
    if (p.type === "relation") {
      const known = (dbList || []).filter((n) => n.id !== id);
      const opts = known.map((n) => `<option value="${esc(n.id)}" ${p.target === n.id ? "selected" : ""}>${esc(n.title)}</option>`).join("");
      const extra = p.target && p.target !== id && !known.some((n) => n.id === p.target) ? `<option value="${esc(p.target)}" selected>${esc(S.rel[p.target]?.title || p.target)}</option>` : "";
      return `<div class="db-sec">Related database</div><select class="input" data-rel-target><option value="${esc(id)}">${esc(S.note.title)} (this)</option>${opts}${extra}</select><div class="faint db-hint">One-way: the other database doesn't get a back-link column.</div>`;
    }
    if (p.type === "rollup") {
      const rels = S.db.props.filter((x) => x.type === "relation"), rp = rels.find((x) => x.key === p.relation);
      const tdb = rp ? (!rp.target || rp.target === id ? S.db : S.rel[rp.target]?.db) : null;
      const tps = [{ key: "title", name: "Name" }, ...(tdb?.props || []).filter((x) => x.key !== p.key)];
      return `<div class="db-sec">Relation</div><select class="input" data-ru="relation"><option value="">—</option>${rels.map((x) => `<option value="${esc(x.key)}" ${x.key === p.relation ? "selected" : ""}>${esc(x.name)}</option>`).join("")}</select>
        <div class="db-sec">Property</div><select class="input" data-ru="target">${tps.map((x) => `<option value="${esc(x.key)}" ${x.key === p.target ? "selected" : ""}>${esc(x.name)}</option>`).join("")}</select>
        <div class="db-sec">Calculate</div><select class="input" data-ru="fn">${ROLLUP_FNS.map((f) => `<option value="${f}" ${f === p.fn ? "selected" : ""}>${FN_LABEL[f]}</option>`).join("")}</select>`;
    }
    if (p.type === "formula") return `<div class="db-sec">Formula</div><textarea class="input db-fx" data-fx rows="3" spellcheck="false" placeholder='if(prop("Done"), "✓", "")'>${esc(p.expr || "")}</textarea><div class="faint db-hint">prop("Name") · + - * / · == != &lt; &gt; · if() concat() length() round() dateBetween(a, b, "days") now()</div>`;
    return "";
  }
  function bindCalcConfig(pp, p) {
    if (p.type === "relation" && !dbList) api.notes().then((d) => {
      dbList = d.notes.filter((n) => n.kind === "database");
      const s = pp.querySelector("[data-rel-target]");
      if (s && pp === pop) { const w = document.createElement("div"); w.innerHTML = calcConfig(p); s.replaceWith(w.querySelector("select")); }
    }).catch(() => {});
    pp.addEventListener("change", (e) => {
      const t = e.target;
      if (t.matches("[data-rel-target]")) { p.target = t.value; S.dirty = true; }
      if (t.matches("[data-ru]")) {
        p[t.dataset.ru] = t.value; S.dirty = true;
        // 관계를 바꾸면 대상 속성 목록도 바뀌어요 → 저장 후 메뉴를 다시 열어요
        if (t.dataset.ru === "relation") { p.target = "title"; closePop(); setTimeout(() => { const th = el.querySelector(`th[data-prop="${p.key}"]`); if (th) propMenu(th); }, 400); }
      }
    });
    pp.querySelector("[data-fx]")?.addEventListener("input", (e) => { p.expr = e.target.value.slice(0, 1000); S.dirty = true; });
  }
  function addView(anchor) {
    openPop(anchor, `<div class="db-opts">${VIEW_ALL.map((t) => `<button type="button" data-v="${t}"><span>${VIEW_IC[t]} ${t[0].toUpperCase() + t.slice(1)}</span></button>`).join("")}</div>`, (pp) => {
      pp.addEventListener("click", (e) => {
        const b = e.target.closest("[data-v]"); if (!b) return;
        const t = b.dataset.v;
        const nv = { id: "v" + Date.now().toString(36).slice(-6), name: t[0].toUpperCase() + t.slice(1), type: t };
        if (t === "board") { const g = S.db.props.find((p) => p.type === "status" || p.type === "select"); if (g) nv.group_by = g.key; }
        if (t === "calendar") { const d = S.db.props.find((p) => p.type === "date"); if (d) nv.date_prop = d.key; }
        S.db.views.push(nv); S.view = nv; rememberView(id, nv.id); closePop(true); saveDb();
      });
    });
  }
  // view menu (click the active tab): rename · delete
  function viewMenu(tab) {
    const v = S.view;
    openPop(tab, `<input class="input" data-vname value="${esc(v.name)}" maxlength="40" aria-label="View name">
      <div class="db-opts">${S.db.views.length > 1 ? `<button type="button" class="db-danger" data-del-view>Delete view</button>` : ""}</div>`, (pp) => {
      const nm = pp.querySelector("[data-vname]"); nm.focus(); nm.select();
      nm.addEventListener("input", () => { const t = nm.value.trim(); if (t && t !== v.name) { v.name = t; S.dirty = true; } });
      nm.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); closePop(); } });
      pp.querySelector("[data-del-view]")?.addEventListener("click", () => {
        if (!confirm(`Delete view "${v.name}"?`)) return;
        S.db.views = S.db.views.filter((x) => x.id !== v.id); S.view = S.db.views[0]; rememberView(id, S.view.id); S.dirty = true; closePop();
      });
    });
  }
  function propList(filterFn) {
    return [prop("title"), ...S.db.props].filter(filterFn).map((p) => `<button type="button" data-p="${esc(p.key)}"><span><span class="db-pi">${TYPE_IC[p.type]}</span>${esc(p.name)}</span></button>`).join("");
  }
  function addFilter(key) {
    const start = (k) => {
      const p = prop(k), op = opsFor(p.type)[0];
      const f = { prop: k, op }; if (p.type === "checkbox") f.value = true;
      (S.view.filters ||= []).push(f); draw();
      const chip = el.querySelector(`[data-edit-filter="${S.view.filters.length - 1}"]`);
      if (chip) editFilter(chip, S.view.filters.length - 1); else S.dirty = true;
    };
    if (key) return start(key);
    const anchor = el.querySelector("[data-add-filter]");
    openPop(anchor, `<div class="db-sec">Filter by</div><div class="db-opts">${propList(() => true)}</div>`, (pp) => {
      pp.addEventListener("click", (e) => { const b = e.target.closest("[data-p]"); if (b) { closePop(true); start(b.dataset.p); } });
    });
  }
  function editFilter(anchor, i) {
    const f = S.view.filters[i], p = prop(f.prop); if (!p) return;
    const valueHtml = () => {
      if (noValue(f.op)) return "";
      if (p.type === "checkbox") return `<select class="input" data-fval><option value="1" ${f.value ? "selected" : ""}>Checked</option><option value="0" ${f.value ? "" : "selected"}>Unchecked</option></select>`;
      if (GROUPABLE.includes(p.type)) return `<div class="db-opts">${(p.options || []).map((x) => `<button type="button" data-fopt="${esc(x.name)}">${pill(x.name, x.color, p.type === "status")}${f.value === x.name ? '<span class="db-tick">✓</span>' : ""}</button>`).join("")}</div>`;
      return `<input class="input" data-fval type="${p.type === "date" ? "date" : p.type === "number" ? "number" : "text"}" value="${esc(f.value ?? "")}" placeholder="Value">`;
    };
    const done = () => {
      // drop a half-made filter the server would reject (number/date without a value)
      if (!noValue(f.op) && (p.type === "number" || p.type === "date") && (f.value === undefined || f.value === "")) S.view.filters.splice(S.view.filters.indexOf(f), 1);
      if (!S.view.filters.length) delete S.view.filters;
      saveDb();
    };
    openPop(anchor, `<div class="db-sec">${esc(p.name)}</div><select class="input" data-fop>${opsFor(p.type).map((op) => `<option value="${op}" ${op === f.op ? "selected" : ""}>${esc(OP_LABEL[op])}</option>`).join("")}</select><div data-fv>${valueHtml()}</div>`, (pp) => {
      const sync = () => { const box = pp.querySelector("[data-fv]"); box.innerHTML = valueHtml(); bindVal(); };
      const bindVal = () => {
        const inp = pp.querySelector("[data-fval]");
        if (inp) {
          if (inp.tagName === "INPUT") inp.focus();
          inp.addEventListener(inp.tagName === "SELECT" ? "change" : "input", () => {
            f.value = p.type === "checkbox" ? inp.value === "1" : p.type === "number" ? (inp.value === "" ? undefined : Number(inp.value)) : inp.value;
            refreshLive();
          });
          inp.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); closePop(); } });
        }
      };
      pp.querySelector("[data-fop]").addEventListener("change", (e) => { f.op = e.target.value; if (noValue(f.op)) delete f.value; sync(); refreshLive(); });
      pp.addEventListener("click", (e) => { const b = e.target.closest("[data-fopt]"); if (b) { f.value = b.dataset.fopt; closePop(); } });
      bindVal();
    }, done);
  }
  // live preview while editing a filter (keep the popover open)
  function refreshLive() {
    const view = el.querySelector(".db-view"), bar = el.querySelector(".db-bar");
    if (view) view.innerHTML = viewHtml();
    if (bar) bar.outerHTML = toolbar();
  }
  function sortMenu(anchor) {
    const render = () => {
      const ss = S.view.sorts || [];
      return `<div class="db-sec">Sort</div>${ss.map((x, i) => `<div class="db-sortrow"><span>${esc(prop(x.prop)?.name || x.prop)}</span><select class="input" data-dir="${i}"><option value="asc" ${x.dir === "asc" ? "selected" : ""}>Ascending</option><option value="desc" ${x.dir === "desc" ? "selected" : ""}>Descending</option></select><button type="button" class="db-chip-x" data-del-sort="${i}" aria-label="Remove sort">×</button></div>`).join("")}
        ${ss.length < 5 ? `<div class="db-sec">${ss.length ? "Then by" : "Sort by"}</div><div class="db-opts">${propList((p) => !ss.some((x) => x.prop === p.key))}</div>` : ""}`;
    };
    openPop(anchor, render(), (pp) => {
      pp.addEventListener("click", (e) => {
        const b = e.target.closest("[data-p]");
        if (b) { (S.view.sorts ||= []).push({ prop: b.dataset.p, dir: "asc" }); S.dirty = true; pp.innerHTML = render(); refreshLive(); return; }
        const d = e.target.closest("[data-del-sort]");
        if (d) { S.view.sorts.splice(+d.dataset.delSort, 1); if (!S.view.sorts.length) delete S.view.sorts; S.dirty = true; pp.innerHTML = render(); refreshLive(); }
      });
      pp.addEventListener("change", (e) => { const s = e.target.closest("[data-dir]"); if (s) { S.view.sorts[+s.dataset.dir].dir = s.value; S.dirty = true; refreshLive(); } });
    });
  }
  function groupMenu(anchor) {
    const v = S.view, gs = S.db.props.filter((p) => GROUPABLE.includes(p.type));
    openPop(anchor, `<div class="db-sec">Group by</div><div class="db-opts">${gs.map((p) => `<button type="button" data-g="${esc(p.key)}"><span><span class="db-pi">${TYPE_IC[p.type]}</span>${esc(p.name)}</span>${v.group_by === p.key ? '<span class="db-tick">✓</span>' : ""}</button>`).join("")}${v.type === "table" && v.group_by ? `<button type="button" data-g="">None</button>` : ""}</div>${gs.length ? "" : `<div class="faint db-hint">Add a Status, Select or Multi-select property first.</div>`}`, (pp) => {
      pp.addEventListener("click", (e) => { const b = e.target.closest("[data-g]"); if (!b) return; if (b.dataset.g) v.group_by = b.dataset.g; else delete v.group_by; closePop(true); saveDb(); });
    });
  }
  function dateMenu(anchor) {
    const v = S.view, ds = S.db.props.filter((p) => p.type === "date");
    openPop(anchor, `<div class="db-sec">Show by</div><div class="db-opts">${ds.map((p) => `<button type="button" data-d="${esc(p.key)}"><span>${esc(p.name)}</span>${v.date_prop === p.key ? '<span class="db-tick">✓</span>' : ""}</button>`).join("")}</div>`, (pp) => {
      pp.addEventListener("click", (e) => { const b = e.target.closest("[data-d]"); if (!b) return; v.date_prop = b.dataset.d; closePop(true); saveDb(); });
    });
  }

  // ---------- events ----------
  let swallowClick = false;
  el.addEventListener("click", (e) => {
    if (swallowClick) { swallowClick = false; e.preventDefault(); e.stopPropagation(); return; }
    const t = e.target;
    const tab = t.closest("[data-view]");
    if (tab) {
      if (tab.dataset.view === S.view.id && !ro) return viewMenu(tab);
      S.view = S.db.views.find((v) => v.id === tab.dataset.view); rememberView(id, S.view.id); draw(); return;
    }
    const a = t.closest(".db-open"); if (a) { e.preventDefault(); o.onOpen ? o.onOpen(a.closest("[data-row]").dataset.row) : (location.hash = a.getAttribute("href")); return; }
    if (t.closest(".db-title")) { e.preventDefault(); o.onOpen ? o.onOpen(id) : (location.hash = "#/notes/" + id); return; }
    const mo = t.closest("[data-month]");
    if (mo) { const k = +mo.dataset.month; if (!k) S.month = kstToday().slice(0, 7); else { const [y, m] = S.month.split("-").map(Number); const d = new Date(Date.UTC(y, m - 1 + k, 1)); S.month = d.toISOString().slice(0, 7); } draw(); return; }
    if (ro) return;
    if (t.closest("[data-add-filter]")) return addFilter();
    const ef = t.closest("[data-edit-filter]"); if (ef) return editFilter(ef, +ef.dataset.editFilter);
    const df = t.closest("[data-del-filter]"); if (df) { S.view.filters.splice(+df.dataset.delFilter, 1); if (!S.view.filters.length) delete S.view.filters; return saveDb(); }
    if (t.closest("[data-sorts]")) return sortMenu(t.closest("[data-sorts]"));
    if (t.closest("[data-group-menu]")) return groupMenu(t.closest("[data-group-menu]"));
    if (t.closest("[data-date-menu]")) return dateMenu(t.closest("[data-date-menu]"));
    const add = t.closest("[data-add]");
    if (add) { const dp = prop(S.view.date_prop); return newRow(dp ? { [dp.key]: add.dataset.add } : {}); }
    if (t.closest("[data-tpl-done]")) { S.tplMode = false; return draw(); }
    if (t.closest(".db-newmenu")) return newMenu(t.closest(".db-newmenu"));
    if (t.closest("[data-show-menu]")) return showMenu(t.closest("[data-show-menu]"));
    if (t.closest(".db-new")) {
      if (S.view.type === "calendar") { const dp = prop(S.view.date_prop); return newRow(dp ? { [dp.key]: kstToday() } : {}); }
      return newRow();
    }
    const nr = t.closest(".db-newrow"); if (nr) return newRow(groupProps(nr.dataset.group));
    if (t.closest(".db-addp")) return addProp(t.closest("th"));
    if (t.closest(".db-addview")) return addView(t.closest(".db-addview"));
    const th = t.closest("th.db-th"); if (th) return propMenu(th);
    if (t.classList.contains("db-cb")) { const td = t.closest("td"); setProp(td.closest("[data-row]").dataset.row, td.dataset.prop, t.checked); return; }
    const td = t.closest("td.db-c"); if (td && !t.closest("a")) return editCell(td);
    const nm = t.closest("td.db-name"); if (nm && !t.closest("a")) { const a2 = nm.querySelector(".db-open"); if (a2) renameRow(nm.closest("[data-row]").dataset.row, a2); }
  });
  el.addEventListener("dblclick", (e) => { const a = e.target.closest("td.db-name .db-open"); if (a && !ro) { e.preventDefault(); renameRow(a.closest("[data-row]").dataset.row, a); } });

  // mouse drag (HTML5): board card → column, calendar card → day
  const CARD = ".db-card, .db-cal-card";
  let drag = null;
  el.addEventListener("dragstart", (e) => { if (td) { e.preventDefault(); return; } const c = e.target.closest?.(CARD); if (!c) return; drag = { row: c.dataset.row, from: c.dataset.from }; e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", drag.row); c.classList.add("dragging"); e.stopPropagation(); });
  el.addEventListener("dragover", (e) => { if (!drag) return; const col = e.target.closest?.("[data-drop]"); if (!col) return; e.preventDefault(); e.stopPropagation(); el.querySelectorAll(".over").forEach((x) => x !== col && x.classList.remove("over")); col.classList.add("over"); });
  el.addEventListener("drop", (e) => {
    if (!drag) return; const col = e.target.closest?.("[data-drop]"); if (!col) return;
    e.preventDefault(); e.stopPropagation();
    const d = drag; drag = null;
    dropRow(d.row, col.dataset.drop || null, d.from);
  });
  el.addEventListener("dragend", () => { drag = null; el.querySelectorAll(".dragging, .over").forEach((x) => x.classList.remove("dragging", "over")); });

  // touch drag (pointer events): long-press a card, then move it — same idea as dock-drag.js
  let td = null; // { card, x, y, ready, ghost, timer, over }
  const endTouch = () => {
    if (!td) return;
    clearTimeout(td.timer); td.ghost?.remove(); td.card.classList.remove("dragging", "db-held");
    el.querySelectorAll(".over").forEach((x) => x.classList.remove("over"));
    td = null;
  };
  el.addEventListener("pointerdown", (e) => {
    if (ro || e.pointerType === "mouse") return;
    const card = e.target.closest(CARD); if (!card) return;
    td = { card, x: e.clientX, y: e.clientY, ready: false, pid: e.pointerId };
    td.timer = setTimeout(() => { if (!td) return; td.ready = true; card.classList.add("db-held"); navigator.vibrate?.(10); }, HOLD_MS);
  });
  el.addEventListener("pointermove", (e) => {
    if (!td || e.pointerId !== td.pid) return;
    const dx = e.clientX - td.x, dy = e.clientY - td.y;
    if (!td.ready) { if (Math.hypot(dx, dy) > 8) endTouch(); return; } // moved before the hold → it's a scroll
    e.preventDefault();
    if (!td.ghost) {
      const r = td.card.getBoundingClientRect();
      td.ghost = td.card.cloneNode(true); td.ghost.classList.add("db-ghost"); td.ghost.style.width = r.width + "px";
      td.ox = td.x - r.left; td.oy = td.y - r.top;
      document.body.appendChild(td.ghost); td.card.classList.add("dragging");
    }
    td.ghost.style.transform = `translate(${e.clientX - td.ox}px, ${e.clientY - td.oy}px)`;
    const under = document.elementFromPoint(e.clientX, e.clientY)?.closest("[data-drop]");
    const target = under && el.contains(under) ? under : null;
    if (target !== td.over) { td.over?.classList.remove("over"); target?.classList.add("over"); td.over = target; }
  });
  el.addEventListener("pointerup", (e) => {
    if (!td || e.pointerId !== td.pid) return;
    const { card, ghost, over } = td;
    if (ghost) {
      swallowClick = true; setTimeout(() => { swallowClick = false; }, 400);
      const row = card.dataset.row, from = card.dataset.from;
      endTouch();
      if (over) dropRow(row, over.dataset.drop || null, from);
      return;
    }
    endTouch();
  });
  el.addEventListener("pointercancel", endTouch);
  el.addEventListener("touchmove", (e) => { if (td?.ready) e.preventDefault(); }, { passive: false });
  el.addEventListener("contextmenu", (e) => { if (td?.ready) e.preventDefault(); });

  load();
  return { reload: load, destroy: () => { closePop(true); el.innerHTML = ""; } };
}

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmtDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ""); if (!m) return s;
  return `${MON[+m[2] - 1]} ${+m[3]}, ${m[1]}`;
}
function fmtDay(s) {
  const d = new Date(s + "T00:00:00Z");
  return `${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getUTCDay()]}, ${MON[d.getUTCMonth()]} ${d.getUTCDate()}`;
}
