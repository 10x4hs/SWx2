// 차트 넘기기 — ‹ › 버튼 · 아래 점과 이름 · 키보드 ←/→ · 모바일 밀기. 마지막으로 본 쪽은 브라우저에 기억해요.
// view 안에 쪽(.pg-slide)을 겹쳐 두고, 바뀔 때 옛 쪽은 밀려 나가고 새 쪽이 들어와요.
const reduce = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const KEY = "trio-home-page";
export const savedPage = (n) => { try { const v = +localStorage.getItem(KEY); return Number.isInteger(v) && v >= 0 && v < n ? v : 0; } catch { return 0; } };
const savePage = (i) => { try { localStorage.setItem(KEY, String(i)); } catch {} };

// 키보드 ←/→ 를 가로채면 안 되는 곳 (입력칸, 열린 창)
const typing = (el) => el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.closest?.("[role=slider]"));

// pages = [{ key, label }], render(i) → HTML, onChange(i)
export function mountPager({ area, view, tabs, pages, index = 0, render, onChange }) {
  let cur = index;
  const n = pages.length;

  tabs.innerHTML = pages.map((p, i) => `<button type="button" class="pg-tab" role="tab" data-page="${i}" aria-controls="${view.id}"><i></i>${p.label}</button>`).join("");
  const arrows = [...area.querySelectorAll("[data-page-prev],[data-page-next]"), ...tabs.parentElement.querySelectorAll(".pg-mini")];

  function paintNav() {
    tabs.querySelectorAll("[data-page]").forEach((b) => { const on = +b.dataset.page === cur; b.setAttribute("aria-selected", String(on)); b.tabIndex = on ? 0 : -1; });
    arrows.forEach((b) => { const prev = b.hasAttribute("data-page-prev"), j = (cur + (prev ? -1 : 1) + n) % n; b.setAttribute("aria-label", `${prev ? "이전" : "다음"} 차트: ${pages[j].label}`); });
    view.setAttribute("aria-label", `${pages[cur].label} 차트 (${cur + 1}/${n})`);
  }

  // 지금 쪽 다시 그리기 (자료가 새로 왔을 때) — 움직임 없이
  function redraw() {
    view.querySelectorAll(".pg-slide.out").forEach((el) => el.remove());
    let el = view.querySelector(".pg-slide");
    if (!el) { el = document.createElement("div"); el.className = "pg-slide"; view.append(el); }
    el.innerHTML = render(cur);
    return el;
  }

  function go(i, dir = 0) {
    i = ((i % n) + n) % n;
    if (i === cur && view.querySelector(".pg-slide")) return;
    if (!dir) dir = i > cur ? 1 : -1;
    cur = i;
    savePage(i);
    paintNav();
    view.querySelectorAll(".pg-slide.out").forEach((el) => el.remove());
    const old = view.querySelector(".pg-slide");
    const el = document.createElement("div");
    el.className = "pg-slide";
    el.innerHTML = render(i);
    if (old && !reduce()) {
      old.classList.add("out"); old.style.setProperty("--dir", dir); old.setAttribute("aria-hidden", "true"); old.inert = true;
      el.classList.add("in"); el.style.setProperty("--dir", dir);
      setTimeout(() => old.remove(), 460);
      el.addEventListener("animationend", () => el.classList.remove("in"), { once: true });
      view.append(el);
    } else view.replaceChildren(el);
    onChange?.(i, el);
  }

  // 버튼 · 점
  const onClick = (e) => {
    if (e.target.closest("[data-page-prev]")) { go(cur - 1, -1); return; }
    if (e.target.closest("[data-page-next]")) { go(cur + 1, 1); return; }
    const t = e.target.closest("[data-page]");
    if (t) go(+t.dataset.page);
  };
  area.addEventListener("click", onClick);
  tabs.parentElement.addEventListener("click", onClick);

  // 키보드 ←/→ (입력 중이 아닐 때만)
  const onKey = (e) => {
    if (e.defaultPrevented || e.altKey || e.metaKey || e.ctrlKey || e.shiftKey || typing(e.target)) return;
    if (document.querySelector(".palette-back, [aria-modal='true']")) return;
    if (e.key === "ArrowLeft") { e.preventDefault(); go(cur - 1, -1); }
    else if (e.key === "ArrowRight") { e.preventDefault(); go(cur + 1, 1); }
  };
  document.addEventListener("keydown", onKey);

  // 모바일: 옆으로 밀기
  let sx = 0, sy = 0, st = 0;
  const onStart = (e) => { const p = e.touches[0]; sx = p.clientX; sy = p.clientY; st = Date.now(); };
  const onEnd = (e) => {
    const p = e.changedTouches[0], dx = p.clientX - sx, dy = p.clientY - sy;
    if (Date.now() - st < 800 && Math.abs(dx) > 44 && Math.abs(dx) > Math.abs(dy) * 1.4) go(cur + (dx < 0 ? 1 : -1), dx < 0 ? 1 : -1);
  };
  area.addEventListener("touchstart", onStart, { passive: true });
  area.addEventListener("touchend", onEnd, { passive: true });

  paintNav();
  return {
    get index() { return cur; },
    go, redraw,
    destroy() { document.removeEventListener("keydown", onKey); },
  };
}
