// 과정 홈 (#/sw/vg · #/sw/dev) — 그 과정의 모듈이 유리 패널로 입자 나선 둘레를 돌아요 (world3d.js 의 modules 모드 · 스크롤하면 내려가요).
//   왼쪽 아래 글자 칸: 앞에 온 모듈 요약(번호 · 제목 · 이번 주 질문 · 진도) + 큰 버튼 하나 [오늘 할 일 시작]. 패널 · '모듈 열기' = 판 속으로 들어가 그 모듈로.
//   패널을 다 지나면 과정 정보: 오늘 · 하루 순서 · 현황 · 왜 이렇게 배우나 · 모듈 목록.
import { esc } from "../util.js";
import { index, state, minutes, setMinutes, MINUTES, split, steps, cardsPerDay, nextCards, position, progressOf, metrics, kday, WHY, topbar, C } from "./data.js";
import { PALETTE } from "./world3d.js";
import { swipe } from "./sw.js";

const enTitle = (id) => id.replace(/^vg-/, "").replace(/-/g, " ").toUpperCase();
const pad = (n) => String(n).padStart(2, "0");

export function mountCourse(host, ctx, key) {
  let alive = true, busy = false, cur = 0, idx = null, st = null, mins = minutes(), onKey = null;
  host.innerHTML = `${topbar("")}<p class="dv-loading">불러오는 중…</p>`;
  (async () => {
    [idx, st] = await Promise.all([index(), state()]);
    if (alive) draw();
  })().catch((e) => { if (alive) host.innerHTML = `${topbar("")}<p class="dv-err">불러오지 못했어요. 새로 고침해 주세요. ${esc(e?.message || "")}</p>`; });

  const stateOf = (i, pos) => (progressOf(idx.modules[i], st).ratio >= 0.999 ? "done" : i === pos.i ? "now" : i < pos.i ? "done" : "next");
  const STATE = { done: "끝냄", now: "지금 진행 중", next: "아직" };

  function card(i) {
    const pos = position(idx, st), m = idx.modules[i], p = progressOf(m, st), s = stateOf(i, pos);
    const bar = (a, b) => `<i style="--p:${b ? Math.round((a / b) * 100) : 0}%"></i>`;
    return `<p class="cs-kicker"><span>Module ${m.no} / ${pad(idx.modules.length)}</span><span class="cs-state ${s}">${STATE[s]}</span></p>
      <h2 class="cs-title">${esc(m.title)}</h2>
      <p class="cs-q">“${esc(m.q)}”</p>
      <div class="cs-meter">${[["카드", p.cards, p.nCards], ["사례", p.cases, p.nCases], ["회의실", p.probs, p.nProbs]].map(([l, a, b]) => `<div><span>${l}</span><b>${a}<small> / ${b}</small></b>${bar(a, b)}</div>`).join("")}</div>
      <div class="cs-acts"><a class="cs-btn" href="${C.base}/today"><span>오늘 할 일 시작</span><small>${mins}분 · ${pos.module.no} ${esc(pos.module.short)}</small></a><a class="cs-link" href="${C.base}/${m.id}" data-enter>모듈 열기 →</a></div>`;
  }
  function setCur(i) {
    cur = i;
    const el = host.querySelector("#cs-card"); if (!el) return;
    el.classList.remove("in"); void el.offsetWidth; el.innerHTML = card(i); el.classList.add("in");
    host.querySelector("#sw-car-t").textContent = `${idx.modules[i].no} · ${idx.modules[i].short}`;
  }

  function todaySec() {
    const M = metrics(idx, st, mins), N = cardsPerDay(mins), fresh = nextCards(idx, st, N), due = (st.due || []).length;
    return `<section class="cs-sec" id="dv-today-sec" aria-labelledby="dv-today-h">
        <div class="dv-sec-h"><div><div class="m">오늘 · ${kday(M.today)}</div><h2 id="dv-today-h">오늘은 ${mins}분, 새 카드 ${N}장${due ? ` · 복습 ${due}장` : ""}</h2></div>
          <div class="cs-chips" role="group" aria-label="하루 공부 시간">${MINUTES.map((n) => `<button class="dv-chip${n === mins ? " on" : ""}" data-min="${n}" aria-pressed="${n === mins}">${n}분</button>`).join("")}</div></div>
        <div class="dv-panel">${fresh.length ? fresh.map((x) => `<a class="dv-row" href="${C.base}/${x.module.id}/${x.card.id}"><span class="m acc">${x.module.no}-${x.card.id.slice(1)}</span><span class="kr">${esc(x.card.title)}</span><span class="m">새 카드</span></a>`).join("") : `<p class="kr dim">카드를 모두 읽었어요.</p>`}
          <div class="cs-sec-acts"><a class="dv-btn" href="${C.base}/today">${mins}분 시작</a><a class="dv-btn ghost" href="${C.base}/ask">AI에게 묻기</a></div></div>
      </section>`;
  }
  function draw() {
    const M = metrics(idx, st, mins), pos = position(idx, st), S = split(mins), plan = steps(mins);
    host.innerHTML = `${topbar("")}
      <div class="sw-scene" id="cs-scene"><section class="sw-layer cs" aria-label="모듈">
        <div class="cs-card sw-ui" id="cs-card" aria-live="polite"></div>
        <div class="cs-foot sw-ui"><button type="button" class="sh-arrow" id="sw-prev" aria-label="이전 모듈">&lt;&lt;</button><span class="sh-count" id="sw-car-t"></span><button type="button" class="sh-arrow" id="sw-next" aria-label="다음 모듈">&gt;&gt;</button></div>
        <span class="sh-scroll" aria-hidden="true">Scroll</span>
      </section>
      <div class="sw-track" style="height:${(idx.modules.length - 1) * 44}vh"></div></div>
      <div class="cs-info">
        ${todaySec()}
        <section class="cs-sec" aria-labelledby="cs-plan-h"><div class="dv-sec-h"><div><div class="m">하루 순서</div><h2 id="cs-plan-h">매일 이 순서로 해요</h2></div></div>
          <div class="dv-panel"><ol class="dv-plan">${plan.map((p, i) => `<li><span class="m">0${i + 1}</span><div><h3>${esc(p.name)}</h3><p>${esc(p.why)} <span class="dim">(${esc(p.src)})</span></p></div><span class="cs-min">${S[i]}분</span></li>`).join("")}</ol></div></section>
        <section class="cs-sec" aria-labelledby="cs-dash-h"><div class="dv-sec-h"><div><div class="m">현황</div><h2 id="cs-dash-h">${M.got.cards ? `${pos.module.no} 모듈 · 전체 ${Math.round(M.ratio * 100)}%` : "첫 카드부터 시작해요"}</h2></div></div>
          <div class="cs-stats">${[["진도", `${Math.round(M.ratio * 100)}%`], ["읽은 카드", `${M.got.cards} / ${M.tot.cards}`], ["정답률", M.acc == null ? "—" : `${Math.round(M.acc * 100)}%`], ["끝나는 날", kday(M.finish)]].map(([k, v]) => `<div class="dv-panel"><div class="m">${k}</div><b>${v}</b></div>`).join("")}</div></section>
        <section class="cs-sec" aria-labelledby="cs-mods-h"><div class="dv-sec-h"><div><div class="m">모듈 ${idx.modules.length}</div><h2 id="cs-mods-h">전체 모듈</h2></div></div>
          <div class="cs-mods">${idx.modules.map((m, i) => { const s = stateOf(i, pos), p = progressOf(m, st); return `<a class="dv-mod" data-mod="${i}" href="${C.base}/${m.id}"><span class="m acc">${m.no}</span><span class="kr cs-mt">${esc(m.title)}</span><span class="q">“${esc(m.q)}”</span><span class="m cs-ms ${s}">${s === "done" ? "끝" : s === "now" ? `진행 ${Math.round(p.ratio * 100)}%` : "아직"}</span></a>`; }).join("")}</div></section>
        <section class="cs-sec" aria-labelledby="dv-why-h"><div class="dv-sec-h"><div><div class="m">학습 설계</div><h2 id="dv-why-h">왜 이렇게 배우나</h2></div></div>
          <div class="dv-grid dv-why">${WHY.map(([t, d, s]) => `<div class="dv-panel"><h3>${esc(t)}</h3><p>${esc(d)}</p><p class="src">${esc(s)}</p></div>`).join("")}</div></section>
      </div>`;
    const items = idx.modules.map((m, i) => ({ key, no: i + 1, of: idx.modules.length, title: enTitle(m.id), label: C.name, href: `${C.base}/${m.id}`, tint: PALETTE[key] || PALETTE.vg }));
    ctx.scene?.show("modules", items, { track: host.querySelector("#cs-scene"), tint: key, start: undefined, onPick: (it) => enter(it.href), onActive: (it, i) => setCur(i) });
    setCur(cur);
    host.querySelector("#sw-prev").addEventListener("click", () => ctx.scene?.goTo(cur - 1));
    host.querySelector("#sw-next").addEventListener("click", () => ctx.scene?.goTo(cur + 1));
    bindMins();
    if (pos.i > 0) setTimeout(() => { if (alive) ctx.scene?.goTo(pos.i); }, 900); // 들어오면 지금 모듈까지 천천히 내려가요
    swipe(host.querySelector(".cs"), (d) => ctx.scene?.goTo(cur + d));
    if (!onKey) {
      onKey = (e) => { if (e.target.closest?.("input,textarea,[contenteditable]")) return; if (e.key === "ArrowDown" || e.key === "ArrowRight") { e.preventDefault(); ctx.scene?.goTo(cur + 1); } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") { e.preventDefault(); ctx.scene?.goTo(cur - 1); } };
      document.addEventListener("keydown", onKey);
    }
  }
  function bindMins() { host.querySelectorAll("[data-min]").forEach((b) => b.addEventListener("click", () => { mins = Number(b.dataset.min); setMinutes(mins); host.querySelector("#dv-today-sec").outerHTML = todaySec(); setCur(cur); bindMins(); })); }
  const enter = async (href) => { if (busy) return; busy = true; host.classList.add("sw-leave"); await ctx.scene?.dive(); if (alive) location.hash = href; };
  host.addEventListener("click", (e) => { const g = e.target.closest("[data-enter]"); if (g && !e.metaKey && !e.ctrlKey) { e.preventDefault(); enter(g.getAttribute("href")); } });
  return () => { alive = false; if (onKey) document.removeEventListener("keydown", onKey); };
}
