// Database views (docs/blocks-schema.md): a database is a note (kind = 'database', db = { props, views }),
// its rows are child notes with props. Table view (inline cell edit) + board view (drag cards between groups).
import { api } from "../api.js";
import { esc, toast } from "../util.js";
import { COLORS, PROP_TYPES } from "./md.js";

const parse = (t) => { try { return t ? JSON.parse(t) : null; } catch { return null; } };
const VIEW_KEY = "trio-db-view";
function lastView(id) { try { return JSON.parse(localStorage.getItem(VIEW_KEY) || "{}")[id]; } catch { return null; } }
function rememberView(id, v) { try { const m = JSON.parse(localStorage.getItem(VIEW_KEY) || "{}"); m[id] = v; localStorage.setItem(VIEW_KEY, JSON.stringify(m)); } catch {} }
const TYPE_LABEL = { status: "Status", select: "Select", multi_select: "Multi-select", date: "Date", text: "Text", number: "Number", checkbox: "Checkbox", url: "URL" };
const TYPE_IC = { status: "◐", select: "▾", multi_select: "☰", date: "▦", text: "≡", number: "#", checkbox: "☑", url: "🔗" };

export function pill(name, color, status) {
  return `<span class="db-pill c-${esc(COLORS.includes(color) ? color : "gray")}${status ? " st" : ""}">${status ? '<i class="db-dot"></i>' : ""}${esc(name)}</span>`;
}

// el: container · id: database note id · o: { onOpen(id), inline, readOnly }
export function mountDatabase(el, id, o = {}) {
  const S = { note: null, db: null, rows: [], view: null };
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
  const opt = (p, name) => p.options?.find((x) => x.name === name);

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
    const v = S.view;
    el.innerHTML = `
      <div class="db-head">
        ${o.inline ? `<a class="db-title" href="#/notes/${esc(id)}">${esc(S.note.title)}</a>` : ""}
        <div class="db-tabs" role="tablist">${S.db.views.map((x) => `<button type="button" role="tab" data-view="${esc(x.id)}" aria-selected="${x.id === v.id}">${x.type === "board" ? "▥" : "▤"} ${esc(x.name)}</button>`).join("")}${ro ? "" : `<button type="button" class="db-addview" title="Add view" aria-label="Add view">+</button>`}</div>
        ${ro ? "" : `<button type="button" class="btn sm accent db-new">+ New</button>`}
      </div>
      <div class="db-view">${v.type === "board" ? board() : table()}</div>`;
  }
  function table() {
    const ps = S.db.props;
    return `<div class="db-scroll"><table class="db-table">
      <thead><tr><th class="db-name">Aa Name</th>${ps.map((p) => `<th data-prop="${esc(p.key)}"><span class="db-pi">${TYPE_IC[p.type] || ""}</span>${esc(p.name)}</th>`).join("")}${ro ? "" : `<th class="db-addprop" title="Add property"><button type="button" class="db-addp" aria-label="Add property">+</button></th>`}</tr></thead>
      <tbody>${S.rows.map((r) => `<tr data-row="${esc(r.id)}"><td class="db-name"><a href="#/notes/${esc(r.id)}" class="db-open">${esc(r.title)}</a></td>${ps.map((p) => `<td data-prop="${esc(p.key)}" class="db-c db-t-${p.type}">${cellHtml(p, r.props[p.key])}</td>`).join("")}${ro ? "" : "<td></td>"}</tr>`).join("")}</tbody>
    </table></div>${ro ? "" : `<button type="button" class="db-newrow">+ New</button>`}`;
  }
  function groups() {
    const g = prop(S.view.group_by);
    if (!g) return null;
    const cols = (g.options || []).map((x) => ({ name: x.name, color: x.color, rows: [] }));
    const none = { name: "", color: "default", rows: [] };
    for (const r of S.rows) { const c = cols.find((x) => x.name === r.props[g.key]); (c || none).rows.push(r); }
    return { g, cols: none.rows.length ? [none, ...cols] : cols };
  }
  function board() {
    const gs = groups();
    if (!gs) return `<div class="faint" style="padding:12px">Add a Status or Select property to group this board.</div>`;
    const others = S.db.props.filter((p) => p.key !== gs.g.key);
    return `<div class="db-board">${gs.cols.map((c) => `
      <section class="db-col" data-group="${esc(c.name)}">
        <header>${c.name ? pill(c.name, c.color, gs.g.type === "status") : `<span class="db-pill c-default">No ${esc(gs.g.name)}</span>`}<span class="db-count">${c.rows.length}</span></header>
        <div class="db-cards">${c.rows.map((r) => `<article class="db-card" data-row="${esc(r.id)}" ${ro ? "" : 'draggable="true"'}>
          <a href="#/notes/${esc(r.id)}" class="db-open"><b>${esc(r.title)}</b></a>
          ${others.map((p) => { const h = cellHtml(p, r.props[p.key]); return h && p.type !== "checkbox" ? `<div class="db-cp">${h}</div>` : ""; }).join("")}
        </article>`).join("")}</div>
        ${ro ? "" : `<button type="button" class="db-newrow" data-group="${esc(c.name)}">+ New</button>`}
      </section>`).join("")}</div>`;
  }

  // ---------- writes ----------
  async function newRow(group) {
    const props = {};
    const g = S.view.type === "board" ? prop(S.view.group_by) : null;
    if (g && group) props[g.key] = group;
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

  // ---------- popovers ----------
  function closePop() { if (pop) { pop.remove(); pop = null; } }
  function openPop(anchor, html, bind) {
    closePop();
    pop = document.createElement("div"); pop.className = "db-pop"; pop.innerHTML = html; document.body.appendChild(pop);
    const r = anchor.getBoundingClientRect();
    pop.style.left = Math.max(8, Math.min(r.left, innerWidth - 250)) + "px";
    pop.style.top = Math.min(r.bottom + 4, innerHeight - 40) + "px";
    bind(pop);
    setTimeout(() => addEventListener("mousedown", function off(e) { if (pop && !pop.contains(e.target)) { closePop(); removeEventListener("mousedown", off); } else if (!pop) removeEventListener("mousedown", off); }), 0);
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
        let k = key, i = 2; while (prop(k)) k = key + "_" + i++;
        const np = { key: k, name, type: b.dataset.t };
        if (["status", "select", "multi_select"].includes(np.type)) np.options = np.type === "status" ? [{ name: "시작 전", color: "gray" }, { name: "진행 중", color: "blue" }, { name: "완료", color: "green" }] : [];
        S.db.props.push(np); closePop(); saveDb();
      });
    });
  }
  function addView(anchor) {
    openPop(anchor, `<div class="db-opts"><button type="button" data-v="table">▤ Table</button><button type="button" data-v="board">▥ Board</button></div>`, (pp) => {
      pp.addEventListener("click", (e) => {
        const b = e.target.closest("[data-v]"); if (!b) return;
        const g = S.db.props.find((p) => p.type === "status" || p.type === "select");
        const nv = { id: "v" + Date.now().toString(36).slice(-6), name: b.dataset.v === "board" ? "Board" : "Table", type: b.dataset.v };
        if (nv.type === "board" && g) nv.group_by = g.key;
        S.db.views.push(nv); S.view = nv; rememberView(id, nv.id); closePop(); saveDb();
      });
    });
  }

  // ---------- events ----------
  el.addEventListener("click", (e) => {
    const t = e.target;
    const tab = t.closest("[data-view]"); if (tab) { S.view = S.db.views.find((v) => v.id === tab.dataset.view); rememberView(id, S.view.id); draw(); return; }
    const a = t.closest(".db-open"); if (a) { e.preventDefault(); o.onOpen ? o.onOpen(a.closest("[data-row]").dataset.row) : (location.hash = a.getAttribute("href")); return; }
    if (t.closest(".db-title")) { e.preventDefault(); o.onOpen ? o.onOpen(id) : (location.hash = "#/notes/" + id); return; }
    if (ro) return;
    if (t.closest(".db-new")) return newRow(S.view.type === "board" ? undefined : undefined);
    const nr = t.closest(".db-newrow"); if (nr) return newRow(nr.dataset.group || undefined);
    if (t.closest(".db-addp")) return addProp(t.closest("th"));
    if (t.closest(".db-addview")) return addView(t.closest(".db-addview"));
    if (t.classList.contains("db-cb")) { const td = t.closest("td"); setProp(td.closest("[data-row]").dataset.row, td.dataset.prop, t.checked); return; }
    const td = t.closest("td.db-c"); if (td && !t.closest("a")) return editCell(td);
    const nm = t.closest("td.db-name"); if (nm && !t.closest("a")) { const a2 = nm.querySelector(".db-open"); if (a2) renameRow(nm.closest("[data-row]").dataset.row, a2); }
  });
  el.addEventListener("dblclick", (e) => { const a = e.target.closest("td.db-name .db-open"); if (a && !ro) { e.preventDefault(); renameRow(a.closest("[data-row]").dataset.row, a); } });
  // board drag: card → column changes the group prop
  let drag = null;
  el.addEventListener("dragstart", (e) => { const c = e.target.closest?.(".db-card"); if (!c) return; drag = c.dataset.row; e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", drag); c.classList.add("dragging"); e.stopPropagation(); });
  el.addEventListener("dragover", (e) => { if (!drag) return; const col = e.target.closest?.(".db-col"); if (!col) return; e.preventDefault(); e.stopPropagation(); el.querySelectorAll(".db-col.over").forEach((x) => x !== col && x.classList.remove("over")); col.classList.add("over"); });
  el.addEventListener("drop", (e) => {
    if (!drag) return; const col = e.target.closest?.(".db-col"); if (!col) return;
    e.preventDefault(); e.stopPropagation();
    const g = prop(S.view.group_by), r = S.rows.find((x) => x.id === drag), to = col.dataset.group || null;
    drag = null;
    if (g && r && (r.props[g.key] || null) !== to) setProp(r.id, g.key, to); else draw();
  });
  el.addEventListener("dragend", () => { drag = null; el.querySelectorAll(".dragging, .over").forEach((x) => x.classList.remove("dragging", "over")); });

  load();
  return { reload: load, destroy: () => { closePop(); el.innerHTML = ""; } };
}

function fmtDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s); if (!m) return s;
  const M = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${M[+m[2] - 1]} ${+m[3]}, ${m[1]}`;
}
