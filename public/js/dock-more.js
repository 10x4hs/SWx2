// SWx2 — Dock '더보기': 아직 못 여는 앱(잠긴 기능 · 신청 전/승인 전)은 Dock 칸을 차지하지 않고 이 타일 하나 뒤로 모여요 (2026-11-16).
// 타일을 누르면 작은 창: 앱마다 이름 · 무엇인지 · 잠긴 이유 + '사용 신청' (잠긴 화면 features.js 의 신청과 같은 API).
// 관리자 전용(SVM)은 다른 사람에게 아예 없는 앱이라 여기에도 안 나와요 (서버도 404).
// 타일은 #dock-list 맨 끝에 붙지만 data-dock 이 없어서 끌기 · 폴더 · 순서 저장에서는 빠지고, 확대(magnify)는 같이 받아요.
import { api } from "./api.js";
import { $, esc, toast } from "./util.js";
import { appIcon } from "./icons.js";
import { NAV_FEATURE, loadFeatures } from "./features.js";

let ctx, redraw, locked = [];
const LOCK = `<svg width="9" height="10" viewBox="0 0 9 10" aria-hidden="true"><rect x="0.5" y="4.2" width="8" height="5.3" rx="1.4" fill="currentColor"/><path d="M2.3 4.4V3a2.2 2.2 0 0 1 4.4 0v1.4" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>`;
const icOf = (n) => n.img ? `<span class="app-ic ic-img ic-${n.key}"><img src="${n.img}" alt="" draggable="false" decoding="async"></span>` : appIcon(n.icon || n.key);
const pop = () => $("#dock-more-pop"), btn = () => $("#dock-more-btn");

// Dock 이 그릴 타일 (잠긴 앱이 없으면 빈 글자 = 타일 없음). 지금 화면이 잠긴 앱 중 하나면 타일에 '지금 여기' 점
export function moreTile(list, curNav) {
  locked = list;
  if (!list.length) { closeMore(false); return ""; }
  const here = list.some((n) => n.key === curNav), open = !!pop() && !pop().hidden;
  return `<button type="button" class="rail-btn dock-more-btn" id="dock-more-btn" aria-haspopup="dialog" aria-expanded="${open}" aria-controls="dock-more-pop" aria-label="더보기 · 잠긴 앱 ${list.length}개" data-tip="더보기"${here ? ` aria-current="page"` : ""}>${appIcon("more")}</button>`;
}

export function initDockMore(deps) {
  ({ ctx, redraw } = deps);
  document.addEventListener("click", (e) => {
    if (e.target.closest?.("#dock-more-btn")) { e.preventDefault(); pop() && !pop().hidden ? closeMore() : openMore(); return; }
    const p = pop(); if (p && !p.hidden && e.target.isConnected && !e.target.closest("#dock-more-pop")) closeMore(false);
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && pop() && !pop().hidden) { e.stopPropagation(); closeMore(); } }, true);
  window.addEventListener("resize", () => { if (pop() && !pop().hidden) place(); });
  window.addEventListener("hashchange", () => closeMore(false));
}

function rows() {
  const all = ctx.features?.all || {}, pend = ctx.features?.pending || [];
  return locked.map((n) => {
    const f = NAV_FEATURE[n.key], waiting = pend.includes(f);
    return `<li class="dm-row${waiting ? " wait" : ""}">
      <a class="dm-app" href="${n.hash}" title="${esc(all[f] || n.label)}">${icOf(n)}<span class="dm-txt"><b>${esc(n.label)}</b><small><span class="dm-lock" aria-hidden="true">${LOCK}</span>${waiting ? "신청함" : "잠김"}${all[f] ? " · " + esc(all[f]) : ""}</small></span></a>
      ${waiting ? `<span class="dm-state" role="status">승인 기다리는 중</span>` : `<button type="button" class="btn sm dm-req" data-f="${f}" aria-label="${esc(n.label)} 사용 신청">사용 신청</button>`}
    </li>`;
  }).join("");
}

function draw(p) {
  p.innerHTML = `<header class="dm-head"><h2 id="dock-more-t">더보기</h2><p>아직 잠긴 앱이에요. 사용 신청을 하면 관리자가 확인하고 열어 줘요.</p></header>
    <ul class="dm-list">${rows()}</ul>
    <a class="dm-ask" href="#/room/help">관리자에게 물어보기 →</a>`;
}

function openMore() {
  if (!locked.length) return;
  document.querySelectorAll("body > #dock-more-pop").forEach((x) => x.remove());
  const p = document.createElement("section");
  p.id = "dock-more-pop"; p.className = "dock-more-pop glass";
  p.setAttribute("role", "dialog"); p.setAttribute("aria-labelledby", "dock-more-t");
  draw(p);
  document.body.append(p);
  p.addEventListener("click", onPick);
  btn()?.setAttribute("aria-expanded", "true");
  place();
  (p.querySelector(".dm-req") || p.querySelector(".dm-app"))?.focus({ preventScroll: true });
}

export function closeMore(refocus = true) {
  const p = pop(); if (!p) return;
  p.remove();
  const b = btn(); b?.setAttribute("aria-expanded", "false");
  if (refocus) b?.focus({ preventScroll: true });
}

// 컴퓨터: Dock(왼쪽 세로) 오른쪽, 타일 높이에 맞춰 · 폰: Dock(아래 가로) 바로 위 (좌우는 CSS)
function place() {
  const p = pop(), b = btn(), rail = document.querySelector(".rail.dock"); if (!p || !rail) return;
  const rr = rail.getBoundingClientRect(), br = (b || rail).getBoundingClientRect();
  if (rr.width > rr.height) { p.style.top = p.style.left = ""; p.style.bottom = Math.round(innerHeight - rr.top + 10) + "px"; return; }
  p.style.bottom = "";
  p.style.left = Math.round(rr.right + 12) + "px";
  p.style.top = Math.round(Math.max(12, Math.min(br.top - 12, innerHeight - p.offsetHeight - 12))) + "px";
}

async function onPick(e) {
  if (e.target.closest(".dm-app, .dm-ask")) { closeMore(false); return; } // 앱 이름 → 그 앱의 잠긴 화면 (이유 쓰기 · 관리자에게 묻기)
  const b = e.target.closest(".dm-req"); if (!b) return;
  e.stopPropagation();
  b.disabled = true;
  const f = b.dataset.f;
  try {
    const r = await api.requestFeature(f, "");
    if (r.open) { await loadFeatures(ctx); closeMore(false); redraw(); toast("이미 열려 있어요. Dock 에 올렸어요."); return; }
    if (!(ctx.features.pending ||= []).includes(f)) ctx.features.pending.push(f);
    toast("사용 신청을 보냈어요.");
    const p = pop(); if (p) { draw(p); place(); p.querySelector(".dm-req, .dm-app")?.focus({ preventScroll: true }); }
  } catch (err) { b.disabled = false; toast(err.message, "err"); }
}
