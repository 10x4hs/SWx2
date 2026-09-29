// 그래프 — 옵시디언 그래프 뷰처럼. 노트 = 점, [[링크]] = 선, 제목이 점 아래에 보여요.
// AI가 정한 주제(없으면 첫 #태그)마다 색 한 가지. 마우스를 올리면 연결된 노트만 밝아지고, 누르면 열려요.
// 오른쪽 설정: 찾기 · 보기(태그/없는 노트/목차/외톨이) · 그룹 · 표시(글자·점·선) · 힘(당김·밀어냄).
import { api } from "../api.js";
import { $, esc, toast } from "../util.js";
import { openByTitle } from "./notes.js";

const GROUP_VARS = ["--c-amber", "--c-green", "--c-blue", "--c-rose", "--c-violet", "--c-teal"];
const GROUP_EXTRA = ["#C9B26A", "#D48A74", "#8FA3B8", "#A7C47A"];
const SETTINGS_KEY = "trio-graph";
const DEFAULTS = { tags: false, ghosts: true, mocs: true, orphans: true, text: 13, node: 1, line: 1, pull: 1, push: 1, open: true };
const load = () => { try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}") }; } catch { return { ...DEFAULTS }; } };
const saveSet = (s) => { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch {} };

export function mount(root, ctx) {
  const set = load();
  root.innerHTML = `
    <div class="obs" id="obs">
      <canvas id="gc" aria-label="노트 연결 그래프"></canvas>
      <header class="obs-top">
        <nav class="seg nt-tabs obs-tabs" aria-label="노트 · 그래프"><a href="#/notes">노트</a><a href="#/graph" aria-current="page">그래프</a></nav>
        <h1 class="obs-title">Second Brain</h1>
        <p class="obs-stat" id="gstat"></p>
        <p class="obs-hint">끌어서 옮기기 · 휠로 확대 · 점에 마우스를 올리면 연결된 노트만 밝아져요 · 누르면 열기</p>
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
          <label class="rng">글자 크기<input type="range" min="10" max="18" step="1" data-set="text" value="${set.text}"></label>
          <label class="rng">점 크기<input type="range" min=".6" max="2" step=".1" data-set="node" value="${set.node}"></label>
          <label class="rng">선 두께<input type="range" min=".5" max="3" step=".1" data-set="line" value="${set.line}"></label>
        </section>
        <section><h2>힘</h2>
          <label class="rng">당기는 힘<input type="range" min=".3" max="2" step=".1" data-set="pull" value="${set.pull}"></label>
          <label class="rng">밀어내는 힘<input type="range" min=".3" max="2.5" step=".1" data-set="push" value="${set.push}"></label>
          <button type="button" class="btn sm ghost" id="reheat">다시 배치</button>
        </section>
      </aside>
      <div class="obs-tip" id="tip" hidden></div>
      <p class="obs-empty" id="empty" hidden>노트를 쓰고 <b>AI 정리</b>를 누르면 주제별로 모여요. <a href="#/notes">노트 쓰러 가기</a></p>
    </div>`;

  const canvas = $("#gc", root), g = canvas.getContext("2d");
  let W = 0, H = 0, dpr = 1, raf = 0, alpha = 1;
  const view = { x: 0, y: 0, k: 1 };
  let data = { nodes: [], edges: [] }, all = [], nodes = [], links = [], adj = new Map(), groups = [];
  let hover = null, drag = null, query = "", focusGroup = null;

  const cssVar = (n) => getComputedStyle(root).getPropertyValue(n).trim();
  let C = {};
  const readColors = () => {
    C = { ink: cssVar("--ink"), ink2: cssVar("--ink-2"), ink3: cssVar("--ink-3"), line: cssVar("--line-2"), bg: cssVar("--paper-solid"), node: cssVar("--ink-3") };
    groups.forEach((gr, i) => (gr.color = i < GROUP_VARS.length ? cssVar(GROUP_VARS[i]) : GROUP_EXTRA[(i - GROUP_VARS.length) % GROUP_EXTRA.length]));
  };

  // ---------- data → nodes/links (보기 설정에 따라 다시 만들어요) ----------
  function buildAll() {
    const byTitle = new Map(), keep = new Map(all.map((n) => [n.id, n]));
    const mk = (o) => { const old = keep.get(o.id); return old ? Object.assign(old, o, { deg: 0 }) : { x: (Math.random() - 0.5) * 400, y: (Math.random() - 0.5) * 400, vx: 0, vy: 0, deg: 0, ...o }; };
    const list = data.nodes.map((n) => {
      const tags = (n.tags || "").split(",").filter((t) => t && t.toLowerCase() !== "moc");
      const node = mk({ id: n.id, title: n.title, user_id: n.user_id, tags, moc: n.title.startsWith("MOC · "), group: n.topic || tags[0] || null });
      const k = n.title.toLowerCase(); if (!byTitle.has(k) || n.user_id === ctx.me.id) byTitle.set(k, node);
      return node;
    });
    const out = [...list], L = [];
    for (const e of data.edges) {
      const s = list.find((x) => x.id === e.src_id); if (!s) continue;
      let t = byTitle.get(e.dst_title.toLowerCase());
      if (!t) { t = mk({ id: "ghost:" + e.dst_title.toLowerCase(), title: e.dst_title, ghost: true, group: s.group }); byTitle.set(e.dst_title.toLowerCase(), t); out.push(t); }
      if (t !== s) L.push({ s, t });
    }
    for (const n of list) for (const tg of n.tags) {
      const id = "tag:" + tg.toLowerCase();
      let t = out.find((x) => x.id === id);
      if (!t) { t = mk({ id, title: "#" + tg, tag: true, group: null }); out.push(t); }
      L.push({ s: n, t, tagLink: true });
    }
    all = out; data.links = L;
    // 그룹: 주제별 개수 (많은 순)
    const cnt = new Map(); list.forEach((n) => n.group && cnt.set(n.group, (cnt.get(n.group) || 0) + 1));
    groups = [...cnt].sort((a, b) => b[1] - a[1]).map(([key, count]) => ({ key, count, color: "" }));
    readColors();
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
    $("#gstat", root).textContent = real ? `노트 ${real}개 · 연결 ${links.filter((l) => !l.tagLink).length}개 · 주제 ${groups.length}개` : "";
    $("#empty", root).hidden = !!real;
    $("#groups", root).innerHTML = groups.length
      ? groups.map((gr, i) => `<li><button type="button" data-group="${i}" aria-pressed="${focusGroup === gr.key}"><i style="background:${gr.color}"></i><span>${esc(gr.key)}</span><b>${gr.count}</b></button></li>`).join("")
      : `<li class="faint" style="font-size:12.5px">노트 화면에서 <b>AI 정리</b>를 누르면 주제별 색이 생겨요.</li>`;
    alpha = Math.max(alpha, 0.5); kick();
  }

  const radius = (n) => ((n.ghost || n.tag) ? 3.2 : n.moc ? 7 + Math.sqrt(n.deg) * 1.6 : 4 + Math.sqrt(n.deg) * 1.9) * set.node;

  // ---------- 물리: 밀어냄 + 링크 스프링 + 주제끼리 살짝 모이기 + 가운데로 ----------
  function step() {
    const N = nodes.length, push = 1800 * set.push, rest = 70 / set.pull;
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
    for (const { s, t } of links) {
      const dx = t.x - s.x, dy = t.y - s.y, d = Math.sqrt(dx * dx + dy * dy) || 1, f = ((d - rest) / d) * 0.05 * set.pull * alpha;
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

  const match = (n) => query && n.title.toLowerCase().includes(query);
  function draw() {
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    g.translate(W / 2 + view.x, H / 2 + view.y); g.scale(view.k, view.k);
    const near = hover ? adj.get(hover) : null;
    const lit = (n) => (hover ? n === hover || near.has(n) : query ? match(n) : focusGroup ? n.group === focusGroup : true);
    // 선
    for (const l of links) {
      const on = hover && (l.s === hover || l.t === hover);
      g.globalAlpha = on ? 0.9 : (hover || query || focusGroup) ? 0.06 : l.tagLink ? 0.25 : 0.45;
      g.strokeStyle = on ? hover.color : C.line;
      g.lineWidth = ((on ? 1.6 : 1) * set.line) / view.k;
      g.beginPath(); g.moveTo(l.s.x, l.s.y); g.lineTo(l.t.x, l.t.y); g.stroke();
    }
    // 점
    for (const n of nodes) {
      const on = lit(n);
      g.globalAlpha = on ? 1 : 0.14;
      g.beginPath(); g.arc(n.x, n.y, radius(n), 0, Math.PI * 2);
      if (n.ghost) { g.fillStyle = C.bg; g.fill(); g.strokeStyle = C.ink3; g.lineWidth = 1.2 / view.k; g.stroke(); }
      else { g.fillStyle = n.color; g.fill(); }
      if (n === hover || (query && match(n))) { g.strokeStyle = C.ink; g.lineWidth = 2 / view.k; g.stroke(); }
    }
    // 제목 (옵시디언처럼: 확대하면 모두, 멀리서는 큰 노드·가리킨 노드만)
    const fs = set.text / Math.max(0.7, view.k);
    g.font = `500 ${fs}px -apple-system, "SF Pro Text", "Pretendard Variable", sans-serif`;
    g.textAlign = "center"; g.textBaseline = "top";
    for (const n of nodes) {
      const on = lit(n);
      const show = n === hover || (near && near.has(n)) || (query && match(n)) || view.k >= 0.9 || n.deg >= 4 || n.moc;
      if (!show) continue;
      g.globalAlpha = !on ? 0.12 : n === hover ? 1 : n.ghost || n.tag ? 0.6 : 0.88;
      g.fillStyle = n === hover ? C.ink : C.ink2;
      const t = n.title.length > 24 ? n.title.slice(0, 23) + "…" : n.title;
      g.fillText(t, n.x, n.y + radius(n) + 4 / view.k);
    }
    g.globalAlpha = 1;
  }

  function frame() { raf = 0; if (alpha > 0.004 || drag) step(); draw(); if (alpha > 0.004 || drag) raf = requestAnimationFrame(frame); }
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

  // ---------- 마우스 ----------
  const toWorld = (e) => { const r = canvas.getBoundingClientRect(); return { x: (e.clientX - r.left - W / 2 - view.x) / view.k, y: (e.clientY - r.top - H / 2 - view.y) / view.k }; };
  const hit = (p) => { let best = null, bd = Infinity; for (const n of nodes) { const d = Math.hypot(n.x - p.x, n.y - p.y); if (d < radius(n) + 6 / view.k && d < bd) { best = n; bd = d; } } return best; };
  const tip = $("#tip", root);
  function showTip(n, e) {
    if (!n) { tip.hidden = true; return; }
    const r = root.getBoundingClientRect();
    tip.hidden = false;
    tip.innerHTML = `<b>${esc(n.title)}</b><span>${n.ghost ? "아직 없는 노트 · 누르면 만들어요" : n.tag ? `태그 · 노트 ${n.deg}개` : `${n.group ? esc(n.group) + " · " : ""}연결 ${n.deg}개${n.tags?.length ? " · " + n.tags.slice(0, 3).map((t) => "#" + esc(t)).join(" ") : ""}`}</span>`;
    tip.style.transform = `translate(${e.clientX - r.left + 14}px, ${e.clientY - r.top + 14}px)`;
  }
  canvas.addEventListener("pointerdown", (e) => {
    canvas.setPointerCapture(e.pointerId);
    const n = hit(toWorld(e));
    drag = { node: n, sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y, moved: false };
    canvas.classList.add("dragging");
    if (n) { alpha = Math.max(alpha, 0.3); kick(); }
  });
  canvas.addEventListener("pointermove", (e) => {
    if (drag) {
      if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 4) drag.moved = true;
      if (drag.node) { const p = toWorld(e); drag.node.x = p.x; drag.node.y = p.y; alpha = Math.max(alpha, 0.2); }
      else { view.x = drag.vx + e.clientX - drag.sx; view.y = drag.vy + e.clientY - drag.sy; }
      kick(); return;
    }
    const n = hit(toWorld(e));
    if (n !== hover) { hover = n; canvas.style.cursor = n ? "pointer" : ""; kick(); }
    showTip(n, e);
  });
  canvas.addEventListener("pointerup", () => {
    const d = drag; drag = null; canvas.classList.remove("dragging");
    if (d && d.node && !d.moved) {
      if (d.node.tag) ctx.go("#/notes/tag/" + encodeURIComponent(d.node.title.slice(1)));
      else if (d.node.ghost) openByTitle(ctx, d.node.title);
      else ctx.go("#/notes/" + d.node.id);
    }
    kick();
  });
  canvas.addEventListener("pointerleave", () => { if (!drag) { hover = null; tip.hidden = true; kick(); } });
  const zoomAt = (k, mx = 0, my = 0) => { k = Math.max(0.25, Math.min(3.5, k)); view.x = mx - ((mx - view.x) * k) / view.k; view.y = my - ((my - view.y) * k) / view.k; view.k = k; kick(); };
  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    zoomAt(view.k * Math.exp(-e.deltaY * 0.0015), e.clientX - r.left - W / 2, e.clientY - r.top - H / 2);
  }, { passive: false });

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
    set[k] = el.type === "checkbox" ? el.checked : +el.value; saveSet(set);
    if (el.type === "checkbox") applyView(); else { if (k === "pull" || k === "push") alpha = Math.max(alpha, 0.6); kick(); }
  });

  const onTheme = () => { readColors(); applyView(); };
  const mo = new MutationObserver(onTheme); mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  api.graph().then((d) => { data = d; buildAll(); setTimeout(fit, 1400); }).catch((e) => toast(e.message, "err"));
  return () => { cancelAnimationFrame(raf); ro.disconnect(); mo.disconnect(); };
}
