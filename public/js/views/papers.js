// 논문 스프린트 — #/papers (현황판) · #/papers/<id> (공부 페이지)
import { mountBoard } from "../papers/board.js";
import { mountPaper } from "../papers/paper.js";
import { mountEasy, mountEasyList, mountEasyReview } from "../papers/easy.js";

let inst = null;
export function update(r) { inst?.update(r); }

export function mount(root, ctx, r) {
  let cur = null, stop = null;
  // #/papers/easy (쉽게 읽기 목록) · #/papers/easy/review (섞어서 복습) · #/papers/<id>/easy (쉽게 읽기 한 편)
  function show(id, sub) {
    const key = `${id || ""}/${sub || ""}`;
    if (stop && cur === key) return;
    stop?.();
    cur = key;
    const host = document.createElement("div");
    root.replaceChildren(host);
    stop = id === "easy" ? (sub === "review" ? mountEasyReview(host, ctx) : mountEasyList(host, ctx))
      : id && sub === "easy" ? mountEasy(host, ctx, id)
      : id ? mountPaper(host, ctx, id) : mountBoard(host, ctx);
    root.closest(".main")?.scrollTo?.({ top: 0 });
  }
  inst = { update: (nr) => show(nr.id || null, nr.sub || null) };
  show(r.id || null, r.sub || null);
  return () => { stop?.(); inst = null; };
}
