// 개발 흐름 마이크로디그리 — #/dev (홈 · 3D 흐름 지도 · 현황판) · #/dev/today · #/dev/docs · #/dev/ask[/<모듈>] (AI 질문) · #/dev/<모듈> (한 주)
//   #/dev/<모듈>/<카드> · #/dev/<모듈>/case/<사례> · #/dev/<모듈>/practice[/<날>] (회의실)
import { mountHome } from "../dev/home.js";
import { mountWeek } from "../dev/week.js";
import { mountCard } from "../dev/card.js";
import { mountCase } from "../dev/case.js";
import { mountMeeting } from "../dev/meeting.js";
import { mountToday } from "../dev/today.js";
import { mountDocs } from "../dev/docs.js";
import { mountAsk } from "../dev/ask.js";

let inst = null;
export function update(r) { inst?.update(r); }

export function mount(root, ctx, r) {
  let cur = null, stop = null;
  function show(id, sub, item) {
    const key = `${id || ""}/${sub || ""}/${item || ""}`;
    if (stop && cur === key) return;
    stop?.();
    cur = key;
    const host = document.createElement("div");
    host.className = "dv";
    root.replaceChildren(host);
    stop = id === "today" ? mountToday(host, ctx)
      : id === "ask" ? mountAsk(host, ctx, sub)
      : id === "docs" ? mountDocs(host, ctx)
      : id && sub === "case" && item ? mountCase(host, ctx, id, item)
      : id && sub === "practice" ? mountMeeting(host, ctx, id, item)
      : id && sub ? mountCard(host, ctx, id, sub)
      : id ? mountWeek(host, ctx, id)
      : mountHome(host, ctx);
    root.closest(".main")?.scrollTo?.({ top: 0 });
  }
  inst = { update: (nr) => show(nr.id || null, nr.sub || null, nr.item || null) };
  show(r.id || null, r.sub || null, r.item || null);
  return () => { stop?.(); inst = null; };
}
