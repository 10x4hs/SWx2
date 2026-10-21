// 과정 목차 (#/sw/vg · #/sw/dev) — 교과서 첫 장처럼: 제목 · 진도 → 오늘 할 일 하나(큰 버튼) → 목차(장마다 진도) → 하루 순서 · 현황 · 왜 이렇게 배우나 · 그림 모아 보기
//   2026-10-20: 나선 3D 갤러리 대신 종이 위 목차. 지금 장이 맨 먼저 눈에 들어오게 표시해요.
import { esc } from "../util.js";
import { index, state, minutes, setMinutes, MINUTES, split, steps, cardsPerDay, nextCards, position, progressOf, metrics, kday, WHY, topbar, C } from "./data.js";
import { figCount } from "../figs/catalog.js";

const LINE = {
  vg: "글을 숫자(벡터)로 바꾸고, 가까운 것을 빨리 찾고, 관계(그래프)로 엮어 AI가 답하게 해요.",
  onto: "세상을 '무엇이 있고 어떻게 이어지는지'로 적어 기계가 뜻을 알게 해요. 원리부터 왜 지금 뜨는지까지.",
  aip: "회사를 객체 · 링크 · 액션으로 옮기고, 그 위에서 LLM 이 일하게 하는 Palantir 의 방식을 뜯어봐요.",
  dev: "아이디어가 문서가 되고, 화면과 서버가 되고, 고객에게 닿고, 고장 나고, 다시 좋아지는 흐름을 따라가요.",
};
const VOL = { vg: "1권", dev: "2권", onto: "3권", aip: "4권" };

export function mountCourse(host, ctx, key) {
  let alive = true, idx = null, st = null, mins = minutes(), figs = 0;
  host.innerHTML = `${topbar("")}<p class="dv-loading">불러오는 중…</p>`;
  (async () => {
    [idx, st] = await Promise.all([index(), state()]);
    figs = await figCount(key).catch(() => 0);
    if (alive) draw();
  })().catch((e) => { if (alive) host.innerHTML = `${topbar("")}<p class="dv-err">불러오지 못했어요. 새로 고침해 주세요. ${esc(e?.message || "")}</p>`; });

  const stateOf = (i, pos) => (progressOf(idx.modules[i], st).ratio >= 0.999 ? "done" : i === pos.i ? "now" : i < pos.i ? "done" : "next");

  function todaySec() {
    const N = cardsPerDay(mins), fresh = nextCards(idx, st, N), due = (st.due || []).length, pos = position(idx, st);
    const first = fresh[0];
    return `<section class="toc-today" id="dv-today-sec" aria-labelledby="dv-today-h">
        <div class="toc-today-t"><p class="toc-label">오늘 할 일 · ${kday(metrics(idx, st, mins).today)}</p>
          <h2 id="dv-today-h">${mins}분 · 새 카드 ${fresh.length || N}장${due ? ` · 복습 ${due}장` : ""}</h2>
          <p class="toc-today-s">${first ? `${esc(first.module.no)} ${esc(first.module.title)} · ${esc(first.card.title)}부터` : pos.done ? "카드를 모두 읽었어요. 복습과 회의실이 남았어요." : ""}</p></div>
        <div class="toc-today-a"><a class="dv-btn" href="${C.base}/today">오늘 ${mins}분 시작 →</a>
          <div class="cs-chips" role="group" aria-label="하루 공부 시간">${MINUTES.map((n) => `<button class="dv-chip${n === mins ? " on" : ""}" data-min="${n}" aria-pressed="${n === mins}">${n}분</button>`).join("")}</div></div>
      </section>`;
  }
  function draw() {
    const M = metrics(idx, st, mins), pos = position(idx, st), S = split(mins), plan = steps(mins);
    host.innerHTML = `${topbar("")}
      <div class="toc">
        <header class="toc-h">
          <p class="toc-label">${VOL[key] || ""} · ${idx.modules.length}장 · 하루 ${mins}분</p>
          <h1>${esc(C.name)}</h1>
          <p class="toc-line">${esc(LINE[key] || "")}</p>
          <dl class="toc-stats">${[["진도", `${Math.round(M.ratio * 100)}%`], ["읽은 카드", `${M.got.cards} / ${M.tot.cards}`], ["정답률", M.acc == null ? "—" : `${Math.round(M.acc * 100)}%`], ["끝나는 날", kday(M.finish)]].map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("")}</dl>
        </header>
        ${todaySec()}
        <section class="toc-sec" aria-labelledby="cs-mods-h">
          <h2 id="cs-mods-h" class="toc-sec-h">목차</h2>
          <ol class="toc-list">${idx.modules.map((m, i) => {
            const s = stateOf(i, pos), p = progressOf(m, st), pct = Math.round(p.ratio * 100);
            return `<li><a class="dv-mod ${s}" href="${C.base}/${m.id}"${s === "now" ? ' aria-current="step"' : ""}>
              <span class="toc-no">${m.no}</span>
              <span class="toc-t"><b>${esc(m.title)}</b><small>“${esc(m.q)}”</small></span>
              <span class="toc-p"><span class="toc-bar"><i style="width:${pct}%"></i></span><small>카드 ${p.cards}/${p.nCards} · 사례 ${p.cases}/${p.nCases} · 회의실 ${p.probs}/${p.nProbs}</small></span>
              <span class="toc-s">${s === "done" ? "끝" : s === "now" ? `지금 · ${pct}%` : pct ? `${pct}%` : ""}</span>
            </a></li>`;
          }).join("")}</ol>
        </section>
        ${figs ? `<section class="toc-sec toc-figs"><a class="toc-figlink" href="${C.base}/figs"><b>그림 모아 보기</b><span>어려운 곳을 설명하는 그림 ${figs}개 · 한 단계씩 넘기거나 직접 움직여 봐요</span><i aria-hidden="true">→</i></a></section>` : ""}
        <section class="toc-sec" aria-labelledby="cs-plan-h"><h2 id="cs-plan-h" class="toc-sec-h">매일 이 순서로 해요</h2>
          <ol class="dv-plan">${plan.map((p, i) => `<li><span class="toc-no sm">${i + 1}</span><div><h3>${esc(p.name)}</h3><p>${esc(p.why)} <span class="dim">(${esc(p.src)})</span></p></div><span class="cs-min">${S[i]}분</span></li>`).join("")}</ol></section>
        <section class="toc-sec" aria-labelledby="dv-why-h"><h2 id="dv-why-h" class="toc-sec-h">왜 이렇게 배우나</h2>
          <div class="dv-why">${WHY.map(([t, d, s]) => `<div class="dv-panel"><h3>${esc(t)}</h3><p>${esc(d)}</p><p class="src">${esc(s)}</p></div>`).join("")}</div></section>
      </div>`;
    bindMins();
  }
  function bindMins() { host.querySelectorAll("[data-min]").forEach((b) => b.addEventListener("click", () => { mins = Number(b.dataset.min); setMinutes(mins); host.querySelector("#dv-today-sec").outerHTML = todaySec(); bindMins(); })); }
  return () => { alive = false; };
}
