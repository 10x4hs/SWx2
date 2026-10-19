// Vector & Graph 홈 (#/sw/vg) — 얇은 큰 제목 · 지금 모듈 · 오늘 · 8모듈 줄 목록. 3D 없이 글과 숫자만.
import { esc } from "../util.js";
import { index, state, minutes, setMinutes, MINUTES, cardsPerDay, nextCards, position, progressOf, metrics, kday, topbar, C } from "./data.js";

export function mountVgHome(host) {
  let alive = true, idx = null, st = null, mins = minutes();
  host.innerHTML = `${topbar("")}<p class="dv-loading">불러오는 중…</p>`;
  (async () => {
    [idx, st] = await Promise.all([index(), state()]);
    if (alive) draw();
  })().catch((e) => { if (alive) host.innerHTML = `${topbar("")}<p class="dv-err">불러오지 못했어요. 새로 고침해 주세요. ${esc(e?.message || "")}</p>`; });

  function draw() {
    const pos = position(idx, st), cur = pos.module, M = metrics(idx, st, mins), N = cardsPerDay(mins), fresh = nextCards(idx, st, N), due = (st.due || []).length;
    host.innerHTML = `${topbar("")}
      <section class="dv-wrap sw-hero2">
        <div class="m">Course · ${idx.modules.length} modules · ${idx.modules.reduce((n, m) => n + m.cards.length, 0)} cards</div>
        <h1 class="sw-h">Vector<br>&amp; Graph</h1>
        <p class="sw-lead kr">글을 숫자(벡터)로 바꾸고, 가까운 것을 빨리 찾고, 관계(그래프)로 엮어 AI가 답하게 하는 법. 임베딩에서 GraphRAG까지 8주예요.</p>
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:32px"><a class="dv-btn" href="${C.base}/today">오늘 공부 · ${mins}분</a><a class="dv-btn ghost" href="${C.base}/${cur.id}">${cur.no} 이어서</a></div>
      </section>
      <section class="dv-wrap dv-sec">
        <div class="dv-sec-h"><div><div class="m">오늘 · ${kday(M.today)}</div><h2>새 카드 ${N}장${due ? ` · 복습 ${due}장` : ""}</h2></div>
          <div style="display:flex;gap:8px;flex-wrap:wrap" role="group" aria-label="하루 공부 시간">${MINUTES.map((n) => `<button class="dv-chip${n === mins ? " on" : ""}" data-min="${n}" aria-pressed="${n === mins}">${n}분</button>`).join("")}</div></div>
        <div>${fresh.length ? fresh.map((x) => `<a class="dv-row" href="${C.base}/${x.module.id}/${x.card.id}"><span class="m acc">${x.module.no}-${x.card.id.slice(1)}</span><span style="font-size:16px;line-height:1.5">${esc(x.card.title)}</span><span class="m">새 카드</span></a>`).join("") : `<p class="kr dim">카드를 모두 읽었어요.</p>`}</div>
        <div class="sw-stats">${[["진도", `${Math.round(M.ratio * 100)}%`], ["읽은 카드", `${M.got.cards}/${M.tot.cards}`], ["정답률", M.acc == null ? "—" : `${Math.round(M.acc * 100)}%`], ["연속", `${M.streak}일`]].map(([k, v]) => `<div><div class="m">${k}</div><div class="sw-num">${v}</div></div>`).join("")}</div>
      </section>
      <section class="dv-wrap dv-sec" aria-label="모듈">
        <div class="dv-sec-h"><div><div class="m">Modules</div><h2>벡터에서 그래프까지</h2></div></div>
        <div class="sw-list" style="padding:0">${idx.modules.map((m, i) => { const p = progressOf(m, st); return `<a class="sw-row${i === pos.i ? " now" : ""}" href="${C.base}/${m.id}"><span class="m">${m.no}</span><span class="sw-t">${esc(m.title)}</span><span class="sw-d kr">${esc(m.q)}</span><span class="m sw-p">${p.ratio >= .999 ? "끝" : p.ratio ? `${Math.round(p.ratio * 100)}%` : i === pos.i ? "지금" : ""}</span></a>`; }).join("")}</div>
      </section>`;
    host.querySelectorAll("[data-min]").forEach((b) => b.addEventListener("click", () => { mins = Number(b.dataset.min); setMinutes(mins); draw(); }));
  }
  return () => { alive = false; };
}
