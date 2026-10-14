// 경영 마이크로디그리 — 연습문제: 계산(숫자 자동 채점) · 개념(고르기). 답을 먼저 내고 풀이는 그다음에.
// #/mba/<모듈>/practice (전체) · #/mba/<모듈>/practice/<날 1~10>. 마지막으로 푼 결과가 기록돼요 (정답률 · 진도에 들어가요).
import { $, esc, toast } from "../util.js";
import { api } from "../api.js";
import { index, moduleDoc, state } from "./data.js";
import { md, back, meter, fmtNum } from "./ui.js";

// "210,000원" · "12.5%" · " -3 " → 숫자
const parse = (s) => { const t = String(s).replace(/[,\s]/g, "").replace(/[^0-9.\-]/g, ""); return t && /^-?\d*\.?\d+$/.test(t) ? Number(t) : NaN; };

export function mountPractice(host, ctx, modId, day) {
  let alive = true;
  const take = meter(15); // 문제 하나에 15분 넘게 머문 시간은 세지 않아요
  host.innerHTML = `<p class="mb-loading">불러오는 중…</p>`;
  (async () => {
    const [idx, doc, st] = await Promise.all([index(), moduleDoc(modId), state()]);
    if (!alive) return;
    const m = idx.modules.find((x) => x.id === modId), all = doc.problems || [], d = Number(day) || 0;
    if (!m) { host.innerHTML = `<p class="mb-err">없는 모듈이에요. <a href="#/mba">모듈 지도로</a></p>`; return; }
    const list = d ? all.filter((p) => p.day === d) : all;
    const days = [...new Set(all.map((p) => p.day))].sort((a, b) => a - b), nextDay = d ? days.find((x) => x > d) : 0;
    const cards = new Map(doc.cards.map((c) => [c.id, c]));
    const last = new Map((st.done || []).filter((x) => x.module === modId && x.kind === "problem").map((x) => [x.item, x]));
    const now = new Map(); // 이번에 푼 것: id → 맞음?
    const probHtml = (p, i) => {
      const c = cards.get(p.card), l = last.get(p.id);
      return `<div class="mb-prob-h"><span class="mb-mono dim">${String(i + 1).padStart(2, "0")}</span><span class="mb-k dim">${p.type === "number" ? "계산" : "개념"}</span>${c ? `<a class="mb-k dim" href="#/mba/${esc(modId)}/${esc(c.id)}">${esc(c.title)}</a>` : ""}<span class="mb-sp"></span>${l ? `<span class="mb-k ${l.score ? "acc" : "loss"}">지난번 ${l.score ? "맞음" : "틀림"}</span>` : ""}</div>
        <p class="mb-q-t">${md(p.q)}</p>
        ${p.type === "number"
          ? `<form class="mb-num" data-num><input class="mb-in" inputmode="decimal" autocomplete="off" aria-label="답${p.unit ? ` (${esc(p.unit)})` : ""}" placeholder="답"><span class="mb-k dim">${esc(p.unit || "")}</span><button class="mb-btn sm" type="submit">확인</button></form><p class="mb-k dim mb-num-m" hidden>숫자로 적어 주세요 (쉼표는 있어도 없어도 돼요)</p>`
          : `<div class="mb-q-c">${(p.choices || []).map((ch, ci) => `<button type="button" class="mb-choice" data-ci="${ci}">${md(ch)}</button>`).join("")}</div>`}
        <div class="mb-prob-r" hidden></div>`;
    };
    const score = () => { const n = now.size, ok = [...now.values()].filter(Boolean).length; return n ? `이번에 ${n}개 풂 · 맞힘 ${ok}` : `${list.length}문제`; };
    host.innerHTML = `<div class="mb-page mb-practice">
      <header class="mb-bar">${back(`#/mba/${esc(modId)}`, "모듈로")}<span class="mb-mono dim">MODULE ${esc(m.no)}</span><span class="mb-k">${esc(m.title)}</span><span class="mb-mono">PRACTICE</span><span class="mb-sp"></span><span class="mb-k" id="mb-score">${score()}</span></header>
      <div class="mb-today-wrap">
        <section class="mb-thead"><span class="mb-mono dim">PRACTICE · ${list.length}</span><h1>${d ? `${d}일차 연습문제` : "연습문제 전체"}</h1>
          <p class="mb-plan-y">답을 먼저 내고, 풀이는 그다음에 봐요. 틀린 문제는 풀이를 덮고 내일 다시 풀어 보면 가장 오래 남아요.</p>
          <nav class="mb-seg" aria-label="날짜별 문제">${[`<a class="mb-chip sm ${!d ? "on" : ""}" href="#/mba/${esc(modId)}/practice">전체</a>`, ...days.map((x) => `<a class="mb-chip sm ${x === d ? "on" : ""}" href="#/mba/${esc(modId)}/practice/${x}">${x}일차</a>`)].join("")}</nav></section>
        ${list.length ? `<ol class="mb-probs">${list.map((p, i) => `<li class="mb-prob" data-pid="${esc(p.id)}" data-i="${i}">${probHtml(p, i)}</li>`).join("")}</ol>` : `<p class="mb-empty">이 날에는 연습문제가 없어요.</p>`}
        <div class="mb-endbar"><a class="mb-btn ghost" href="#/mba/${esc(modId)}">모듈로</a>${nextDay ? `<a class="mb-btn" href="#/mba/${esc(modId)}/practice/${nextDay}">${nextDay}일차 문제</a>` : `<a class="mb-btn" href="#/mba/today">오늘 화면으로</a>`}</div>
      </div>
    </div>`;
    const answer = async (li, ok, shown) => {
      const p = list[Number(li.dataset.i)];
      now.set(p.id, ok); $("#mb-score", host).textContent = score();
      const r = $(".mb-prob-r", li); r.hidden = false;
      r.innerHTML = `<p class="mb-q-why"><b>${ok ? "맞아요." : "다시 볼까요."}</b> 정답 ${shown}</p>${(p.steps || []).length ? `<ol class="mb-solve">${p.steps.map((s) => `<li>${md(s)}</li>`).join("")}</ol>` : ""}<button type="button" class="mb-btn ghost sm" data-retry>다시 풀기</button>`;
      try { await api.mbaDone(modId, p.id, "problem", ok ? 1 : 0, 1); const n = take(); if (n) await api.mbaDay(n); }
      catch (x) { toast(x.message || "결과를 저장하지 못했어요.", "err"); }
    };
    host.addEventListener("submit", (e) => {
      const f = e.target.closest("[data-num]"); if (!f) return;
      e.preventDefault();
      const li = f.closest(".mb-prob"), p = list[Number(li.dataset.i)], inp = $("input", f), v = parse(inp.value);
      if (!Number.isFinite(v)) { $(".mb-num-m", li).hidden = false; inp.focus(); return; }
      $(".mb-num-m", li).hidden = true;
      const ok = Math.abs(v - p.answer) <= (Number(p.tol) || 0) + 1e-9;
      inp.disabled = true; $("button", f).disabled = true; inp.classList.add(ok ? "right" : "wrong");
      answer(li, ok, `${fmtNum(p.answer)}${esc(p.unit || "")}`);
    });
    host.addEventListener("click", (e) => {
      const rt = e.target.closest("[data-retry]");
      if (rt) { const li = rt.closest(".mb-prob"); li.innerHTML = probHtml(list[Number(li.dataset.i)], Number(li.dataset.i)); ($("input", li) || $(".mb-choice", li))?.focus(); return; }
      const b = e.target.closest(".mb-choice"); if (!b || b.disabled) return;
      const li = b.closest(".mb-prob"), p = list[Number(li.dataset.i)], ci = Number(b.dataset.ci), ok = ci === p.answer;
      li.querySelectorAll(".mb-choice").forEach((x) => { x.disabled = true; const k = Number(x.dataset.ci); x.classList.toggle("right", k === p.answer); x.classList.toggle("wrong", k === ci && !ok); });
      answer(li, ok, md(p.choices[p.answer]));
    });
  })().catch((e) => { if (alive) host.innerHTML = `<p class="mb-err">연습문제를 불러오지 못했어요. ${esc(e.message || "")}</p>`; });
  return () => { alive = false; };
}
