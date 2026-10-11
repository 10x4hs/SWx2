// 공부 — Dock 아이콘 하나 아래 영어 | 논문 | AI + 내가(또는 친구가 공개한) 추가한 과목 탭. 주소는 그대로 (#/english/… · #/papers/… · #/study/<id>)
import * as englishView from "./english.js";
import * as papersView from "./papers.js";
import * as booksView from "./books.js";
import * as pageView from "./page.js";
import { $, esc } from "../util.js";
import { api } from "../api.js";
import { icon } from "../icons.js";

const SUBS = [
  { key: "english", label: "영어", hash: "#/english", view: englishView },
  { key: "papers", label: "논문", hash: "#/papers", view: papersView },
  { key: "books", label: "AI", hash: "#/books", view: booksView },
];
const KEY = "trio.study.sub";
const tabIcon = (ic) => /^https?:\/\//.test(ic || "") ? `<img class="page-fav" src="${esc(ic)}" alt="">` : esc(ic || "📚");
let subjects = []; // place=study 인 페이지들 (내 것 + 친구가 공개한 것)

let inst = null;
export function update(r) { inst?.update(r); }

export function mount(root, ctx, r) {
  let sub = null, stop = null, cur = r;
  root.innerHTML = `
    <div class="study-wrap">
      <nav class="seg study-switch glass" role="tablist" aria-label="공부 탭" id="study-switch"></nav>
      <div class="study-body" id="study-body"></div>
    </div>`;
  const body = $("#study-body", root), nav = $("#study-switch", root);

  function drawTabs() {
    const key = keyOf(cur);
    nav.innerHTML = SUBS.map((s) => `<a role="tab" href="${s.hash}" data-sub="${s.key}" aria-selected="${key === s.key}">${s.label}</a>`).join("")
      + subjects.map((p) => `<a role="tab" class="study-subj${p.mine ? "" : " shared"}" href="#/study/${p.id}" data-sub="p:${p.id}" aria-selected="${key === "p:" + p.id}" title="${esc(p.title)}${p.mine ? "" : ` · ${esc(ctx.user(p.user_id)?.display_name || "")} 의 과목`}"><span class="study-ic">${tabIcon(p.icon)}</span>${esc(p.title)}</a>`).join("")
      + `<a role="tab" class="study-add" href="#/study/new" data-sub="new" aria-selected="${key === "new"}" title="과목 추가 — AI 가 페이지를 짜요">${icon.plus(13)}</a>`;
  }
  async function loadSubjects() {
    try { subjects = ((await api.pages()).pages || []).filter((p) => p.place === "study"); } catch { subjects = []; }
    drawTabs();
  }
  const keyOf = (nr) => nr.view === "papers" ? "papers" : nr.view === "books" ? "books" : nr.view === "page" ? (nr.id && nr.id !== "new" ? "p:" + nr.id : "new") : "english";

  function show(nr) {
    cur = nr;
    const next = keyOf(nr);
    try { if (next !== "new") localStorage.setItem(KEY, next); } catch {}
    drawTabs();
    const isPage = nr.view === "page";
    // 과목 페이지(iframe)는 화면 끝까지 채워야 해요. 처음 들어온 길(바로 주소 · 영어 · 논문 · AI)과 상관없이 지금 탭으로 정해요
    root.classList.toggle("study-fill", isPage);
    const S = isPage ? { view: pageView } : SUBS.find((s) => s.key === next);
    const same = isPage ? sub?.startsWith("p:") || sub === "new" : sub === next;
    if (same && sub !== null && S.view.update) { sub = next; S.view.update(nr); return; }
    stop?.(); sub = next;
    const host = document.createElement("div");
    host.className = "host host-" + (isPage ? "page" : next);
    body.replaceChildren(host);
    stop = S.view.mount(host, ctx, nr) || null;
    root.closest(".main")?.scrollTo?.({ top: 0 });
  }
  const onChanged = (e) => { if (e.detail?.kind === "pages") loadSubjects(); };
  window.addEventListener("trio:changed", onChanged);
  inst = { update: show };
  show(r); loadSubjects();
  return () => { stop?.(); inst = null; window.removeEventListener("trio:changed", onChanged); };
}
// Dock 에서 눌렀을 때: 마지막으로 보던 탭으로
export function lastHash() {
  try { const k = localStorage.getItem(KEY) || ""; if (k.startsWith("p:")) return "#/study/" + k.slice(2); return SUBS.find((s) => s.key === k)?.hash || "#/english"; } catch { return "#/english"; }
}
