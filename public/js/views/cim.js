// CIM — 투자자산운용사 2주 완성 (Dock 앱 · 누구나)
//   #/cim 오늘 · #/cim/book[/<장>[/<핵심>]] 교과서 · #/cim/figs 그림 · #/cim/quiz[/<방식>/…] 문제 · #/cim/mock 모의고사 · #/cim/table 숫자표
// 껍데기(머리 · 탭)는 그대로 두고 아래만 바꿔요. 기록은 cim/store.js (사람별 서버 저장 + 이 기기 사본)
import { ready, st } from "../cim/store.js";
import { mountDash, ddayText } from "../cim/dash.js";
import { mountBook } from "../cim/book.js";
import { mountQuiz } from "../cim/quiz.js";
import { mountMock } from "../cim/mock.js";
import { mountTable, mountFigs } from "../cim/table.js";
import { loading, errorBox, esc } from "../cim/ui.js";

const TABS = [
  ["dash", "#/cim", "오늘"],
  ["book", "#/cim/book", "교과서"],
  ["figs", "#/cim/figs", "그림<span class=\"cim-lg\">으로 보기</span>"],
  ["quiz", "#/cim/quiz", "문제"],
  ["mock", "#/cim/mock", "모의고사"],
  ["table", "#/cim/table", "숫자표"],
];
const MOUNT = { dash: mountDash, book: mountBook, figs: mountFigs, quiz: mountQuiz, mock: mountMock, table: mountTable };
const tabOf = (r) => (TABS.some(([k]) => k === r.tab) ? r.tab : "dash");

let inst = null;
export function update(r) { inst?.update(r); }

export function mount(root, ctx, r) {
  root.innerHTML = `<div class="cim">
    <header class="cim-top"><div class="cim-top-in">
      <a class="cim-brand" href="#/cim" aria-label="CIM 오늘">CIM <span class="dot" aria-hidden="true">·</span> 투자자산운용사</a>
      <span class="cim-dd cim-num" id="cim-dd" title="시험까지"></span>
      <span class="cim-sync" id="cim-sync" aria-live="polite"></span>
      <nav class="cim-tabs no-anim" aria-label="CIM"><span class="ink" aria-hidden="true"></span>${TABS.map(([k, h, t]) => `<a href="${h}" data-t="${k}">${t}</a>`).join("")}</nav>
    </div><div class="cim-prog" id="cim-prog" aria-hidden="true"></div></header>
    <div class="cim-body" id="cim-body">${loading("기록 불러오는 중")}</div></div>`;
  const body = root.querySelector("#cim-body"), tabs = root.querySelector(".cim-tabs"), ink = tabs.querySelector(".ink"), prog = root.querySelector("#cim-prog");
  const scroller = root.closest(".main") || document.scrollingElement;
  let cur = null, view = null, tab = null, gen = 0, first = true;
  // 탭 아래 잉크가 고른 탭으로 미끄러져요
  const moveInk = () => { const a = tabs.querySelector('a[aria-current="page"]'); if (!a) return; const x = a.getBoundingClientRect().left - tabs.getBoundingClientRect().left; ink.style.width = a.offsetWidth + "px"; ink.style.transform = `translateX(${x}px)`; };
  // 장을 읽을 때만: 위 막대 밑 파란 선이 읽은 만큼 차요
  const onScroll = () => { const el = scroller, max = el.scrollHeight - el.clientHeight, k = body.querySelector(".cb-main") && max > 0 ? Math.min(1, el.scrollTop / max) : 0; prog.style.transform = `scaleX(${k})`; };

  const top = () => { const S = st(); root.querySelector("#cim-dd").textContent = S ? ddayText(S) : ""; };
  async function show(nr, force = false) {
    const t = tabOf(nr), key = [t, nr.id, nr.sub, nr.item].join("/");
    root.querySelectorAll(".cim-tabs a").forEach((a) => { if (a.dataset.t === t) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
    moveInk(); requestAnimationFrame(() => tabs.classList.remove("no-anim"));
    if (!force && key === cur) return;
    if (!force && view && t === tab && view.update?.(nr)) { cur = key; return; } // 같은 탭 안 작은 이동 (예: 같은 장의 다른 카드)
    cur = key;
    const g = ++gen;
    try { await ready(ctx); } catch (e) { body.innerHTML = errorBox(esc(e.message)); return; }
    if (g !== gen || !root.isConnected) return;
    view?.stop?.(); view = null; tab = t;
    const host = document.createElement("div");
    host.className = "cim-v cim-v-" + t;
    body.replaceChildren(host);
    top();
    view = MOUNT[t](host, nr, { top }) || {};
    if (!first) root.closest(".main")?.scrollTo?.({ top: 0 }); // 처음 열 때는 Dock 기억(스크롤)을 app.js 가 돌려놔요
    first = false; onScroll();
  }
  // 다른 기기 기록이 들어오면: 오늘 화면만 다시 (풀고 있는 화면은 그대로)
  const onState = () => { top(); if (tab === "dash") view?.redraw?.(); };
  const onSync = (e) => { const el = root.querySelector("#cim-sync"); if (el) { el.dataset.s = e.detail.s; el.textContent = { saving: "저장 중", saved: "저장됨", offline: "이 기기에만" }[e.detail.s] || ""; } };
  const onClick = (e) => { if (e.target.closest("[data-reload]")) location.reload(); };
  const ro = "ResizeObserver" in window ? new ResizeObserver(moveInk) : null; ro?.observe(tabs);
  document.fonts?.ready.then(moveInk);
  scroller.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("cim:state", onState);
  window.addEventListener("cim:sync", onSync);
  root.addEventListener("click", onClick);
  inst = { update: (nr) => show(nr) };
  show(r);
  return () => {
    gen++; view?.stop?.(); view = null; inst = null; ro?.disconnect(); scroller.removeEventListener("scroll", onScroll);
    window.removeEventListener("cim:state", onState); window.removeEventListener("cim:sync", onSync); root.removeEventListener("click", onClick);
  };
}
