// Dock 앱마다 '보던 곳 그대로' — 다른 앱(예: Plan)에 잠깐 갔다 와도 마지막 화면 · 스크롤 위치로 돌아와요 (2026-10-20)
//   · 기억하는 앱: Obsidian · Study · Newsletter · Message · MBA · Code Flow · CIM (Home · Plan(늘 오늘) · Diary 는 그대로)
//   · 12시간이 지나면 잊고 그 앱의 첫 화면으로 · 지금 그 앱 안에서 아이콘을 한 번 더 누르면 한 칸 위(그 앱의 첫 화면)로
//   · 같은 기록(뒤로 · 앞으로 · 새로 고침)으로 돌아오면 history.state 에 적어 둔 스크롤로
import * as studyView from "./views/study.js";

const KEY = "trio-dock-last", TTL = 12 * 3600e3;
export const REMEMBER = new Set(["brain", "study", "news", "room", "biz", "dev", "cim"]);
let mem = {};
try { mem = JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch { mem = {}; }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(mem)); } catch {} };

let cur = { nav: null, hash: "" }; // 지금 화면 (app.js 의 route 가 알려 줘요)
let jump = null; // Dock 에서 눌러 돌아가는 중: { hash, top }

export function remember(nav, hash, top) {
  if (!REMEMBER.has(nav) || !hash) return;
  mem[nav] = { hash, top: Math.max(0, Math.round(top || 0)), at: Date.now() };
  save();
}
const lastOf = (nav) => { const m = mem[nav]; return m && Date.now() - m.at < TTL ? m : null; };
const homeOf = (n) => (n.key === "study" ? studyView.lastHash() : n.hash);

// 그 앱 안에서 한 칸 위: SW 는 카드 → 과정 목차 → 과정 목록, Study 는 그 탭의 첫 화면, 나머지는 첫 화면
function upOf(n, hash) {
  if (n.key === "dev") {
    const m = hash.match(/^#\/sw\/([a-z]+)(\/.+)?$/);
    if (m) return m[2] ? `#/sw/${m[1]}` : "#/sw";
    const old = hash.match(/^#\/dev(\/.+)?$/);
    return old?.[1] ? "#/sw/dev" : "#/sw";
  }
  if (n.key === "cim") { // CIM: 읽던 카드(#/cim/study/<장>/<n>) → 공부 목록, 시험 안(문제 · 모의고사 · 숫자) → 시험, 오늘 공부 · 기록 · 탭 → 오늘
    const m = hash.match(/^#\/cim\/([a-z]+)(\/.+)?$/);
    return m?.[2] ? `#/cim/${m[1]}` : "#/cim";
  }
  if (n.key === "study") {
    const m = hash.match(/^#\/(english|papers|books)\b/) || hash.match(/^#\/(study\/[^/]+)/);
    return m ? `#/${m[1]}` : homeOf(n);
  }
  return n.hash;
}

// Dock 아이콘의 주소: 그 앱 안이면 한 칸 위, 밖이면 보던 곳(없으면 첫 화면)
export function navHref(n, today) {
  if (n.key === "calendar") return "#/calendar/" + today;
  if (!REMEMBER.has(n.key)) return n.hash;
  if (n.key === cur.nav) return upOf(n, cur.hash);
  return lastOf(n.key)?.hash || homeOf(n);
}

// route() 가 화면을 바꾸기 직전에: 떠나는 화면을 기억하고, 새 화면에서 돌려놓을 스크롤을 정해요
export function enter(nav, hash, main) {
  if (cur.nav && cur.hash) remember(cur.nav, cur.hash, main?.scrollTop);
  let top = history.state?.top;
  if (jump && jump.hash === hash) top = jump.top;
  jump = null;
  cur = { nav, hash };
  if (REMEMBER.has(nav)) remember(nav, hash, typeof top === "number" ? top : 0);
  return typeof top === "number" && top > 0 ? top : 0;
}

// Dock 에서 누를 때: 보던 곳으로 가는 길이면 그 스크롤도 같이
export function onDockClick(a) {
  const k = a.dataset.nav, href = a.getAttribute("href") || "", m = lastOf(k);
  jump = m && m.hash === href && k !== cur.nav ? { hash: href, top: m.top } : null;
}

// 스크롤을 지금 기록(history.state)과 Dock 기억에 같이 적어요 — 뒤로 가기 · 새로 고침 · Dock 으로 돌아올 때 쓰려고
let t = 0;
export function watchScroll(main) {
  main.addEventListener("scroll", () => {
    clearTimeout(t);
    t = setTimeout(() => {
      const top = Math.round(main.scrollTop);
      try { if (history.state?.top !== top) history.replaceState({ ...(history.state || {}), top }, ""); } catch {}
      if (REMEMBER.has(cur.nav) && location.hash === cur.hash) remember(cur.nav, cur.hash, top);
    }, 250);
  }, { passive: true });
}

// 내용이 늦게 그려져도(불러오기) 그 높이가 될 때까지 기다렸다가 스크롤 — 그 사이 사용자가 움직이면 멈춰요
export function restoreTop(main, top) {
  if (!main || !(top > 0)) return;
  let n = 0, stop = false;
  const cancel = () => { stop = true; off(); };
  const evs = ["wheel", "touchstart", "pointerdown", "keydown"];
  const off = () => evs.forEach((e) => main.removeEventListener(e, cancel));
  evs.forEach((e) => main.addEventListener(e, cancel, { passive: true }));
  const tick = () => {
    if (stop) return;
    if (main.scrollHeight - main.clientHeight >= top - 2 || ++n > 120) { main.scrollTop = top; off(); return; }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
