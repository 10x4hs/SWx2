// 논문 스프린트 — #/papers (현황판) · #/papers/<id> (공부 페이지)
import { mountBoard } from "../papers/board.js";
import { mountPaper } from "../papers/paper.js";

let inst = null;
export function update(r) { inst?.update(r); }

export function mount(root, ctx, r) {
  let cur = null, stop = null;
  function show(id) {
    if (stop && cur === id) return;
    stop?.();
    cur = id;
    const host = document.createElement("div");
    root.replaceChildren(host);
    stop = id ? mountPaper(host, ctx, id) : mountBoard(host, ctx);
    root.closest(".main")?.scrollTo?.({ top: 0 });
  }
  inst = { update: (nr) => show(nr.id || null) };
  show(r.id || null);
  return () => { stop?.(); inst = null; };
}
