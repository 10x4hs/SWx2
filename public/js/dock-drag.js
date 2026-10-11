// Dock 아이콘 끌어서 순서 바꾸기 (Mac Dock 처럼). 순서는 계정에 저장돼요 (users.dock_order · PATCH /me).
//   마우스: 누른 채 5px 넘게 움직이면 끌기 시작 · 오른쪽 클릭은 그대로 메뉴
//   손가락: 0.45초 길게 누르면 들려요 → 움직이면 끌기, 안 움직이고 떼면 메뉴(페이지 아이콘만)
// 끄는 동안 다른 아이콘이 비켜 주고(DOM 순서를 바로 바꿔요), 놓으면 onDrop(keys) 로 새 순서를 알려 줘요.
const HOLD_MS = 450, MOVE_PX = 5;

export function wireDockDrag(list, { onDrop, onHoldMenu }) {
  let st = null; // { el, id, x, y, touch, ready, dragging, timer }
  const items = () => [...list.querySelectorAll(":scope > [data-dock]")];
  const vertical = () => { const a = items(); return a.length < 2 || Math.abs(a[1].offsetTop - a[0].offsetTop) > Math.abs(a[1].offsetLeft - a[0].offsetLeft); };

  const start = () => {
    st.dragging = true;
    st.el.classList.add("dock-dragging");
    list.classList.add("dock-sorting");
    navigator.vibrate?.(8);
  };
  const end = (commit) => {
    if (!st) return;
    clearTimeout(st.timer);
    const was = st.dragging, el = st.el, before = st.before;
    el.classList.remove("dock-dragging", "dock-held");
    list.classList.remove("dock-sorting");
    st = null;
    if (!was) return;
    // 끈 직후의 클릭(링크 열기)은 막아요
    const stop = (e) => { e.preventDefault(); e.stopPropagation(); };
    window.addEventListener("click", stop, { capture: true, once: true });
    setTimeout(() => window.removeEventListener("click", stop, true), 300);
    const keys = items().map((x) => x.dataset.dock);
    if (commit && keys.join("|") !== before) onDrop(keys);
  };

  list.addEventListener("pointerdown", (e) => {
    const el = e.target.closest("[data-dock]");
    if (!el || el.parentElement !== list || (e.pointerType === "mouse" && e.button !== 0)) return;
    const touch = e.pointerType !== "mouse";
    st = { el, x: e.clientX, y: e.clientY, touch, ready: !touch, dragging: false, before: items().map((x) => x.dataset.dock).join("|") };
    if (touch) st.timer = setTimeout(() => { if (!st) return; st.ready = true; el.classList.add("dock-held"); navigator.vibrate?.(10); }, HOLD_MS);
  });
  window.addEventListener("pointermove", (e) => {
    if (!st) return;
    const dx = e.clientX - st.x, dy = e.clientY - st.y, far = Math.hypot(dx, dy) > MOVE_PX;
    if (!st.ready) { if (far) { clearTimeout(st.timer); st = null; } return; } // 손가락: 들리기 전에 움직이면 스크롤로 보내요
    if (!st.dragging) { if (!far) return; start(); }
    // 손가락(포인터) 밑의 아이콘과 자리를 바꿔요 — 반을 넘으면 그 앞/뒤로
    const v = vertical(), p = v ? e.clientY : e.clientX;
    for (const other of items()) {
      if (other === st.el) continue;
      const r = other.getBoundingClientRect(), lo = v ? r.top : r.left, hi = v ? r.bottom : r.right, mid = (lo + hi) / 2;
      if (p >= lo && p <= hi) {
        const after = p > mid;
        if (after && other.nextElementSibling !== st.el) other.after(st.el);
        else if (!after && other.previousElementSibling !== st.el) other.before(st.el);
        break;
      }
    }
  });
  window.addEventListener("pointerup", () => {
    if (st && st.touch && st.ready && !st.dragging) { const el = st.el; end(false); onHoldMenu?.(el); return; } // 길게 누르고 그냥 떼면 메뉴
    end(true);
  });
  window.addEventListener("pointercancel", () => end(false));
  // 들린 뒤에는 화면이 스크롤되지 않게 (폰 아래 막대는 가로 스크롤이라서)
  list.addEventListener("touchmove", (e) => { if (st?.ready) e.preventDefault(); }, { passive: false });
  // 링크 아이콘을 브라우저가 따로 끌어 가지 않게
  list.addEventListener("dragstart", (e) => { if (e.target.closest?.("[data-dock]")) e.preventDefault(); });
  // 길게 누를 때 뜨는 기본 메뉴(iOS 링크 미리보기 · 안드로이드 메뉴)는 우리가 대신 띄워요
  list.addEventListener("contextmenu", (e) => { if (e.pointerType && e.pointerType !== "mouse" && e.target.closest("[data-dock]")) e.preventDefault(); });
}

// 저장된 순서대로 정렬. 순서에 없는 새 아이콘(새 페이지 · 새 메뉴)은 원래 자리 근처, 끝쪽에 붙어요
export function sortByOrder(entries, order) {
  const at = new Map((order || []).map((k, i) => [k, i]));
  const known = entries.filter((e) => at.has(e.key)).sort((a, b) => at.get(a.key) - at.get(b.key));
  return [...known, ...entries.filter((e) => !at.has(e.key))];
}
