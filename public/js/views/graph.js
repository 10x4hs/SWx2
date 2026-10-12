// 그래프 — 옵시디언 그래프 뷰처럼. 노트 = 빛나는 점, [[링크]] = 선.
// 한 번 누르면 고르고, 고른 채로 다른 점을 누르면 연결돼요(첫 노트 본문 끝 "## 연결"에 [[제목]]이 적혀요).
// 두 번 누르면 그 노트로 들어가요. 선 위에 마우스를 올리면 ✕ 가 떠서 끊을 수 있어요. 끌어서 옮기기, 휠로 확대.
import { api } from "../api.js";
import { $, esc, toast } from "../util.js";
import { openByTitle } from "./notes.js";
import { loadIndex } from "../papers/data.js";

// 논문 스프린트 노드(#논문스프린트): 두 번 누르면 노트 대신 공부 페이지로 (제목 → 논문 id)
let paperIds = null;
loadIndex().then((idx) => { paperIds = new Map(idx.papers.map((p) => [p.title.toLowerCase(), p.id])); }).catch(() => {});
const paperHash = (n) => {
  if (!n || n.tag || n.ghost || !paperIds) return null;
  const tagged = String(n.tags || "").split(",").includes("논문스프린트");
  if (!tagged) return null;
  if (n.title === "📄 논문 공부") return "#/papers";
  const id = paperIds.get(String(n.title).toLowerCase());
  return id ? "#/papers/" + id : null;
};

// 주제 색: 차분한 파스텔 (유리 구슬이라 너무 진하면 촌스러워요)
const PALETTE = ["#E9B872", "#8CC5B0", "#93A9E8", "#E39AA8", "#B9A3E6", "#84C6CC", "#D9C27A", "#E0A184", "#A7B6CB", "#B3CF8C"];
const SETTINGS_KEY = "trio-graph";
const DEFAULTS = { tags: false, ghosts: true, mocs: true, orphans: true, text: 11, node: 1, line: 1, pull: 1, push: 1, open: true, basis: "deg" };
const load = () => { try { const v = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}"); if (v.text === 13 && !v.textV2) { v.text = 11; v.textV2 = 1; } return { ...DEFAULTS, ...v }; } catch { return { ...DEFAULTS }; } };
const saveSet = (s) => { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch {} };
const DBL_MS = 280;
// 유리 구슬 이미지 (투명 PNG, 256px 안에 224px 구슬). 색은 그 아래 원으로 깔아요.
const ORB = new Image(); ORB.src = "/assets/graph/orb.png"; const ORB_K = 256 / 224;

export function mount(root, ctx) {
  const set = load();
  root.innerHTML = `
    <div class="obs" id="obs">
      <canvas id="gc" aria-label="노트 연결 그래프"></canvas>
      <header class="obs-top">
        <nav class="seg nt-tabs obs-tabs" aria-label="노트 · 그래프"><a href="#/notes">노트</a><a href="#/graph" aria-current="page">그래프</a></nav>
        <h1 class="obs-title">Second Brain</h1>
        <p class="obs-stat" id="gstat"></p>
        <p class="obs-hint" id="ghint">우클릭으로 새 노트·지우기 · 점을 누르고 다른 점을 누르면 연결 · 두 번 누르면 열기 · 선 위 ✕ 로 끊기</p>
      </header>
      <div class="obs-zoom" role="group" aria-label="확대">
        <button type="button" class="icon-btn" data-zoom="in" aria-label="확대">＋</button>
        <button type="button" class="icon-btn" data-zoom="out" aria-label="축소">−</button>
        <button type="button" class="icon-btn" data-zoom="fit" aria-label="전체 보기">⤢</button>
      </div>
      <button type="button" class="btn sm ghost obs-toggle" id="obs-toggle" aria-expanded="${set.open}">그래프 설정</button>
      <aside class="obs-panel glass" id="obs-panel" ${set.open ? "" : "hidden"} aria-label="그래프 설정">
        <section><h2>찾기</h2><input class="input" id="gq" placeholder="노트 제목으로 찾기" aria-label="노트 찾기"></section>
        <section><h2>보기</h2>
          <label class="chk"><input type="checkbox" data-set="tags" ${set.tags ? "checked" : ""}>태그를 점으로</label>
          <label class="chk"><input type="checkbox" data-set="ghosts" ${set.ghosts ? "checked" : ""}>아직 없는 노트</label>
          <label class="chk"><input type="checkbox" data-set="mocs" ${set.mocs ? "checked" : ""}>주제 목차(MOC)</label>
          <label class="chk"><input type="checkbox" data-set="orphans" ${set.orphans ? "checked" : ""}>연결 없는 노트</label>
        </section>
        <section><h2>그룹 <small>주제별 색</small></h2><ul class="obs-groups" id="groups"></ul></section>
        <section><h2>표시</h2>
          <label class="rng">글자 크기<input type="range" min="8" max="16" step="1" data-set="text" value="${set.text}"></label>
          <label class="rng">크기 기준<select class="select sm" data-set="basis"><option value="deg" ${set.basis !== "same" ? "selected" : ""}>연결 수</option><option value="same" ${set.basis === "same" ? "selected" : ""}>모두 같게</option></select></label>
          <label class="rng">점 크기<input type="range" min=".4" max="3" step=".1" data-set="node" value="${set.node}"></label>
          <label class="rng">선 두께<input type="range" min=".5" max="3" step=".1" data-set="line" value="${set.line}"></label>
        </section>
        <section><h2>힘</h2>
          <label class="rng">당기는 힘<input type="range" min=".3" max="2" step=".1" data-set="pull" value="${set.pull}"></label>
          <label class="rng">밀어내는 힘<input type="range" min=".3" max="2.5" step=".1" data-set="push" value="${set.push}"></label>
          <button type="button" class="btn sm ghost" id="reheat">다시 배치</button>
        </section>
      </aside>
      <div class="obs-tip" id="tip" hidden></div>
      <button type="button" class="obs-cut" id="cut" hidden aria-label="연결 끊기" title="연결 끊기">✕</button>
      <div class="obs-pop glass" id="pop" hidden role="dialog"></div>
      <div class="obs-sel glass" id="selbar" hidden>
        <span class="dot" id="sel-dot"></span><b id="sel-title"></b><span class="faint">→ 연결할 노트를 누르세요</span>
        <button type="button" class="btn sm ghost" id="sel-open">열기</button>
        <button type="button" class="btn sm ghost" id="sel-note" hidden>노트 열기</button>
        <button type="button" class="btn sm ghost danger-btn" id="sel-del" hidden>지우기</button>
        <button type="button" class="icon-btn sm" id="sel-x" aria-label="선택 취소">✕</button>
      </div>
      <div class="obs-menu glass" id="ctxmenu" hidden role="menu"></div>
      <form class="obs-new glass" id="newpop" hidden>
        <span class="faint">여기에 새 노트</span>
        <input class="input" id="new-title" placeholder="제목 · Enter" maxlength="120" aria-label="새 노트 제목" autocomplete="off">
        <label class="chk" id="new-link-row" hidden><input type="checkbox" id="new-link" checked><span id="new-link-t"></span></label>
        <div class="row" style="gap:6px;justify-content:flex-end"><button type="button" class="btn sm ghost" id="new-x">취소</button><button type="submit" class="btn sm accent">만들기</button></div>
      </form>
      <p class="obs-empty" id="empty" hidden>노트를 쓰고 <b>AI 정리</b>를 누르면 주제별로 모여요. <a href="#/notes">노트 쓰러 가기</a></p>
    </div>`;

  const canvas = $("#gc", root), g = canvas.getContext("2d");
  let W = 0, H = 0, dpr = 1, raf = 0, alpha = 1, t0 = performance.now();
  const view = { x: 0, y: 0, k: 1 };
  let data = { nodes: [], edges: [] }, all = [], nodes = [], links = [], adj = new Map(), groups = [];
  let hover = null, hoverLink = null, drag = null, query = "", focusGroup = null;
  let sel = null, lastTap = { node: null, at: 0 }, mouse = null, busy = false;

  const cssVar = (n) => getComputedStyle(root).getPropertyValue(n).trim();
  let C = {};
  const readColors = () => {
    C = { ink: cssVar("--ink"), ink2: cssVar("--ink-2"), ink3: cssVar("--ink-3"), line: cssVar("--line-2"), bg: cssVar("--paper-solid"), node: cssVar("--ink-2"), me: cssVar("--me") || cssVar("--ink") };
    C.dark = document.documentElement.dataset.theme !== "light" && !(document.documentElement.dataset.theme !== "dark" && matchMedia("(prefers-color-scheme: light)").matches);
    groups.forEach((gr, i) => (gr.color = PALETTE[i % PALETTE.length]));
  };

  // ---------- data → nodes/links ----------
  function buildAll() {
    const byTitle = new Map(), keep = new Map(all.map((n) => [n.id, n]));
    const mk = (o) => { const old = keep.get(o.id); return old ? Object.assign(old, o, { deg: 0 }) : { x: (Math.random() - 0.5) * 400, y: (Math.random() - 0.5) * 400, vx: 0, vy: 0, deg: 0, ...o }; };
    const list = data.nodes.map((n) => {
      const tags = (n.tags || "").split(",").filter((t) => t && t.toLowerCase() !== "moc");
      const node = mk({ id: n.id, title: n.title, user_id: n.user_id, tags, moc: n.title.startsWith("MOC · "), group: n.topic || tags[0] || null, parent_id: n.parent_id || null });
      const k = n.title.toLowerCase(); if (!byTitle.has(k) || n.user_id === ctx.me.id) byTitle.set(k, node);
      return node;
    });
    const out = [...list], L = [];
    for (const e of data.edges) {
      const s = list.find((x) => x.id === e.src_id); if (!s) continue;
      let t = byTitle.get(e.dst_title.toLowerCase());
      if (!t) { t = mk({ id: "ghost:" + e.dst_title.toLowerCase(), title: e.dst_title, ghost: true, group: s.group }); byTitle.set(e.dst_title.toLowerCase(), t); out.push(t); }
      if (t !== s && !L.some((l) => l.s === s && l.t === t)) L.push({ s, t });
    }
    // 페이지 트리(부모 › 자식)도 얇은 선으로
    for (const n of list) if (n.parent_id) { const p = list.find((x) => x.id === n.parent_id); if (p && !L.some((l) => (l.s === p && l.t === n) || (l.s === n && l.t === p))) L.push({ s: p, t: n, page: true }); }
    for (const n of list) for (const tg of n.tags) {
      const id = "tag:" + tg.toLowerCase();
      let t = out.find((x) => x.id === id);
      if (!t) { t = mk({ id, title: "#" + tg, tag: true, group: null }); out.push(t); }
      L.push({ s: n, t, tagLink: true });
    }
    all = out; data.links = L;
    const cnt = new Map(); list.forEach((n) => n.group && cnt.set(n.group, (cnt.get(n.group) || 0) + 1));
    groups = [...cnt].sort((a, b) => b[1] - a[1]).map(([key, count]) => ({ key, count, color: "" }));
    readColors();
    if (sel && !all.includes(sel)) select(null);
    applyView();
  }
  function applyView() {
    const shown = (n) => (!n.ghost || set.ghosts) && (!n.tag || set.tags) && (!n.moc || set.mocs);
    links = data.links.filter((l) => shown(l.s) && shown(l.t) && (!l.tagLink || set.tags));
    const deg = new Map(); links.forEach((l) => { deg.set(l.s, (deg.get(l.s) || 0) + 1); deg.set(l.t, (deg.get(l.t) || 0) + 1); });
    nodes = all.filter((n) => shown(n) && (set.orphans || deg.get(n)));
    nodes.forEach((n) => (n.deg = deg.get(n) || 0));
    adj = new Map(nodes.map((n) => [n, new Set()]));
    for (const l of links) { adj.get(l.s)?.add(l.t); adj.get(l.t)?.add(l.s); }
    const colorOf = new Map(groups.map((gr) => [gr.key, gr.color]));
    nodes.forEach((n) => (n.color = n.tag ? C.ink3 : n.ghost ? C.ink3 : colorOf.get(n.group) || C.node));
    const real = data.nodes.length;
    $("#gstat", root).textContent = real ? `노트 ${real}개 · 연결 ${links.filter((l) => !l.tagLink && !l.page).length}개 · 주제 ${groups.length}개` : "";
    $("#empty", root).hidden = !!real;
    $("#groups", root).innerHTML = groups.length
      ? groups.map((gr, i) => `<li><button type="button" data-group="${i}" aria-pressed="${focusGroup === gr.key}"><i style="background:${gr.color}"></i><span>${esc(gr.key)}</span><b>${gr.count}</b></button></li>`).join("")
      : `<li class="faint" style="font-size:12.5px">노트 화면에서 <b>AI 정리</b>를 누르면 주제별 색이 생겨요.</li>`;
    alpha = Math.max(alpha, 0.5); kick();
  }

  const radius = (n) => ((n.ghost || n.tag) ? 3 : set.basis === "same" ? (n.moc ? 6.5 : 5) : n.moc ? 7 + Math.sqrt(n.deg) * 1.8 : 4 + Math.sqrt(n.deg) * 1.8) * set.node; // 옵시디언처럼 작은 점

  // ---------- 물리 ----------
  function step() {
    const N = nodes.length, push = 2000 * set.push, rest = 78 / set.pull;
    for (let i = 0; i < N; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < N; j++) {
        const b = nodes[j];
        let dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy || 0.01;
        if (d2 > 250000) continue;
        const f = (push / d2) * alpha, d = Math.sqrt(d2); dx /= d; dy /= d;
        a.vx -= dx * f; a.vy -= dy * f; b.vx += dx * f; b.vy += dy * f;
      }
    }
    for (const { s, t, page } of links) {
      const dx = t.x - s.x, dy = t.y - s.y, d = Math.sqrt(dx * dx + dy * dy) || 1, f = ((d - (page ? rest * 0.7 : rest)) / d) * 0.05 * set.pull * alpha;
      s.vx += dx * f; s.vy += dy * f; t.vx -= dx * f; t.vy -= dy * f;
    }
    const centers = new Map();
    for (const n of nodes) if (n.group) { const c = centers.get(n.group) || { x: 0, y: 0, n: 0 }; c.x += n.x; c.y += n.y; c.n++; centers.set(n.group, c); }
    for (const n of nodes) {
      const c = n.group && centers.get(n.group);
      if (c && c.n > 1) { n.vx += (c.x / c.n - n.x) * 0.004 * alpha; n.vy += (c.y / c.n - n.y) * 0.004 * alpha; }
      n.vx -= n.x * 0.004 * alpha; n.vy -= n.y * 0.004 * alpha;
      if (n === drag?.node) { n.vx = n.vy = 0; continue; }
      n.vx *= 0.8; n.vy *= 0.8; n.x += n.vx; n.y += n.vy;
    }
    alpha = Math.max(0, alpha * 0.985);
  }

  // ---------- 그리기 ----------
  const match = (n) => query && n.title.toLowerCase().includes(query);
  const rgba = (hex, a) => { const m = /^#?([0-9a-f]{6})$/i.exec((hex || "").trim()); if (!m) return hex; const v = parseInt(m[1], 16); return `rgba(${v >> 16},${(v >> 8) & 255},${v & 255},${a})`; };
  function draw() {
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    g.translate(W / 2 + view.x, H / 2 + view.y); g.scale(view.k, view.k);
    const focus = hover || sel;
    const near = focus ? adj.get(focus) : null;
    const dim = !!(focus || query || focusGroup);
    const lit = (n) => (focus ? n === focus || near?.has(n) : query ? match(n) : focusGroup ? n.group === focusGroup : true);
    // 선
    for (const l of links) {
      const on = focus && (l.s === focus || l.t === focus), isHL = l === hoverLink;
      g.globalAlpha = isHL ? 1 : on ? 0.8 : dim ? 0.06 : l.tagLink ? 0.2 : l.page ? 0.28 : 0.38;
      g.strokeStyle = on || isHL ? C.ink2 : C.line;
      g.lineWidth = ((isHL ? 2 : on ? 1.5 : l.page ? 0.8 : 1.1) * set.line) / view.k;
      g.setLineDash(l.page ? [3 / view.k, 4 / view.k] : []);
      g.beginPath(); g.moveTo(l.s.x, l.s.y); g.lineTo(l.t.x, l.t.y); g.stroke();
    }
    g.setLineDash([]);
    // 고른 점 → 마우스로 이어지는 점선
    if (sel && mouse && hover !== sel) {
      g.globalAlpha = 0.6; g.strokeStyle = C.ink; g.lineWidth = 1.2 / view.k; g.setLineDash([5 / view.k, 5 / view.k]);
      g.beginPath(); g.moveTo(sel.x, sel.y); g.lineTo(mouse.x, mouse.y); g.stroke(); g.setLineDash([]);
    }
    // 점: 단색 원 하나. 고른 점·올린 점만 얇은 고리
    for (const n of nodes) {
      const on = lit(n), r = radius(n), col = n.color || C.node;
      g.globalAlpha = on ? 1 : 0.12;
      g.beginPath(); g.arc(n.x, n.y, r, 0, Math.PI * 2);
      if (n.ghost) { g.fillStyle = C.bg; g.fill(); g.strokeStyle = C.ink3; g.lineWidth = 1.2 / view.k; g.setLineDash([2 / view.k, 2 / view.k]); g.stroke(); g.setLineDash([]); }
      else if (n.tag) { g.fillStyle = C.ink3; g.fill(); }
      else { g.fillStyle = col; g.fill(); } // 옵시디언처럼 납작한 점
      if (n === hover || n === sel || (query && match(n))) { // 얇은 고리 + 옅은 후광
        g.globalAlpha = 0.25; g.beginPath(); g.arc(n.x, n.y, r + 9 / view.k, 0, Math.PI * 2); g.fillStyle = col; g.fill();
        g.globalAlpha = 1; g.beginPath(); g.arc(n.x, n.y, r + 3.5 / view.k, 0, Math.PI * 2); g.strokeStyle = n === sel ? col : C.ink; g.lineWidth = 1.4 / view.k; g.stroke();
      }
    }
    // 제목
    const fs = set.text / Math.max(0.7, view.k);
    g.font = `450 ${fs}px -apple-system, "SF Pro Text", "Pretendard Variable", sans-serif`;
    g.textAlign = "center"; g.textBaseline = "top";
    for (const n of nodes) {
      const on = lit(n);
      const show = n === hover || n === sel || (near && near.has(n)) || (query && match(n)) || view.k >= 0.9 || n.deg >= 4 || n.moc;
      if (!show) continue;
      const t = n.title.length > 24 ? n.title.slice(0, 23) + "…" : n.title;
      const y = n.y + radius(n) + 6 / view.k;
      g.globalAlpha = !on ? 0.12 : n === hover || n === sel ? 1 : n.ghost || n.tag ? 0.6 : 0.8;
      g.lineWidth = 3 / view.k; g.strokeStyle = C.bg; g.lineJoin = "round"; g.strokeText(t, n.x, y); // 글자 뒤 배경색 테두리로 선과 겹쳐도 읽히게
      g.fillStyle = n === hover || n === sel ? C.ink : C.ink2;
      g.fillText(t, n.x, y);
    }
    g.globalAlpha = 1;
  }

  function frame() { raf = 0; const live = alpha > 0.004 || drag; if (alpha > 0.004 || drag) step(); draw(); if (live) raf = requestAnimationFrame(frame); }
  const kick = () => { if (!raf) raf = requestAnimationFrame(frame); };

  function fit() {
    if (!nodes.length) return;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const n of nodes) { x0 = Math.min(x0, n.x); y0 = Math.min(y0, n.y); x1 = Math.max(x1, n.x); y1 = Math.max(y1, n.y); }
    const pw = set.open && W > 900 ? 300 : 0;
    const k = Math.max(0.3, Math.min(2.2, Math.min((W - pw - 120) / (x1 - x0 + 1), (H - 200) / (y1 - y0 + 1))));
    view.k = k; view.x = -((x0 + x1) / 2) * k - pw / 2; view.y = -((y0 + y1) / 2) * k + 20; kick();
  }
  function resize() {
    const r = canvas.getBoundingClientRect(); dpr = Math.min(2, devicePixelRatio || 1);
    W = r.width; H = r.height; canvas.width = W * dpr; canvas.height = H * dpr; kick();
  }
  const ro = new ResizeObserver(resize); ro.observe(canvas);
  if (!ORB.complete) ORB.addEventListener("load", () => kick(), { once: true });
  // 자동 테스트용: 화면 좌표로 점 위치 (데이터는 이미 화면에 다 보이는 것)
  canvas.__nodes = () => nodes.map((n) => ({ id: n.id, title: n.title, ghost: !!n.ghost, x: W / 2 + view.x + n.x * view.k, y: H / 2 + view.y + n.y * view.k }));

  // ---------- 고르기 · 연결 · 열기 ----------
  const selbar = $("#selbar", root), pop = $("#pop", root), hint = $("#ghint", root);
  function select(n) {
    sel = n && !n.tag ? n : null;
    selbar.hidden = !sel;
    $("#sel-del", root).hidden = !(sel && !sel.ghost && sel.user_id === ctx.me.id);
    const isPaper = !!(sel && paperHash(sel));
    $("#sel-open", root).textContent = isPaper ? "공부 페이지" : "열기";
    $("#sel-note", root).hidden = !isPaper;
    if (sel) { $("#sel-title", root).textContent = sel.title; $("#sel-dot", root).style.setProperty("--c", sel.color); hint.textContent = isPaper ? "두 번 누르면 공부 페이지(설명 · 그림 · 퀴즈) · 내 정리 노트는 '노트 열기'" : "다른 점을 누르면 이어져요 · 빈 곳 우클릭으로 이어진 새 노트 · 다시 누르면 취소 · 두 번 누르면 열기"; }
    else hint.textContent = "우클릭으로 새 노트·지우기 · 점을 누르고 다른 점을 누르면 연결 · 두 번 누르면 열기 · 선 위 ✕ 로 끊기";
    kick();
  }
  function openNode(n) {
    select(null); pop.hidden = true;
    const ph = paperHash(n);
    if (ph) ctx.go(ph); // 논문 노드 → 공부 페이지 (노트 자체는 선택 띠의 '노트 열기'로)
    else if (n.tag) ctx.go("#/notes/tag/" + encodeURIComponent(n.title.slice(1)));
    else if (n.ghost) openByTitle(ctx, n.title);
    else ctx.go("#/notes/" + n.id);
  }
  async function reload(keepSel) {
    const d = await api.graph(); data = d; buildAll();
    if (keepSel) { const again = all.find((n) => n.id === keepSel.id); if (again) select(again); }
    ctx.refreshSide?.();
  }
  async function connect(a, b) {
    if (busy || a === b) return;
    if (a.ghost && b.ghost) return toast("아직 없는 노트끼리는 이을 수 없어요.", "err");
    const [src, dst] = a.ghost ? [b, a] : [a, b]; // 없는 노트가 골라졌으면 반대 방향으로 적어요
    if (adj.get(a)?.has(b)) { const l = links.find((x) => (x.s === a && x.t === b) || (x.s === b && x.t === a)); select(null); if (l && !l.page && mouse) return showLinkPop(l, { clientX: canvas.getBoundingClientRect().left + W / 2 + view.x + b.x * view.k, clientY: canvas.getBoundingClientRect().top + H / 2 + view.y + b.y * view.k }); return toast("이미 이어져 있어요."); }
    busy = true;
    try {
      const r = await api.linkNote(src.id, dst.title);
      toast(r.added ? `${src.title} → ${dst.title} 연결했어요.` : "이미 이어져 있어요.");
      await reload(null); select(null);
    } catch (e) { toast(e.message, "err"); }
    finally { busy = false; }
  }
  function showLinkPop(l, e) {
    const r = root.getBoundingClientRect();
    pop.hidden = false;
    pop.innerHTML = `<div class="obs-pop-t"><i style="background:${l.s.color}"></i>${esc(l.s.title)}<span class="faint"> → </span><i style="background:${l.t.color}"></i>${esc(l.t.title)}</div>
      ${l.page ? `<p class="faint">페이지 트리(상위 › 하위)라 선을 끊을 수 없어요. 노트 안에서 옮길 수 있어요.</p>` : `<p class="faint">이미 이어져 있어요.</p><div class="row" style="gap:6px"><button type="button" class="btn sm ghost" data-open="${esc(l.s.id)}">첫 노트 열기</button><button type="button" class="btn sm danger-btn" id="pop-unlink">연결 끊기</button></div>`}`;
    pop.style.left = Math.min(e.clientX - r.left + 12, r.width - 300) + "px";
    pop.style.top = Math.min(e.clientY - r.top + 12, r.height - 110) + "px";
    pop.dataset.src = l.s.id; pop.dataset.dst = l.t.title;
  }
  pop.addEventListener("click", async (e) => {
    const o = e.target.closest("[data-open]"); if (o) { pop.hidden = true; return ctx.go("#/notes/" + o.dataset.open); }
    if (e.target.closest("#pop-unlink")) {
      const src = pop.dataset.src, dst = pop.dataset.dst; pop.hidden = true;
      try { const r = await api.unlinkNote(src, dst); toast(r.removed ? "연결을 끊었어요." : "이미 끊겨 있어요."); await reload(sel); } catch (err) { toast(err.message, "err"); }
    }
  });
  $("#sel-x", root).addEventListener("click", () => select(null));
  // 지우기: 한 번 누르면 "정말?", 3초 안에 다시 누르면 지워요
  const delBtn = $("#sel-del", root);
  delBtn.addEventListener("click", async () => {
    if (!sel || sel.ghost) return;
    if (!delBtn.dataset.armed) { delBtn.dataset.armed = "1"; delBtn.textContent = "정말 지울까요?"; setTimeout(() => { if (delBtn.isConnected) { delete delBtn.dataset.armed; delBtn.textContent = "지우기"; } }, 3000); return; }
    const n = sel; delete delBtn.dataset.armed; delBtn.textContent = "지우기";
    try { await api.deleteNote(n.id); toast(`'${n.title}' 노트를 지웠어요.`); select(null); await reload(null); ctx.changed?.("notes"); } catch (e) { toast(e.message, "err"); }
  });
  // 빈 곳 클릭 → 새 노트
  const newpop = $("#newpop", root); let newAt = null;
  function openNew(e, p) {
    newAt = p; const r = root.getBoundingClientRect();
    newpop.hidden = false; newpop.style.left = Math.min(e.clientX - r.left + 10, r.width - 290) + "px"; newpop.style.top = Math.min(e.clientY - r.top + 10, r.height - 170) + "px";
    $("#new-link-row", root).hidden = !sel; if (sel) $("#new-link-t", root).textContent = `${sel.title} 와 연결`;
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
      try { d = await api.addNote({ title, body: `# ${title}\n\n` }); } catch (e) { if (e.status === 409) { toast("같은 제목의 노트가 이미 있어요.", "err"); return; } throw e; }
      if (from && !from.ghost) await api.linkNote(from.id, title);
      toast(from && !from.ghost ? `'${title}' 을 만들고 ${from.title} 와 이었어요.` : `'${title}' 노트를 만들었어요.`);
      select(null); await reload(null);
      const nn = all.find((n) => n.id === d.note?.id); if (nn && at) { nn.x = at.x; nn.y = at.y; nn.vx = nn.vy = 0; kick(); }
      ctx.changed?.("notes");
    } catch (err) { toast(err.message, "err"); }
    finally { busy = false; }
  });
  $("#sel-open", root).addEventListener("click", () => sel && openNode(sel));
  $("#sel-note", root).addEventListener("click", () => { if (sel && !sel.ghost) { const n = sel; select(null); ctx.go("#/notes/" + n.id); } });
  const onKey = (e) => { if (e.key === "Escape" && (sel || !pop.hidden || !newpop.hidden || !menu.hidden)) { select(null); pop.hidden = true; closeNew(); closeMenu(); } };
  document.addEventListener("keydown", onKey);

  // ---------- 마우스 ----------
  const toWorld = (e) => { const r = canvas.getBoundingClientRect(); return { x: (e.clientX - r.left - W / 2 - view.x) / view.k, y: (e.clientY - r.top - H / 2 - view.y) / view.k }; };
  const hit = (p) => { let best = null, bd = Infinity; for (const n of nodes) { const d = Math.hypot(n.x - p.x, n.y - p.y); if (d < radius(n) + 7 / view.k && d < bd) { best = n; bd = d; } } return best; };
  // 선 맞히기: 선에서 가장 가까운 거리
  function hitLink(p) {
    let best = null, bd = 8 / view.k;
    for (const l of links) { if (l.tagLink || l.page) continue; const d = distSeg(p, l.s.x, l.s.y, l.t.x, l.t.y); if (d < bd) { bd = d; best = l; } }
    return best;
  }
  // 선 위에 올리면 가운데에 ✕ (끊기)
  const cut = $("#cut", root); let cutLink = null;
  function showCut(l) {
    if (l === cutLink) return; cutLink = l;
    if (!l) { cut.hidden = true; return; }
    const mx = W / 2 + view.x + ((l.s.x + l.t.x) / 2) * view.k, my = H / 2 + view.y + ((l.s.y + l.t.y) / 2) * view.k;
    cut.hidden = false; cut.style.left = mx + "px"; cut.style.top = my + "px";
  }
  cut.addEventListener("pointerenter", () => { if (cutLink) { hoverLink = cutLink; kick(); } });
  cut.addEventListener("click", async () => {
    const l = cutLink; if (!l) return; showCut(null); hoverLink = null;
    try { const r = await api.unlinkNote(l.s.id, l.t.title); toast(r.removed ? `${l.s.title} — ${l.t.title} 연결을 끊었어요.` : "이미 끊겨 있어요."); await reload(sel); } catch (err) { toast(err.message, "err"); }
  });
  function distSeg(p, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1, L = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((p.x - x1) * dx + (p.y - y1) * dy) / L));
    return Math.hypot(p.x - (x1 + t * dx), p.y - (y1 + t * dy));
  }
  const tip = $("#tip", root);
  function showTip(n, e) {
    if (!n || n === sel) { tip.hidden = true; return; }
    const r = root.getBoundingClientRect();
    tip.hidden = false;
    tip.innerHTML = `<b>${esc(n.title)}</b><span>${n.ghost ? "아직 없는 노트 · 두 번 누르면 만들어요" : n.tag ? `태그 · 노트 ${n.deg}개` : `${n.group ? esc(n.group) + " · " : ""}연결 ${n.deg}개${n.tags?.length ? " · " + n.tags.slice(0, 3).map((t) => "#" + esc(t)).join(" ") : ""}`}</span>${sel && sel !== n ? `<em>누르면 ${esc(sel.title)} 와 이어져요</em>` : ""}`;
    tip.style.transform = `translate(${e.clientX - r.left + 14}px, ${e.clientY - r.top + 14}px)`;
  }
  canvas.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    canvas.setPointerCapture(e.pointerId);
    const p = toWorld(e), n = hit(p);
    drag = { node: n, sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y, moved: false, link: n ? null : hitLink(p) };
    canvas.classList.add("dragging");
  });
  canvas.addEventListener("pointermove", (e) => {
    mouse = toWorld(e);
    if (drag) {
      if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 4) drag.moved = true;
      if (drag.node) { drag.node.x = mouse.x; drag.node.y = mouse.y; if (drag.moved) alpha = Math.max(alpha, 0.2); }
      else { view.x = drag.vx + e.clientX - drag.sx; view.y = drag.vy + e.clientY - drag.sy; }
      showCut(null); kick(); return;
    }
    const n = hit(mouse), l = n ? null : hitLink(mouse);
    if (n !== hover || l !== hoverLink) { hover = n; hoverLink = l; canvas.style.cursor = n || l ? "pointer" : ""; kick(); }
    showCut(l); showTip(n, e);
    if (sel) kick();
  });
  canvas.addEventListener("pointerup", (e) => {
    const d = drag; drag = null; canvas.classList.remove("dragging");
    if (!d || d.moved) { kick(); return; }
    pop.hidden = true;
    const n = d.node;
    if (!n) { // 빈 곳 또는 선
      if (d.link) { closeNew(); showLinkPop(d.link, e); }
      else if (!newpop.hidden) closeNew();
      else select(null); // 새 노트는 우클릭으로
      return;
    }
    closeNew();
    // 바로 고르고 바로 잇기. 같은 점을 빠르게 두 번 누르면 열기.
    const nowT = performance.now(), dbl = lastTap.node === n && nowT - lastTap.at < DBL_MS;
    lastTap = { node: n, at: nowT };
    if (dbl) { lastTap = { node: null, at: 0 }; openNode(n); return; }
    if (n.tag) return openNode(n);
    if (!sel) return select(n);
    if (sel === n) return select(null);
    lastTap = { node: null, at: 0 }; // 이어 붙인 뒤 한 번 더 눌러도 열리지 않게
    connect(sel, n);
  });
  canvas.addEventListener("pointerleave", (e) => { mouse = null; if (!drag) { hover = null; tip.hidden = true; if (e.relatedTarget !== cut) { hoverLink = null; showCut(null); } kick(); } });
  cut.addEventListener("pointerleave", () => { hoverLink = null; showCut(null); kick(); });
  const zoomAt = (k, mx = 0, my = 0) => { showCut(null); k = Math.max(0.25, Math.min(3.5, k)); view.x = mx - ((mx - view.x) * k) / view.k; view.y = my - ((my - view.y) * k) / view.k; view.k = k; kick(); };
  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    zoomAt(view.k * Math.exp(-e.deltaY * 0.0015), e.clientX - r.left - W / 2, e.clientY - r.top - H / 2);
  }, { passive: false });

  // ---------- 우클릭 메뉴 ----------
  const menu = $("#ctxmenu", root);
  const closeMenu = () => { menu.hidden = true; };
  canvas.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    const p = toWorld(e), n = hit(p), r = root.getBoundingClientRect();
    closeNew(); pop.hidden = true; tip.hidden = true;
    const mine = n && !n.ghost && !n.tag && n.user_id === ctx.me.id;
    const items = n ? [
      ["open", n.ghost ? "만들어서 열기" : n.tag ? "태그 노트 보기" : "열기"],
      ...(!n.tag ? [["link", sel && sel !== n ? `${sel.title} 와 잇기` : "여기서 연결 시작"]] : []),
      ...(!n.tag && !n.ghost ? [["child", "이어진 새 노트"]] : []),
      ...(mine ? [["del", "지우기", "danger"]] : []),
    ] : [["new", sel ? `새 노트 (${sel.title} 와 이어서)` : "여기에 새 노트"], ...(sel ? [["new-free", "새 노트 (잇지 않고)"]] : []), ["fit", "전체 보기"]];
    menu.innerHTML = (n ? `<div class="obs-menu-t">${esc(n.title)}</div>` : "") + items.map(([k, l, c]) => `<button type="button" role="menuitem" data-m="${k}" class="${c || ""}">${esc(l)}</button>`).join("");
    menu.hidden = false;
    menu.style.left = Math.min(e.clientX - r.left, r.width - 210) + "px"; menu.style.top = Math.min(e.clientY - r.top, r.height - 40 - items.length * 34) + "px";
    menu._n = n; menu._p = p; menu._e = { clientX: e.clientX, clientY: e.clientY };
  });
  menu.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-m]"); if (!b) return;
    const k = b.dataset.m, n = menu._n, p = menu._p, ev = menu._e; closeMenu();
    if (k === "open") return openNode(n);
    if (k === "link") { if (sel && sel !== n) return connect(sel, n); return select(n); }
    if (k === "child") { select(n); return openNew(ev, { x: n.x + 60, y: n.y + 40 }); }
    if (k === "new") return openNew(ev, p);
    if (k === "new-free") { select(null); return openNew(ev, p); }
    if (k === "fit") return fit();
    if (k === "del") {
      if (!confirm(`'${n.title}' 노트를 지울까요? 되돌릴 수 없어요.`)) return;
      try { await api.deleteNote(n.id); toast(`'${n.title}' 노트를 지웠어요.`); if (sel === n) select(null); await reload(sel); ctx.changed?.("notes"); } catch (err) { toast(err.message, "err"); }
    }
  });
  document.addEventListener("pointerdown", (e) => { if (!menu.hidden && !menu.contains(e.target)) closeMenu(); }, true);

  // ---------- 설정 ----------
  root.addEventListener("click", (e) => {
    const z = e.target.closest("[data-zoom]");
    if (z) { if (z.dataset.zoom === "fit") fit(); else zoomAt(view.k * (z.dataset.zoom === "in" ? 1.25 : 0.8)); return; }
    const gb = e.target.closest("[data-group]");
    if (gb) { const key = groups[+gb.dataset.group].key; focusGroup = focusGroup === key ? null : key; applyView(); return; }
    if (e.target.closest("#reheat")) { all.forEach((n) => { n.x = (Math.random() - 0.5) * 400; n.y = (Math.random() - 0.5) * 400; }); alpha = 1; kick(); setTimeout(fit, 1600); return; }
    if (e.target.closest("#obs-toggle")) { const p = $("#obs-panel", root); p.hidden = !p.hidden; set.open = !p.hidden; saveSet(set); e.target.setAttribute("aria-expanded", String(set.open)); }
  });
  root.addEventListener("input", (e) => {
    const el = e.target;
    if (el.id === "gq") { query = el.value.trim().toLowerCase(); kick(); return; }
    const k = el.dataset.set; if (!k) return;
    set[k] = el.type === "checkbox" ? el.checked : el.tagName === "SELECT" ? el.value : +el.value; saveSet(set);
    if (el.type === "checkbox") applyView(); else { if (k === "pull" || k === "push") alpha = Math.max(alpha, 0.6); kick(); }
  });

  const onTheme = () => { readColors(); applyView(); };
  const mo = new MutationObserver(onTheme); mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  api.graph().then((d) => { data = d; buildAll(); setTimeout(fit, 1400); }).catch((e) => toast(e.message, "err"));
  return () => { cancelAnimationFrame(raf); ro.disconnect(); mo.disconnect(); document.removeEventListener("keydown", onKey); };
}
