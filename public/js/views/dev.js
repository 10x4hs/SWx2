// SW 과정 — #/sw (과정 두 권) · #/sw/<과정> (그 과정의 목차) · #/sw/<과정>/today · docs · ask[/<모듈>] · figs[/<그림>] · <모듈> (한 장)
//   #/sw/<과정>/<모듈>/<카드> · <모듈>/case/<사례> · <모듈>/practice[/<날>] (회의실) — 과정: dev(개발 흐름) · vg(Vector & Graph)
//   옛 주소 #/dev/… 는 #/sw/dev/… 와 같아요
//   2026-10-20: 별 · 3D 세계 · 유리 대신 종이 교과서. 바탕은 조용한 종이(밤에는 [밤] 버튼으로 차분한 어둠), 움직임은 설명 그림 안에서만.
import { mountSw } from "../dev/sw.js";
import { mountCourse } from "../dev/course.js";
import { mountWeek } from "../dev/week.js";
import { mountCard } from "../dev/card.js";
import { mountCase } from "../dev/case.js";
import { mountMeeting } from "../dev/meeting.js";
import { mountToday } from "../dev/today.js";
import { mountDocs } from "../dev/docs.js";
import { mountAsk } from "../dev/ask.js";
import { mountFigs } from "../dev/figs.js";
import { COURSES, setCourse, theme, setTheme } from "../dev/data.js";

let inst = null;
export function update(r) { inst?.update(r); }

export function mount(root, ctx, r) {
  let cur = null, stop = null;
  const page = document.createElement("div");
  root.replaceChildren(page);
  const main = root.closest(".main");
  // 종이 · 밤 — 이 기기에 기억. 화면 칸(.main) 바탕도 같이 바꿔요
  const paint = () => { const t = theme(); root.dataset.swTheme = t; page.querySelector(".dv")?.setAttribute("data-sw-theme", t); page.querySelectorAll("[data-night]").forEach((b) => b.setAttribute("aria-pressed", String(t === "night"))); };
  root.addEventListener("click", (e) => {
    const b = e.target.closest("[data-night]"); if (!b) return;
    setTheme(theme() === "night" ? "paper" : "night"); paint();
    document.dispatchEvent(new CustomEvent("sw-theme", { detail: theme() })); // 그림(3D)이 색을 다시 칠해요
  });

  function show(course, id, sub, item) {
    const key = `${course || ""}/${id || ""}/${sub || ""}/${item || ""}`;
    if (stop && cur === key) return;
    stop?.();
    cur = key;
    const host = document.createElement("div");
    host.className = "dv";
    if (course && !COURSES[course]) course = null;
    host.dataset.course = course || "sw";
    host.dataset.swTheme = theme();
    if (course) setCourse(course);
    page.replaceChildren(host);
    const c = { ...ctx };
    stop = !course ? mountSw(host, c)
      : id === "today" ? mountToday(host, c)
      : id === "ask" ? mountAsk(host, c, sub)
      : id === "figs" ? mountFigs(host, c, sub)
      : id === "docs" && COURSES[course].docs ? mountDocs(host, c)
      : id && sub === "case" && item ? mountCase(host, c, id, item)
      : id && sub === "practice" ? mountMeeting(host, c, id, item)
      : id && sub ? mountCard(host, c, id, sub)
      : id ? mountWeek(host, c, id)
      : mountCourse(host, c, course);
    paint();
    main?.scrollTo?.({ top: 0 });
  }
  const go = (x) => show(x.course || null, x.id || null, x.sub || null, x.item || null);
  inst = { update: go };
  go(r);
  return () => { stop?.(); inst = null; };
}
