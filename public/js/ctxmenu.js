// 우클릭 메뉴 (공용) — 계획표 블록 · 체크리스트 · 목표 목록에서 같은 모양으로.
// openMenu(e, { title, items: [{ k, label, danger?, sep? } | { k: "prio", prio: current }], onPick(k, value) })
// 우선순위 줄은 알약 다섯 개(Low → Max)라 한 번에 바꿀 수 있어요. Esc · 바깥 클릭으로 닫혀요.
import { esc } from "./util.js";

const PRIOS = [["low", "Low"], ["medium", "Med"], ["high", "High"], ["xhigh", "XHigh"], ["max", "Max"]];
let cur = null;

export function closeMenu() { if (cur) { cur.remove(); cur = null; document.removeEventListener("pointerdown", outside, true); document.removeEventListener("keydown", onKey, true); } }
const outside = (e) => { if (cur && !cur.contains(e.target)) closeMenu(); };
const onKey = (e) => { if (e.key === "Escape") { e.preventDefault(); closeMenu(); } };

export function openMenu(e, { title = "", items = [], onPick }) {
  e.preventDefault(); closeMenu();
  const m = document.createElement("div");
  m.className = "cm glass"; m.setAttribute("role", "menu");
  m.innerHTML = (title ? `<div class="cm-t">${esc(title)}</div>` : "") + items.map((it) => {
    if (it.sep) return `<i class="cm-sep"></i>`;
    if (it.k === "prio") return `<div class="cm-prio" role="group" aria-label="우선순위">${PRIOS.map(([k, l]) => `<button type="button" data-k="prio" data-v="${k}" data-p="${k}" class="prio${it.prio === k ? " on" : ""}">${l}</button>`).join("")}${it.prio ? `<button type="button" class="cm-x" data-k="prio" data-v="" title="우선순위 지우기">✕</button>` : ""}</div>`;
    return `<button type="button" role="menuitem" data-k="${it.k}" class="cm-i${it.danger ? " danger" : ""}">${esc(it.label)}${it.hint ? `<small>${esc(it.hint)}</small>` : ""}</button>`;
  }).join("");
  document.body.appendChild(m);
  const w = m.offsetWidth, h = m.offsetHeight;
  m.style.left = Math.min(e.clientX, innerWidth - w - 8) + "px";
  m.style.top = Math.min(e.clientY, innerHeight - h - 8) + "px";
  m.addEventListener("click", (ev) => { const b = ev.target.closest("[data-k]"); if (!b) return; const k = b.dataset.k, v = b.dataset.v; closeMenu(); onPick?.(k, v); });
  cur = m;
  setTimeout(() => { document.addEventListener("pointerdown", outside, true); document.addEventListener("keydown", onKey, true); }, 0);
  m.querySelector("button")?.focus({ preventScroll: true });
}
