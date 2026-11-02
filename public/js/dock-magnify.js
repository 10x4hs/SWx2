// SWx2 — Dock 확대 (맥 Dock 처럼): 마우스에 가까운 앱 아이콘일수록 커지고, 양옆은 부드럽게 벌어져요. 컴퓨터 화면만. 검색 · 타이머 · 프로필은 고정.
//   크기 s(d) = 1 + (m-1)·cos²(πd/2R) — d = 마우스와 아이콘 가운데 거리, R = 퍼지는 범위(px)
//   벌어짐 = s-1 을 마우스에서 그 아이콘까지 적분한 값 → 마우스 바로 아래 아이콘은 제자리, 멀수록 바깥으로 밀려요
//   설정(크기 · 범위 · 속도 · 끄기)은 dock-hide.js 의 dockPrefs (Settings 화면에서 바꿔요)
//   아이콘을 끌어 순서를 바꾸거나 폴더로 합칠 때는 잠깐 꺼요 — dock-drag.js 가 자리를 재는데 벌어진 자리로 재면 엉뚱한 데 들어가서요
import { dockPrefs } from "./dock-hide.js";

const wide = matchMedia("(min-width: 861px)");
const PITCH = 56, ICON = 44; // 아이콘 칸(48 + 사이 8) · 아이콘 크기
let y = null, held = false, raf = 0, items = [];
const rail = () => document.querySelector(".rail.dock");

// 커지는 건 가운데 앱 줄(+ 페이지 추가 버튼)만 — 위 검색 · 아래 타이머 · 프로필은 고정이에요
// 원래 자리(mid)와 위아래 여유(lo · hi)는 모양을 풀어 둔 지금 재 둬요: 벌어진 줄이 검색 · 타이머 쪽으로 넘어가지 않게
let lo = 0, hi = 0;
function collect() {
  const r = rail(); if (!r) return [];
  const els = [...new Set(r.querySelectorAll(".rail-nav .rail-btn, .rail-nav .dock-fold-btn"))].filter((el) => el.offsetParent);
  if (!els.length) return [];
  const rect = (el) => el.getBoundingClientRect();
  const top = r.querySelector("#open-palette"), foot = r.querySelector(".rail-foot");
  lo = rect(els[0]).top - (top ? rect(top).bottom + 8 : rect(r).top + 8);
  hi = (foot ? rect(foot).top : rect(r).bottom) - 8 - rect(els.at(-1)).bottom;
  if (r.querySelector(".rail-nav.scrolls")) lo = hi = Infinity; // 넘기는 줄이면 끝은 스크롤 칸이 잘라 줘요
  return els.map((el) => {
    const ic = el.querySelector(":scope > .app-ic, :scope > .av, :scope > .fold-grid") || el.firstElementChild, b = rect(el);
    return { el, ic, mid: b.top + b.height / 2, s: 1, t: 0 };
  });
}
// 마우스 거리 d 에서 { 배율, 밀림 }
function at(d, p) {
  const R = Math.max(1, p.range) * PITCH, m = p.size - 1;
  if (Math.abs(d) >= R) return { s: 1, t: Math.sign(d) * m * R / 2 * (ICON / PITCH) };
  return { s: 1 + m * Math.cos(Math.PI * d / (2 * R)) ** 2, t: m * (d / 2 + R / (2 * Math.PI) * Math.sin(Math.PI * d / R)) * (ICON / PITCH) };
}
function clear() {
  for (const it of items) { it.el.style.transform = ""; if (it.ic) it.ic.style.transform = ""; }
  items = [];
  // 움직임(transition)을 끈 채로 원래 자리에 놓은 뒤 다음 프레임에 풀어요 — 안 그러면 천천히 돌아가는 사이 dock-drag.js 가 엉뚱한 자리를 재요
  requestAnimationFrame(() => { if (!items.length) document.documentElement.classList.remove("dock-mag"); });
}
function frame() {
  raf = 0;
  const p = dockPrefs(), on = y != null && !held && p.mag && wide.matches;
  if (items.length && !items.every((it) => it.el.isConnected)) clear(); // Dock 이 다시 그려졌으면 (순서 · 배지 · 폴더) 새로 잡아요
  if (on && !items.length) { items = collect(); document.documentElement.classList.add("dock-mag"); }
  const k = Math.min(1, Math.max(1, p.speed) / 22);
  let moving = false;
  const goal = items.map((it) => (on ? at(it.mid - y, p) : { s: 1, t: 0 }));
  if (on && goal.length) { // 줄 끝이 여유를 넘으면 그쪽으로 벌어지는 양만 줄여요 — 마우스 아래 아이콘은 그대로 제자리
    const f = goal[0], l = goal.at(-1), half = ICON / 2;
    const cu = f.t < 0 ? Math.min(1, Math.max(0, (lo - half * (f.s - 1)) / -f.t)) : 1;
    const cd = l.t > 0 ? Math.min(1, Math.max(0, (hi - half * (l.s - 1)) / l.t)) : 1;
    for (const g of goal) g.t *= g.t < 0 ? cu : cd;
  }
  items.forEach((it, i) => {
    const g = goal[i];
    it.s += (g.s - it.s) * k; it.t += (g.t - it.t) * k;
    if (Math.abs(g.s - it.s) > 0.002 || Math.abs(g.t - it.t) > 0.2) moving = true; else { it.s = g.s; it.t = g.t; }
    it.el.style.transform = it.t ? `translateY(${it.t.toFixed(2)}px)` : "";
    if (it.ic) it.ic.style.transform = it.s !== 1 ? `scale(${it.s.toFixed(3)})` : "";
  });
  if (!on && !moving) return clear();
  if (on || moving) raf = requestAnimationFrame(frame);
}
const kick = () => { if (!raf) raf = requestAnimationFrame(frame); };

export function initDockMagnify() {
  document.addEventListener("mousemove", (e) => {
    const r = rail();
    const inside = r && e.target.closest?.(".rail.dock");
    if (inside) { y = e.clientY; kick(); }
    else if (y != null) { y = null; kick(); }
  }, { passive: true });
  document.addEventListener("mouseleave", () => { y = null; kick(); });
  // 누르는 동안은 그 모양 그대로 멈춰요 (누른 아이콘이 손 밑에서 빠져나가면 클릭이 안 돼요).
  // 실제로 끌기 시작하면(5px 넘게 움직이면) 원래 자리로 — dock-drag.js 가 정확한 자리를 재게. 캡처라 dock-drag 보다 먼저 돌아요
  let down = null;
  document.addEventListener("pointerdown", (e) => { if (e.button === 0 && e.target.closest?.(".rail.dock")) { held = true; down = { x: e.clientX, y: e.clientY }; cancelAnimationFrame(raf); raf = 0; } }, true);
  document.addEventListener("pointermove", (e) => { if (held && down && items.length && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 3) clear(); }, true);
  addEventListener("pointerup", () => { if (held) { held = false; down = null; kick(); } });
  addEventListener("pointercancel", () => { held = false; down = null; kick(); });
  window.addEventListener("trio:dock-prefs", () => { clear(); kick(); });
  // 앱 줄이 넘치면(작은 화면) 스크롤 칸 + 얇은 스크롤바. 넘기면 원래 자리를 다시 재요
  document.addEventListener("scroll", (e) => { if (e.target.classList?.contains("rail-nav")) { if (items.length) { clear(); kick(); } fit(e.target); } }, true);
  new ResizeObserver(() => fit()).observe(document.documentElement);
  addEventListener("resize", () => { if (items.length) { clear(); kick(); } });
  setInterval(() => { const n = document.querySelector(".rail.dock .rail-nav"); if (n && n.scrollHeight !== +n.dataset.sh) { n.dataset.sh = n.scrollHeight; fit(n); } }, 1000);
}

function fit(nav = document.querySelector(".rail.dock .rail-nav")) {
  const r = rail(); if (!nav || !r) return;
  let bar = r.querySelector(".dock-sbar");
  if (!bar) { bar = Object.assign(document.createElement("div"), { className: "dock-sbar" }); bar.setAttribute("aria-hidden", "true"); r.append(bar); dragBar(bar); }
  const over = wide.matches && nav.scrollHeight > nav.clientHeight + 2;
  nav.classList.toggle("scrolls", over); bar.hidden = !over;
  nav.classList.toggle("at-top", over && nav.scrollTop < 2); nav.classList.toggle("at-end", over && nav.scrollTop + nav.clientHeight > nav.scrollHeight - 2);
  if (!over) return;
  const nr = nav.getBoundingClientRect(), rr = r.getBoundingClientRect(), h = Math.max(24, nav.clientHeight * nav.clientHeight / nav.scrollHeight);
  bar.style.height = h + "px";
  bar.style.top = nr.top - rr.top + (nav.clientHeight - h) * (nav.scrollTop / (nav.scrollHeight - nav.clientHeight)) + "px";
}
function dragBar(bar) {
  bar.addEventListener("pointerdown", (e) => {
    const nav = document.querySelector(".rail.dock .rail-nav"); if (!nav) return;
    e.preventDefault(); e.stopPropagation(); bar.setPointerCapture(e.pointerId); bar.classList.add("drag");
    const y0 = e.clientY, s0 = nav.scrollTop, k = nav.scrollHeight / nav.clientHeight;
    const mv = (ev) => { nav.scrollTop = s0 + (ev.clientY - y0) * k; };
    const up = () => { bar.classList.remove("drag"); bar.removeEventListener("pointermove", mv); };
    bar.addEventListener("pointermove", mv); bar.addEventListener("pointerup", up, { once: true });
  });
}
