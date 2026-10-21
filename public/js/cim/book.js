// CIM 교과서 — 차례(#/cim/book) · 장(#/cim/book/<장>) · 카드로 바로(#/cim/book/<장>/<핵심 번호>)
// 카드: 본문(+ 사진에서 옮긴 '내 밑줄') · TIP · 용어 · 예시 · '개정 확인' · 어려운 공식에만 '왜 이 공식' · 이야기 · 그림 · 문제 5개 · 읽음
// 차례에서 장을 누르면 그 줄이 장 머리로 그 자리에서 커져요 (View Transitions, 안 되면 그냥 넘어가요)
import { st, save } from "./store.js";
import { CHS, CH, ORDER, SUBJ, TOTAL_P, TOTAL_Q } from "./meta.js";
import { chapter, QS_BY } from "./data.js";
import { NOTES } from "./notes.js";
import { FIGS } from "./figs.js";
import { runQuiz } from "./quiz.js";
import { planDay } from "./dash.js";
import { esc, pad2, loading, errorBox, chev, liftTo, reduced } from "./ui.js";

const REV = /예금자\s*보호|Gross-?up|그로스업|귀속법인세|증권거래세\s*세율/;
const SUBJ_T = { 1: "금융상품 및 세제", 2: "투자운용 및 전략 II · 투자분석", 3: "직무윤리 · 법규 · 투자운용 및 전략 I" };
const SUBJ_IC = { 1: "b", 2: "g", 3: "p" };
const FILTERS = ["전체", "★★ 이상", "★★★만"];
const CIRC = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳";
const FORM = /^[A-Za-zΔσβαΣ∑][^가-힣]{0,6}\s*[=≈]|^[^가-힣]*[=≈][^가-힣]*$/; // 한글 없이 '=' 가 있는 짧은 줄 = 공식
const STRUCT = /^(TIP$|예$|용어 알아두기$|▶|\(\d+\)|[①-⑳])/;
let filt = 0; // 이번 접속 동안 기억

// 교재 본문 → 읽기 쉬운 HTML
//   TIP(파랑) · 용어 알아두기(회색) · 예(초록) · ▶/(1) 소제목 · ① 동그라미 목록 · ㉠ · • 하위 항목 · 공식(회색 가운데) · '|' 표(첫 칸 회색)
//   교재의 주석 상자 때문에 끊긴 줄("등가수익률" / "은 4.5% × 2 …")은 다시 이어 붙여요
// marks: 교재 사진에서 옮긴 '내 밑줄' 구절 — 본문에서 처음 나온 자리만 노란 형광펜 (TIP 은 빼고)
export function renderBody(txt, marks) {
  const L = [];
  for (const raw of String(txt || "").split("\n")) {
    const l = raw.trim(), prev = L.length ? L[L.length - 1].trim() : null;
    if (prev && l && /^(은|는|이|가|을|를|의|로|으로|와|과|에|에서)\s/.test(l) && prev.length <= 14 && !STRUCT.test(prev) && !prev.includes("|") && !/[.:!?)다음함임됨]$/.test(prev)) L[L.length - 1] = prev + l;
    else L.push(raw);
  }
  const re = marks?.length ? new RegExp([...marks].sort((a, b) => b.length - a.length).map((m) => esc(m).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "g") : null;
  const seen = new Set(); // 같은 구절은 처음 나온 자리만 (교재에서 그은 곳이 한 군데라서)
  const E = (t) => (re ? esc(t).replace(re, (m) => (seen.has(m) ? m : (seen.add(m), `<mark class="cc-my" title="내 밑줄">${m}</mark>`))) : esc(t));
  const out = [], tip = [], term = [], ex = [];
  let mode = "";
  const flushEx = () => { if (ex.length) { out.push(`<div class="cc-box ex"><span class="bl">예시</span><p>${ex.map(E).join("<br>")}</p></div>`); ex.length = 0; } };

  // 표: 한 줄이 '|' 로 끝나면 그 행이 닫혀요. 칸 안의 여러 줄은 줄바꿈으로, '|' 앞의 짧은 줄은 그 행 첫 칸으로
  const table = (i) => {
    const rows = []; let cur = null;
    const add = (t) => { cur[cur.length - 1] += (cur[cur.length - 1] ? "\n" : "") + t; };
    for (; i < L.length; i++) {
      const l = L[i].trim();
      if (l === "|") { if (cur) { rows.push(cur); cur = null; } continue; }
      if (l.includes("|")) {
        l.split("|").forEach((sg, k) => { sg = sg.trim(); if (k === 0) { if (cur) { if (sg) add(sg); } else cur = [sg]; } else cur.push(sg); });
        if (/\|$/.test(l)) { cur.pop(); rows.push(cur); cur = null; }
        continue;
      }
      if (!l) { if (cur) continue; break; }
      if (cur) { if (/^(▶|TIP$)/.test(l)) { rows.push(cur); cur = null; break; } add(l); continue; }
      let j = i; while (j < L.length && j - i < 3 && L[j].trim() && L[j].trim().length <= 30 && !L[j].includes("|") && !STRUCT.test(L[j].trim())) j++;
      if (j > i && j < L.length && L[j].includes("|")) { cur = [l]; continue; }
      break;
    }
    if (cur) rows.push(cur);
    const R = rows.filter((r) => r.some((c) => c));
    if (R.length) {
      const n = Math.max(...R.map((r) => r.length)), C = (c) => E(c).replace(/\n/g, "<br>");
      const head = R.length > 1 && n > 1 && R[0].length === n && R[0].every((c) => c && c.length <= 12);
      const tr = (r, tag) => `<tr>${r.map((c, k) => `<${tag}${tag === "th" ? ' scope="col"' : ""}${k === r.length - 1 && r.length < n ? ` colspan="${n - r.length + 1}"` : ""}>${C(c)}</${tag}>`).join("")}</tr>`;
      out.push(`<div class="cim-tscroll"><table class="cim-tbl${n === 1 ? " one" : ""}">${head ? `<thead>${tr(R[0], "th")}</thead>` : ""}<tbody>${R.slice(head ? 1 : 0).map((r) => tr(r, "td")).join("")}</tbody></table></div>`);
    }
    return i;
  };

  for (let i = 0; i < L.length; i++) {
    const raw = L[i], l = raw.trim();
    if (l === "TIP") { mode = "tip"; continue; }
    if (l === "용어 알아두기") { mode = "term"; continue; }
    if (l === "예") { flushEx(); mode = "ex"; continue; }
    if (mode === "tip") { if (!l || /^\(\d+\)|^▶/.test(l)) mode = ""; else { tip.push(l); continue; } }
    if (mode === "term") { if (!l) { mode = ""; continue; } if (/^\(\d+\)|^▶/.test(l)) mode = ""; else { term.push(raw); continue; } }
    if (mode === "ex") { if (!l || /^\(\d+\)|^[①-⑳]|^▶/.test(l)) { flushEx(); mode = ""; } else { ex.push(l); continue; } }
    if (l.includes("|")) { i = table(i) - 1; continue; }
    if (!l || l.startsWith("▶ 핵심포인트")) continue;
    let m;
    const s = l.startsWith("▶") ? l.replace(/^▶\s*/, "") : null;
    if (s != null && (m = s.match(/^\((\d+)\)\s*(.*)$/))) out.push(`<h4 class="cc-sub"><span class="no">${m[1]}</span><span>${E(m[2])}</span></h4>`);
    else if (s != null) out.push(`<h4 class="cc-sub">${E(s)}</h4>`);
    else if ((m = l.match(/^\((\d+)\)\s*(.*)$/))) out.push(`<h4 class="cc-sub"><span class="no">${m[1]}</span><span>${E(m[2])}</span></h4>`);
    else if ((m = l.match(/^([①-⑳])\s*(.*)$/))) out.push(`<div class="cc-li"><span class="dot" aria-hidden="true">${CIRC.indexOf(m[1]) + 1}</span><span>${E(m[2])}</span></div>`);
    else if (/^[㉠-㉭ⓐ-ⓩ·•\-]/.test(l)) out.push(`<div class="cc-li2">${E(l)}</div>`);
    else if (l.length < 70 && FORM.test(l)) out.push(`<div class="cc-formula">${E(l)}</div>`);
    else out.push(`<p>${E(l)}</p>`);
  }
  flushEx();
  const termHtml = term.map((r) => (/^\S/.test(r) && r.trim().length <= 24 ? `<b>${E(r.trim())}</b>` : E(r.trim()))).join("<br>");
  return (term.length ? `<div class="cc-box term"><span class="bl">용어 알아두기</span><p>${termHtml}</p></div>` : "")
    + (tip.length ? `<div class="cc-box tip"><span class="bl">TIP</span><p>${esc(tip.join(" "))}</p></div>` : "")
    + (out.length ? `<div class="cc-text">${out.join("")}</div>` : "");
}
const whyBox = (w) => `<section class="cc-box why cw" aria-label="왜 이 공식이 나왔나"><span class="bl">왜 이 공식일까</span><h4>${esc(w.t)}</h4><div class="cc-formula">${esc(w.f).replace(/\n/g, "<br>")}</div><dl><dt>직관</dt><dd>${esc(w.why)}</dd><dt>숫자로 풀어 보기</dt><dd>${esc(w.ex)}</dd><dt>기억 훅</dt><dd>${esc(w.hook)}</dd></dl></section>`;
const readIn = (id) => { const p = id + "-"; let n = 0; for (const k in st().read) if (k.startsWith(p)) n++; return n; };
const readBtn = (on) => (on ? "✓ 읽었어요" : "다 읽었어요");

export function mountBook(host, r) {
  let stops = [], curCh = null;
  const scroller = host.closest(".main");
  const stopAll = () => { stops.forEach((f) => f()); stops = []; };

  function toc() {
    curCh = null;
    const S = st(), todayChs = NOTES.PLAN[planDay(S) - 1]?.ch || [];
    const nRead = Object.keys(S.read).length;
    host.innerHTML = `<header class="cim-vh"><span class="cim-lab">교과서</span><h1>3과목 19장, 카드로 읽어요</h1><p>장을 누르면 그 자리에서 펼쳐져요. 카드마다 그 내용 문제 5개가 붙어 있어요.</p>
        <div class="chips cim-num" style="margin-top:10px"><span class="chip">핵심 <b>${TOTAL_P}</b></span><span class="chip">문제 <b>${TOTAL_Q.toLocaleString("ko-KR")}</b></span><span class="chip">읽음 <b>${nRead}</b> / ${TOTAL_P}</span></div></header>
      ${[1, 2, 3].map((s) => `<section class="cim-panel cb-subj"><div class="gh"><h2>${s}과목 · ${SUBJ_T[s]}</h2><span class="badge b cim-num">${SUBJ[s].q}문항</span></div>
        <ol class="cb-chs">${CHS.filter((c) => c.s === s).map((c) => {
          const n = readIn(c.id), now = todayChs.includes(c.id), p = Math.round((n / c.np) * 100);
          return `<li><a class="row-i press cb-row${now ? " now" : ""}" href="#/cim/book/${c.id}" data-ch="${c.id}"><span class="ic ${now ? "b" : n ? SUBJ_IC[s] : "n"}">${c.c}</span><span class="tx"><b>${esc(c.t)}</b><span class="cim-num">핵심 ${c.np} · 문제 ${c.nq}${now ? " · 오늘" : ""}</span></span>${n ? `<span class="prog-mini" aria-label="읽음 ${p}%"><i style="width:${p}%"></i></span><span class="end cim-num">${n}/${c.np}</span>` : `<span class="end">시작 전</span>`}${chev}</a></li>`;
        }).join("")}</ol></section>`).join("")}`;
    // 장을 누르면: 장 내용을 먼저 받고(대부분 캐시) → 그 줄이 장 머리로 커져요
    host.onclick = async (e) => {
      const a = e.target.closest("a[data-ch]");
      if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button || !document.startViewTransition || reduced()) return;
      e.preventDefault();
      await Promise.race([chapter(a.dataset.ch).catch(() => {}), new Promise((r) => setTimeout(r, 700))]);
      liftTo(a, () => { location.hash = a.getAttribute("href"); }, "#cb-hero");
    };
  }

  async function open(id, n) {
    if (curCh === id && host.querySelector(".cb-main")) { if (n) jump(n); return; }
    stopAll(); curCh = id;
    host.onclick = null;
    if (!QS_BY[id]) host.innerHTML = loading("장 불러오는 중");
    let c;
    try { c = await chapter(id); } catch (e) { host.innerHTML = errorBox(esc(e.message)); return; }
    if (!host.isConnected || curCh !== id) return;
    if (n && filt) { const p = findPoint(c, n); if (p && !pass(p)) filt = 0; }
    draw(c);
    if (n) requestAnimationFrame(() => jump(n));
  }
  const findPoint = (c, n) => { for (const s of c.sec) for (const p of s.p) if (String(p.n) === String(n)) return p; return null; };
  const pass = (p) => filt === 0 || p.st >= filt + 1;
  function jump(n, smooth = false) {
    const el = host.querySelector(`#k-${curCh}-${CSS.escape(String(n))}`);
    if (el) { el.scrollIntoView({ block: "start", behavior: smooth && !reduced() ? "smooth" : "auto" }); el.classList.add("flash"); setTimeout(() => el.classList.remove("flash"), 1400); }
  }

  function draw(c) {
    stopAll();
    const S = st(), idx = ORDER.indexOf(c.id), N = NOTES;
    const all = c.sec.flatMap((s) => s.p), nRead = all.filter((p) => S.read[p.key]).length, nq = QS_BY[c.id]?.length || 0;
    const examN = (String(c.strat || "").match(/총\s*(\d+)\s*문제/) || [])[1];
    let cards = "", outline = "";
    c.sec.forEach((s) => {
      const ps = s.p.filter(pass);
      if (!ps.length) return;
      if (s.t) { cards += `<div class="cb-sec"><span class="badge b cim-num">${ps.length}</span><h2>${esc(s.t)}</h2></div>`; outline += `<li class="cb-ol-sec">${esc(s.t)}</li>`; }
      ps.forEach((p) => {
        const rev = REV.test(p.b) || p.q.some((q) => REV.test(q.q + q.x)), on = !!S.read[p.key];
        outline += `<li><a href="#/cim/book/${c.id}/${p.n}" data-ol="${p.key}" class="${on ? "read" : ""}"><span class="k cim-num">${p.n}</span><span>${esc(p.t)}</span></a></li>`;
        cards += `<article class="cim-panel cc" id="k-${p.key}">
          <header class="cc-h"><div class="cc-tags"><span class="cc-n">핵심 ${pad2(p.n)}</span>${p.st ? `<span class="cc-st" aria-label="중요도 ${p.st}" title="중요도 ${p.st}">${"★".repeat(p.st)}</span>` : ""}${rev ? `<span class="badge r" title="최근 바뀐 숫자가 있을 수 있어요. 숫자표에서 확인하세요.">개정 확인</span>` : ""}${p.marks?.length ? `<span class="badge y" title="교재에 직접 그은 밑줄을 옮겨 왔어요">내 밑줄</span>` : ""}${on ? `<span class="badge g cc-seen">읽음</span>` : ""}${p.pg ? `<span class="cc-pg cim-num">${esc(p.pg)}쪽</span>` : ""}</div><h3>${esc(p.t)}</h3></header>
          ${renderBody(p.b, p.marks) || `<p class="cim-empty">본문을 준비하고 있어요.</p>`}
          ${N.WHY[p.key] ? whyBox(N.WHY[p.key]) : ""}
          ${N.FIGS[p.key] ? `<div class="cc-fig" data-fig="${N.FIGS[p.key]}"></div>` : ""}
          ${N.STORY[p.key] ? `<aside class="cc-box story cs"><span class="bl">이야기</span><p>${esc(N.STORY[p.key])}</p></aside>` : ""}
          <div class="cc-pq"></div>
          <footer class="cc-f">${p.q.length ? `<button type="button" class="cim-btn press" data-pq="${p.key}" aria-expanded="false">문제 ${p.q.length}개 풀기</button>` : ""}<button type="button" class="cim-btn line press${on ? " on" : ""}" data-read="${p.key}" aria-pressed="${on}">${readBtn(on)}</button></footer></article>`;
      });
    });
    host.innerHTML = `<div class="cb-wrap">
      <nav class="cim-panel cb-side" aria-label="이 장의 카드"><ol class="cb-ol">${outline}</ol></nav>
      <div class="cb-main">
        <section class="cim-panel cb-hero" id="cb-hero">
          <a class="cim-back press" href="#/cim/book"><span aria-hidden="true">←</span> 차례</a>
          <span class="cim-lab cim-num">${c.s}과목 · ${c.c}장${c.pg ? ` · 교재 ${esc(c.pg)}쪽부터` : ""}</span>
          <h1 class="cb-title">${esc(c.t)}</h1>
          <div class="chips cim-num"><span class="chip">핵심 <b>${all.length}</b></span><span class="chip">문제 <b>${nq}</b></span>${examN ? `<span class="chip">시험 <b>${examN}문항</b></span>` : ""}<span class="chip">읽음 <b id="cb-nread">${nRead}</b> / ${all.length}</span></div>
          <span class="cim-bar" aria-hidden="true"><i id="cb-rbar" style="width:${(nRead / all.length) * 100}%"></i></span>
          <div class="filters" role="group" aria-label="중요도 거르기">${FILTERS.map((t, i) => `<button type="button" class="press" data-f="${i}" aria-pressed="${filt === i}">${t}</button>`).join("")}</div>
        </section>
        <details class="cim-panel cb-strat"><summary>이 장은 이렇게 공부해요</summary>${renderBody(String(c.strat || "").replace(/^▶ 학습전략\s*/, ""))}</details>
        ${cards || `<p class="cim-empty">이 거르기에 맞는 카드가 없어요.</p>`}
        <nav class="cb-pn" aria-label="다른 장">${idx > 0 ? `<a class="press" href="#/cim/book/${ORDER[idx - 1]}"><span class="cim-lab">← 이전 장</span>${esc(CH[ORDER[idx - 1]].t)}</a>` : "<span></span>"}${idx < ORDER.length - 1 ? `<a class="nx press" href="#/cim/book/${ORDER[idx + 1]}"><span class="cim-lab">다음 장 →</span>${esc(CH[ORDER[idx + 1]].t)}</a>` : ""}</nav>
        <div class="cb-cta" id="cb-cta"><a class="cim-btn press" href="#/cim/quiz/ch/${c.id}/20">이 장 문제 20개 풀기</a></div>
      </div></div>`;
    host.querySelectorAll("[data-fig]").forEach((d) => { try { FIGS[d.dataset.fig].mount(d); } catch (e) { console.warn(e); } });
    // 아래 고정 버튼: 조금 읽어 내려가면 올라와요
    const cta = host.querySelector("#cb-cta");
    if (scroller) {
      const onS = () => cta.classList.toggle("show", scroller.scrollTop > 500);
      scroller.addEventListener("scroll", onS, { passive: true }); onS();
      stops.push(() => scroller.removeEventListener("scroll", onS));
    }
    // 옆 목차: 지금 읽는 카드를 따라가요 (넓은 화면에서만 보여요)
    const side = host.querySelector(".cb-side");
    if ("IntersectionObserver" in window && getComputedStyle(side).display !== "none") {
      const io = new IntersectionObserver((es) => {
        const e = es.filter((x) => x.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]; if (!e) return;
        host.querySelectorAll(".cb-ol a[aria-current]").forEach((a) => a.removeAttribute("aria-current"));
        const a = host.querySelector(`[data-ol="${e.target.id.slice(2)}"]`); if (!a) return;
        a.setAttribute("aria-current", "true");
        const top = a.offsetTop - side.clientHeight / 2 + a.offsetHeight / 2; // 목차 안에서만 움직여요 (본문 스크롤은 그대로)
        side.scrollTo({ top: Math.max(0, top), behavior: reduced() ? "auto" : "smooth" });
      }, { root: scroller, rootMargin: "-25% 0px -65% 0px" });
      host.querySelectorAll(".cc").forEach((k) => io.observe(k));
      stops.push(() => io.disconnect());
    }
    host.onclick = (e) => {
      const t = e.target;
      const f = t.closest("[data-f]"); if (f) { filt = +f.dataset.f; draw(c); return; }
      const rd = t.closest("[data-read]");
      if (rd) {
        const k = rd.dataset.read, S = st(); S.read[k] ? delete S.read[k] : (S.read[k] = 1); save();
        const on = !!S.read[k], card = rd.closest(".cc"), tg = card.querySelector(".cc-seen");
        rd.textContent = readBtn(on); rd.setAttribute("aria-pressed", String(on)); rd.classList.toggle("on", on);
        if (on && !tg) { const pg = card.querySelector(".cc-pg"); const b = `<span class="badge g cc-seen">읽음</span>`; pg ? pg.insertAdjacentHTML("beforebegin", b) : card.querySelector(".cc-tags").insertAdjacentHTML("beforeend", b); }
        if (!on && tg) tg.remove();
        host.querySelector(`[data-ol="${k}"]`)?.classList.toggle("read", on);
        const nr = all.filter((p) => S.read[p.key]).length;
        host.querySelector("#cb-nread").textContent = nr; host.querySelector("#cb-rbar").style.width = (nr / all.length) * 100 + "%";
        return;
      }
      const pq = t.closest("[data-pq]");
      if (pq) {
        const box = pq.closest(".cc").querySelector(".cc-pq"), n = (QS_BY[c.id] || []).filter((q) => q.pt.key === pq.dataset.pq);
        if (box.innerHTML) { box._stop?.(); box.innerHTML = ""; pq.setAttribute("aria-expanded", "false"); pq.textContent = `문제 ${n.length}개 풀기`; return; }
        pq.setAttribute("aria-expanded", "true"); pq.textContent = "문제 닫기";
        box._stop = runQuiz(box, n, { inline: true });
        stops.push(() => box._stop?.());
        box.querySelector(".cq-o")?.focus({ preventScroll: true });
        box.scrollIntoView({ behavior: reduced() ? "auto" : "smooth", block: "nearest" });
      }
    };
  }

  const show = (r) => { if (r.id && CH[r.id]) open(r.id, r.sub); else { stopAll(); toc(); } };
  show(r);
  return {
    stop: stopAll,
    // 같은 장 안에서 카드만 바뀌면 다시 그리지 않고 그 카드로
    update(nr) { if (nr.id && nr.id === curCh && host.querySelector(".cb-main")) { if (nr.sub) jump(nr.sub, true); return true; } return false; },
  };
}
