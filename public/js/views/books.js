// AI 공부책 — #/books (책장) · #/books/<book>/<chapter> (한 장) · #/books/review · #/books/words. 공부 스위치의 AI 탭 안에서 열려요
import { mountShelf, mountChapter, mountReview, mountWords } from "../books/books.js";

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
    root.replaceChildren(host);
    stop = id === "review" ? mountReview(host, ctx) : id === "words" ? mountWords(host, ctx) : id && sub ? mountChapter(host, ctx, id, sub) : id ? mountShelf(host, ctx, id) : mountShelf(host, ctx);
    root.closest(".main")?.scrollTo?.({ top: 0 });
  }
  inst = { update: (nr) => show(nr.id || null, nr.sub || null) };
  show(r.id || null, r.sub || null);
  return () => { stop?.(); inst = null; };
}
