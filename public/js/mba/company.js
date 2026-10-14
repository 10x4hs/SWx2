// 경영 마이크로디그리 — 회사 세우기 (한국 주식회사). 그림 없이 글 · 표 · 계산기만: 순서와 숫자가 전부예요.
import { $, $$, esc } from "../util.js";
import { company } from "./data.js";
import { NAV } from "./home.js";

const won = (n) => Math.round(n).toLocaleString("ko-KR") + "원";

export function mountCompany(host, ctx) {
  let alive = true, i = 6, cap = 10000000, dense = false;
  host.innerHTML = `<p class="mb-loading">불러오는 중…</p>`;
  (async () => {
    const d = await company();
    if (!alive) return;
    const T = d.tax;
    const detail = () => { const s = d.steps[i]; return `<span class="mb-mono acc">STEP ${String(i).padStart(2, "0")}</span><h2>${esc(s.title)}</h2>
      <dl class="mb-dl">
        <div><dt>어디서</dt><dd>${esc(s.who)}</dd></div><div><dt>무엇을</dt><dd>${esc(s.docs)}</dd></div>
        <div><dt>비용</dt><dd>${esc(s.cost)}</dd></div><div><dt>기한 · 요점</dt><dd>${esc(s.time)}</dd></div>
        <div><dt>근거</dt><dd class="mb-mono-t">${esc(s.law)}</dd></div></dl>
      ${s.pro ? `<p class="mb-pro"><span class="mb-k">전문가</span> ${esc(s.pro)}</p>` : ""}
      <div class="mb-row sp"><span class="mb-mono dim">${i + 1} / ${d.steps.length}</span><button type="button" class="mb-btn" data-next>다음 칸</button></div>`; };
    const taxHtml = () => { const reg = Math.max(cap * T.rate, T.min) * (dense ? T.dense : 1), edu = reg * T.edu;
      return `<div><dt>등록면허세</dt><dd>${won(reg)}</dd></div><div><dt>지방교육세</dt><dd>${won(edu)}</dd></div><div><dt class="acc">합계</dt><dd class="acc">${won(reg + edu)}</dd></div>`; };
    host.innerHTML = `<div class="mb-page mb-company">
      <header class="mb-bar"><a class="mb-back" href="#/mba" aria-label="모듈 지도로"><svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M9 2 4 7l5 5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></a><span class="mb-mono dim">MODULE 11</span><span class="mb-k">창업과 법인</span><span class="mb-sp"></span><span class="mb-k dim">기준일 ${esc(d.asOf)} · ${esc(d.basis)}</span></header>
      <div class="mb-wrap">
        ${NAV("company")}
        <section class="mb-hero2"><span class="mb-lbl"><span class="mb-mono">KOREA</span>주식회사</span><h1>회사 세우기,<br>열두 칸</h1><p>한 칸은 한 기관, 한 묶음의 서류예요. 그림은 필요 없어요. 순서와 기한, 비용만 정확하면 돼요.</p>
          <dl class="mb-facts">${d.facts.map((f) => `<div><dt>${esc(f.k)}</dt><dd>${esc(f.v)}</dd><dd class="note">${esc(f.note)}</dd></div>`).join("")}</dl></section>

        <section class="mb-steps2">
          <div class="mb-steplist" role="group" aria-label="설립 단계">${d.steps.map((s, k) => `<button type="button" class="mb-step ${k === i ? "on" : ""}" data-i="${k}" aria-pressed="${k === i}"><span class="n">${String(k).padStart(2, "0")}</span><span class="t">${esc(s.title)}</span><span class="w">${esc(s.when)}</span></button>`).join("")}</div>
          <article class="mb-stepbox" id="mb-step" aria-live="polite">${detail()}</article>
        </section>

        <section class="mb-sec2 mb-taxsec">
          <div><span class="mb-lbl"><span class="mb-mono">TAX</span>설립 세금</span><h2>자본금을 넣으면<br>세금이 나와요</h2><p>${esc(T.note)}</p><p class="mb-mono-t dim">${esc(T.law)} · 조문 요율로 계산한 값</p></div>
          <div class="mb-taxbox">
            <label class="mbc-sl"><span class="mbc-sl-k">납입 자본금</span><output id="mb-cap-o">${won(cap)}</output><input type="range" id="mb-cap" min="1000000" max="500000000" step="1000000" value="${cap}" aria-label="납입 자본금"></label>
            <div class="mb-seg" role="group" aria-label="본점 지역"><button type="button" class="mb-chip on" data-dense="0" aria-pressed="true">과밀억제권역 아님</button><button type="button" class="mb-chip" data-dense="1" aria-pressed="false">과밀억제권역 (서울 등)</button></div>
            <dl class="mbc-read" id="mb-tax">${taxHtml()}</dl>
            <p class="mb-k dim">+ ${esc(T.fee)}</p>
          </div>
        </section>

        <section class="mb-sec2"><span class="mb-lbl"><span class="mb-mono">PEOPLE</span>사람을 쓸 때</span><h2>사람이 늘 때마다<br>새 법이 닿아요</h2>
          <div class="mb-ruler">${d.people.map((p, k) => `<div class="${k ? "" : "first"}"><i aria-hidden="true"></i><b>${p.n}명<small>부터</small></b><ul>${p.rules.map((r) => `<li>${esc(r)}</li>`).join("")}</ul></div>`).join("")}</div></section>

        <section class="mb-sec2"><span class="mb-lbl"><span class="mb-mono">MISTAKES</span>흔한 실수</span><h2>먼저 알면 피하는 것</h2>
          <ol class="mb-mist">${d.mistakes.map((m, k) => `<li><span class="mb-mono dim">${String(k + 1).padStart(2, "0")}</span><p><b>${esc(m.t)}.</b> ${esc(m.d)}</p></li>`).join("")}</ol>
          <p class="mb-foot">${esc(d.pros)} ${esc(d.unknown)}</p></section>
      </div>
    </div>`;
    const paintStep = () => { $("#mb-step", host).innerHTML = detail(); $$(".mb-step", host).forEach((b) => { const on = Number(b.dataset.i) === i; b.classList.toggle("on", on); b.setAttribute("aria-pressed", on); }); };
    host.addEventListener("click", (e) => {
      const s = e.target.closest(".mb-step"); if (s) { i = Number(s.dataset.i); paintStep(); return; }
      if (e.target.closest("[data-next]")) { i = (i + 1) % d.steps.length; paintStep(); return; }
      const dz = e.target.closest("[data-dense]"); if (dz) { dense = dz.dataset.dense === "1"; $$("[data-dense]", host).forEach((b) => { const on = (b.dataset.dense === "1") === dense; b.classList.toggle("on", on); b.setAttribute("aria-pressed", on); }); $("#mb-tax", host).innerHTML = taxHtml(); }
    });
    $("#mb-cap", host).addEventListener("input", (e) => { cap = Number(e.target.value); $("#mb-cap-o", host).textContent = won(cap); $("#mb-tax", host).innerHTML = taxHtml(); });
  })().catch((e) => { if (alive) host.innerHTML = `<p class="mb-err">회사 세우기를 불러오지 못했어요. ${esc(e.message || "")}</p>`; });
  return () => { alive = false; };
}
