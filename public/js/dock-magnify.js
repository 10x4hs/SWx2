// SWx2 — Dock 확대 (맥 Dock 처럼): 마우스에 가까운 앱 아이콘일수록 커지고, 커진 만큼 칸이 길어져서 Dock 판도 위아래로 늘어나요. 컴퓨터 화면만.
//   크기 s(d) = 1 + (m-1)·cos²(πd/2R) — d = 마우스와 아이콘의 '원래' 가운데 거리, R = 퍼지는 범위(px)
//   원래 자리는 커지기 전에 재 둬요 — Dock 은 세로 가운데라 늘어나도 가운데는 그대로여서, 커져도 계산이 되먹지 않아 떨리지 않아요
//   검색 · + · 타이머 · 프로필은 크기 그대로 판 끝을 따라 움직여요. 이름표는 커진 아이콘 바로 옆 (--s)
//   설정(크기 · 범위 · 속도 · 끄기)은 dock-hide.js 의 dockPrefs (Settings 화면에서 바꿔요)
//   아이콘을 끌기 시작하면 잠깐 꺼요 — dock-drag.js 가 자리를 재는데 커진 자리로 재면 엉뚱한 데 들어가서요
import { dockPrefs } from "./dock-hide.js";

const wide = matchMedia("(min-width: 861px)");
const PITCH = 56, BTN = 48; // 아이콘 칸(48 + 사이 8) · 칸 높이
let y = null, held = false, raf = 0, items = [], dz = 1; // dz = 작은 화면에서 줄인 배율 (fit)
const rail = () => document.querySelector(".rail.dock");

function collect() {
  const r = rail(); if (!r) return [];
  return [...new Set(r.querySelectorAll("#dock-list .rail-btn, #dock-list .dock-fold-btn"))].filter((el) => el.offsetParent).map((el) => {
    const ic = el.querySelector(":scope > .app-ic, :scope > .fold-grid") || el.firstElementChild, b = el.getBoundingClientRect();
    return { el, ic, mid: b.top + b.height / 2, s: 1 };
  });
}
const at = (d, p) => { const R = Math.max(1, p.range) * PITCH * dz; return Math.abs(d) >= R ? 1 : 1 + (p.size - 1) * Math.cos(Math.PI * d / (2 * R)) ** 2; };
function paint(it) {
  const big = it.s !== 1;
  it.el.style.height = big ? (BTN * it.s).toFixed(2) + "px" : "";
  it.el.style.setProperty("--s", it.s.toFixed(3));
  if (it.ic) it.ic.style.transform = big ? `scale(${it.s.toFixed(3)})` : "";
}
function clear() {
  for (const it of items) { it.s = 1; paint(it); it.el.style.removeProperty("--s"); }
  items = [];
  // 움직임(transition)을 끈 채로 원래 크기로 놓은 뒤 다음 프레임에 풀어요 — 안 그러면 천천히 돌아가는 사이 dock-drag.js 가 엉뚱한 자리를 재요
  requestAnimationFrame(() => { if (!items.length) document.documentElement.classList.remove("dock-mag"); });
}
function frame() {
  raf = 0;
  const p = dockPrefs(), on = y != null && !held && p.mag && wide.matches;
  if (items.length && !items.every((it) => it.el.isConnected)) clear(); // Dock 이 다시 그려졌으면 (순서 · 배지 · 폴더) 새로 잡아요
  if (on && !items.length) { items = collect(); document.documentElement.classList.add("dock-mag"); }
  const k = Math.min(1, Math.max(1, p.speed) / 22);
  let moving = false;
  for (const it of items) {
    const g = on ? at(it.mid - y, p) : 1;
    it.s += (g - it.s) * k;
    if (Math.abs(g - it.s) > 0.002) moving = true; else it.s = g;
    paint(it);
  }
  if (!on && !moving) return clear();
  raf = requestAnimationFrame(frame);
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
  // 작은 화면(14인치 · 앱이 많을 때): 맥처럼 아이콘을 줄여서 한 화면에 다 넣어요 (44px → 최소 30px). 그래도 넘칠 때만 스크롤(스크롤바 없이 위아래 흐림)
  document.addEventListener("scroll", (e) => { if (e.target.classList?.contains("rail-nav")) { if (items.length) { clear(); kick(); } edges(e.target); } }, true);
  addEventListener("resize", () => { if (items.length) { clear(); kick(); } fit(); });
  window.addEventListener("trio:dock-prefs", () => fit(true));
  setInterval(() => fit(), 800); // Dock 이 다시 그려졌는지(앱 수) 가볍게 살펴요 — 바뀐 게 없으면 아무것도 안 해요
}

// 줄이는 배율(--dz, CSS zoom): 앱 줄 + 확대할 때 늘어날 여유가 Dock 최대 높이(화면 - 24px) 안에 들어가게
const MIN_Z = 30 / 44;
let fitKey = "";
export function fit(force = false) {
  const r = rail(), nav = r?.querySelector(".rail-nav"); if (!nav) return;
  const p = dockPrefs(), key = [r.querySelectorAll("#dock-list [data-dock]").length, innerHeight, wide.matches, p.size, p.range, p.mag].join();
  if ((!force && key === fitKey) || items.length || r.querySelector(".dock-sorting")) return;
  fitKey = key;
  let z = 1;
  nav.style.setProperty("--dz", "1");
  if (wide.matches) {
    const max = innerHeight - 24, fixed = r.offsetHeight - nav.offsetHeight, need = nav.scrollHeight;
    const room = p.mag ? (p.size - 1) * Math.max(1, p.range) * BTN : 0; // 확대하면 판이 이만큼 늘어나요
    z = Math.min(1, Math.max(MIN_Z, (max - fixed) / (need + room)));
  }
  dz = z; nav.style.setProperty("--dz", z.toFixed(3));
  edges(nav);
}
function edges(nav) {
  const over = wide.matches && nav.scrollHeight > nav.clientHeight + 2;
  nav.classList.toggle("scrolls", over);
  nav.classList.toggle("at-top", over && nav.scrollTop < 2); nav.classList.toggle("at-end", over && nav.scrollTop + nav.clientHeight > nav.scrollHeight - 2);
}
