// Dock 아이콘 끌어서 순서 바꾸기 (Mac Dock 처럼). 순서는 계정에 저장돼요 (users.dock_order · PATCH /me).
//   마우스: 누른 채 5px 넘게 움직이면 끌기 시작 · 오른쪽 클릭은 그대로 메뉴
//   손가락: 0.45초 길게 누르면 들려요 → 움직이면 끌기, 안 움직이고 떼면 메뉴(페이지 아이콘만)
// 끄는 동안 다른 아이콘이 비켜 주고(DOM 순서를 바로 바꿔요), 놓으면 onDrop({ order, kids, merge }) 로 새 모양을 알려 줘요.
//   폴더(Discord 처럼): 다른 아이콘 가운데에 0.4초 머물면 테두리가 뜨고, 그때 놓으면 merge = { drag, onto } → 폴더로 묶어요
//   폴더 안 아이콘은 폴더 밖으로 끌어내면 Dock 줄로 나와요 (kids 에서 빠져요)
const HOLD_MS = 450, MOVE_PX = 5, MERGE_MS = 400;

export function wireDockDrag(list, { onDrop, onHoldMenu }) {
  let st = null; // { el, home, x, y, touch, ready, dragging, timer, over, mergeT, merge, before }
  const items = () => [...list.querySelectorAll(":scope > [data-dock]")];
  const vertical = () => { const a = items(); return a.length < 2 || Math.abs(a[1].offsetTop - a[0].offsetTop) > Math.abs(a[1].offsetLeft - a[0].offsetLeft); };
  // 지금 Dock 모양 = 맨 위 순서 + 폴더마다 안의 순서 (DOM 이 곧 상태예요)
  const snap = () => ({ order: items().map((x) => x.dataset.dock), kids: Object.fromEntries([...list.querySelectorAll(":scope > [data-folder]")].map((f) => [f.dataset.folder, [...f.querySelectorAll(".dock-fold-items > [data-dock]")].map((x) => x.dataset.dock)])) });
  const sig = () => JSON.stringify(snap());
  const clearOver = () => { if (!st) return; clearTimeout(st.mergeT); st.over?.classList.remove("dock-merge"); st.over = null; st.merge = false; };

  const start = () => {
    st.dragging = true;
    st.el.classList.add("dock-dragging");
    list.classList.add("dock-sorting");
    navigator.vibrate?.(8);
  };
  const end = (commit) => {
    if (!st) return;
    clearTimeout(st.timer);
    const was = st.dragging, el = st.el, before = st.before, merge = st.merge ? st.over?.dataset.dock : null;
    clearOver();
    el.classList.remove("dock-dragging", "dock-held");
    list.classList.remove("dock-sorting");
    st = null;
    if (!was) return;
    // 끈 직후의 클릭(링크 열기 · 폴더 펼치기)은 막아요
    const stop = (e) => { e.preventDefault(); e.stopPropagation(); };
    window.addEventListener("click", stop, { capture: true, once: true });
    setTimeout(() => window.removeEventListener("click", stop, true), 300);
    if (commit && (merge || sig() !== before)) onDrop({ ...snap(), merge: merge ? { drag: el.dataset.dock, onto: merge } : null });
  };

  list.addEventListener("pointerdown", (e) => {
    const el = e.target.closest("[data-dock]");
    if (!el || (e.pointerType === "mouse" && e.button !== 0)) return;
    const home = el.parentElement.classList.contains("dock-fold-items") ? el.closest("[data-folder]") : null; // 폴더 안 아이콘이면 그 폴더
    if (el.parentElement !== list && !home) return;
    const touch = e.pointerType !== "mouse";
    st = { el, home, x: e.clientX, y: e.clientY, touch, ready: !touch, dragging: false, before: sig() };
    if (touch) st.timer = setTimeout(() => { if (!st) return; st.ready = true; el.classList.add("dock-held"); navigator.vibrate?.(10); }, HOLD_MS);
  });
  window.addEventListener("pointermove", (e) => {
    if (!st) return;
    const dx = e.clientX - st.x, dy = e.clientY - st.y, far = Math.hypot(dx, dy) > MOVE_PX;
    if (!st.ready) { if (far) { clearTimeout(st.timer); st = null; } return; } // 손가락: 들리기 전에 움직이면 스크롤로 보내요
    if (!st.dragging) { if (!far) return; start(); }
    const v = vertical(), p = v ? e.clientY : e.clientX;
    // 폴더 안에서 꺼낸 아이콘: 폴더 밖으로 나가면 Dock 줄로, 다시 들어오면 폴더로
    let box = list;
    if (st.home) {
      const r = st.home.getBoundingClientRect();
      const inside = e.clientX >= r.left - 4 && e.clientX <= r.right + 4 && e.clientY >= r.top - 4 && e.clientY <= r.bottom + 4;
      const fi = st.home.querySelector(".dock-fold-items");
      if (inside) { box = fi; if (st.el.parentElement !== fi) fi.append(st.el); }
      else if (st.el.parentElement !== list) { const lo = v ? r.top : r.left; (p < lo ? st.home.before(st.el) : st.home.after(st.el)); }
    }
    const sibs = [...box.querySelectorAll(":scope > [data-dock]")];
    const mine = sibs.indexOf(st.el);
    let over = null;
    for (const other of sibs) {
      if (other === st.el) continue;
      const r = other.getBoundingClientRect(), lo = v ? r.top : r.left, hi = v ? r.bottom : r.right, q = (hi - lo) * 0.25;
      if (p < lo || p > hi) continue;
      // 가운데에 머물면 폴더 만들기 (폴더 · 폴더 안끼리는 안 돼요), 먼 쪽 끝까지 가야 자리를 바꿔요 — 가운데를 지나갈 틈이 생겨요
      const canMerge = box === list && !st.el.dataset.folder;
      if (canMerge && p > lo + q && p < hi - q) { over = other; break; }
      const after = sibs.indexOf(other) > mine;
      if (after ? p > hi - q || !canMerge && p > (lo + hi) / 2 : p < lo + q || !canMerge && p < (lo + hi) / 2) { after ? other.after(st.el) : other.before(st.el); }
      break;
    }
    if (over !== st.over) {
      clearOver();
      if (over) { st.over = over; st.mergeT = setTimeout(() => { if (st?.over === over) { st.merge = true; over.classList.add("dock-merge"); navigator.vibrate?.(6); } }, MERGE_MS); }
    }
  });
  window.addEventListener("pointerup", (e) => {
    if (st && st.touch && st.ready && !st.dragging) { const el = st.el; end(false); onHoldMenu?.(el); return; } // 길게 누르고 그냥 떼면 메뉴
    // 가운데에서 바로 놓았는데 아직 폴더 표시가 안 떴으면 = 그냥 순서 바꾸기 (반 넘으면 뒤로)
    if (st?.dragging && st.over && !st.merge) {
      const r = st.over.getBoundingClientRect(), v = vertical(), p = v ? e.clientY : e.clientX;
      p > (v ? r.top + r.height / 2 : r.left + r.width / 2) ? st.over.after(st.el) : st.over.before(st.el);
    }
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
