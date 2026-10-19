// SW 공간 — #/sw (과정 목록) · #/sw/<과정> (그 과정 홈) · #/sw/<과정>/today · docs · ask[/<모듈>] · <모듈> (한 주)
//   #/sw/<과정>/<모듈>/<카드> · <모듈>/case/<사례> · <모듈>/practice[/<날>] (회의실) — 과정: dev(개발 흐름) · vg(Vector & Graph)
//   옛 주소 #/dev/… 는 #/sw/dev/… 와 같아요
import { mountSw } from "../dev/sw.js";
import { mountHome } from "../dev/home.js";
import { mountVgHome } from "../dev/vghome.js";
import { mountWeek } from "../dev/week.js";
import { mountCard } from "../dev/card.js";
import { mountCase } from "../dev/case.js";
import { mountMeeting } from "../dev/meeting.js";
import { mountToday } from "../dev/today.js";
import { mountDocs } from "../dev/docs.js";
import { mountAsk } from "../dev/ask.js";
import { COURSES, setCourse } from "../dev/data.js";

let inst = null;
export function update(r) { inst?.update(r); }

export function mount(root, ctx, r) {
  let cur = null, stop = null;
  function show(course, id, sub, item) {
    const key = `${course || ""}/${id || ""}/${sub || ""}/${item || ""}`;
    if (stop && cur === key) return;
    stop?.();
    cur = key;
    const host = document.createElement("div");
    host.className = "dv";
    if (course && !COURSES[course]) course = null;
    host.dataset.course = course || "sw";
    if (course) setCourse(course);
    root.replaceChildren(host);
    stop = !course ? mountSw(host, ctx)
      : id === "today" ? mountToday(host, ctx)
      : id === "ask" ? mountAsk(host, ctx, sub)
      : id === "docs" && COURSES[course].docs ? mountDocs(host, ctx)
      : id && sub === "case" && item ? mountCase(host, ctx, id, item)
      : id && sub === "practice" ? mountMeeting(host, ctx, id, item)
      : id && sub ? mountCard(host, ctx, id, sub)
      : id ? mountWeek(host, ctx, id)
      : course === "dev" ? mountHome(host, ctx)
      : mountVgHome(host, ctx);
    root.closest(".main")?.scrollTo?.({ top: 0 });
  }
  const go = (x) => show(x.course || null, x.id || null, x.sub || null, x.item || null);
  inst = { update: go };
  go(r);
  return () => { stop?.(); inst = null; };
}
