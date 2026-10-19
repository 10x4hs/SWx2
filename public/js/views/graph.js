// Brain graph (#/brain/graph) — 옵시디언 그래프 뷰처럼, 하지만 처음엔 노트 192개 대신 '개념' 8~20개만.
//   개념 = 노트 내용(AI topic · 태그 · 제목 TF-IDF · 링크)으로 묶은 무리 (graph/concepts.js, 항상 같은 결과).
//   개념을 누르면(또는 두 번 누르면) 안의 노트가 펼쳐지고, 다시 누르면 접혀요.
//   노트: 한 번 누르면 고르고, 고른 채로 다른 노트를 누르면 연결 · 두 번 누르면 열기 · 선 위 ✕ 로 끊기 · 우클릭 새 노트/지우기.
import { api } from "../api.js";
import { $, esc, toast } from "../util.js";
import { openByTitle } from "./notes.js";
import { clusterNotes } from "../graph/concepts.js";

const SETTINGS_KEY = "trio-cgraph";
const DEFAULTS = { open: true, orphans: true, ghosts: false, node: 1, line: 1, text: 12, fade: 1.1, center: 1, repel: 1, link: 1, dist: 1 };
const load = () => { try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}") }; } catch { return { ...DEFAULTS }; } };
const saveSet = (s) => { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch {} };
const DBL_MS = 280;
// 옵시디언 다크 캔버스
const C = { bg: "#1e1e1e", node: "#9a9a9a", line: "rgba(255,255,255,.14)", lineOn: "#a78bfa", text: "#dadada", text2: "#9c9c9c", accent: "#a78bfa", ghost: "#555" };

export function mount(root, ctx) {
  const set = load();
  const range = (k, label, min, max, step) => `<label class="cg-row"><span>${label}</span><input type="range" min="${min}" max="${max}" step="${step}" data-set="${k}" value="${set[k]}"></label>`;
  root.innerHTML = `
    <div class="obs cg" id="obs">
      <canvas id="gc" aria-label="Concept graph of notes"></canvas>
      <header class="cg-top">
        <a class="cg-back" href="#/brain">‹ Second Brain</a>
        <h1 class="cg-title">Graph</h1>
        <p class="cg-stat" id="gstat"></p>
      </header>
      <div class="cg-zoom" role="group" aria-label="Zoom">
        <button type="button" data-zoom="in" aria-label="Zoom in">＋</button>
        <button type="button" data-zoom="out" aria-label="Zoom out">−</button>
        <button type="button" data-zoom="fit" aria-label="Fit">⤢</button>
      </div>
      <button type="button" class="cg-toggle" id="obs-toggle" aria-expanded="${set.open}" title="Graph settings">⚙︎</button>
      <aside class="cg-panel" id="obs-panel" ${set.open ? "" : "hidden"} aria-label="Graph settings">
        <div class="cg-panel-h">Graph settings</div>
        <details open><summary>Filters</summary>
          <input class="cg-q" id="gq" type="search" placeholder="Search notes…" aria-label="Search">
          <label class="cg-chk"><input type="checkbox" data-set="orphans" ${set.orphans ? "checked" : ""}>Orphans</label>
          <label class="cg-chk"><input type="checkbox" data-set="ghosts" ${set.ghosts ? "checked" : ""}>Unresolved links</label>
          <div class="cg-btns"><button type="button" data-all="open">Expand all</button><button type="button" data-all="close">Collapse all</button></div>
        </details>
        <details open><summary>Groups</summary><ul class="cg-groups" id="groups"></ul></details>
        <details><summary>Display</summary>
          ${range("node", "Node size", 0.4, 3, 0.1)}${range("line", "Link thickness", 0.3, 3, 0.1)}${range("text", "Text size", 8, 18, 1)}${range("fade", "Text fade threshold", 0.2, 2.5, 0.1)}
        </details>
        <details><summary>Forces</summary>
          ${range("center", "Center force", 0, 3, 0.1)}${range("repel", "Repel force", 0.2, 3, 0.1)}${range("link", "Link force", 0.2, 3, 0.1)}${range("dist", "Link distance", 0.3, 3, 0.1)}
          <div class="cg-btns"><button type="button" id="reheat">Animate</button></div>
        </details>
      </aside>
      <div class="cg-tip" id="tip" hidden></div>
      <button type="button" class="obs-cut" id="cut" hidden aria-label="Remove link" title="Remove link">✕</button>
      <div class="cg-pop" id="pop" hidden role="dialog"></div>
      <div class="cg-sel" id="selbar" hidden>
        <span class="dot" id="sel-dot"></span><b id="sel-title"></b><span class="faint">→ click another note to link</span>
        <button type="button" id="sel-open">Open</button>
        <button type="button" class="danger" id="sel-del" hidden>Delete</button>
        <button type="button" id="sel-x" aria-label="Clear selection">✕</button>
      </div>
      <div class="cg-menu" id="ctxmenu" hidden role="menu"></div>
      <form class="cg-new" id="newpop" hidden>
        <span class="faint">New note here</span>
        <input id="new-title" placeholder="Title · Enter" maxlength="120" aria-label="New note title" autocomplete="off">
        <label class="cg-chk" id="new-link-row" hidden><input type="checkbox" id="new-link" checked><span id="new-link-t"></span></label>
        <div class="cg-btns"><button type="button" id="new-x">Cancel</button><button type="submit" class="accent">Create</button></div>
      </form>
      <p class="cg-empty" id="empty" hidden>No notes yet. <a href="#/notes">Write a note</a></p>
    </div>`;

  const canvas = $("#gc", root), g = canvas.getContext("2d");
  let W = 0, H = 0, dpr = 1, raf = 0, alpha = 1;
  const view = { x: 0, y: 0, k: 1 };
  let data = { nodes: [], edges: [] }, cl = { concepts: [], of: new Map(), links: [] }, conceptById = new Map();
  const expanded = new Set(), pool = new Map(); // id → 노드 (위치 유지)
  let nodes = [], links = [], adj = new Map();
  let hover = null, hoverLink = null, drag = null, query = "", focusGroup = null;
  let sel = null, lastTap = { node: null, at: 0 }, mouse = null, busy = false, touched = false;

  // ---------- data → 보이는 그래프 ----------
  function cluster() {
    cl = clusterNotes(data.nodes, data.edges);
    conceptById = new Map(cl.concepts.map((c) => [c.id, c]));
    for (const id of [...expanded]) if (!conceptById.has(id)) expanded.delete(id);
  }
  const mk = (id, o, near) => {
    let n = pool.get(id);
    if (!n) { const a = Math.random() * 6.283, r = near ? 30 + Math.random() * 30 : 200 * Math.random(); n = { id, x: (near?.x || 0) + Math.cos(a) * r, y: (near?.y || 0) + Math.sin(a) * r, vx: 0, vy: 0 }; pool.set(id, n); }
    return Object.assign(n, o, { deg: 0 });
  };
  function build() {
    const out = [], L = new Map(), noteNode = new Map(), byTitle = new Map();
    for (const c of cl.concepts) {
      const open = expanded.has(c.id);
      const hub = mk(c.id, { title: c.title, concept: true, open, count: c.members.length, color: c.color, group: c.id });
      out.push(hub);
      if (!open) continue;
      for (const id of c.members) {
        const n = data.nodes.find((x) => x.id === id); if (!n) continue;
        const node = mk(id, { title: n.title, user_id: n.user_id, tags: String(n.tags || "").split(",").filter(Boolean), color: c.color, group: c.id, concept: false, ghost: false }, hub);
        out.push(node); noteNode.set(id, node);
        L.set(c.id + "|" + id, { s: hub, t: node, hub: true, w: 1 });
      }
    }
    for (const n of data.nodes) { const k = n.title.toLowerCase(); if (!byTitle.has(k) || n.user_id === ctx.me.id) byTitle.set(k, n.id); }
    const ep = (id) => noteNode.get(id) || pool.get(cl.of.get(id));
    const addL = (a, b, w, edge) => {
      if (!a || !b || a === b) return;
      const k = a.id < b.id ? a.id + "|" + b.id : b.id + "|" + a.id, l = L.get(k);
      if (l) { l.w += w; if (edge && !l.edge && !a.concept && !b.concept) l.edge = edge; return; }
      L.set(k, { s: a, t: b, w, edge: !a.concept && !b.concept ? edge : null });
    };
    for (const e of data.edges) {
      const dst = byTitle.get(e.dst_title.toLowerCase()), a = ep(e.src_id);
      if (dst) { addL(a, ep(dst), 1, { src: e.src_id, title: e.dst_title }); continue; }
      if (!set.ghosts || !noteNode.has(e.src_id)) continue; // 아직 없는 노트는 펼친 노트에서만
      const gid = "ghost:" + e.dst_title.toLowerCase();
      const gn = mk(gid, { title: e.dst_title, ghost: true, concept: false, color: C.ghost, group: null }, a);
      if (!out.includes(gn)) out.push(gn);
      addL(a, gn, 1, { src: e.src_id, title: e.dst_title });
    }
    for (const n of data.nodes) if (n.parent_id) addL(ep(n.id), ep(n.parent_id), 0.5, null);
    for (const l of cl.links) if (l.w < 1) addL(pool.get(l.s), pool.get(l.t), 0, null); // 내용이 비슷한 개념끼리: 약한 선
    links = [...L.values()];
    const deg = new Map(); links.forEach((l) => { if (l.hub) return; deg.set(l.s, (deg.get(l.s) || 0) + 1); deg.set(l.t, (deg.get(l.t) || 0) + 1); });
    nodes = out.filter((n) => set.orphans || n.concept || deg.get(n) || expanded.has(n.group));
    nodes.forEach((n) => (n.deg = deg.get(n) || 0));
    const vis = new Set(nodes); links = links.filter((l) => vis.has(l.s) && vis.has(l.t));
    adj = new Map(nodes.map((n) => [n, new Set()]));
    links.forEach((l) => { adj.get(l.s).add(l.t); adj.get(l.t).add(l.s); });
    if (sel && !vis.has(sel)) select(null);
    drawPanel();
    alpha = Math.max(alpha, 0.5); kick();
  }
  function drawPanel() {
    const real = data.nodes.length;
    $("#gstat", root).textContent = real ? `${real} notes · ${cl.concepts.length} concepts · ${expanded.size ? expanded.size + " open" : "click a concept to expand"}` : "";
    $("#empty", root).hidden = !!real;
    $("#groups", root).innerHTML = cl.concepts.map((c) => `<li><button type="button" data-group="${esc(c.id)}" aria-pressed="${expanded.has(c.id)}"><i style="background:${c.color}"></i><span>${esc(c.title)}</span><b>${c.members.length}</b></button></li>`).join("");
  }

  const radius = (n) => (n.ghost ? 2.5 : n.concept ? (n.open ? 7 : 6 + Math.sqrt(n.count) * 2.6) : 3 + Math.sqrt(n.deg) * 1.6) * set.node;

  // ---------- 물리 ----------
  function step() {
    const N = nodes.length, rep = 1100 * set.repel, rest = 60 * set.dist, kl = 0.05 * set.link, kc = 0.005 * set.center;
    for (const n of nodes) n.r = radius(n);
    for (let i = 0; i < N; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < N; j++) {
        const b = nodes[j]; let dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy || 0.01;
        if (d2 > 640000) continue;
        const d = Math.sqrt(d2); dx /= d; dy /= d;
        let f = (rep * (a.concept && b.concept ? 2.5 : 1) / d2) * alpha;
        const gap = a.r + b.r + 4 - d; if (gap > 0) f += gap * 0.3;
        a.vx -= dx * f; a.vy -= dy * f; b.vx += dx * f; b.vy += dy * f;
      }
    }
    for (const l of links) {
      const { s, t } = l, dx = t.x - s.x, dy = t.y - s.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
      const len = (l.hub ? rest * 0.8 : s.concept && t.concept ? rest * 2.4 : rest) + s.r + t.r;
      const f = ((d - len) / d) * kl * (l.w ? 1 : 0.3) * alpha;
      s.vx += dx * f; s.vy += dy * f; t.vx -= dx * f; t.vy -= dy * f;
    }
    for (const n of nodes) {
      n.vx -= n.x * kc * alpha; n.vy -= n.y * kc * alpha;
      if (n === drag?.node) { n.vx = n.vy = 0; continue; }
      n.vx *= 0.8; n.vy *= 0.8; n.x += n.vx; n.y += n.vy;
    }
    alpha = Math.max(0, alpha * 0.985);
  }

  // ---------- 그리기 ----------
  const match = (n) => query && n.title.toLowerCase().includes(query);
  function draw() {
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = C.bg; g.fillRect(0, 0, W, H);
    g.translate(W / 2 + view.x, H / 2 + view.y); g.scale(view.k, view.k);
    const focus = hover || sel, near = focus ? adj.get(focus) : null;
    const dim = !!(focus || query || focusGroup);
    const lit = (n) => (focus ? n === focus || near?.has(n) : query ? match(n) : focusGroup ? n.group === focusGroup : true);
    for (const l of links) {
      const on = focus && (l.s === focus || l.t === focus), hl = l === hoverLink;
      g.globalAlpha = hl ? 1 : on ? 0.9 : dim ? 0.06 : l.hub ? 0.45 : l.w ? 0.9 : 0.4;
      g.strokeStyle = on || hl ? C.lineOn : C.line;
      g.lineWidth = ((hl ? 2 : 1) * set.line * (l.hub ? 0.6 : Math.min(4, Math.sqrt(Math.max(0.4, l.w))))) / view.k;
      g.setLineDash(l.w ? [] : [3 / view.k, 4 / view.k]);
      g.beginPath(); g.moveTo(l.s.x, l.s.y); g.lineTo(l.t.x, l.t.y); g.stroke();
    }
    g.setLineDash([]);
    if (sel && mouse && hover !== sel) {
      g.globalAlpha = 0.6; g.strokeStyle = C.text; g.lineWidth = 1.2 / view.k; g.setLineDash([5 / view.k, 5 / view.k]);
      g.beginPath(); g.moveTo(sel.x, sel.y); g.lineTo(mouse.x, mouse.y); g.stroke(); g.setLineDash([]);
    }
    for (const n of nodes) {
      const r = radius(n), on = lit(n);
      g.globalAlpha = on ? 1 : 0.12;
      g.beginPath(); g.arc(n.x, n.y, r, 0, Math.PI * 2);
      if (n.ghost) { g.fillStyle = C.ghost; g.fill(); }
      else if (n.concept && n.open) { g.fillStyle = C.bg; g.fill(); g.strokeStyle = n.color; g.lineWidth = 2 / view.k; g.stroke(); }
      else { g.fillStyle = n === focus ? C.accent : n.concept ? n.color : mixGray(n.color); g.fill(); }
      if (n === sel || match(n)) { g.beginPath(); g.arc(n.x, n.y, r + 3.5 / view.k, 0, Math.PI * 2); g.strokeStyle = C.accent; g.lineWidth = 1.4 / view.k; g.stroke(); }
    }
    // 이름: 개념은 늘, 노트는 확대가 'Text fade threshold' 를 넘으면 서서히
    const fadeIn = Math.max(0, Math.min(1, (view.k - set.fade) / 0.5 + 0.2));
    g.textAlign = "center"; g.textBaseline = "top";
    for (const n of nodes) {
      const special = n === focus || near?.has(n) || match(n);
      const a = n.concept ? (lit(n) ? 1 : 0.2) : special ? 1 : lit(n) ? fadeIn * (dim ? 0.2 : 0.85) : 0;
      if (a < 0.03) continue;
      const fs = (n.concept ? set.text + 2 : set.text) / Math.max(0.65, view.k);
      g.font = `${n.concept ? 600 : 450} ${fs}px -apple-system, "SF Pro Text", "Pretendard Variable", sans-serif`;
      const t = n.title.length > 28 ? n.title.slice(0, 27) + "…" : n.title, y = n.y + radius(n) + 5 / view.k;
      g.globalAlpha = a; g.lineWidth = 3 / view.k; g.strokeStyle = C.bg; g.lineJoin = "round"; g.strokeText(t, n.x, y);
      g.fillStyle = n === focus || n.concept ? C.text : C.text2; g.fillText(t, n.x, y);
    }
    g.globalAlpha = 1;
  }
  // 노트 점은 개념 색을 회색 쪽으로 눌러서 차분하게 (옵시디언 느낌)
  const mixCache = new Map();
  function mixGray(hex) {
    if (mixCache.has(hex)) return mixCache.get(hex);
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || ""); if (!m) return C.node;
    const v = parseInt(m[1], 16), k = 0.55, gr = 154;
    const c = `rgb(${Math.round((v >> 16) * k + gr * (1 - k))},${Math.round(((v >> 8) & 255) * k + gr * (1 - k))},${Math.round((v & 255) * k + gr * (1 - k))})`;
    mixCache.set(hex, c); return c;
  }

  let settled = false;
  function frame() { raf = 0; const live = alpha > 0.004 || drag; if (live) step(); if (!touched && !settled && alpha < 0.05) { settled = true; fit(); } draw(); if (live) raf = requestAnimationFrame(frame); }
  const kick = () => { if (!raf) raf = requestAnimationFrame(frame); };
  function fit() {
    if (!nodes.length) return;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const n of nodes) { const r = radius(n) + 16; x0 = Math.min(x0, n.x - r); y0 = Math.min(y0, n.y - r); x1 = Math.max(x1, n.x + r); y1 = Math.max(y1, n.y + r + 18); }
    const pw = set.open && W > 860 ? 280 : 0;
    view.k = Math.max(0.2, Math.min(2.2, Math.min((W - pw - 60) / (x1 - x0 + 1), (H - 120) / (y1 - y0 + 1))));
    view.x = -((x0 + x1) / 2) * view.k - pw / 2; view.y = -((y0 + y1) / 2) * view.k + 20; kick();
  }
  function resize() { const r = canvas.getBoundingClientRect(); dpr = Math.min(2, devicePixelRatio || 1); W = r.width; H = r.height; canvas.width = W * dpr; canvas.height = H * dpr; kick(); }
  const ro = new ResizeObserver(resize); ro.observe(canvas);
  // 자동 검사용: 화면 좌표로 점 위치
  canvas.__nodes = () => nodes.map((n) => ({ id: n.id, title: n.title, type: n.concept ? "concept" : n.ghost ? "ghost" : "note", open: !!n.open, ghost: !!n.ghost, x: W / 2 + view.x + n.x * view.k, y: H / 2 + view.y + n.y * view.k }));

  // ---------- 개념 펼치기 ----------
  function toggle(c, force) {
    const open = force ?? !expanded.has(c.id);
    if (open) expanded.add(c.id); else expanded.delete(c.id);
    if (sel && !open && sel.group === c.id) select(null);
    build(); alpha = Math.max(alpha, 0.7); kick();
  }

  // ---------- 고르기 · 연결 · 열기 ----------
  const selbar = $("#selbar", root), pop = $("#pop", root);
  function select(n) {
    sel = n && !n.concept ? n : null;
    selbar.hidden = !sel;
    $("#sel-del", root).hidden = !(sel && !sel.ghost && sel.user_id === ctx.me.id);
    if (sel) { $("#sel-title", root).textContent = sel.title; $("#sel-dot", root).style.background = sel.color; }
    kick();
  }
  function openNode(n) {
    select(null); pop.hidden = true;
    if (n.ghost) openByTitle(ctx, n.title); else ctx.go("#/notes/" + n.id);
  }
  async function reload(keepSel) {
    data = await api.graph(); cluster(); build();
    if (keepSel) { const again = nodes.find((n) => n.id === keepSel.id); if (again) select(again); }
    ctx.refreshSide?.();
  }
  async function connect(a, b) {
    if (busy || a === b) return;
    if (a.ghost && b.ghost) return toast("Can't link two unresolved notes.", "err");
    const [src, dst] = a.ghost ? [b, a] : [a, b];
    if (adj.get(a)?.has(b)) { select(null); return toast("Already linked."); }
    busy = true;
    try { const r = await api.linkNote(src.id, dst.title); toast(r.added ? `Linked ${src.title} → ${dst.title}` : "Already linked."); await reload(null); select(null); }
    catch (e) { toast(e.message, "err"); } finally { busy = false; }
  }
  function showLinkPop(l, e) {
    const r = root.getBoundingClientRect();
    pop.hidden = false;
    pop.innerHTML = `<div class="cg-pop-t">${esc(l.s.title)} <span class="faint">↔</span> ${esc(l.t.title)}</div>`
      + (l.edge ? `<div class="cg-btns"><button type="button" data-open="${esc(l.edge.src)}">Open source</button><button type="button" class="danger" id="pop-unlink">Remove link</button></div>`
        : `<p class="faint">${l.s.concept || l.t.concept ? `${Math.round(l.w)} link${l.w === 1 ? "" : "s"} between these groups. Expand to edit.` : "Page tree link."}</p>`);
    pop.style.left = Math.min(e.clientX - r.left + 12, r.width - 300) + "px"; pop.style.top = Math.min(e.clientY - r.top + 12, r.height - 110) + "px";
    pop._l = l;
  }
  pop.addEventListener("click", async (e) => {
    const o = e.target.closest("[data-open]"); if (o) { pop.hidden = true; return ctx.go("#/notes/" + o.dataset.open); }
    if (e.target.closest("#pop-unlink")) { const l = pop._l; pop.hidden = true; unlink(l); }
  });
  async function unlink(l) {
    if (!l?.edge) return;
    try { const r = await api.unlinkNote(l.edge.src, l.edge.title); toast(r.removed ? "Link removed." : "Already removed."); await reload(sel); } catch (err) { toast(err.message, "err"); }
  }
  $("#sel-x", root).addEventListener("click", () => select(null));
  $("#sel-open", root).addEventListener("click", () => sel && openNode(sel));
  const delBtn = $("#sel-del", root);
  delBtn.addEventListener("click", async () => {
    if (!sel || sel.ghost) return;
    if (!delBtn.dataset.armed) { delBtn.dataset.armed = "1"; delBtn.textContent = "Sure?"; setTimeout(() => { if (delBtn.isConnected) { delete delBtn.dataset.armed; delBtn.textContent = "Delete"; } }, 3000); return; }
    const n = sel; delete delBtn.dataset.armed; delBtn.textContent = "Delete";
    try { await api.deleteNote(n.id); toast(`Deleted '${n.title}'.`); select(null); await reload(null); ctx.changed?.("notes"); } catch (e) { toast(e.message, "err"); }
  });
  // 새 노트
  const newpop = $("#newpop", root); let newAt = null;
  function openNew(e, p) {
    newAt = p; const r = root.getBoundingClientRect();
    newpop.hidden = false; newpop.style.left = Math.min(e.clientX - r.left + 10, r.width - 290) + "px"; newpop.style.top = Math.min(e.clientY - r.top + 10, r.height - 170) + "px";
    $("#new-link-row", root).hidden = !sel; if (sel) $("#new-link-t", root).textContent = `Link to ${sel.title}`;
    const inp = $("#new-title", root); inp.value = ""; setTimeout(() => inp.focus(), 60);
  }
  const closeNew = () => { newpop.hidden = true; newAt = null; };
  $("#new-x", root).addEventListener("click", closeNew);
  newpop.addEventListener("keydown", (e) => { if (e.key === "Escape") closeNew(); });
  newpop.addEventListener("submit", async (e) => {
    e.preventDefault();
    const title = $("#new-title", root).value.replace(/[\[\]|#]/g, "").trim(); if (!title) return;
    const from = sel && $("#new-link", root).checked ? sel : null, at = newAt; closeNew();
    if (busy) return; busy = true;
    try {
      let d;
      try { d = await api.addNote({ title, body: `# ${title}\n\n` }); } catch (err) { if (err.status === 409) { toast("A note with that title already exists.", "err"); return; } throw err; }
      if (from && !from.ghost) await api.linkNote(from.id, title);
      toast(from && !from.ghost ? `Created '${title}' linked to ${from.title}.` : `Created '${title}'.`);
      select(null);
      data = await api.graph(); cluster();
      const cid = cl.of.get(d.note?.id); if (cid) expanded.add(cid); // 새 노트가 들어간 개념을 펼쳐서 바로 보이게
      build();
      const nn = pool.get(d.note?.id); if (nn && at) { nn.x = at.x; nn.y = at.y; nn.vx = nn.vy = 0; kick(); }
      ctx.changed?.("notes");
    } catch (err) { toast(err.message, "err"); } finally { busy = false; }
  });
  const onKey = (e) => { if (e.key === "Escape") { select(null); pop.hidden = true; closeNew(); closeMenu(); } };
  document.addEventListener("keydown", onKey);

  // ---------- 마우스 ----------
  const toWorld = (e) => { const r = canvas.getBoundingClientRect(); return { x: (e.clientX - r.left - W / 2 - view.x) / view.k, y: (e.clientY - r.top - H / 2 - view.y) / view.k }; };
  const hit = (p) => { let best = null, bd = Infinity; for (const n of nodes) { const d = Math.hypot(n.x - p.x, n.y - p.y); if (d < radius(n) + 6 / view.k && d < bd) { best = n; bd = d; } } return best; };
  const distSeg = (p, x1, y1, x2, y2) => { const dx = x2 - x1, dy = y2 - y1, L = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((p.x - x1) * dx + (p.y - y1) * dy) / L)); return Math.hypot(p.x - (x1 + t * dx), p.y - (y1 + t * dy)); };
  function hitLink(p) { let best = null, bd = 7 / view.k; for (const l of links) { if (l.hub) continue; const d = distSeg(p, l.s.x, l.s.y, l.t.x, l.t.y); if (d < bd) { bd = d; best = l; } } return best; }
  const cut = $("#cut", root); let cutLink = null;
  function showCut(l) {
    l = l?.edge ? l : null; if (l === cutLink) return; cutLink = l;
    if (!l) { cut.hidden = true; return; }
    cut.hidden = false; cut.style.left = W / 2 + view.x + ((l.s.x + l.t.x) / 2) * view.k + "px"; cut.style.top = H / 2 + view.y + ((l.s.y + l.t.y) / 2) * view.k + "px";
  }
  cut.addEventListener("pointerenter", () => { if (cutLink) { hoverLink = cutLink; kick(); } });
  cut.addEventListener("click", () => { const l = cutLink; showCut(null); hoverLink = null; unlink(l); });
  cut.addEventListener("pointerleave", () => { hoverLink = null; showCut(null); kick(); });
  const tip = $("#tip", root);
  function showTip(n, e) {
    if (!n || n === sel) { tip.hidden = true; return; }
    const r = root.getBoundingClientRect(), c = conceptById.get(n.group);
    tip.hidden = false;
    tip.innerHTML = n.concept
      ? `<b><i style="background:${n.color}"></i>${esc(n.title)}</b><span>${n.count} notes · ${n.open ? "click to collapse" : "click to expand"}</span>`
      : `<b>${esc(n.title)}</b><span>${n.ghost ? "Unresolved · double-click to create" : `${c ? esc(c.title) + " · " : ""}${n.deg} links`}</span>${sel && sel !== n ? `<em>Click to link with ${esc(sel.title)}</em>` : ""}`;
    tip.style.transform = `translate(${Math.min(e.clientX - r.left + 14, r.width - 260)}px, ${e.clientY - r.top + 14}px)`;
  }
  canvas.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    canvas.setPointerCapture(e.pointerId); touched = true;
    const p = toWorld(e), n = hit(p);
    drag = { node: n, sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y, moved: false, link: n ? null : hitLink(p) };
  });
  canvas.addEventListener("pointermove", (e) => {
    mouse = toWorld(e);
    if (drag) {
      if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 4) drag.moved = true;
      if (drag.node) { drag.node.x = mouse.x; drag.node.y = mouse.y; if (drag.moved) alpha = Math.max(alpha, 0.25); }
      else { view.x = drag.vx + e.clientX - drag.sx; view.y = drag.vy + e.clientY - drag.sy; }
      showCut(null); kick(); return;
    }
    const n = hit(mouse), l = n ? null : hitLink(mouse);
    if (n !== hover || l !== hoverLink) { hover = n; hoverLink = l; canvas.style.cursor = n || l ? "pointer" : "grab"; kick(); }
    showCut(l); showTip(n, e);
    if (sel) kick();
  });
  canvas.addEventListener("pointerup", (e) => {
    const d = drag; drag = null;
    if (!d || d.moved) { kick(); return; }
    pop.hidden = true;
    const n = d.node;
    if (!n) { if (d.link) { closeNew(); showLinkPop(d.link, e); } else if (!newpop.hidden) closeNew(); else select(null); return; }
    closeNew();
    if (n.concept) { lastTap = { node: null, at: 0 }; return toggle(conceptById.get(n.id)); } // 개념: 누르면 펼치기 / 접기
    const nowT = performance.now(), dbl = lastTap.node === n && nowT - lastTap.at < DBL_MS;
    lastTap = { node: n, at: nowT };
    if (dbl) { lastTap = { node: null, at: 0 }; return openNode(n); }
    if (!sel) return select(n);
    if (sel === n) return select(null);
    lastTap = { node: null, at: 0 };
    connect(sel, n);
  });
  canvas.addEventListener("pointerleave", (e) => { mouse = null; if (!drag) { hover = null; tip.hidden = true; if (e.relatedTarget !== cut) { hoverLink = null; showCut(null); } kick(); } });
  const zoomAt = (k, mx = 0, my = 0) => { showCut(null); touched = true; k = Math.max(0.15, Math.min(5, k)); view.x = mx - ((mx - view.x) * k) / view.k; view.y = my - ((my - view.y) * k) / view.k; view.k = k; kick(); };
  canvas.addEventListener("wheel", (e) => { e.preventDefault(); const r = canvas.getBoundingClientRect(); zoomAt(view.k * Math.exp(-e.deltaY * 0.0015), e.clientX - r.left - W / 2, e.clientY - r.top - H / 2); }, { passive: false });

  // ---------- 우클릭 메뉴 ----------
  const menu = $("#ctxmenu", root);
  const closeMenu = () => { menu.hidden = true; };
  canvas.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    const p = toWorld(e), n = hit(p), r = root.getBoundingClientRect();
    closeNew(); pop.hidden = true; tip.hidden = true;
    const mine = n && !n.concept && !n.ghost && n.user_id === ctx.me.id;
    const items = n?.concept ? [["toggle", n.open ? "Collapse" : "Expand"], ["solo", "Show only this"]]
      : n ? [["open", n.ghost ? "Create and open" : "Open"], ["link", sel && sel !== n ? `Link with ${sel.title}` : "Start link from here"], ...(!n.ghost ? [["child", "New linked note"]] : []), ...(mine ? [["del", "Delete", "danger"]] : [])]
      : [["new", sel ? `New note (linked to ${sel.title})` : "New note here"], ...(sel ? [["new-free", "New note (unlinked)"]] : []), ["fit", "Fit to screen"]];
    menu.innerHTML = (n ? `<div class="cg-menu-t">${esc(n.title)}</div>` : "") + items.map(([k, l, c]) => `<button type="button" role="menuitem" data-m="${k}" class="${c || ""}">${esc(l)}</button>`).join("");
    menu.hidden = false;
    menu.style.left = Math.min(e.clientX - r.left, r.width - 210) + "px"; menu.style.top = Math.min(e.clientY - r.top, r.height - 40 - items.length * 34) + "px";
    menu._n = n; menu._p = p; menu._e = { clientX: e.clientX, clientY: e.clientY };
  });
  menu.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-m]"); if (!b) return;
    const k = b.dataset.m, n = menu._n, p = menu._p, ev = menu._e; closeMenu();
    if (k === "toggle") return toggle(conceptById.get(n.id));
    if (k === "solo") { focusGroup = n.id; expanded.clear(); return toggle(conceptById.get(n.id), true); }
    if (k === "open") return openNode(n);
    if (k === "link") { if (sel && sel !== n) return connect(sel, n); return select(n); }
    if (k === "child") { select(n); return openNew(ev, { x: n.x + 60, y: n.y + 40 }); }
    if (k === "new") return openNew(ev, p);
    if (k === "new-free") { select(null); return openNew(ev, p); }
    if (k === "fit") return fit();
    if (k === "del") {
      if (!confirm(`Delete '${n.title}'? This can't be undone.`)) return;
      try { await api.deleteNote(n.id); toast(`Deleted '${n.title}'.`); if (sel === n) select(null); await reload(sel); ctx.changed?.("notes"); } catch (err) { toast(err.message, "err"); }
    }
  });
  const onDocDown = (e) => { if (!menu.hidden && !menu.contains(e.target)) closeMenu(); };
  document.addEventListener("pointerdown", onDocDown, true);

  // ---------- 설정 ----------
  root.addEventListener("click", (e) => {
    const z = e.target.closest("[data-zoom]");
    if (z) { if (z.dataset.zoom === "fit") fit(); else zoomAt(view.k * (z.dataset.zoom === "in" ? 1.25 : 0.8)); return; }
    const gb = e.target.closest("[data-group]");
    if (gb) { const c = conceptById.get(gb.dataset.group); if (c) toggle(c); return; }
    const all = e.target.closest("[data-all]");
    if (all) { expanded.clear(); if (all.dataset.all === "open") cl.concepts.forEach((c) => expanded.add(c.id)); focusGroup = null; build(); alpha = 1; settled = false; touched = false; return; }
    if (e.target.closest("#reheat")) { nodes.forEach((n) => { n.x += (Math.random() - 0.5) * 80; n.y += (Math.random() - 0.5) * 80; }); alpha = 1; settled = false; touched = false; kick(); return; }
    if (e.target.closest("#obs-toggle")) { const p = $("#obs-panel", root); p.hidden = !p.hidden; set.open = !p.hidden; saveSet(set); e.target.setAttribute("aria-expanded", String(set.open)); }
  });
  // 그룹 목록 위에 올리면 그 개념만 밝게
  const groupsEl = $("#groups", root);
  groupsEl.addEventListener("mouseover", (e) => { const gb = e.target.closest("[data-group]"); if (gb && gb.dataset.group !== focusGroup) { focusGroup = gb.dataset.group; kick(); } });
  groupsEl.addEventListener("mouseleave", () => { focusGroup = null; kick(); });
  root.addEventListener("input", (e) => {
    const el = e.target;
    if (el.id === "gq") { query = el.value.trim().toLowerCase(); if (query) cl.concepts.forEach((c) => { if (c.members.some((id) => data.nodes.find((x) => x.id === id)?.title.toLowerCase().includes(query))) expanded.add(c.id); }); build(); return; }
    const k = el.dataset.set; if (!k) return;
    set[k] = el.type === "checkbox" ? el.checked : +el.value; saveSet(set);
    if (el.type === "checkbox") build(); else { if (["center", "repel", "link", "dist"].includes(k)) alpha = Math.max(alpha, 0.6); kick(); }
  });

  api.graph().then((d) => { data = d; cluster(); build(); for (let i = 0; i < 120; i++) step(); setTimeout(fit, 60); }).catch((e) => toast(e.message, "err"));
  return () => { cancelAnimationFrame(raf); ro.disconnect(); document.removeEventListener("keydown", onKey); document.removeEventListener("pointerdown", onDocDown, true); };
}
