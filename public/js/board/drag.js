// 보드 카드 끌기 — 마우스는 5px 움직이면, 터치는 길게(0.32초) 누르면 집어요. 집은 카드는 살짝 기울어져 손가락을 따라오고,
// 원래 카드는 점선 빈 자리(placeholder)가 되어 놓일 곳으로 옮겨 다녀요. 칸 끝 · 화면 끝에 가면 저절로 넘어가요. Esc = 그만두기.
//   const stop = boardDrag(root, { onDrop(id, col, index), onCancel() })   카드: .tb-card[data-id] · 칸: .tb-col[data-col] > .tb-body
import { $$ } from "../util.js";

const SKIP = "button, input, textarea, select, a, label, [data-nodrag]";

export function boardDrag(root, { onDrop, onCancel, scroller }) {
  let pend = null, drag = null, raf = 0, eatClick = 0;

  const cleanupPend = () => { if (pend) { clearTimeout(pend.timer); pend = null; } };
  function down(e) {
    if (drag || e.button !== 0 || !e.isPrimary) return;
    const card = e.target.closest(".tb-card"); if (!card || !root.contains(card) || e.target.closest(SKIP)) return;
    pend = { card, x: e.clientX, y: e.clientY, id: e.pointerId, touch: e.pointerType === "touch", timer: 0 };
    if (pend.touch) pend.timer = setTimeout(() => { if (pend) begin(pend.x, pend.y); }, 320);
  }
  function move(e) {
    if (pend && e.pointerId === pend.id && !drag) {
      const d = Math.hypot(e.clientX - pend.x, e.clientY - pend.y);
      if (pend.touch) { if (d > 8) cleanupPend(); else { pend.x = e.clientX; pend.y = e.clientY; } return; } // 길게 누르기 전에 움직이면 그냥 스크롤
      if (d > 5) begin(e.clientX, e.clientY);
      return;
    }
    if (drag && e.pointerId === drag.id) { e.preventDefault(); drag.x = e.clientX; drag.y = e.clientY; follow(); }
  }
  function begin(x, y) {
    const { card, id, touch } = pend; clearTimeout(pend.timer); pend = null;
    const r = card.getBoundingClientRect();
    const ghost = card.cloneNode(true);
    ghost.classList.add("tb-ghost"); ghost.removeAttribute("id"); ghost.setAttribute("aria-hidden", "true");
    Object.assign(ghost.style, { width: r.width + "px", height: r.height + "px", left: "0px", top: "0px" });
    document.body.appendChild(ghost);
    card.style.height = r.height + "px";
    card.classList.add("is-ph");
    document.body.classList.add("tb-dragging");
    drag = { card, ghost, id, x, y, ox: x - r.left, oy: y - r.top, from: card.closest(".tb-col")?.dataset.col, fromIdx: idxOf(card), touch };
    if (touch) navigator.vibrate?.(8);
    follow(); tick();
  }
  const idxOf = (card) => $$(".tb-card", card.parentElement).indexOf(card);
  function follow() {
    const { ghost, card, x, y, ox, oy } = drag;
    ghost.style.transform = `translate(${x - ox}px, ${y - oy}px) rotate(2.5deg) scale(1.02)`;
    const el = document.elementFromPoint(x, y);
    const col = el?.closest(".tb-col"); if (!col || !root.contains(col)) return;
    const body = col.querySelector(".tb-body"); if (!body) return;
    const cards = $$(".tb-card", body).filter((c) => c !== card);
    const next = cards.find((c) => { const b = c.getBoundingClientRect(); return y < b.top + b.height / 2; }) || null;
    if (card.parentElement !== body || card.nextElementSibling !== next) body.insertBefore(card, next);
  }
  // 끝 가까이 가면 저절로 넘겨요 (가로 = 보드, 세로 = 칸 · 화면)
  function tick() {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      if (!drag) return;
      const sc = scroller?.() || null, edge = 56, step = (d) => Math.ceil((edge - d) / 4);
      if (sc) {
        const r = sc.getBoundingClientRect();
        if (drag.x < r.left + edge) sc.scrollLeft -= step(drag.x - r.left);
        else if (drag.x > r.right - edge) sc.scrollLeft += step(r.right - drag.x);
      }
      const main = document.getElementById("main");
      const vs = [drag.card.closest(".tb-body"), main].find((n) => n && n.scrollHeight > n.clientHeight + 2);
      if (vs) {
        const r = vs.getBoundingClientRect();
        if (drag.y < r.top + edge) vs.scrollTop -= step(Math.max(0, drag.y - r.top));
        else if (drag.y > r.bottom - edge) vs.scrollTop += step(Math.max(0, r.bottom - drag.y));
      }
      follow(); tick();
    });
  }
  function finish(cancel) {
    cancelAnimationFrame(raf);
    const d = drag; drag = null;
    document.body.classList.remove("tb-dragging");
    const col = d.card.closest(".tb-col")?.dataset.col, idx = idxOf(d.card);
    // 놓을 자리로 미끄러져 들어가요
    const r = d.card.getBoundingClientRect();
    d.ghost.classList.add("drop");
    d.ghost.style.transform = `translate(${r.left}px, ${r.top}px) rotate(0deg)`;
    setTimeout(() => d.ghost.remove(), 170);
    d.card.classList.remove("is-ph"); d.card.style.height = "";
    eatClick = Date.now();
    if (cancel || !col) return onCancel?.();
    if (col === d.from && idx === d.fromIdx) return onCancel?.();
    onDrop?.(d.card.dataset.id, col, idx);
  }
  function up(e) {
    if (pend && e.pointerId === pend.id) cleanupPend();
    if (drag && e.pointerId === drag.id) finish(e.type === "pointercancel");
  }
  const key = (e) => { if (drag && e.key === "Escape") { e.preventDefault(); e.stopPropagation(); finish(true); } };
  const click = (e) => { if (Date.now() - eatClick < 300) { e.preventDefault(); e.stopPropagation(); } }; // 끌고 나서 놓을 때 생기는 '누르기'는 버려요
  const touchmove = (e) => { if (drag) e.preventDefault(); }; // 끄는 동안엔 화면이 따라 스크롤되지 않게
  const ctxmenu = (e) => { if (drag || pend?.touch) e.preventDefault(); };

  root.addEventListener("pointerdown", down);
  addEventListener("pointermove", move, { passive: false });
  addEventListener("pointerup", up);
  addEventListener("pointercancel", up);
  addEventListener("keydown", key, true);
  root.addEventListener("click", click, true);
  addEventListener("touchmove", touchmove, { passive: false });
  root.addEventListener("contextmenu", ctxmenu);
  return () => {
    if (drag) { drag.ghost.remove(); document.body.classList.remove("tb-dragging"); drag = null; }
    cleanupPend(); cancelAnimationFrame(raf);
    root.removeEventListener("pointerdown", down);
    removeEventListener("pointermove", move);
    removeEventListener("pointerup", up);
    removeEventListener("pointercancel", up);
    removeEventListener("keydown", key, true);
    root.removeEventListener("click", click, true);
    removeEventListener("touchmove", touchmove);
    root.removeEventListener("contextmenu", ctxmenu);
  };
}
