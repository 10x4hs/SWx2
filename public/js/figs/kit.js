// 설명 그림 도구 — SVG 만들기 · 부드럽게 옮기기(tween) · 끌기 · 색(종이/밤을 따라가는 CSS 변수) · 작은 수학
//   그림 파일(f-*.js)은 이것만 써서 그려요. 색은 늘 C.* (var(--fg-…)) 로 — 밤 모드에서 저절로 바뀌어요.
const NS = "http://www.w3.org/2000/svg";

// 색 — css/dev.css 의 .fig 에 정의 (종이 · 밤 둘 다)
export const C = {
  ink: "var(--fg-ink)", sub: "var(--fg-sub)", mute: "var(--fg-mute)", line: "var(--fg-line)", grid: "var(--fg-grid)", bg: "var(--fg-bg)", soft: "var(--fg-soft)",
  a: "var(--fg-a)", aSoft: "var(--fg-a-soft)", b: "var(--fg-b)", bSoft: "var(--fg-b-soft)", c: "var(--fg-c)", cSoft: "var(--fg-c-soft)",
  d: "var(--fg-d)", dSoft: "var(--fg-d-soft)", hi: "var(--fg-hi)", ok: "var(--fg-ok)", no: "var(--fg-no)",
};
// 여러 묶음(군집 · 커뮤니티)을 칠할 때 쓰는 차분한 색 6개
export const SERIES = ["var(--fg-a)", "var(--fg-b)", "var(--fg-c)", "var(--fg-d)", "var(--fg-e)", "var(--fg-f)"];
export const SERIES_SOFT = ["var(--fg-a-soft)", "var(--fg-b-soft)", "var(--fg-c-soft)", "var(--fg-d-soft)", "var(--fg-e-soft)", "var(--fg-f-soft)"];

const STYLE_KEYS = new Set(["fill", "stroke", "stop-color", "color", "opacity", "fill-opacity", "stroke-opacity"]);
// SVG 요소 하나: el(부모, "circle", { cx, cy, r, fill: C.a }) — var(...) 색은 style 로 넣어요 (모든 브라우저에서 되게)
export function el(parent, tag, attrs = {}, text) {
  const e = document.createElementNS(NS, tag);
  set(e, attrs);
  if (text != null) e.textContent = text;
  parent?.appendChild(e);
  return e;
}
export function set(e, attrs) {
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null) continue;
    if (STYLE_KEYS.has(k) && typeof v === "string" && v.includes("var(")) e.style.setProperty(k, v);
    else if (STYLE_KEYS.has(k)) { e.style.removeProperty(k); e.setAttribute(k, v); } // 전에 style 로 넣은 색이 있으면 지워야 이 값이 보여요
    else if (k === "style") e.setAttribute("style", v);
    else e.setAttribute(k, v);
  }
  return e;
}
// 그림판: viewBox 로 그려서 칸 너비에 맞게 커지고 작아져요
export function svg(stage, w, h, label = "") {
  const s = el(null, "svg", { viewBox: `0 0 ${w} ${h}`, class: "fg-svg", role: "img", "aria-label": label || null, preserveAspectRatio: "xMidYMid meet" });
  stage.appendChild(s);
  return s;
}
export const g = (parent, attrs = {}) => el(parent, "g", attrs);
// 글자: text(부모, x, y, "글", { size: 14, anchor: "middle", weight: 600, fill: C.sub })
export function text(parent, x, y, str, o = {}) {
  return el(parent, "text", { x, y, "font-size": o.size || 14, "text-anchor": o.anchor || "start", "font-weight": o.weight || 500, fill: o.fill || C.ink, "dominant-baseline": o.base || "middle", class: o.cls || "fg-t", "font-family": o.mono ? "var(--fg-mono)" : null }, str);
}
// 화살촉: 색마다 marker 하나 (defs 에)
let mk = 0;
export function arrowHead(s, color) {
  const defs = s.querySelector("defs") || el(s, "defs");
  const key = color.replace(/[^a-z0-9]/gi, "");
  let m = defs.querySelector(`[data-k="${key}"]`);
  if (!m) {
    m = el(defs, "marker", { id: `fgm${++mk}`, "data-k": key, viewBox: "0 0 10 10", refX: 8.5, refY: 5, markerWidth: 10, markerHeight: 10, orient: "auto-start-reverse", markerUnits: "userSpaceOnUse" });
    el(m, "path", { d: "M0,0 L10,5 L0,10 z", fill: color });
  }
  return `url(#${m.id})`;
}
export function arrow(parent, x1, y1, x2, y2, o = {}) {
  const s = parent.ownerSVGElement || parent;
  const color = o.color || C.ink;
  return el(parent, "line", { x1, y1, x2, y2, stroke: color, "stroke-width": o.width || 2, "marker-end": o.head === false ? null : arrowHead(s, color), "stroke-dasharray": o.dash || null, "stroke-linecap": "round" });
}
export const line = (parent, x1, y1, x2, y2, o = {}) => el(parent, "line", { x1, y1, x2, y2, stroke: o.color || C.line, "stroke-width": o.width || 1, "stroke-dasharray": o.dash || null, "stroke-linecap": "round" });
export const circle = (parent, cx, cy, r, o = {}) => el(parent, "circle", { cx, cy, r, fill: o.fill || C.ink, stroke: o.stroke || null, "stroke-width": o.sw || null });
export const rect = (parent, x, y, w, h, o = {}) => el(parent, "rect", { x, y, width: w, height: h, rx: o.r ?? 6, fill: o.fill || C.soft, stroke: o.stroke || null, "stroke-width": o.sw || null });
export const path = (parent, d, o = {}) => el(parent, "path", { d, fill: o.fill || "none", stroke: o.stroke || C.ink, "stroke-width": o.width || 2, "stroke-dasharray": o.dash || null, "stroke-linecap": "round", "stroke-linejoin": "round" });
// 둥근 상자 + 가운데 글자 (흐름도 칸)
export function box(parent, x, y, w, h, label, o = {}) {
  const gg = g(parent, { class: o.cls || null });
  rect(gg, x, y, w, h, { r: o.r ?? 8, fill: o.fill || C.bg, stroke: o.stroke || C.line, sw: o.sw || 1.5 });
  const lines = String(label).split("\n");
  lines.forEach((l, i) => text(gg, x + w / 2, y + h / 2 + (i - (lines.length - 1) / 2) * (o.size ? o.size * 1.3 : 18), l, { size: o.size || 14, anchor: "middle", weight: o.weight || 600, fill: o.color || C.ink }));
  return gg;
}

// ---------- 움직임 ----------
export const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
export const ease = { out: (t) => 1 - (1 - t) ** 3, inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2), lin: (t) => t };
// anim(ms, (t) => …) — 0→1, 끝나면 resolve. 움직임 줄이기를 켠 사람은 바로 끝 모습으로
export function anim(ms, fn, ez = ease.inOut) {
  return new Promise((done) => {
    if (reduced() || ms <= 0) { fn(1); done(); return; }
    const t0 = performance.now();
    const step = (now) => { const t = Math.max(0, Math.min(1, (now - t0) / ms)); fn(ez(t)); if (t < 1) requestAnimationFrame(step); else done(); }; // rAF 시각이 시작보다 이를 수 있어서 0 아래로 안 가게
    requestAnimationFrame(step);
  });
}
// tween(obj, { x: 10 }, ms, onUpdate) — 숫자 속성을 부드럽게
export function tween(obj, to, ms, onUpdate, ez) {
  const from = {}; for (const k in to) from[k] = obj[k];
  return anim(ms, (t) => { for (const k in to) obj[k] = from[k] + (to[k] - from[k]) * t; onUpdate?.(obj, t); }, ez);
}
// 요소를 보였다 숨겼다 (opacity 전환)
export function show(e, on, ms = 300) {
  if (!e) return;
  e.style.transition = reduced() ? "none" : `opacity ${ms}ms ease`;
  e.style.opacity = on ? "1" : "0";
  e.style.pointerEvents = on ? "" : "none";
}
// 계속 도는 그림(줄 서기 · 트래픽 같은 것)용: 화면에 보일 때만 돌고, 그림이 사라지면 멈춰요
export function loop(stage, fn) {
  let raf = 0, last = 0, vis = true, alive = true;
  const io = new IntersectionObserver(([e]) => { vis = e.isIntersecting; if (vis && alive && !raf) raf = requestAnimationFrame(tick); }, { threshold: 0 });
  io.observe(stage);
  function tick(now) {
    raf = 0;
    if (!alive || !stage.isConnected) { stop(); return; }
    const dt = last ? Math.min(64, now - last) : 16; last = now;
    if (vis && !document.hidden) fn(dt, now);
    else last = 0;
    if (vis) raf = requestAnimationFrame(tick);
  }
  function stop() { alive = false; cancelAnimationFrame(raf); raf = 0; io.disconnect(); }
  raf = requestAnimationFrame(tick);
  return stop;
}

// ---------- 끌기 ----------
// drag(svg, 손잡이, (x, y) => …, { get, step, label }) — 화면 좌표를 viewBox 좌표로 바꿔서 알려 줘요. 키보드: 손잡이에 초점 → 화살표로 step 씩
export function drag(s, handle, onMove, o = {}) {
  handle.style.cursor = "grab"; handle.style.touchAction = "none";
  handle.setAttribute("tabindex", "0"); handle.setAttribute("role", "slider");
  if (o.label) handle.setAttribute("aria-label", o.label);
  const toLocal = (e) => { const p = s.createSVGPoint(); p.x = e.clientX; p.y = e.clientY; return p.matrixTransform(s.getScreenCTM().inverse()); };
  handle.addEventListener("pointerdown", (e) => {
    e.preventDefault(); handle.setPointerCapture(e.pointerId); handle.style.cursor = "grabbing";
    const mv = (ev) => { const p = toLocal(ev); onMove(p.x, p.y, ev); };
    const up = () => { handle.style.cursor = "grab"; handle.removeEventListener("pointermove", mv); handle.removeEventListener("pointerup", up); handle.removeEventListener("pointercancel", up); o.onEnd?.(); };
    handle.addEventListener("pointermove", mv); handle.addEventListener("pointerup", up); handle.addEventListener("pointercancel", up);
  });
  handle.addEventListener("keydown", (e) => {
    const k = o.step || 4, d = { ArrowLeft: [-k, 0], ArrowRight: [k, 0], ArrowUp: [0, -k], ArrowDown: [0, k] }[e.key]; if (!d) return;
    e.preventDefault(); e.stopPropagation(); const cur = o.get?.() || [0, 0]; onMove(cur[0] + d[0], cur[1] + d[1], e); o.onEnd?.();
  });
}
// 슬라이더 하나 (그림 아래 조절 칸): slider(ctl, { label, min, max, step, value, fmt }, (v) => …)
export function slider(ctl, o, onInput) {
  const id = "fgs" + Math.random().toString(36).slice(2, 8);
  const w = document.createElement("label"); w.className = "fig-sl"; w.htmlFor = id;
  w.innerHTML = `<span class="fig-sl-l">${o.label}</span><input id="${id}" type="range" min="${o.min}" max="${o.max}" step="${o.step || 1}" value="${o.value}"><output class="fig-sl-v"></output>`;
  const inp = w.querySelector("input"), out = w.querySelector("output");
  const fmt = o.fmt || ((v) => String(v));
  const upd = () => { out.textContent = fmt(Number(inp.value)); onInput(Number(inp.value)); };
  inp.addEventListener("input", upd);
  ctl.appendChild(w); out.textContent = fmt(Number(o.value));
  return { el: w, input: inp, set: (v) => { inp.value = v; out.textContent = fmt(Number(v)); } };
}
// 작은 단추 묶음 (예: [코사인] [내적] [거리]) — 고른 것 하나만 눌림
export function choice(ctl, items, value, onPick, label = "") {
  const w = document.createElement("div"); w.className = "fig-seg"; w.setAttribute("role", "group"); if (label) w.setAttribute("aria-label", label);
  w.innerHTML = items.map(([k, l]) => `<button type="button" data-k="${k}" aria-pressed="${k === value}">${l}</button>`).join("");
  w.addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; w.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b))); onPick(b.dataset.k); });
  ctl.appendChild(w);
  return { el: w, set: (k) => w.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.k === k))) };
}

// 그림 아래 계산 칸 (HTML — 폰에서도 글씨가 작아지지 않게): readout(ctl) → { set(html) }
export function readout(ctl) {
  const d = document.createElement("div"); d.className = "fig-read"; d.setAttribute("aria-live", "polite");
  ctl.appendChild(d);
  return { el: d, set(html) { d.innerHTML = html; } };
}

// ---------- 수학 ----------
export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const fmt = (n, d = 2) => (Number.isFinite(n) ? String(Number(n.toFixed(d))) : "—"); // 끝의 0 은 떼요 (0.50 → 0.5)
export const num = (n, d = 2) => fmt(n, d).replace(/^-/, "−"); // 화면에 보이는 음수는 진짜 빼기 기호로
export const fix = (n, d = 2) => (Number.isFinite(n) ? n.toFixed(d) : "—");
// 같은 씨앗이면 늘 같은 '무작위' (그림이 매번 똑같이 그려지게)
export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export function gauss(r) { let u = 0, v = 0; while (!u) u = r(); while (!v) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
export const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
