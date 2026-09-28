// 그래프: 노트 연결을 force layout으로. 드래그로 옮기고, 휠로 확대, 눌러서 열기.
import { api } from "../api.js";
import { $, esc, toast } from "../util.js";
import { openByTitle } from "./notes.js";

export function mount(root, ctx) {
  root.innerHTML = `
    <div class="graph-wrap">
      <canvas id="gc" aria-label="노트 연결 그래프"></canvas>
      <div class="graph-hud">
        <div class="title" style="display:grid;gap:6px">
          <span class="eyebrow">Graph</span>
          <h1 class="h1">생각의 지도</h1>
          <span class="faint" id="gstat" style="font-size:12.5px"></span>
        </div>
        <div class="graph-legend" id="glegend"></div>
      </div>
    </div>`;
  const canvas = $("#gc", root), g = canvas.getContext("2d");
  let W = 0, H = 0, dpr = 1, raf = 0, alpha = 1;
  const view = { x: 0, y: 0, k: 1 };
  let nodes = [], links = [], hover = null, drag = null, adj = new Map();

  const css = () => {
    const s = getComputedStyle(root);
    return { ink: s.getPropertyValue("--ink").trim(), ink3: s.getPropertyValue("--ink-3").trim(), line: s.getPropertyValue("--line-2").trim(), bg: s.getPropertyValue("--glass-3").trim() };
  };
  let C = css();
  // "var(--m1)" 같은 CSS 변수를 캔버스가 쓸 수 있는 실제 색으로
  const resolve = (v) => { const m = /^var\((--[\w-]+)\)$/.exec(v || ""); return m ? getComputedStyle(root).getPropertyValue(m[1]).trim() || "#888" : v || "#888"; };

  async function load() {
    try {
      const data = await api.graph();
      const byTitle = new Map();
      nodes = data.nodes.map((n, i) => {
        const a = (i / Math.max(1, data.nodes.length)) * Math.PI * 2, r = 120 + Math.random() * 80;
        const node = { ...n, x: Math.cos(a) * r, y: Math.sin(a) * r, vx: 0, vy: 0, deg: 0, color: resolve(ctx.user(n.user_id)?.color) };
        const k = n.title.toLowerCase();
        if (!byTitle.has(k) || n.user_id === ctx.me.id) byTitle.set(k, node);
        return node;
      });
      const idx = new Map(nodes.map((n) => [n.id, n]));
      const ghosts = new Map();
      links = [];
      for (const e of data.edges) {
        const s = idx.get(e.src_id);
        if (!s) continue;
        let t = byTitle.get(e.dst_title.toLowerCase());
        if (!t) {
          const k = e.dst_title.toLowerCase();
          if (!ghosts.has(k)) { const gh = { id: "ghost:" + k, title: e.dst_title, ghost: true, x: s.x + (Math.random() - .5) * 60, y: s.y + (Math.random() - .5) * 60, vx: 0, vy: 0, deg: 0, color: C.ink3 }; ghosts.set(k, gh); nodes.push(gh); }
          t = ghosts.get(k);
        }
        if (t === s) continue;
        links.push({ s, t }); s.deg++; t.deg++;
      }
      adj = new Map(nodes.map((n) => [n, new Set()]));
      for (const l of links) { adj.get(l.s).add(l.t); adj.get(l.t).add(l.s); }
      const real = nodes.filter((n) => !n.ghost).length;
      $("#gstat", root).textContent = real ? `노트 ${real}개 · 연결 ${links.length}개${ghosts.size ? ` · 아직 없는 노트 ${ghosts.size}개` : ""}` : "";
      const owners = [...new Set(data.nodes.map((n) => n.user_id))];
      $("#glegend", root).innerHTML = owners.map((id) => `<span><span class="dot" style="--c:${esc(ctx.user(id)?.color || "#999")}"></span>${esc(ctx.user(id)?.display_name || "")}</span>`).join("")
        + (ghosts.size ? `<span><span class="dot" style="--c:transparent;box-shadow:inset 0 0 0 1.5px var(--ink-3)"></span>아직 없는 노트</span>` : "");
      if (!real) {
        root.querySelector(".graph-wrap").insertAdjacentHTML("beforeend", `<div style="position:absolute;inset:0;display:grid;place-items:center;pointer-events:none"><p class="empty" style="pointer-events:auto;max-width:360px;background:var(--glass-3)">노트에 <code>[[다른 노트]]</code> 를 쓰면 여기에 연결이 그려져요. <a href="#/notes">노트 쓰러 가기</a></p></div>`);
      }
      alpha = 1; kick();
    } catch (e) { toast(e.message, "err"); }
  }

  const radius = (n) => (n.ghost ? 5 : 7 + Math.sqrt(n.deg) * 3);

  function step() {
    const N = nodes.length;
    for (let i = 0; i < N; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < N; j++) {
        const b = nodes[j];
        let dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy || .01;
        if (d2 > 160000) continue;
        const f = (2600 / d2) * alpha, d = Math.sqrt(d2);
        dx /= d; dy /= d;
        a.vx -= dx * f; a.vy -= dy * f; b.vx += dx * f; b.vy += dy * f;
      }
    }
    for (const { s, t } of links) {
      const dx = t.x - s.x, dy = t.y - s.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
      const f = ((d - 120) / d) * .04 * alpha;
      s.vx += dx * f; s.vy += dy * f; t.vx -= dx * f; t.vy -= dy * f;
    }
    for (const n of nodes) {
      n.vx -= n.x * .003 * alpha; n.vy -= n.y * .003 * alpha;
      if (n === drag?.node) { n.vx = n.vy = 0; continue; }
      n.vx *= .82; n.vy *= .82;
      n.x += n.vx; n.y += n.vy;
    }
    alpha = Math.max(0, alpha * .985);
  }

  function draw() {
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    g.translate(W / 2 + view.x, H / 2 + view.y);
    g.scale(view.k, view.k);
    const focus = hover ? adj.get(hover) : null;
    g.lineWidth = 1 / view.k;
    for (const { s, t } of links) {
      const on = hover && (s === hover || t === hover);
      g.strokeStyle = on ? hover.color : C.line;
      g.globalAlpha = hover && !on ? .25 : 1;
      g.lineWidth = (on ? 1.8 : 1) / view.k;
      g.beginPath(); g.moveTo(s.x, s.y); g.lineTo(t.x, t.y); g.stroke();
    }
    for (const n of nodes) {
      const dim = hover && n !== hover && !focus.has(n);
      g.globalAlpha = dim ? .25 : 1;
      g.beginPath(); g.arc(n.x, n.y, radius(n), 0, Math.PI * 2);
      if (n.ghost) { g.fillStyle = C.bg; g.fill(); g.strokeStyle = C.ink3; g.lineWidth = 1.4 / view.k; g.stroke(); }
      else { g.fillStyle = n.color; g.fill(); }
      if (n === hover) { g.strokeStyle = C.ink; g.lineWidth = 2 / view.k; g.stroke(); }
    }
    g.textAlign = "center"; g.textBaseline = "top";
    g.font = `${500} ${13 / Math.max(.6, view.k)}px Geist, "Pretendard Variable", sans-serif`;
    for (const n of nodes) {
      const show = view.k > .75 || n === hover || (focus && focus.has(n)) || n.deg >= 3;
      if (!show) continue;
      const dim = hover && n !== hover && !focus.has(n);
      g.globalAlpha = dim ? .2 : n.ghost ? .7 : .92;
      g.fillStyle = C.ink;
      g.fillText(n.title.length > 22 ? n.title.slice(0, 21) + "…" : n.title, n.x, n.y + radius(n) + 4 / view.k);
    }
    g.globalAlpha = 1;
  }

  function frame() {
    raf = 0;
    if (alpha > .005 || drag) step();
    draw();
    if (alpha > .005 || drag) raf = requestAnimationFrame(frame);
  }
  const kick = () => { if (!raf) raf = requestAnimationFrame(frame); };

  function resize() {
    const r = canvas.getBoundingClientRect();
    dpr = Math.min(2, devicePixelRatio || 1);
    W = r.width; H = r.height;
    canvas.width = W * dpr; canvas.height = H * dpr;
    C = css(); kick();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);

  const toWorld = (e) => { const r = canvas.getBoundingClientRect(); return { x: (e.clientX - r.left - W / 2 - view.x) / view.k, y: (e.clientY - r.top - H / 2 - view.y) / view.k }; };
  const hit = (p) => { let best = null, bd = Infinity; for (const n of nodes) { const d = Math.hypot(n.x - p.x, n.y - p.y); if (d < radius(n) + 6 / view.k && d < bd) { best = n; bd = d; } } return best; };

  canvas.addEventListener("pointerdown", (e) => {
    canvas.setPointerCapture(e.pointerId);
    const p = toWorld(e), n = hit(p);
    drag = { node: n, sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y, moved: false };
    canvas.classList.add("dragging");
    if (n) { alpha = Math.max(alpha, .3); kick(); }
  });
  canvas.addEventListener("pointermove", (e) => {
    if (drag) {
      if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 4) drag.moved = true;
      if (drag.node) { const p = toWorld(e); drag.node.x = p.x; drag.node.y = p.y; alpha = Math.max(alpha, .2); }
      else { view.x = drag.vx + e.clientX - drag.sx; view.y = drag.vy + e.clientY - drag.sy; }
      kick();
      return;
    }
    const n = hit(toWorld(e));
    if (n !== hover) { hover = n; canvas.style.cursor = n ? "pointer" : ""; kick(); }
  });
  canvas.addEventListener("pointerup", () => {
    const d = drag; drag = null; canvas.classList.remove("dragging");
    if (d && d.node && !d.moved) {
      if (d.node.ghost) openByTitle(ctx, d.node.title);
      else ctx.go("#/notes/" + d.node.id);
    }
    kick();
  });
  canvas.addEventListener("pointerleave", () => { if (!drag && hover) { hover = null; kick(); } });
  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    const r = canvas.getBoundingClientRect(), mx = e.clientX - r.left - W / 2, my = e.clientY - r.top - H / 2;
    const k = Math.max(.3, Math.min(3, view.k * Math.exp(-e.deltaY * .0015)));
    view.x = mx - ((mx - view.x) * k) / view.k; view.y = my - ((my - view.y) * k) / view.k; view.k = k;
    kick();
  }, { passive: false });

  const mq = matchMedia("(prefers-color-scheme: dark)");
  const onTheme = () => { C = css(); for (const n of nodes) if (!n.ghost) n.color = resolve(ctx.user(n.user_id)?.color); kick(); };
  mq.addEventListener("change", onTheme);
  const mo = new MutationObserver(onTheme);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  load();
  return () => { cancelAnimationFrame(raf); ro.disconnect(); mo.disconnect(); mq.removeEventListener("change", onTheme); };
}
