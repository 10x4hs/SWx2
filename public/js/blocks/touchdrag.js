// Finger drag for the block editor and database cards (mouse keeps native HTML5 drag).
// Long-press (0.4 s, like dock-drag.js) lifts the item; moving shows where it lands; lifting the finger drops.
const HOLD_MS = 400, SLOP = 8;

// root: container · sel: what can be lifted · o: { over(x, y, el) → bool, drop(x, y, el), end() }
export function touchDrag(root, sel, o) {
  let st = null;
  const clear = () => { if (st) { clearTimeout(st.timer); st.el.classList.remove("touch-lift"); } st = null; document.body.classList.remove("touch-dragging"); };
  root.addEventListener("pointerdown", (e) => {
    if (e.pointerType !== "touch") return;
    const el = e.target.closest?.(sel); if (!el || !root.contains(el)) return;
    st = { el, x: e.clientX, y: e.clientY, ready: false, id: e.pointerId };
    st.timer = setTimeout(() => { if (!st) return; st.ready = true; el.classList.add("touch-lift"); document.body.classList.add("touch-dragging"); navigator.vibrate?.(10); }, HOLD_MS);
  });
  root.addEventListener("pointermove", (e) => {
    if (!st || e.pointerId !== st.id) return;
    if (!st.ready) { if (Math.hypot(e.clientX - st.x, e.clientY - st.y) > SLOP) clear(); return; } // a scroll, not a drag
    e.preventDefault();
    o.over?.(e.clientX, e.clientY, st.el);
  });
  const up = (e) => {
    if (!st || e.pointerId !== st.id) return;
    const s = st; clear();
    if (s.ready) {
      e.preventDefault(); o.drop(e.clientX, e.clientY, s.el);
      const eat = (ev) => { ev.stopPropagation(); ev.preventDefault(); }; // the click that follows a drop is not a tap
      root.addEventListener("click", eat, { capture: true, once: true });
      setTimeout(() => root.removeEventListener("click", eat, { capture: true }), 400);
    }
    o.end?.();
  };
  root.addEventListener("pointerup", up);
  root.addEventListener("pointercancel", () => { clear(); o.end?.(); });
  // stop the page from scrolling while an item is lifted
  root.addEventListener("touchmove", (e) => { if (st?.ready) e.preventDefault(); }, { passive: false });
  root.addEventListener("contextmenu", (e) => { if (st) e.preventDefault(); });
}
