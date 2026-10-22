// CIM 공부 — 장 목록(#/cim/study) · 한 장씩 읽기(#/cim/study/<장>[/<핵심 번호>]) · 그림 모아 보기(#/cim/study/figs)
//   목록: 과목별 19장, 읽은 만큼 막대 + %, 오늘 장은 라임 '오늘'
//   읽기: 한 화면에 카드 한 장(오늘 공부와 같은 모양), ← / 다음 카드, '목차'로 아무 카드나. 넘기면 읽음.
//         주소를 바꾸지 않고 카드만 갈아 끼워요(location.replace) — Dock 기억 · 새로 고침이 그 카드로 돌아와요
import { st, save } from "./store.js";
import { CHS, CH, ORDER, SUBJ, chName } from "./meta.js";
import { chapter } from "./data.js";
import { NOTES } from "./notes.js";
import { FIGS } from "./figs.js";
import { todayChs, readIn } from "./plan.js";
import { cardHtml, mountFigs, cardText, chLabel, renderBody } from "./render.js";
import { setAi } from "./ai.js";
import { esc, loading, errorBox, typing, pad2 } from "./ui.js";

const SUBJ_T = { 1: "1과목 · 금융상품 및 세제", 2: "2과목 · 투자운용 · 투자분석", 3: "3과목 · 윤리 · 법규 · 투자운용" };

export function mountStudy(host, r) {
  let cur = null, all = [], idx = 0, offKey = null; // cur = 지금 장 (읽기 중일 때)
  const scrollTop = () => host.closest(".main")?.scrollTo({ top: 0 });

  function list() {
    cur = null;
    const S = st(), now = todayChs(S);
    host.innerHTML = `<div class="c-list"><h1>공부</h1>
      ${[1, 2, 3].map((s) => `<section class="c-grp"><div class="gh"><span>${SUBJ_T[s]}</span><span class="num">${SUBJ[s].q}문항</span></div>
        ${CHS.filter((c) => c.s === s).map((c) => { const p = Math.round((readIn(c.id, S) / c.np) * 100); return `<a class="c-row press${now.includes(c.id) ? " now" : ""}" href="#/cim/study/${c.id}"><span class="n num">${c.c}</span><b>${esc(c.t)}</b><span class="p num">${p ? `<span class="c-mini" aria-hidden="true"><i style="width:${p}%"></i></span>${p}%` : "—"}</span></a>`; }).join("")}</section>`).join("")}
      <p class="c-hint"><a class="c-link" href="#/cim/study/figs">그림 모아 보기</a></p></div>`;
    setAi({ kind: "general", topic: "공부 탭 · 장 목록" });
  }

  async function open(id, n) {
    if (cur !== id) {
      cur = id;
      host.innerHTML = loading("장 불러오는 중");
      let c;
      try { c = await chapter(id); } catch (e) { host.innerHTML = errorBox(esc(e.message)); return; }
      if (!host.isConnected || cur !== id) return;
      all = c.sec.flatMap((s) => s.p); all.strat = c.strat;
    }
    const S = st();
    idx = n != null ? Math.max(0, all.findIndex((p) => String(p.n) === String(n))) : Math.max(0, all.findIndex((p) => !S.read[p.key]));
    draw();
  }
  function draw() {
    const p = all[idx], c = CH[cur], i = ORDER.indexOf(cur), last = idx === all.length - 1, S = st();
    const nRead = all.filter((x) => S.read[x.key]).length;
    host.innerHTML = `<div class="c-session">
      <div class="c-shead num"><a class="c-ghost press" href="#/cim/study">← 공부</a><span class="r"><button type="button" class="c-ghost press" data-ai-open>AI에게 묻기</button><button type="button" class="c-ghost press" data-toc aria-haspopup="dialog">목차 ${idx + 1}/${all.length}</button></span></div>
      <div class="c-bar" aria-hidden="true"><i style="transform:scaleX(${(idx + 1) / all.length})"></i></div>
      <p class="c-chap">${esc(chLabel(cur))} · ${esc(c.t)} <span class="num">· 읽음 ${nRead}/${all.length}</span></p>
      ${cardHtml(p)}
      <div class="c-navrow"><button type="button" class="c-btn press" data-prev ${idx ? "" : "disabled"} aria-label="이전 카드">←</button>${last ? `<a class="c-btn lime press" href="#/cim/exam/ch/${cur}/20" data-pass>이 장 문제 20개 풀기</a>` : `<button type="button" class="c-btn dark press" data-next>다음 카드</button>`}</div>
      ${last && i < ORDER.length - 1 ? `<p class="c-hint"><a class="c-link" href="#/cim/study/${ORDER[i + 1]}" data-pass>다음 장 · ${esc(CH[ORDER[i + 1]].t)}</a></p>` : ""}
    </div>
    <dialog class="c-sheet c-toc" id="c-toc" aria-label="이 장의 카드"><div class="c-sheet-h"><b>${esc(c.t)}</b><button type="button" class="c-ai-x press" data-close aria-label="닫기">✕</button></div>
      ${all.strat ? `<details class="c-strat"><summary>이 장 공부법</summary>${renderBody(String(all.strat).replace(/^▶ 학습전략\s*/, ""))}</details>` : ""}
      <div class="c-toc-l">${all.map((x, j) => `<button type="button" class="c-row press${j === idx ? " cur" : ""}" data-j="${j}"><span class="n num">${x.n}</span><b>${esc(x.t)}</b><span class="p">${S.read[x.key] ? "✓" : x.st >= 3 ? "★★★" : ""}</span></button>`).join("")}</div></dialog>`;
    mountFigs(host);
    setAi({ kind: "card", chapter: `${chLabel(cur)} ${c.t}`, title: p.t, body: cardText(p) });
  }
  const goCard = (j) => { if (j < 0 || j >= all.length) return; location.replace(`#/cim/study/${cur}/${all[j].n}`); };
  const pass = () => { const S = st(), k = all[idx]?.key; if (k && !S.read[k]) { S.read[k] = 1; save(); } };

  function gallery() {
    cur = null;
    const keyOf = {}; Object.entries(NOTES.FIGS).forEach(([k, f]) => (keyOf[f] = k));
    host.innerHTML = `<div class="c-list"><div class="c-shead"><a class="c-ghost press" href="#/cim/study">← 공부</a><span></span></div><h1>그림 모아 보기</h1><p class="c-lead">변화 자체가 개념인 것만 골랐어요. ‹ › 로 한 단계씩, 슬라이더로 직접 바꿔 보세요.</p>
      <ol class="c-figs">${Object.entries(FIGS).map(([k, f], i) => { const key = keyOf[k], [ch, n] = key ? key.split("-") : [f.ch, ""]; return `<li id="fig-${k}"><div class="gh"><span class="num">${k === "re" ? "계산기" : "그림 " + pad2(i + 1)} · ${esc(chName(f.ch))}</span>${key ? `<a class="c-link" href="#/cim/study/${ch}/${n}">카드로</a>` : ""}</div><h2>${esc(f.t)}</h2><div data-fig="${k}"></div></li>`; }).join("")}</ol></div>`;
    mountFigs(host);
    setAi({ kind: "general", topic: "그림 모아 보기" });
  }

  host.addEventListener("click", (e) => {
    const t = e.target;
    if (t.closest("[data-next]")) { pass(); goCard(idx + 1); return; }
    if (t.closest("[data-prev]")) { goCard(idx - 1); return; }
    if (t.closest("[data-pass]")) pass();
    if (t.closest("[data-toc]")) { host.querySelector("#c-toc")?.showModal(); host.querySelector("#c-toc .cur")?.scrollIntoView({ block: "center" }); return; }
    if (t.closest("[data-close]")) { host.querySelector("#c-toc")?.close(); return; }
    const j = t.closest("[data-j]"); if (j) { host.querySelector("#c-toc")?.close(); goCard(+j.dataset.j); return; }
    if (t.matches?.("dialog.c-sheet")) t.close(); // 바깥(배경)을 누르면 닫혀요
  });
  offKey = (() => {
    const on = (e) => {
      if (!cur || typing(e) || host.querySelector("dialog[open]")) return;
      if (e.key === "ArrowRight") { e.preventDefault(); if (idx < all.length - 1) { pass(); goCard(idx + 1); } }
      else if (e.key === "ArrowLeft") { e.preventDefault(); goCard(idx - 1); }
    };
    document.addEventListener("keydown", on);
    return () => document.removeEventListener("keydown", on);
  })();

  const show = (nr) => { if (nr.id === "figs") gallery(); else if (nr.id && CH[nr.id]) open(nr.id, nr.sub); else list(); };
  show(r);
  return {
    stop: () => offKey?.(),
    // 같은 장 안에서 카드만 바뀌면 화면을 갈아 끼우기만
    update(nr) { if (nr.id && nr.id === cur && all.length) { open(nr.id, nr.sub); scrollTop(); return true; } return false; },
  };
}
