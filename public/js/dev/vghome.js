// Vector & Graph 홈 (#/sw/vg) — 화면 전체가 카드 160장의 임베딩 점구름. 커서를 대면 그 카드와 가까운 5장이 선으로 이어지고, 누르면 그 카드로.
//   아래 << 모듈 >> 로 넘기면 카메라가 그 무리로 날아가요 (처음엔 전체 · ← → 키 · 옆으로 밀기). 아래로 내리면 오늘 · 현황 · 모듈 목록(읽기용).
import { esc } from "../util.js";
import { index, state, minutes, setMinutes, MINUTES, cardsPerDay, nextCards, position, progressOf, metrics, kday, topbar, C } from "./data.js";
import { MOD_COLORS } from "./stage.js";
import { swipe, big } from "./sw.js";

export function mountVgHome(host, ctx) {
  let alive = true, idx = null, st = null, mins = minutes(), sel = -1, onKey = null;
  host.innerHTML = `${topbar("")}<p class="dv-loading">불러오는 중…</p>`;
  (async () => {
    [idx, st] = await Promise.all([index(), state()]);
    if (alive) draw();
  })().catch((e) => { if (alive) host.innerHTML = `${topbar("")}<p class="dv-err">불러오지 못했어요. 새로 고침해 주세요. ${esc(e?.message || "")}</p>`; });

  function cap() {
    const pos = position(idx, st);
    if (sel < 0) {
      const total = idx.modules.reduce((n, m) => n + m.cards.length, 0);
      return `<div class="m">Course · ${idx.modules.length} modules · ${total} cards</div>
        <h1 class="sw-h">${big(C.name)}</h1>
        <p class="sw-lead kr">점 하나가 카드 한 장이에요. 비슷한 내용끼리 가까이 모여 있어요 — 이게 임베딩 공간이에요. 점에 커서를 대면(폰은 한 번 누르면) 가장 가까운 카드 5장이 이어져요.</p>
        <div class="sw-acts"><a class="dv-btn" href="${C.base}/today">오늘 공부 · ${mins}분</a><a class="dv-btn ghost" href="${C.base}/${pos.module.id}">${pos.module.no} 이어서</a></div>`;
    }
    const m = idx.modules[sel], p = progressOf(m, st);
    return `<div class="m"><i class="sw-sw" style="background:${MOD_COLORS[sel % 8]}"></i>Module ${m.no} / ${String(idx.modules.length).padStart(2, "0")}</div>
      <h1 class="sw-h sw-h2">${esc(m.title)}</h1>
      <p class="sw-lead kr">“${esc(m.q)}”</p>
      <p class="kr dim" style="margin:10px 0 0;font-size:14px;line-height:1.6">${esc(m.sub)}</p>
      <div class="sw-acts"><a class="dv-btn" href="${C.base}/${m.id}">이 주 열기 →</a><span class="m">카드 ${p.cards}/${p.nCards} · 사례 ${p.cases}/${p.nCases} · 회의실 ${p.probs}/${p.nProbs}</span></div>`;
  }
  const label = () => (sel < 0 ? `All · ${idx.modules.length} modules` : `${idx.modules[sel].no} · ${idx.modules[sel].short}`);
  function setSel(i) {
    sel = i;
    host.querySelector("#sw-cap").innerHTML = cap();
    host.querySelector("#sw-car-t").textContent = label();
    ctx.scene?.focus(sel);
  }

  function draw() {
    const M = metrics(idx, st, mins), N = cardsPerDay(mins), fresh = nextCards(idx, st, N), due = (st.due || []).length, pos = position(idx, st);
    host.innerHTML = `<section class="sw-full" id="sw-full" aria-roledescription="carousel" aria-label="모듈">
        <header class="sw-bar"><a class="sw-mark m" href="#/sw">SW / ${esc(C.name)}</a>
          <nav class="sw-pill" aria-label="${esc(C.brand)} 메뉴"><a href="${C.base}/today">오늘</a><i aria-hidden="true"></i><a href="${C.base}/ask">AI 질문</a><i aria-hidden="true"></i><a href="#/sw">과정</a></nav></header>
        <div class="sw-cap" id="sw-cap" aria-live="polite"></div>
        <div class="sw-tip" id="sw-tip" role="status" hidden></div>
        <div class="sw-car"><button class="sw-arrow" id="sw-prev" aria-label="이전 모듈">&lt;&lt;</button><span class="sw-car-t m" id="sw-car-t"></span><button class="sw-arrow" id="sw-next" aria-label="다음 모듈">&gt;&gt;</button></div>
        <span class="sw-hint m" aria-hidden="true">scroll</span>
      </section>
      <section class="dv-wrap dv-sec">
        <div class="sw-read">
          <div class="dv-sec-h"><div><div class="m">오늘 · ${kday(M.today)}</div><h2>새 카드 ${N}장${due ? ` · 복습 ${due}장` : ""}</h2></div>
            <div style="display:flex;gap:8px;flex-wrap:wrap" role="group" aria-label="하루 공부 시간">${MINUTES.map((n) => `<button class="dv-chip${n === mins ? " on" : ""}" data-min="${n}" aria-pressed="${n === mins}">${n}분</button>`).join("")}</div></div>
          <div>${fresh.length ? fresh.map((x) => `<a class="dv-row" href="${C.base}/${x.module.id}/${x.card.id}"><span class="m acc">${x.module.no}-${x.card.id.slice(1)}</span><span style="font-size:16px;line-height:1.5">${esc(x.card.title)}</span><span class="m">새 카드</span></a>`).join("") : `<p class="kr dim">카드를 모두 읽었어요.</p>`}</div>
          <div class="sw-stats">${[["진도", `${Math.round(M.ratio * 100)}%`], ["읽은 카드", `${M.got.cards}/${M.tot.cards}`], ["정답률", M.acc == null ? "—" : `${Math.round(M.acc * 100)}%`], ["연속", `${M.streak}일`]].map(([k, v]) => `<div><div class="m">${k}</div><div class="sw-num">${v}</div></div>`).join("")}</div>
        </div>
      </section>
      <section class="dv-wrap dv-sec" aria-label="모듈">
        <div class="sw-read">
          <div class="dv-sec-h"><div><div class="m">Modules</div><h2>벡터에서 그래프까지</h2></div></div>
          <div class="sw-list" style="padding:0">${idx.modules.map((m, i) => { const p = progressOf(m, st); return `<a class="sw-row${i === pos.i ? " now" : ""}" href="${C.base}/${m.id}" data-mod="${i}"><span class="m"><i class="sw-sw" style="background:${MOD_COLORS[i % 8]}"></i>${m.no}</span><span class="sw-t">${esc(m.title)}</span><span class="sw-d kr">${esc(m.q)}</span><span class="m sw-p">${p.ratio >= .999 ? "끝" : p.ratio ? `${Math.round(p.ratio * 100)}%` : i === pos.i ? "지금" : ""}</span></a>`; }).join("")}</div>
        </div>
      </section>`;
    host.querySelectorAll("[data-min]").forEach((b) => b.addEventListener("click", () => { mins = Number(b.dataset.min); setMinutes(mins); draw(); }));
    host.querySelectorAll("[data-mod]").forEach((a) => a.addEventListener("mouseenter", () => ctx.scene?.focus(Number(a.dataset.mod))));
    host.querySelector(".sw-list").addEventListener("mouseleave", () => ctx.scene?.focus(sel));
    const n = idx.modules.length, step = (d) => setSel(((sel + 1 + d + n + 1) % (n + 1)) - 1); // -1(전체) → 0 … n-1 → 다시 전체
    host.querySelector("#sw-prev").addEventListener("click", () => step(-1));
    host.querySelector("#sw-next").addEventListener("click", () => step(1));
    if (!onKey) { onKey = (e) => { if (e.target.closest?.("input,textarea,[contenteditable]")) return; if (e.key === "ArrowRight") step(1); else if (e.key === "ArrowLeft") step(-1); }; document.addEventListener("keydown", onKey); }
    swipe(host.querySelector("#sw-full"), step);
    const tip = host.querySelector("#sw-tip");
    ctx.scene?.mode("vg", {
      modules: idx.modules, focus: sel,
      onHover: (h) => {
        if (!h) { tip.hidden = true; return; }
        const m = idx.modules[h.module], c = m.cards[h.card];
        tip.innerHTML = `<div class="m"><i class="sw-sw" style="background:${MOD_COLORS[h.module % 8]}"></i>${m.no}-${c.id.slice(1)} · ${esc(m.short)}</div><b class="kr">${esc(c.title)}</b><div class="m" style="margin-top:8px">가까운 카드 ${h.near.length}장 · ${matchMedia("(pointer: coarse)").matches ? "한 번 더 누르면" : "누르면"} 열려요</div>`;
        tip.hidden = false; tip.style.transform = `translate(${Math.round(h.x + 16)}px, ${Math.round(h.y + 16)}px)`;
      },
      onPick: (g, ci) => { location.hash = `${C.base}/${idx.modules[g].id}/${idx.modules[g].cards[ci].id}`; },
    });
    setSel(sel);
  }
  return () => { alive = false; if (onKey) document.removeEventListener("keydown", onKey); };
}
