// 우클릭 메뉴 (공용) — 계획표 블록 · 체크리스트 · 목표 목록에서 같은 모양으로.
// openMenu(e, { title, items: [{ k, label, danger?, sep? } | { k: "prio", prio: current }], onPick(k, value), back? })
// 우선순위 줄은 알약 다섯 개(1순위 → 5순위)라 한 번에 바꿀 수 있어요. Esc · 바깥 클릭으로 닫혀요. back = Esc 로 닫으면 초점이 돌아갈 곳 (키보드로 연 메뉴)
// openDrop(anchor, { label, items: [{ v, label, sub?, p?, on?, clear? }], onPick(v) }) — 버튼 아래로 펼쳐지는 고르기 (우선순위 · 예상 시간)
import { esc } from "./util.js";

// 저장값 → 보이는 이름 (1순위 = 가장 급함). public/js/prio.js 의 PRIOS 와 같은 순서예요
const PRIOS = [["max", "1"], ["xhigh", "2"], ["high", "3"], ["medium", "4"], ["low", "5"]];
let cur = null, curAnchor = null, closedBy = null, curBack = null; // closedBy = 방금 바깥 클릭으로 닫게 한 알약 (같은 알약을 다시 누르면 토글로 닫히게)

export function closeMenu() {
  if (cur) { cur.remove(); cur = null; curAnchor?.removeAttribute("aria-expanded"); curAnchor = null; curBack = null; document.removeEventListener("pointerdown", outside, true); document.removeEventListener("keydown", onKey, true); window.removeEventListener("resize", closeMenu); window.removeEventListener("scroll", closeMenu, true); }
}
const outside = (e) => { if (cur && !cur.contains(e.target)) { closedBy = curAnchor && curAnchor.contains(e.target) ? { a: curAnchor, t: Date.now() } : null; closeMenu(); } };
const onKey = (e) => {
  if (!cur) return;
  if (e.key === "Escape") { e.preventDefault(); const b = curBack; closeMenu(); if (b?.isConnected) b.focus({ preventScroll: true }); return; }
  if (e.key === "ArrowDown" || e.key === "ArrowUp") { // 드롭다운 안에서 위아래로
    const bs = [...cur.querySelectorAll("button:not([disabled])")], i = bs.indexOf(document.activeElement);
    if (!bs.length) return; e.preventDefault();
    bs[(i + (e.key === "ArrowDown" ? 1 : -1) + bs.length) % bs.length].focus({ preventScroll: true });
  }
};
function show(m, left, top) {
  document.body.appendChild(m);
  m.style.left = left + "px"; m.style.top = top + "px";
  cur = m;
  setTimeout(() => { if (cur !== m) return; document.addEventListener("pointerdown", outside, true); document.addEventListener("keydown", onKey, true); window.addEventListener("resize", closeMenu); window.addEventListener("scroll", closeMenu, true); }, 0);
}

export function openMenu(e, { title = "", items = [], onPick, back = null }) {
  e.preventDefault(); closeMenu();
  const m = document.createElement("div");
  m.className = "cm glass"; m.setAttribute("role", "menu");
  m.innerHTML = (title ? `<div class="cm-t">${esc(title)}</div>` : "") + items.map((it) => {
    if (it.sep) return `<i class="cm-sep"></i>`;
    if (it.k === "prio") return `<div class="cm-prio" role="group" aria-label="우선순위">${PRIOS.map(([k, l]) => `<button type="button" data-k="prio" data-v="${k}" data-p="${k}" class="prio${it.prio === k ? " on" : ""}" title="${l}순위">${l}</button>`).join("")}${it.prio ? `<button type="button" class="cm-x" data-k="prio" data-v="" title="우선순위 지우기">✕</button>` : ""}</div>`;
    return `<button type="button" role="menuitem" data-k="${it.k}" class="cm-i${it.danger ? " danger" : ""}">${esc(it.label)}${it.hint ? `<small>${esc(it.hint)}</small>` : ""}</button>`;
  }).join("");
  document.body.appendChild(m);
  const w = m.offsetWidth, h = m.offsetHeight;
  m.remove();
  show(m, Math.min(e.clientX, innerWidth - w - 8), Math.min(e.clientY, innerHeight - h - 8));
  curBack = back;
  m.addEventListener("click", (ev) => { const b = ev.target.closest("[data-k]"); if (!b) return; const k = b.dataset.k, v = b.dataset.v; closeMenu(); onPick?.(k, v); });
  m.addEventListener("contextmenu", (ev) => ev.preventDefault()); // 메뉴 위에선 브라우저 메뉴를 띄우지 않아요 (Windows 는 ContextMenu 키를 뗄 때 한 번 더 보내요)
  m.querySelector("button")?.focus({ preventScroll: true });
}

// 버튼(anchor) 바로 아래로 펼쳐지는 고르기. 아래 자리가 모자라면 위로. 같은 버튼을 다시 누르면 닫혀요.
export function openDrop(anchor, { label = "", items = [], onPick }) {
  if (cur && curAnchor === anchor) { closeMenu(); return; }
  if (closedBy && closedBy.a === anchor && Date.now() - closedBy.t < 500) { closedBy = null; return; } // pointerdown 으로 이미 닫힘 → 이 click 은 토글의 '닫기'
  closedBy = null;
  closeMenu();
  const m = document.createElement("div");
  m.className = "cm glass cm-drop"; m.setAttribute("role", "listbox"); if (label) m.setAttribute("aria-label", label);
  m.innerHTML = items.map((it) => `<button type="button" role="option" aria-selected="${it.on ? "true" : "false"}" data-v="${esc(it.v)}" ${it.p !== undefined ? `data-p="${esc(it.p)}"` : ""} class="cm-o${it.on ? " on" : ""}${it.clear ? " clear" : ""}">${it.p !== undefined ? `<i class="cm-dot"></i>` : ""}<span class="cm-ol">${esc(it.label)}</span>${it.sub ? `<small>${esc(it.sub)}</small>` : ""}${it.on ? `<svg class="cm-ck" viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path d="M3 8.5l3.2 3L13 4.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>` : ""}</button>`).join("");
  document.body.appendChild(m);
  const w = m.offsetWidth, h = m.offsetHeight, r = anchor.getBoundingClientRect();
  m.remove();
  // 기본은 아래로 펼쳐요. 아래 자리가 모자라면 안에서 스크롤하고, 아래가 너무 좁을(220px 미만) 때만 위로
  let left = Math.max(8, Math.min(r.left, innerWidth - w - 8)), top = r.bottom + 6;
  const below = innerHeight - 8 - top, above = r.top - 6 - 8;
  if (h > below && below < 220 && above > below) { const hh = Math.min(h, above); top = r.top - 6 - hh; m.style.maxHeight = hh + "px"; m.classList.add("up"); }
  else if (h > below) m.style.maxHeight = below + "px";
  show(m, left, top);
  curAnchor = anchor; anchor.setAttribute("aria-expanded", "true");
  m.addEventListener("click", (ev) => { const b = ev.target.closest("[data-v]"); if (!b) return; const v = b.dataset.v; closeMenu(); anchor.focus?.({ preventScroll: true }); onPick?.(v); });
  (m.querySelector(".on") || m.querySelector("button"))?.focus({ preventScroll: true });
}
