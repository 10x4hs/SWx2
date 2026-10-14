// 경영 마이크로디그리 — #/mba (홈 · 모듈 지도) · #/mba/today · #/mba/company · #/mba/words · #/mba/<모듈> · #/mba/<모듈>/<카드>
import { mountHome } from "../mba/home.js";
import { mountModule, mountCard } from "../mba/card.js";
import { mountToday } from "../mba/today.js";
import { mountCompany } from "../mba/company.js";
import { mountWords } from "../mba/words.js";

let inst = null;
export function update(r) { inst?.update(r); }

export function mount(root, ctx, r) {
  let cur = null, stop = null;
  function show(id, sub) {
    const key = `${id || ""}/${sub || ""}`;
    if (stop && cur === key) return;
    stop?.();
    cur = key;
    const host = document.createElement("div");
    host.className = "mb";
    root.replaceChildren(host);
    stop = id === "today" ? mountToday(host, ctx)
      : id === "company" ? mountCompany(host, ctx)
      : id === "words" ? mountWords(host, ctx, sub)
      : id && sub ? mountCard(host, ctx, id, sub)
      : id ? mountModule(host, ctx, id)
      : mountHome(host, ctx);
    root.closest(".main")?.scrollTo?.({ top: 0 });
  }
  inst = { update: (nr) => show(nr.id || null, nr.sub || null) };
  show(r.id || null, r.sub || null);
  return () => { stop?.(); inst = null; };
}
