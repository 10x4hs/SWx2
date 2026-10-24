// 옵시디언 그래프 뷰 같은 지식 그래프 (Study 탭마다 하나). 읽기 전용: 점을 누르면 그 내용으로 가요.
//   모양: 납작한 점 · 가는 선 · 마우스를 올리면 그 점과 이웃만 밝게 · 확대하면 이름이 서서히 · 오른쪽 설정 패널
//   mountGraph(host, { data: { nodes, links }, types, onOpen, onMenu?, prefs, savePrefs, empty })
//     nodes: [{ id, title, type, group?, sub? }]  links: [{ s, t, kind? }]  (s · t 는 node id)
//     types: { [type]: { label, color, tier: 0(가장 큼)~3 } } — 종류별 색 · 크기 · 보이기 필터
//     onMenu(node, e): 점 위에서 오른쪽 클릭 · 손가락으로 0.5초 누르기 (e = { clientX, clientY, preventDefault, hold? })
//   설정(prefs)은 계정에 저장돼요 (users.graph_prefs) — 크기 기준 · 노드 크기 · 글자 · 선 · 힘
import { esc } from "../util.js";

export const GRAPH_DEFAULTS = { basis: "deg", node: 1, text: 12, line: 1, fade: 1.2, center: 1, repel: 1, link: 1, dist: 1, open: true, hide: {} };
const TIER_R = [11, 7, 4.5, 3.2];

// onClick(node, e)?: 있으면 왼쪽 클릭이 열기 대신 이것 (두 번 빨리 누르면 열기) · onBlank(e)?: 빈 곳 왼쪽 클릭
// select: true = Obsidian(Brain) 방식 (2026-10-22) — 한 번 누르기 = 고르기(테두리) · 고른 채 다른 점 = onConnect(고른 점, 누른 점)
//   · 두 번 누르기 = onOpen (첫 번째 누르기는 고르기만 해서 연결이 생기지 않아요 — 연결은 두 번 누르기 시간(300ms)이 지난 뒤에 정해요)
//   · 빈 곳 누르기 = 고르기 풀기 · 오른쪽 클릭(폰은 길게): 점 = onMenu, 선 = onEdgeMenu(link, e), 빈 곳 = onBlankMenu(e, world)
//   · onSelect(node | null) · initial = { k, x, y, sel, pos } (돌아왔을 때 확대 · 위치 · 고른 점 그대로)
// 돌려주는 stop() 에 붙은 것: stop.state() · stop.setData(data, types?, spawn?) · stop.select(id) · stop.worldAt(clientX, clientY) · stop.screenOf(id)
// 관계 종류 (2026-10-24): edgeStyle(link) → { color, dash, label, arrow } | null — 선 색 · 점선 · 화살표(from → 다른 점). 이름표는 마우스를 올린 선 · 고른 점의 선에만
//   legend: [{ label, color, dash }] → 설정 패널 '관계' 칸
export function mountGraph(host, { data, types, onOpen, onMenu, onClick, onBlank, prefs: p0, savePrefs, empty, scope = "", select = false, onSelect, onConnect, onEdgeMenu, onBlankMenu, initial = null, edgeStyle = null, legend = null }) {
  let lastTap = { n: null, t: 0 };
  const DBL = 300;
  const P = { ...GRAPH_DEFAULTS, open: innerWidth > 760, ...(p0 || {}) }; // 폰은 설정 패널을 접고 시작해요
  const hidden = () => new Set(P.hide?.[scope] || []);
  host.innerHTML = `
    <div class="og">
      <canvas class="og-c" aria-label="지식 그래프 · 점을 누르면 그 내용으로 가요"></canvas>
      <div class="og-stat" data-stat></div>
      <div class="og-zoom" role="group" aria-label="확대"><button type="button" data-z="in" aria-label="확대">＋</button><button type="button" data-z="out" aria-label="축소">−</button><button type="button" data-z="fit" aria-label="전체 보기">⤢</button></div>
      <button type="button" class="og-toggle" data-toggle aria-expanded="${P.open}" title="그래프 설정">⚙︎</button>
      <aside class="og-panel" data-panel ${P.open ? "" : "hidden"} aria-label="그래프 설정">
        <details open><summary>필터</summary>
          <input class="og-q" data-q type="search" placeholder="찾기…" aria-label="점 찾기">
          <div data-types></div>
          <label class="og-chk"><input type="checkbox" data-orph ${P.orphans === false ? "" : "checked"}>연결 없는 점</label>
        </details>
        <details open><summary>그룹</summary><ul class="og-groups" data-groups></ul></details>
        <details open><summary>표시</summary>
          <label class="og-row">크기 기준<select data-p="basis"><option value="deg">연결 수</option><option value="tier">종류별 (큰 묶음 → 용어)</option><option value="same">모두 같게</option></select></label>
          <label class="og-row">노드 크기<input type="range" min=".4" max="3" step=".1" data-p="node"><output></output></label>
          <label class="og-row">글자 크기<input type="range" min="8" max="20" step="1" data-p="text"><output></output></label>
          <label class="og-row">선 두께<input type="range" min=".3" max="3" step=".1" data-p="line"><output></output></label>
          <label class="og-row">이름 보이는 확대<input type="range" min=".2" max="2.5" step=".1" data-p="fade"><output></output></label>
        </details>
        ${legend?.length ? `<details open class="og-legend"><summary>관계</summary><ul>${legend.map((l) => `<li><svg width="28" height="8" aria-hidden="true"><line x1="1" y1="4" x2="27" y2="4" stroke="${esc(l.color)}" stroke-width="2"${l.dash ? ` stroke-dasharray="${l.dash.join(" ")}"` : ""}/></svg>${esc(l.label)}</li>`).join("")}<li class="og-legend-ai"><b>AI</b> AI 가 정한 관계 · 우클릭으로 바꿔요</li></ul></details>` : ""}
        <details><summary>힘</summary>
          <label class="og-row">가운데로 모이는 힘<input type="range" min="0" max="3" step=".1" data-p="center"><output></output></label>
          <label class="og-row">밀어내는 힘<input type="range" min=".2" max="3" step=".1" data-p="repel"><output></output></label>
          <label class="og-row">선이 당기는 힘<input type="range" min=".2" max="3" step=".1" data-p="link"><output></output></label>
          <label class="og-row">선 길이<input type="range" min=".3" max="3" step=".1" data-p="dist"><output></output></label>
          <button type="button" class="og-btn" data-reheat>다시 배치</button>
        </details>
      </aside>
      <div class="og-tip" data-tip hidden></div>
      <p class="og-empty" data-empty hidden>${esc(empty || "아직 그래프로 그릴 내용이 없어요.")}</p>
    </div>`;
  const $ = (s) => host.querySelector(s);
  const canvas = $(".og-c"), g = canvas.getContext("2d");
  let W = 0, H = 0, dpr = 1, raf = 0, alpha = 1, alive = true;
  const view = { x: 0, y: 0, k: 1 };
  let hover = null, pinned = null, drag = null, pan = null, query = "", focusType = null, moved = false, sel = null, pendT = 0, hoverEdge = null;

  // ---------- 데이터 ----------
  let byId = new Map();
  const saved = initial?.pos || {};
  let all = data.nodes.map((n, i) => { const a = i * 2.39996, r = 14 * Math.sqrt(i + 1), sp = saved[n.id]; const o = { ...n, x: sp ? sp[0] : Math.cos(a) * r, y: sp ? sp[1] : Math.sin(a) * r, vx: 0, vy: 0, deg: 0 }; byId.set(n.id, o); return o; }); // 해바라기 씨앗처럼 고르게 퍼진 원에서 시작
  const linksOf = (d) => (d.links || []).map((l) => ({ ...l, s: byId.get(l.s), t: byId.get(l.t), st: edgeStyle ? edgeStyle(l) : null })).filter((l) => l.s && l.t && l.s !== l.t);
  let allLinks = linksOf(data);
  let nodes = [], links = [], adj = new Map();
  function apply(heat = 0.6) {
    const hide = hidden(), orph = P.orphans !== false;
    const vis = (n) => !hide.has(n.type);
    links = allLinks.filter((l) => vis(l.s) && vis(l.t));
    const deg = new Map(); links.forEach((l) => { deg.set(l.s, (deg.get(l.s) || 0) + 1); deg.set(l.t, (deg.get(l.t) || 0) + 1); });
    nodes = all.filter((n) => vis(n) && (orph || deg.get(n)));
    nodes.forEach((n) => (n.deg = deg.get(n) || 0));
    adj = new Map(nodes.map((n) => [n, new Set()]));
    links.forEach((l) => { adj.get(l.s)?.add(l.t); adj.get(l.t)?.add(l.s); });
    $("[data-stat]").textContent = `${nodes.length} node${nodes.length === 1 ? "" : "s"} · ${links.length} link${links.length === 1 ? "" : "s"}`;
    $("[data-empty]").hidden = all.length > 0;
    drawGroups();
    alpha = Math.max(alpha, heat); kick();
  }
  const typeOf = (n) => types[n.type] || { label: n.type, color: "#9aa0a6", tier: 2 };
  const radius = (n) => {
    if (n.size) return n.size * P.node; // 호출한 쪽이 크기를 정했으면 그대로 (Brain: 하위 개수)
    const b = P.basis === "same" ? 4.5 : P.basis === "tier" ? TIER_R[typeOf(n).tier ?? 2] : 3 + Math.sqrt(n.deg) * 1.9;
    return Math.max(1.5, b * P.node);
  };

  // ---------- 패널 ----------
  function drawTypes() {
    const hide = hidden(), cnt = new Map(); all.forEach((n) => cnt.set(n.type, (cnt.get(n.type) || 0) + 1));
    $("[data-types]").innerHTML = Object.entries(types).filter(([k]) => cnt.get(k)).map(([k, t]) => `<label class="og-chk"><input type="checkbox" data-type="${esc(k)}" ${hide.has(k) ? "" : "checked"}><i style="background:${t.color}"></i>${esc(t.label)} <small>${cnt.get(k)}</small></label>`).join("");
  }
  function drawGroups() {
    const cnt = new Map(); nodes.forEach((n) => cnt.set(n.type, (cnt.get(n.type) || 0) + 1));
    $("[data-groups]").innerHTML = Object.entries(types).filter(([k]) => cnt.get(k)).map(([k, t]) => `<li><button type="button" data-focus="${esc(k)}" aria-pressed="${focusType === k}"><i style="background:${t.color}"></i>${esc(t.label)}<b>${cnt.get(k)}</b></button></li>`).join("");
  }
  const outs = () => host.querySelectorAll("[data-p]").forEach((el) => { if (el.tagName === "SELECT") el.value = P[el.dataset.p]; else { el.value = P[el.dataset.p]; const o = el.nextElementSibling; if (o?.tagName === "OUTPUT") o.textContent = el.dataset.p === "text" ? P.text + "px" : "×" + (+P[el.dataset.p]).toFixed(1); } });
  let saveT = 0;
  const persist = () => { clearTimeout(saveT); saveT = setTimeout(() => savePrefs?.({ ...P }), 500); };
  host.addEventListener("input", (e) => {
    const el = e.target;
    if (el.dataset.p) { P[el.dataset.p] = el.tagName === "SELECT" ? el.value : +el.value; outs(); if (["center", "repel", "link", "dist"].includes(el.dataset.p)) alpha = Math.max(alpha, 0.5); kick(); persist(); }
    if (el.dataset.q !== undefined) { query = el.value.trim().toLowerCase(); kick(); }
  });
  host.addEventListener("change", (e) => {
    const el = e.target;
    if (el.dataset.type) { const h = hidden(); el.checked ? h.delete(el.dataset.type) : h.add(el.dataset.type); P.hide = { ...(P.hide || {}), [scope]: [...h] }; apply(); persist(); }
    if (el.dataset.orph !== undefined) { P.orphans = el.checked; apply(); persist(); }
  });
  host.addEventListener("click", (e) => {
    const f = e.target.closest("[data-focus]"); if (f) { focusType = focusType === f.dataset.focus ? null : f.dataset.focus; drawGroups(); kick(); }
    if (e.target.closest("[data-reheat]")) { alpha = 1; settledFit = false; touched = false; all.forEach((n) => { n.x += (Math.random() - 0.5) * 60; n.y += (Math.random() - 0.5) * 60; }); kick(); }
    const z = e.target.closest("[data-z]"); if (z) { if (z.dataset.z === "fit") fit(); else zoomAt(W / 2, H / 2, z.dataset.z === "in" ? 1.25 : 0.8); }
    if (e.target.closest("[data-toggle]")) { P.open = !P.open; $("[data-panel]").hidden = !P.open; $("[data-toggle]").setAttribute("aria-expanded", String(P.open)); persist(); }
  });

  // ---------- 물리 ----------
  function step() {
    const N = nodes.length, rep = 900 * P.repel, rest = 46 * P.dist, kl = 0.06 * P.link, kc = 0.006 * P.center;
    for (const n of nodes) n.r = radius(n);
    for (let i = 0; i < N; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < N; j++) {
        const b = nodes[j]; let dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy || 0.01;
        if (d2 > 640000) continue;
        const d = Math.sqrt(d2); dx /= d; dy /= d;
        let f = (rep / d2) * alpha;
        const gap = a.r + b.r + 3 - d; if (gap > 0) f += gap * 0.25; // 부딪히면 겹치지 않게 밀어요
        a.vx -= dx * f; a.vy -= dy * f; b.vx += dx * f; b.vy += dy * f;
      }
    }
    for (const { s, t } of links) { const dx = t.x - s.x, dy = t.y - s.y, d = Math.sqrt(dx * dx + dy * dy) || 1, f = ((d - rest - s.r - t.r) / d) * kl * alpha; s.vx += dx * f; s.vy += dy * f; t.vx -= dx * f; t.vy -= dy * f; }
    for (const n of nodes) {
      n.vx -= n.x * kc * alpha; n.vy -= n.y * kc * alpha;
      if (n === drag?.node) { n.vx = n.vy = 0; continue; }
      n.vx *= 0.82; n.vy *= 0.82; n.x += n.vx; n.y += n.vy;
    }
    alpha = Math.max(0, alpha * 0.982);
  }

  // ---------- 그리기 ----------
  const css = (v) => getComputedStyle(host).getPropertyValue(v).trim();
  function draw() {
    const ink = css("--ink") || "#ddd", ink2 = css("--ink-2") || "#aaa", line = css("--line-2") || "#555", accent = css("--og-accent") || "#8b7cf6";
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    g.translate(W / 2 + view.x, H / 2 + view.y); g.scale(view.k, view.k);
    const focus = hover || sel || pinned, near = focus ? adj.get(focus) : null;
    const lit = (n) => (focus ? n === focus || near?.has(n) : query ? n.title.toLowerCase().includes(query) : focusType ? n.type === focusType : true);
    const dim = !!(focus || query || focusType);
    const named = []; // 이름표를 달 선 (마우스를 올린 선 · 고른 점의 선)
    for (const l of links) {
      const on = (focus && (l.s === focus || l.t === focus)) || l === hoverEdge, st = l.st;
      g.globalAlpha = on ? 0.95 : dim ? 0.05 : st ? 0.62 : 0.32;
      g.strokeStyle = st ? st.color : on ? accent : line; g.lineWidth = ((on ? 1.4 : st ? 1.1 : 0.8) * P.line * Math.min(4, Math.sqrt(l.w || 1))) / view.k; // w = 묶인 연결 수
      if (st?.dash) g.setLineDash(st.dash.map((x) => (x * 1.4) / view.k));
      g.beginPath(); g.moveTo(l.s.x, l.s.y); g.lineTo(l.t.x, l.t.y); g.stroke();
      if (st?.dash) g.setLineDash([]);
      if (st?.arrow) { // 화살표: from → 다른 점, 그 점 테두리 바로 앞
        const [a, b] = l.from === l.t.id ? [l.t, l.s] : [l.s, l.t], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
        const tipR = radius(b) + 2 / view.k, hx = b.x - ux * tipR, hy = b.y - uy * tipR, s2 = 5.5 / view.k;
        if (d > tipR + s2 * 2) { g.fillStyle = st.color; g.beginPath(); g.moveTo(hx, hy); g.lineTo(hx - ux * s2 * 1.6 - uy * s2, hy - uy * s2 * 1.6 + ux * s2); g.lineTo(hx - ux * s2 * 1.6 + uy * s2, hy - uy * s2 * 1.6 - ux * s2); g.closePath(); g.fill(); }
      }
      if (on && st?.label) named.push(l);
    }
    for (const n of nodes) {
      const on = lit(n), r = radius(n);
      g.globalAlpha = on ? 1 : 0.14;
      g.beginPath(); g.arc(n.x, n.y, r, 0, Math.PI * 2);
      g.fillStyle = n === focus ? accent : typeOf(n).color; g.fill();
    }
    if (sel && nodes.includes(sel)) { // 고른 점: 바깥 테두리
      g.globalAlpha = 1; g.strokeStyle = accent; g.lineWidth = 2.2 / view.k;
      g.beginPath(); g.arc(sel.x, sel.y, radius(sel) + 4.5 / view.k, 0, Math.PI * 2); g.stroke();
    }
    // 이름: 확대가 '이름 보이는 확대' 를 넘으면 서서히, 고른 점 · 이웃 · 찾은 점은 늘
    const fs = P.text / Math.max(0.6, view.k), fadeIn = Math.max(0, Math.min(1, (view.k - P.fade) / 0.4 + 0.15));
    g.font = `500 ${fs}px -apple-system, "SF Pro Text", "Pretendard Variable", sans-serif`; g.textAlign = "center"; g.textBaseline = "top";
    for (const n of nodes) {
      const special = n === focus || near?.has(n) || (query && n.title.toLowerCase().includes(query)) || (typeOf(n).tier === 0 && !dim) || (nodes.length <= 40 && !dim); // 점이 적으면 이름을 다 보여요
      const a = special ? 1 : lit(n) ? fadeIn * (dim ? 0.15 : 0.85) : 0;
      if (a < 0.03) continue;
      const t = n.title.length > 28 ? n.title.slice(0, 27) + "…" : n.title;
      g.globalAlpha = a; g.fillStyle = n === focus ? ink : ink2;
      g.fillText(t, n.x, n.y + radius(n) + 4 / view.k);
    }
    // 관계 이름표: 선 가운데 작은 띠
    if (named.length) {
      const fs2 = 11 / view.k, bg = css("--paper-solid") || css("--bg") || "#111";
      g.font = `600 ${fs2}px -apple-system, "SF Pro Text", "Pretendard Variable", sans-serif`; g.textBaseline = "middle";
      for (const l of named) {
        const mx = (l.s.x + l.t.x) / 2, my = (l.s.y + l.t.y) / 2, tw = g.measureText(l.st.label).width, px = 5 / view.k, h2 = fs2 * 0.8;
        g.globalAlpha = 0.92; g.fillStyle = bg; g.beginPath(); g.roundRect?.(mx - tw / 2 - px, my - h2, tw + px * 2, h2 * 2, 4 / view.k); if (!g.roundRect) g.rect(mx - tw / 2 - px, my - h2, tw + px * 2, h2 * 2); g.fill();
        g.globalAlpha = 1; g.fillStyle = l.st.color || ink; g.fillText(l.st.label, mx, my);
      }
    }
    g.globalAlpha = 1;
  }
  let touched = false, settledFit = false;
  function frame() { raf = 0; if (!alive) return; const live = alpha > 0.003 || drag; if (live) step(); if (!touched && !settledFit && alpha < 0.03) { settledFit = true; fit(); } draw(); if (live) raf = requestAnimationFrame(frame); }
  const kick = () => { if (!raf && alive) raf = requestAnimationFrame(frame); };
  function fit() {
    if (!nodes.length) return;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const n of nodes) { const r = radius(n) + 14; x0 = Math.min(x0, n.x - r); y0 = Math.min(y0, n.y - r); x1 = Math.max(x1, n.x + r); y1 = Math.max(y1, n.y + r + 16); } // 점 크기 · 이름까지 화면 안에
    const pw = P.open && W > 760 ? 260 : 0;
    view.k = Math.max(0.15, Math.min(2.5, Math.min((W - pw - 60) / (x1 - x0 + 1), (H - 60) / (y1 - y0 + 1))));
    view.x = -((x0 + x1) / 2) * view.k - pw / 2; view.y = -((y0 + y1) / 2) * view.k; kick();
  }
  function zoomAt(sx, sy, f) {
    const k = Math.max(0.1, Math.min(6, view.k * f)), wx = (sx - W / 2 - view.x) / view.k, wy = (sy - H / 2 - view.y) / view.k;
    view.k = k; view.x = sx - W / 2 - wx * k; view.y = sy - H / 2 - wy * k; kick();
  }
  function resize() { const r = canvas.getBoundingClientRect(); dpr = Math.min(2, devicePixelRatio || 1); W = r.width; H = r.height; canvas.width = W * dpr; canvas.height = H * dpr; kick(); }
  const ro = new ResizeObserver(resize); ro.observe(canvas);

  // ---------- 손 · 마우스 ----------
  const world = (e) => { const r = canvas.getBoundingClientRect(); return { sx: e.clientX - r.left, sy: e.clientY - r.top, x: (e.clientX - r.left - W / 2 - view.x) / view.k, y: (e.clientY - r.top - H / 2 - view.y) / view.k }; };
  const hit = (w) => { let best = null, bd = Infinity; for (const n of nodes) { const d = Math.hypot(n.x - w.x, n.y - w.y), r = radius(n) + 6 / view.k; if (d < r && d < bd) { best = n; bd = d; } } return best; };
  const tip = $("[data-tip]");
  const showTip = (n, w) => { if (!n) { tip.hidden = true; return; } tip.hidden = false; tip.innerHTML = `<i style="background:${typeOf(n).color}"></i><b>${esc(n.title)}</b><small>${esc(typeOf(n).label)}${n.sub ? " · " + esc(n.sub) : ""} · 연결 ${n.deg}</small>`; tip.style.left = Math.min(w.sx + 14, W - 260) + "px"; tip.style.top = Math.max(8, w.sy - 10) + "px"; };
  // 메뉴: 손가락은 점을 0.5초 누르고 있으면(10px 안에서) — 그 뒤 손을 떼도 열기 · 고르기는 안 해요 (held)
  let hold = 0, held = false, x0 = 0, y0 = 0;
  const side = (e) => e.button > 0 || (e.ctrlKey && e.pointerType === "mouse" && /Mac/.test(navigator.platform)); // 맥은 Ctrl+클릭도 오른쪽 클릭
  const menu = (n, e, touch) => {
    clearTimeout(hold); hold = 0;
    if (touch) { held = true; drag = null; }
    hover = null; showTip(null); kick();
    onMenu(n, e);
  };
  // 선 찾기: 점에서 선분까지 거리 (화면에서 6px 안)
  const hitEdge = (w) => {
    let best = null, bd = 6 / view.k;
    for (const l of [...links].sort((a, b) => (b.w >= 1) - (a.w >= 1))) { // 진짜 연결(w ≥ 1)을 먼저 — 옅은 선(제목이 비슷함)은 그다음
      if (best && best.w >= 1 && !(l.w >= 1)) break;
      const dx = l.t.x - l.s.x, dy = l.t.y - l.s.y, L2 = dx * dx + dy * dy || 1;
      const u = Math.max(0, Math.min(1, ((w.x - l.s.x) * dx + (w.y - l.s.y) * dy) / L2));
      const d = Math.hypot(w.x - (l.s.x + u * dx), w.y - (l.s.y + u * dy));
      if (d < bd && u > 0.02 && u < 0.98) { best = l; bd = d; }
    }
    return best;
  };
  const edgeOut = (l) => ({ s: l.s.id, t: l.t.id, w: l.w, sTitle: l.s.title, tTitle: l.t.title, rel: l.rel || null, status: l.status || null, origin: l.origin || null, from: l.from || null, relId: l.relId || null });
  // 빈 곳 · 선 위에서 메뉴 (오른쪽 클릭 · 길게 누르기)
  const spaceMenu = (e, w) => {
    const l = onEdgeMenu ? hitEdge(w) : null;
    hover = null; showTip(null); kick();
    if (l) onEdgeMenu(edgeOut(l), e); else onBlankMenu?.(e, w);
  };
  canvas.addEventListener("contextmenu", (e) => {
    if (!onMenu && !onBlankMenu && !onEdgeMenu) return;
    if (held) return e.preventDefault(); // 길게 누르기로 이미 띄웠어요 (안드로이드는 contextmenu 가 또 와요)
    const w = world(e), n = hit(w);
    if (!n) { if (onBlankMenu || onEdgeMenu) { e.preventDefault(); spaceMenu(e, w); } return; }
    if (!onMenu) return;
    e.preventDefault(); menu(n, e, !!hold || !!drag?.touch);
  });
  canvas.addEventListener("pointerdown", (e) => {
    if (side(e)) return; // 오른쪽 · 가운데 버튼은 끌기 · 열기가 아니에요 (오른쪽은 위 메뉴)
    try { canvas.setPointerCapture(e.pointerId); } catch {} // 이미 뗀 손가락 · 합성 포인터(자동 검사)는 던져요
    const w = world(e), n = hit(w); moved = false; touched = true; held = false;
    if (n) { drag = { node: n, ox: n.x - w.x, oy: n.y - w.y, touch: e.pointerType !== "mouse" }; alpha = Math.max(alpha, 0.3); }
    else pan = { sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y };
    if (n && onMenu && e.pointerType !== "mouse") { x0 = e.clientX; y0 = e.clientY; clearTimeout(hold); hold = setTimeout(() => menu(n, { clientX: x0, clientY: y0, preventDefault() {}, hold: true }, true), 500); }
    else if (!n && select && (onBlankMenu || onEdgeMenu) && e.pointerType !== "mouse") { // 빈 곳 · 선을 길게 누르기
      x0 = e.clientX; y0 = e.clientY; clearTimeout(hold);
      hold = setTimeout(() => { hold = 0; held = true; pan = null; spaceMenu({ clientX: x0, clientY: y0, preventDefault() {}, hold: true }, w); }, 500);
    }
  });
  canvas.addEventListener("pointermove", (e) => {
    const w = world(e);
    if (hold && Math.hypot(e.clientX - x0, e.clientY - y0) > 10) { clearTimeout(hold); hold = 0; }
    if (drag) { if (Math.hypot(drag.node.x - (w.x + drag.ox), drag.node.y - (w.y + drag.oy)) > 2 / view.k) moved = true; drag.node.x = w.x + drag.ox; drag.node.y = w.y + drag.oy; kick(); return; }
    if (pan) { if (Math.hypot(e.clientX - pan.sx, e.clientY - pan.sy) > 3) moved = true; view.x = pan.vx + e.clientX - pan.sx; view.y = pan.vy + e.clientY - pan.sy; kick(); return; }
    if (e.pointerType === "mouse") {
      const n = hit(w); if (n !== hover) { hover = n; canvas.style.cursor = n ? "pointer" : "grab"; kick(); } showTip(n, w);
      const he = !n && edgeStyle ? hitEdge(w) : null, hs = he?.st ? he : null; // 관계가 있는 선에 올리면 이름표
      if (hs !== hoverEdge) { hoverEdge = hs; kick(); }
    }
  });
  canvas.addEventListener("pointerup", (e) => {
    if (side(e)) return;
    clearTimeout(hold); hold = 0;
    const w = world(e), n = drag?.node, wasTouch = drag?.touch;
    drag = null; pan = null;
    if (held) { held = false; return; }
    if (moved) return;
    if (!n) { pinned = null; showTip(null); if (select) { clearTimeout(pendT); pendT = 0; setSel(null); } kick(); if (onBlank && hit(w) == null) onBlank({ clientX: e.clientX, clientY: e.clientY, preventDefault() {} }); return; }
    if (select) { tapNode(n); return; }
    // 마우스: 한 번 누르면 열기 · 손가락: 처음엔 이웃을 밝게(이름표), 같은 점을 다시 누르면 열기
    if (wasTouch && pinned !== n) { pinned = n; showTip(n, w); kick(); return; }
    if (onClick) {
      const t = performance.now(), dbl = lastTap.n === n && t - lastTap.t < 350;
      lastTap = { n, t };
      if (dbl) { onOpen?.(n); return; }
      onClick(n, { clientX: e.clientX, clientY: e.clientY, preventDefault() {} });
      return;
    }
    onOpen?.(n);
  });
  canvas.addEventListener("pointercancel", () => { clearTimeout(hold); hold = 0; drag = null; pan = null; });
  // ---------- 고르기 · 연결 (select) ----------
  function setSel(n, quiet = false) {
    if (sel === n) return;
    sel = n || null; kick();
    if (!quiet) onSelect?.(sel);
  }
  function tapNode(n) {
    const t = performance.now(), dbl = lastTap.n === n && t - lastTap.t < DBL;
    // 두 번 누르기: 첫 번째 누르기가 바꾼 고르기는 되돌리고 들어가요 (돌아왔을 때 실수로 연결되지 않게)
    if (dbl) { clearTimeout(pendT); pendT = 0; setSel(lastTap.before, true); lastTap = { n: null, t: 0 }; onOpen?.(n); return; }
    lastTap = { n, t, before: sel };
    if (sel && sel !== n && onConnect) {
      // 연결은 두 번 누르기 시간이 지난 뒤에 — 그 사이 같은 점을 한 번 더 누르면 연결 대신 들어가기
      const a = sel; clearTimeout(pendT);
      pendT = setTimeout(() => { pendT = 0; if (alive) onConnect(a, n); }, DBL);
      return;
    }
    setSel(n);
  }
  canvas.addEventListener("pointerleave", () => { if (!drag) { hover = null; hoverEdge = null; showTip(null); kick(); } });
  canvas.addEventListener("wheel", (e) => { e.preventDefault(); touched = true; const w = world(e); zoomAt(w.sx, w.sy, Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
  // 자동 검사용: 화면 좌표로 점 위치
  canvas.__nodes = () => nodes.map((n) => ({ id: n.id, title: n.title, type: n.type, r: radius(n) * view.k, x: W / 2 + view.x + n.x * view.k, y: H / 2 + view.y + n.y * view.k }));
  canvas.__links = () => links.map((l) => ({ s: l.s.id, t: l.t.id, w: l.w, rel: l.rel || null, status: l.status || null, from: l.from || null, color: l.st?.color || null, dash: !!l.st?.dash, x1: W / 2 + view.x + l.s.x * view.k, y1: H / 2 + view.y + l.s.y * view.k, x2: W / 2 + view.x + l.t.x * view.k, y2: H / 2 + view.y + l.t.y * view.k }));
  canvas.__view = () => ({ ...view, sel: sel?.id || null });

  drawTypes(); outs();
  const back = initial && typeof initial.k === "number";
  if (back) { Object.assign(view, { k: initial.k, x: initial.x || 0, y: initial.y || 0 }); touched = true; settledFit = true; }
  const allSaved = back && all.length && all.every((n) => saved[n.id]);
  apply(allSaved ? 0.02 : 0.6);
  if (!allSaved) for (let i = 0; i < 160; i++) step(); // 처음 배치를 미리 풀어 두고
  if (!back) { setTimeout(fit, 30); setTimeout(fit, 900); }
  if (initial?.sel && byId.has(initial.sel)) setSel(byId.get(initial.sel), true);
  const stop = () => { alive = false; ro.disconnect(); cancelAnimationFrame(raf); clearTimeout(saveT); clearTimeout(hold); clearTimeout(pendT); };
  // 지금 모습 (돌아올 때 그대로 그리려고)
  stop.state = () => ({ k: view.k, x: view.x, y: view.y, sel: sel?.id || null, pos: Object.fromEntries(all.map((n) => [n.id, [Math.round(n.x * 10) / 10, Math.round(n.y * 10) / 10]])) });
  // 같은 층에서 점 · 선만 바뀌었을 때: 있던 점은 그 자리, 새 점은 spawn[id] = { x, y } (없으면 가운데 근처) — 확대 · 고른 점 그대로
  stop.setData = (d, ty, spawn = {}) => {
    if (ty) types = ty;
    const old = byId, cx = all.reduce((a, n) => a + n.x, 0) / (all.length || 1), cy = all.reduce((a, n) => a + n.y, 0) / (all.length || 1);
    byId = new Map();
    all = d.nodes.map((n) => {
      const o0 = old.get(n.id), sp = spawn[n.id];
      const o = o0 ? Object.assign(o0, n) : { ...n, x: sp ? sp.x : cx + (Math.random() - 0.5) * 60, y: sp ? sp.y : cy + (Math.random() - 0.5) * 60, vx: 0, vy: 0, deg: 0 };
      byId.set(n.id, o); return o;
    });
    allLinks = linksOf(d);
    if (sel && !byId.has(sel.id)) setSel(null);
    hoverEdge = null;
    if (hover && !byId.has(hover.id)) hover = null;
    if (drag && !byId.has(drag.node.id)) drag = null;
    drawTypes(); apply(0.25);
  };
  stop.select = (id) => setSel(id ? byId.get(id) || null : null);
  stop.selected = () => sel?.id || null;
  stop.worldAt = (clientX, clientY) => { const w = world({ clientX, clientY }); return { x: w.x, y: w.y }; };
  // 점의 화면 좌표 (작은 창을 그 근처에 띄울 때)
  stop.screenOf = (id) => { const n = byId.get(id); if (!n) return null; const r = canvas.getBoundingClientRect(); return { x: r.left + W / 2 + view.x + n.x * view.k, y: r.top + H / 2 + view.y + n.y * view.k }; };
  return stop;
}
