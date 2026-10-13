// 옵시디언 그래프 뷰 같은 지식 그래프 (Study 탭마다 하나). 읽기 전용: 점을 누르면 그 내용으로 가요.
//   모양: 납작한 점 · 가는 선 · 마우스를 올리면 그 점과 이웃만 밝게 · 확대하면 이름이 서서히 · 오른쪽 설정 패널
//   mountGraph(host, { data: { nodes, links }, types, onOpen, prefs, savePrefs, empty })
//     nodes: [{ id, title, type, group?, sub? }]  links: [{ s, t, kind? }]  (s · t 는 node id)
//     types: { [type]: { label, color, tier: 0(가장 큼)~3 } } — 종류별 색 · 크기 · 보이기 필터
//   설정(prefs)은 계정에 저장돼요 (users.graph_prefs) — 크기 기준 · 노드 크기 · 글자 · 선 · 힘
import { esc } from "../util.js";

export const GRAPH_DEFAULTS = { basis: "deg", node: 1, text: 12, line: 1, fade: 1.2, center: 1, repel: 1, link: 1, dist: 1, open: true, hide: {} };
const TIER_R = [11, 7, 4.5, 3.2];

export function mountGraph(host, { data, types, onOpen, prefs: p0, savePrefs, empty, scope = "" }) {
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
  let hover = null, pinned = null, drag = null, pan = null, query = "", focusType = null, moved = false;

  // ---------- 데이터 ----------
  const byId = new Map();
  const all = data.nodes.map((n, i) => { const a = i * 2.39996, r = 14 * Math.sqrt(i + 1); const o = { ...n, x: Math.cos(a) * r, y: Math.sin(a) * r, vx: 0, vy: 0, deg: 0 }; byId.set(n.id, o); return o; }); // 해바라기 씨앗처럼 고르게 퍼진 원에서 시작
  const allLinks = (data.links || []).map((l) => ({ ...l, s: byId.get(l.s), t: byId.get(l.t) })).filter((l) => l.s && l.t && l.s !== l.t);
  let nodes = [], links = [], adj = new Map();
  function apply() {
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
    alpha = Math.max(alpha, 0.6); kick();
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
    const focus = hover || pinned, near = focus ? adj.get(focus) : null;
    const lit = (n) => (focus ? n === focus || near?.has(n) : query ? n.title.toLowerCase().includes(query) : focusType ? n.type === focusType : true);
    const dim = !!(focus || query || focusType);
    for (const l of links) {
      const on = focus && (l.s === focus || l.t === focus);
      g.globalAlpha = on ? 0.9 : dim ? 0.05 : 0.32;
      g.strokeStyle = on ? accent : line; g.lineWidth = ((on ? 1.4 : 0.8) * P.line * Math.min(4, Math.sqrt(l.w || 1))) / view.k; // w = 묶인 연결 수
      g.beginPath(); g.moveTo(l.s.x, l.s.y); g.lineTo(l.t.x, l.t.y); g.stroke();
    }
    for (const n of nodes) {
      const on = lit(n), r = radius(n);
      g.globalAlpha = on ? 1 : 0.14;
      g.beginPath(); g.arc(n.x, n.y, r, 0, Math.PI * 2);
      g.fillStyle = n === focus ? accent : typeOf(n).color; g.fill();
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
  canvas.addEventListener("pointerdown", (e) => {
    canvas.setPointerCapture(e.pointerId); const w = world(e), n = hit(w); moved = false; touched = true;
    if (n) { drag = { node: n, ox: n.x - w.x, oy: n.y - w.y, touch: e.pointerType !== "mouse" }; alpha = Math.max(alpha, 0.3); }
    else pan = { sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y };
  });
  canvas.addEventListener("pointermove", (e) => {
    const w = world(e);
    if (drag) { if (Math.hypot(drag.node.x - (w.x + drag.ox), drag.node.y - (w.y + drag.oy)) > 2 / view.k) moved = true; drag.node.x = w.x + drag.ox; drag.node.y = w.y + drag.oy; kick(); return; }
    if (pan) { if (Math.hypot(e.clientX - pan.sx, e.clientY - pan.sy) > 3) moved = true; view.x = pan.vx + e.clientX - pan.sx; view.y = pan.vy + e.clientY - pan.sy; kick(); return; }
    if (e.pointerType === "mouse") { const n = hit(w); if (n !== hover) { hover = n; canvas.style.cursor = n ? "pointer" : "grab"; kick(); } showTip(n, w); }
  });
  canvas.addEventListener("pointerup", (e) => {
    const w = world(e), n = drag?.node, wasTouch = drag?.touch;
    drag = null; pan = null;
    if (moved) return;
    if (!n) { pinned = null; showTip(null); kick(); return; }
    // 마우스: 한 번 누르면 열기 · 손가락: 처음엔 이웃을 밝게(이름표), 같은 점을 다시 누르면 열기
    if (wasTouch && pinned !== n) { pinned = n; showTip(n, w); kick(); return; }
    onOpen?.(n);
  });
  canvas.addEventListener("pointerleave", () => { if (!drag) { hover = null; showTip(null); kick(); } });
  canvas.addEventListener("wheel", (e) => { e.preventDefault(); touched = true; const w = world(e); zoomAt(w.sx, w.sy, Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
  // 자동 검사용: 화면 좌표로 점 위치
  canvas.__nodes = () => nodes.map((n) => ({ id: n.id, title: n.title, type: n.type, r: radius(n) * view.k, x: W / 2 + view.x + n.x * view.k, y: H / 2 + view.y + n.y * view.k }));

  drawTypes(); outs(); apply();
  for (let i = 0; i < 160; i++) step(); // 처음 배치를 미리 풀어 두고
  setTimeout(fit, 30); setTimeout(fit, 900);
  return () => { alive = false; ro.disconnect(); cancelAnimationFrame(raf); clearTimeout(saveT); };
}
