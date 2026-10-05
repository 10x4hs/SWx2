// 공부 — Dock 아이콘 하나 아래 영어 | 논문 탭. 주소는 그대로 (#/english/… · #/papers/…), 이 껍데기가 위에 스위처만 얹어요
import * as englishView from "./english.js";
import * as papersView from "./papers.js";
import { $ } from "../util.js";

const SUBS = [
  { key: "english", label: "영어", hash: "#/english", view: englishView },
  { key: "papers", label: "논문", hash: "#/papers", view: papersView },
];
const KEY = "trio.study.sub";

let inst = null;
export function update(r) { inst?.update(r); }

export function mount(root, ctx, r) {
  let sub = null, stop = null;
  root.innerHTML = `
    <div class="study-wrap">
      <nav class="seg study-switch glass" role="tablist" aria-label="공부 탭">
        ${SUBS.map((s) => `<a role="tab" href="${s.hash}" data-sub="${s.key}">${s.label}</a>`).join("")}
      </nav>
      <div class="study-body" id="study-body"></div>
    </div>`;
  const body = $("#study-body", root);

  function show(nr) {
    const next = nr.view === "papers" ? "papers" : "english";
    root.querySelectorAll("[data-sub]").forEach((a) => a.setAttribute("aria-selected", String(a.dataset.sub === next)));
    try { localStorage.setItem(KEY, next); } catch {}
    const S = SUBS.find((s) => s.key === next);
    if (sub === next && S.view.update) { S.view.update(nr); return; }
    stop?.(); sub = next;
    const host = document.createElement("div");
    host.className = "host host-" + next;
    body.replaceChildren(host);
    stop = S.view.mount(host, ctx, nr) || null;
    root.closest(".main")?.scrollTo?.({ top: 0 });
  }
  inst = { update: show };
  show(r);
  return () => { stop?.(); inst = null; };
}
// Dock 에서 눌렀을 때: 마지막으로 보던 탭으로
export function lastHash() { try { return SUBS.find((s) => s.key === localStorage.getItem(KEY))?.hash || "#/english"; } catch { return "#/english"; } }
