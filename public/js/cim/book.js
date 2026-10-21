// CIM 교과서 — 차례(#/cim/book) · 장(#/cim/book/<장>) · 카드로 바로(#/cim/book/<장>/<핵심 번호>)
// 카드: 본문(+ 사진에서 옮긴 '내 밑줄') · TIP · '개정 확인' · 어려운 공식에만 '왜 이 공식' · 이야기 · 그림 · 문제 5개 · 읽음
import { st, save } from "./store.js";
import { CHS, CH, ORDER, SUBJ, chShort } from "./meta.js";
import { chapter, QS_BY } from "./data.js";
import { NOTES } from "./notes.js";
import { FIGS } from "./figs.js";
import { runQuiz } from "./quiz.js";
import { esc, pad2, loading, errorBox } from "./ui.js";

const REV = /예금자\s*보호|Gross-?up|그로스업|귀속법인세|증권거래세\s*세율/;
const SUBJ_T = { 1: "금융상품 및 세제", 2: "투자운용 및 전략 II · 투자분석", 3: "직무윤리 · 법규 · 투자운용 및 전략 I" };
const FILTERS = ["전체", "★★ 이상", "★★★만"];
let filt = 0; // 이번 접속 동안 기억

// 교재 본문 → 읽기 쉬운 HTML (TIP · ▶ 소제목 · ① 항목 · ㉠ 하위 항목 · '|' 표)
// marks: 교재 사진에서 옮긴 '내 밑줄' 구절 — 본문에서 찾아 살짝 표시해요 (TIP 은 빼고)
export function renderBody(txt, marks) {
  const L = String(txt || "").split("\n"); let h = "", tip = [], mode = "", tbl = [];
  const re = marks?.length ? new RegExp([...marks].sort((a, b) => b.length - a.length).map((m) => esc(m).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "g") : null;
  const seen = new Set(); // 같은 구절은 처음 나온 자리만 (교재에서 그은 곳이 한 군데라서)
  const E = (t) => (re ? esc(t).replace(re, (m) => (seen.has(m) ? m : (seen.add(m), `<mark class="cc-my" title="내 밑줄">${m}</mark>`))) : esc(t));
  const flush = () => { if (tbl.length) { h += `<div class="cim-tscroll"><table class="cim-tbl">${tbl.map((r, i) => `<tr>${r.map((c) => (i ? `<td>${E(c)}</td>` : `<th scope="col">${E(c)}</th>`)).join("")}</tr>`).join("")}</table></div>`; tbl = []; } };
  for (const raw of L) {
    const l = raw.trim();
    if (l === "TIP") { mode = "tip"; continue; }
    if (mode === "tip") { if (!l || l.startsWith("▶") || /^\(\d+\)/.test(l)) mode = ""; else { tip.push(l); continue; } }
    if (/^\S.*\|\s*$/.test(l) && l.includes(" | ")) { tbl.push(l.replace(/\|\s*$/, "").split(" | ").map((c) => c.trim())); continue; }
    flush();
    if (!l || l.startsWith("▶ 핵심포인트 해설")) continue;
    if (l.startsWith("▶")) h += `<h5 class="cc-sub">${E(l.replace(/^▶\s*/, ""))}</h5>`;
    else if (/^[①-⑳]/.test(l)) h += `<p class="cc-li">${E(l)}</p>`;
    else if (/^[㉠-㉭ⓐ-ⓩ·•\-]/.test(l)) h += `<p class="cc-li2">${E(l)}</p>`;
    else if (/^\(\d+\)/.test(l)) h += `<h5 class="cc-sub">${E(l)}</h5>`;
    else h += `<p>${E(l)}</p>`;
  }
  flush();
  return (tip.length ? `<div class="cc-tip"><span class="cc-tag">TIP</span><p>${esc(tip.join(" "))}</p></div>` : "") + `<div class="cc-body">${h}</div>`;
}
const whyBox = (w) => `<section class="cw" aria-label="왜 이 공식이 나왔나"><div class="cw-h"><span class="cc-tag acc">왜 이 공식</span><h4>${esc(w.t)}</h4></div><div class="cw-f">${esc(w.f).replace(/\n/g, "<br>")}</div><dl><dt>직관</dt><dd>${esc(w.why)}</dd><dt>숫자로 풀어 보기</dt><dd>${esc(w.ex)}</dd><dt>기억 훅</dt><dd>${esc(w.hook)}</dd></dl></section>`;
const readIn = (id) => { const p = id + "-"; let n = 0; for (const k in st().read) if (k.startsWith(p)) n++; return n; };

export function mountBook(host, r) {
  let stops = [], curCh = null;
  const stopAll = () => { stops.forEach((f) => f()); stops = []; };

  function toc() {
    curCh = null;
    host.innerHTML = `<header class="cim-vh"><h1>교과서</h1><p>3과목 · 19장 · 핵심포인트 399개. 장을 누르면 카드로 읽어요. 카드마다 그 내용 문제 5개가 붙어 있어요.</p></header>
      ${[1, 2, 3].map((s) => `<section class="cb-subj"><h2><span class="cim-num">제${s}과목</span> ${SUBJ_T[s]} <small>${SUBJ[s].q}문항</small></h2>
        <ol class="cb-chs">${CHS.filter((c) => c.s === s).map((c) => { const n = readIn(c.id); return `<li><a href="#/cim/book/${c.id}"><span class="cb-no cim-num">${pad2(c.c)}</span><span class="cb-t">${esc(c.t)}</span><span class="cb-m cim-num">핵심 ${c.np}${n ? ` · 읽음 ${n}` : ""}</span><span class="cb-bar" aria-hidden="true"><i style="width:${(n / c.np) * 100}%"></i></span></a></li>`; }).join("")}</ol></section>`).join("")}`;
  }

  async function open(id, n) {
    if (curCh === id && host.querySelector(".cb-main")) { if (n) jump(n); return; }
    stopAll(); curCh = id;
    host.innerHTML = loading("장 불러오는 중");
    let c;
    try { c = await chapter(id); } catch (e) { host.innerHTML = errorBox(esc(e.message)); return; }
    if (!host.isConnected || curCh !== id) return;
    if (n && filt) { const p = findPoint(c, n); if (p && !pass(p)) filt = 0; }
    draw(c);
    if (n) requestAnimationFrame(() => jump(n));
  }
  const findPoint = (c, n) => { for (const s of c.sec) for (const p of s.p) if (String(p.n) === String(n)) return p; return null; };
  const pass = (p) => filt === 0 || p.st >= filt + 1;
  function jump(n) {
    const el = host.querySelector(`#k-${curCh}-${CSS.escape(String(n))}`);
    if (el) { el.scrollIntoView({ block: "start" }); el.classList.add("flash"); setTimeout(() => el.classList.remove("flash"), 1400); }
  }

  function draw(c) {
    stopAll();
    const S = st(), idx = ORDER.indexOf(c.id), N = NOTES;
    const all = c.sec.flatMap((s) => s.p), nRead = all.filter((p) => S.read[p.key]).length;
    let cards = "", outline = "";
    c.sec.forEach((s) => {
      const ps = s.p.filter(pass);
      if (!ps.length) return;
      if (s.t) { cards += `<h3 class="cb-sec">${esc(s.t)}</h3>`; outline += `<li class="cb-ol-sec">${esc(s.t)}</li>`; }
      ps.forEach((p) => {
        const rev = REV.test(p.b) || p.q.some((q) => REV.test(q.q + q.x));
        outline += `<li><a href="#/cim/book/${c.id}/${p.n}" data-ol="${p.key}" class="${S.read[p.key] ? "read" : ""}"><span class="cim-num">${pad2(p.n)}</span><span>${esc(p.t)}</span></a></li>`;
        cards += `<article class="cc" id="k-${p.key}">
          <header class="cc-h"><span class="cc-n cim-num">핵심 ${pad2(p.n)}</span><h3>${esc(p.t)}</h3><span class="cc-tags">${p.st ? `<span class="cc-st" aria-label="중요도 ${p.st}" title="중요도 ${p.st}">${"★".repeat(p.st)}</span>` : ""}${rev ? `<span class="cc-tag rev" title="최근 바뀐 숫자가 있을 수 있어요. 숫자표에서 확인하세요.">개정 확인</span>` : ""}${p.marks?.length ? `<span class="cc-tag my" title="교재에 직접 그은 밑줄을 옮겨 왔어요">내 밑줄</span>` : ""}${S.read[p.key] ? `<span class="cc-tag seen">읽음</span>` : ""}</span></header>
          ${renderBody(p.b, p.marks)}
          ${N.WHY[p.key] ? whyBox(N.WHY[p.key]) : ""}
          ${N.FIGS[p.key] ? `<div class="cc-fig" data-fig="${N.FIGS[p.key]}"></div>` : ""}
          ${N.STORY[p.key] ? `<aside class="cs"><span class="cc-tag">이야기</span><p>${esc(N.STORY[p.key])}</p></aside>` : ""}
          <footer class="cc-f"><button type="button" class="cim-btn line sm" data-pq="${p.key}" aria-expanded="false">문제 ${p.q.length}개</button><button type="button" class="cim-btn ghost sm" data-read="${p.key}" aria-pressed="${!!S.read[p.key]}">${S.read[p.key] ? "읽음 취소" : "읽었어요"}</button>${p.pg ? `<span class="cc-pg cim-num">교재 ${esc(p.pg)}쪽</span>` : ""}</footer>
          <div class="cc-pq"></div></article>`;
      });
    });
    host.innerHTML = `<div class="cb-wrap">
      <aside class="cb-side" aria-label="이 장의 카드"><div class="cb-side-in"><a class="cb-back" href="#/cim/book"><span aria-hidden="true">←</span> 차례</a><span class="cim-lab">${chShort(c.id)} · 카드 ${all.length}</span><ol class="cb-ol">${outline}</ol></div></aside>
      <div class="cb-main">
        <div class="cim-crumb"><a href="#/cim/book"><span aria-hidden="true">←</span> 차례</a><span class="cim-num">${c.s}과목 · ${c.c}장${c.pg ? " · 교재 " + esc(c.pg) + "쪽~" : ""}</span></div>
        <h1 class="cb-title">${esc(c.t)}</h1>
        <div class="cb-prog"><span class="cim-num" id="cb-nread">읽음 ${nRead}/${all.length}</span><span class="cim-bar" aria-hidden="true"><i id="cb-rbar" style="width:${(nRead / all.length) * 100}%"></i></span><span class="cim-num">문제 ${QS_BY[c.id]?.length || 0}</span></div>
        <details class="cb-strat"><summary>학습전략 · 출제 비중</summary>${renderBody(String(c.strat || "").replace(/^▶ 학습전략\s*/, ""))}</details>
        <div class="cb-tools"><div class="cim-seg" role="group" aria-label="중요도 거르기">${FILTERS.map((t, i) => `<button type="button" data-f="${i}" aria-pressed="${filt === i}">${t}</button>`).join("")}</div><a class="cim-btn sm" href="#/cim/quiz/ch/${c.id}/20">이 장 20문제 풀기</a></div>
        ${cards || `<p class="cim-empty">이 거르기에 맞는 카드가 없어요.</p>`}
        <nav class="cb-pn" aria-label="다른 장">${idx > 0 ? `<a href="#/cim/book/${ORDER[idx - 1]}"><span class="cim-lab">← 이전 장</span>${esc(CH[ORDER[idx - 1]].t)}</a>` : "<span></span>"}${idx < ORDER.length - 1 ? `<a class="nx" href="#/cim/book/${ORDER[idx + 1]}"><span class="cim-lab">다음 장 →</span>${esc(CH[ORDER[idx + 1]].t)}</a>` : ""}</nav>
      </div></div>`;
    host.querySelectorAll("[data-fig]").forEach((d) => { try { FIGS[d.dataset.fig].mount(d); } catch (e) { console.warn(e); } });
    // 옆 목차: 지금 읽는 카드에 표시 (넓은 화면에서만 보여요)
    if ("IntersectionObserver" in window) {
      const io = new IntersectionObserver((es) => {
        const e = es.filter((x) => x.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]; if (!e) return;
        host.querySelectorAll(".cb-ol a[aria-current]").forEach((a) => a.removeAttribute("aria-current"));
        host.querySelector(`[data-ol="${e.target.id.slice(2)}"]`)?.setAttribute("aria-current", "true");
      }, { root: host.closest(".main"), rootMargin: "-80px 0px -65% 0px" });
      host.querySelectorAll(".cc").forEach((c) => io.observe(c));
      stops.push(() => io.disconnect());
    }
    host.onclick = (e) => {
      const t = e.target;
      const f = t.closest("[data-f]"); if (f) { filt = +f.dataset.f; draw(c); return; }
      const rd = t.closest("[data-read]");
      if (rd) {
        const k = rd.dataset.read, S = st(); S.read[k] ? delete S.read[k] : (S.read[k] = 1); save();
        const on = !!S.read[k], card = rd.closest(".cc"), tg = card.querySelector(".cc-tag.seen");
        rd.textContent = on ? "읽음 취소" : "읽었어요"; rd.setAttribute("aria-pressed", String(on));
        if (on && !tg) card.querySelector(".cc-tags").insertAdjacentHTML("beforeend", `<span class="cc-tag seen">읽음</span>`);
        if (!on && tg) tg.remove();
        host.querySelector(`[data-ol="${k}"]`)?.classList.toggle("read", on);
        const nr = all.filter((p) => S.read[p.key]).length;
        host.querySelector("#cb-nread").textContent = `읽음 ${nr}/${all.length}`; host.querySelector("#cb-rbar").style.width = (nr / all.length) * 100 + "%";
        return;
      }
      const pq = t.closest("[data-pq]");
      if (pq) {
        const box = pq.closest(".cc").querySelector(".cc-pq");
        if (box.innerHTML) { box._stop?.(); box.innerHTML = ""; pq.setAttribute("aria-expanded", "false"); return; }
        pq.setAttribute("aria-expanded", "true");
        box._stop = runQuiz(box, (QS_BY[c.id] || []).filter((q) => q.pt.key === pq.dataset.pq), { inline: true });
        stops.push(() => box._stop?.());
        box.querySelector(".cq-o")?.focus({ preventScroll: true });
      }
    };
  }

  const show = (r) => { if (r.id && CH[r.id]) open(r.id, r.sub); else { stopAll(); toc(); } };
  show(r);
  return {
    stop: stopAll,
    // 같은 장 안에서 카드만 바뀌면 다시 그리지 않고 그 카드로
    update(nr) { if (nr.id && nr.id === curCh && host.querySelector(".cb-main")) { if (nr.sub) jump(nr.sub); return true; } return false; },
  };
}
