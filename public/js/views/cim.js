// CIM — 투자자산운용사 2주 완성 (Dock 앱 · 누구나) · 2026-10-22 미니멀 (흑백 + '지금 누를 것'만 라임)
//   아래 탭 셋: 오늘(#/cim) · 공부(#/cim/study…) · 시험(#/cim/exam…)
//   #/cim/go 오늘 공부(1 읽기 · 2 문제 · 3 오답 · 4 떠올리기, 아래 탭 숨김) · #/cim/log 계획 · 기록
//   옛 주소는 새 주소로 바꿔요: book → study · quiz/mock/table → exam · figs → study/figs
//   처음 한 번 3단계 안내(머리의 '사용법'으로 다시) · 'AI에게 묻기' 옆 패널(cim/ai.js)
//   기록은 cim/store.js (사람별 서버 저장 + 이 기기 사본)
import { ready, st, save } from "../cim/store.js";
import { ddayText } from "../cim/plan.js";
import { mountToday, mountLog } from "../cim/today.js";
import { mountSession } from "../cim/session.js";
import { mountStudy } from "../cim/study.js";
import { mountExam } from "../cim/exam.js";
import { mountAi } from "../cim/ai.js";
import { loading, errorBox, esc, reduced } from "../cim/ui.js";

const TABS = [["today", "#/cim", "오늘"], ["study", "#/cim/study", "공부"], ["exam", "#/cim/exam", "시험"]];
const MOUNT = { today: mountToday, go: mountSession, log: mountLog, study: mountStudy, exam: mountExam };
const viewOf = (r) => (r.tab && MOUNT[r.tab] ? r.tab : "today");
const tabOf = (v) => (v === "study" || v === "exam" ? v : "today");

// 옛 주소 → 새 주소 (없으면 null)
export function redirect(r) {
  const rest = [r.id, r.sub, r.item].filter(Boolean).join("/");
  if (r.tab === "book") return "#/cim/study" + (rest ? "/" + rest : "");
  if (r.tab === "figs") return "#/cim/study/figs";
  if (r.tab === "mock") return "#/cim/exam/mock";
  if (r.tab === "table") return "#/cim/exam/cards";
  if (r.tab === "quiz") return r.id ? "#/cim/exam/" + rest : "#/cim/exam/quiz";
  return null;
}

const INTRO = [
  ["1 / 3", "시험일을 정해요", "날짜를 고르면 14일 계획이 자동으로 짜여요. 계산 파트 → 법규 → 실전 순서예요.", () => `<div class="c-illu num">${st()?.exam ? esc(ddayText()) : "D-14"}</div>`],
  ["2 / 3", "매일 버튼 하나만", "'오늘 공부 시작'을 누르면 오늘 읽을 카드와 문제가 순서대로 나와요. 고민할 필요 없어요.", () => `<div class="c-illu lime">오늘 공부 시작 →</div>`],
  ["3 / 3", "틀린 건 알아서 다시", "틀린 문제는 1 · 3 · 7일 뒤에 다시 나와요. 시험 직전엔 '시험' 탭에서 모의고사를 풀어요.", () => `<div class="c-illu num">1 · 3 · 7</div>`],
];

let inst = null;
export function update(r) { inst?.update(r); }

export function mount(root, ctx, r) {
  root.innerHTML = `<div class="cim">
    <header class="c-top"><div class="in">
      <a class="c-mark" href="#/cim" aria-label="CIM 오늘"><i aria-hidden="true"></i>CIM</a>
      <span class="r"><span class="c-sync" id="c-sync" aria-live="polite"></span><button type="button" class="c-ghost press" data-ai-open aria-expanded="false">AI에게 묻기</button><button type="button" class="c-ghost press" id="c-help">사용법</button></span>
    </div><div class="c-prog" id="c-prog" aria-hidden="true"></div></header>
    <main class="c-col" id="c-body">${loading("기록 불러오는 중")}</main>
    <nav class="c-tabbar" aria-label="CIM"><span class="ink" aria-hidden="true"></span>${TABS.map(([k, h, t]) => `<a href="${h}" data-t="${k}">${t}</a>`).join("")}</nav>
    <div class="c-intro" id="c-intro" hidden><div class="c-isheet" role="dialog" aria-modal="true" aria-labelledby="c-intro-h"><div class="pips" aria-hidden="true"><i></i><i></i><i></i></div><div id="c-intro-b"></div><div class="acts"><button type="button" class="c-ghost press" data-skip>건너뛰기</button><button type="button" class="c-btn dark press" data-inext>다음</button></div></div></div>
  </div>`;
  const cim = root.querySelector(".cim"), body = root.querySelector("#c-body"), bar = root.querySelector(".c-tabbar"), ink = bar.querySelector(".ink"), prog = root.querySelector("#c-prog");
  let cur = null, view = null, vname = null, gen = 0, first = true;
  const env = { top: () => {}, prog: (k) => { prog.style.transform = `scaleX(${Math.max(0, Math.min(1, k || 0))})`; } };
  const moveInk = () => { const a = bar.querySelector('a[aria-current="page"]'); if (!a || !a.offsetWidth) return; ink.style.width = a.offsetWidth + "px"; ink.style.transform = `translateX(${a.offsetLeft - 5}px)`; };

  // 처음 안내
  const intro = root.querySelector("#c-intro");
  let si = 0, lastFocus = null;
  const drawIntro = () => { const s = INTRO[si]; root.querySelector("#c-intro-b").innerHTML = `<div class="c-istep">${s[3]()}<span class="n">${s[0]}</span><h2 id="c-intro-h">${s[1]}</h2><p>${s[2]}</p></div>`; intro.querySelectorAll(".pips i").forEach((p, j) => p.classList.toggle("on", j === si)); intro.querySelector("[data-inext]").textContent = si < 2 ? "다음" : "시작하기"; };
  const introKey = "cim-intro:" + (ctx.me?.id || "anon");
  const openIntro = () => { si = 0; lastFocus = document.activeElement; drawIntro(); intro.hidden = false; intro.querySelector("[data-inext]").focus(); };
  const closeIntro = () => { intro.hidden = true; try { localStorage.setItem(introKey, "1"); } catch {} const S = st(); if (S && !S.intro) { S.intro = 1; save(); } lastFocus?.focus?.(); };
  const seenIntro = () => { try { if (localStorage.getItem(introKey)) return true; } catch {} return !!st()?.intro; };

  async function show(nr, force = false) {
    const to = redirect(nr);
    if (to) { location.replace(to); return; }
    const v = viewOf(nr), t = tabOf(v), key = [v, nr.id, nr.sub, nr.item].join("/");
    bar.querySelectorAll("a").forEach((a) => { if (a.dataset.t === t) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
    cim.classList.toggle("c-going", v === "go");
    moveInk();
    if (!force && key === cur) return;
    if (!force && view && v === vname && view.update?.(nr)) { cur = key; return; } // 같은 화면 안 작은 이동 (예: 같은 장의 다른 카드)
    cur = key;
    const g = ++gen;
    try { await ready(ctx); } catch (e) { body.innerHTML = errorBox(esc(e.message)); return; }
    if (g !== gen || !root.isConnected) return;
    view?.stop?.(); view = null; vname = v;
    cim.classList.remove("c-focus"); env.prog(0);
    const host = document.createElement("div");
    host.className = "c-v c-v-" + v;
    const swap = () => { body.replaceChildren(host); view = MOUNT[v](host, nr, env) || {}; };
    if (!first && document.startViewTransition && !reduced()) { const tr = document.startViewTransition(swap); tr.ready.catch(() => {}); tr.finished.catch(() => {}); } else swap();
    if (!first) root.closest(".main")?.scrollTo?.({ top: 0 }); // 처음 열 때는 Dock 기억(스크롤)을 app.js 가 돌려놔요
    if (first && !seenIntro()) openIntro();
    first = false;
  }
  // 다른 기기 기록이 들어오면: 오늘 · 오늘 공부만 다시 (문제 푸는 화면은 그대로)
  const onState = () => { if (vname === "today" || vname === "go") view?.redraw?.(); };
  const onSync = (e) => { const el = root.querySelector("#c-sync"); if (el) { el.dataset.s = e.detail.s; el.textContent = { saving: "저장 중", saved: "저장됨", offline: "이 기기에만" }[e.detail.s] || ""; } };
  const onClick = (e) => {
    if (e.target.closest("[data-reload]")) location.reload();
    if (e.target.closest("#c-help")) openIntro();
    if (e.target.closest("[data-inext]")) { if (si < 2) { si++; drawIntro(); } else closeIntro(); }
    if (e.target.closest("[data-skip]")) closeIntro();
  };
  const onKey = (e) => { if (!intro.hidden && e.key === "Escape") { e.preventDefault(); closeIntro(); } };
  const ro = "ResizeObserver" in window ? new ResizeObserver(moveInk) : null; ro?.observe(bar);
  document.fonts?.ready.then(moveInk);
  window.addEventListener("cim:state", onState);
  window.addEventListener("cim:sync", onSync);
  root.addEventListener("click", onClick);
  document.addEventListener("keydown", onKey);
  const offAi = mountAi(cim);
  inst = { update: (nr) => show(nr) };
  show(r);
  return () => {
    gen++; view?.stop?.(); view = null; inst = null; ro?.disconnect(); offAi();
    window.removeEventListener("cim:state", onState); window.removeEventListener("cim:sync", onSync); root.removeEventListener("click", onClick); document.removeEventListener("keydown", onKey);
  };
}
