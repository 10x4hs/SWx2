// CIM 모의고사 — 100문항(1과목 20 · 2과목 30 · 3과목 50) · 120분 · 과목별 과락 40% + 총점 70. 해설은 끝나고.
// 진행 중인 시험(S.run)은 서버에 저장돼서 새로 고침 · 다른 기기에서도 이어서 풀어요.
import { st, save, record, today, addDays } from "./store.js";
import { CH, ORDER, SUBJ, MARK, chName, chOf } from "./meta.js";
import { chapters, QI } from "./data.js";
import { interleave } from "./quiz.js";
import { esc, pad2, loading, errorBox, ring } from "./ui.js";
import { toast } from "../util.js";

const SUBJ_AT = (i) => (i < 20 ? 1 : i < 50 ? 2 : 3);
const typing = (e) => e.target.closest?.("input, textarea, select, [contenteditable]") || e.metaKey || e.ctrlKey || e.altKey;

export function mountMock(host) {
  let tick = null, onKey = null;
  const stop = () => { clearInterval(tick); tick = null; if (onKey) document.removeEventListener("keydown", onKey); onKey = null; };

  function home() {
    stop();
    const S = st();
    host.innerHTML = `<header class="cim-vh"><h1>실전 모의고사</h1><p>실제 시험처럼 100문항 · 120분. 해설은 끝나고 보여 줘요.</p></header>
      <section class="cim-panel cm-start">
        <dl class="cm-spec"><div><dt>문항</dt><dd class="cim-num">100</dd></div><div><dt>시간</dt><dd class="cim-num">120<small>분</small></dd></div><div><dt>1과목</dt><dd class="cim-num">20</dd></div><div><dt>2과목</dt><dd class="cim-num">30</dd></div><div><dt>3과목</dt><dd class="cim-num">50</dd></div></dl>
        <p>합격: 70개 이상 + 과목별 40% 이상. 문제 은행 1,990개에서 장을 섞어 뽑아요.</p>
        <button type="button" class="cim-btn" id="cm-go">시작하기</button></section>
      ${S.mocks.length ? `<section class="cim-panel"><header class="cim-ph"><div><span class="cim-lab">지난 기록</span><h2>${S.mocks.length}회</h2></div></header><div class="cim-tscroll"><table class="cim-tbl cm-hist"><thead><tr><th scope="col">날짜</th><th scope="col">1과목</th><th scope="col">2과목</th><th scope="col">3과목</th><th scope="col">총점</th><th scope="col">결과</th></tr></thead><tbody>${S.mocks.slice().reverse().map((m) => `<tr><td class="cim-num">${m.date}</td>${[1, 2, 3].map((s) => `<td class="cim-num${m.by[s] >= SUBJ[s].q * 0.4 ? "" : " bad"}">${m.by[s]}/${SUBJ[s].q}</td>`).join("")}<td class="cim-num"><b>${m.total}</b></td><td class="${m.pass ? "ok" : "bad"}">${m.pass ? "합격" : "불합격"}</td></tr>`).join("")}</tbody></table></div></section>` : ""}`;
    host.querySelector("#cm-go").onclick = async () => {
      host.querySelector("#cm-go").disabled = true;
      if (!(await need(ORDER))) return;
      const ids = [];
      [1, 2, 3].forEach((s) => ids.push(...interleave(ORDER.filter((id) => CH[id].s === s), SUBJ[s].q).map((q) => q.id)));
      st().run = { rid: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), ids, picks: {}, end: Date.now() + 120 * 60e3, cur: 0 };
      save(); run();
    };
  }
  // 필요한 장을 받아요 (모의고사는 19장 전부 · 약 2MB, 한 번 받으면 캐시)
  async function need(ids) {
    host.innerHTML = loading("문제 은행 불러오는 중");
    try { await chapters(ids, (n, t) => { if (host.isConnected) host.innerHTML = loading(`문제 은행 불러오는 중 <span class="cim-num">${n}/${t}</span>`); }); return host.isConnected; }
    catch (e) { host.innerHTML = errorBox(esc(e.message)); return false; }
  }

  async function run() {
    stop();
    const r0 = st().run;
    if (!r0) return home();
    if (r0.ids.some((id) => !QI[id]) && !(await need(r0.ids.map(chOf)))) return;
    const R = () => st().run; // 다른 기기 기록과 합쳐져도 늘 지금 것
    const draw = () => {
      const r = R(); if (!r) return home();
      const i = r.cur, q = QI[r.ids[i]], n = Object.keys(r.picks).length, s = SUBJ_AT(i);
      host.innerHTML = `<div class="cm-run">
        <div class="cm-bar"><span class="cm-timer cim-num" id="cm-tm" role="timer" aria-label="남은 시간"></span><span class="cm-ans"><b class="cim-num">${n}</b><small class="cim-num">/100 답함</small></span><span class="cm-prog" aria-hidden="true"><i style="width:${n}%"></i></span><button type="button" class="cim-btn line sm" id="cm-sub">제출</button></div>
        <div class="cim-panel cm-q">
          <p class="cq-meta"><b class="cim-num">${pad2(i + 1)}</b>번 · ${SUBJ[s].n}</p>
          <p class="cq-q">${esc(q?.q || "문제를 찾지 못했어요.")}</p>
          <div class="cq-opts" role="group" aria-label="보기">${(q?.o || []).map((t, k) => `<button type="button" class="cq-o${r.picks[i] === k ? " pick" : ""}" data-k="${k}" aria-pressed="${r.picks[i] === k}"><span class="cq-k" aria-hidden="true">${MARK[k]}</span><span class="cq-ot">${esc(t)}</span></button>`).join("")}</div>
          <div class="cq-nav split"><button type="button" class="cim-btn ghost" data-mv="-1" ${i ? "" : "disabled"}><span aria-hidden="true">←</span> 이전</button><span class="cq-hint" aria-hidden="true"><kbd>1</kbd>–<kbd>5</kbd> 고르기 · <kbd>←</kbd><kbd>→</kbd> 이동</span><button type="button" class="cim-btn" data-mv="1" ${i < 99 ? "" : "disabled"}>다음 <span aria-hidden="true">→</span></button></div>
        </div>
        <details class="cim-panel cm-map"${matchMedia("(min-width: 900px)").matches ? " open" : ""}><summary>문항 지도 <span class="cim-num dim">${n}/100</span></summary>
          ${[1, 2, 3].map((sj) => { const a = sj === 1 ? 0 : sj === 2 ? 20 : 50, b = a + SUBJ[sj].q; return `<div class="cm-grp"><span class="cim-lab">${sj}과목</span><div class="cm-grid">${r.ids.slice(a, b).map((_, j) => { const k = a + j; return `<button type="button" data-j="${k}" class="${r.picks[k] != null ? "a" : ""}${k === i ? " cur" : ""}" aria-label="${k + 1}번${r.picks[k] != null ? " 답함" : ""}"${k === i ? ' aria-current="true"' : ""}>${k + 1}</button>`; }).join("")}</div></div>`; }).join("")}</details></div>`;
      upd();
    };
    const upd = () => {
      const t = host.querySelector("#cm-tm"), r = R(); if (!t || !r) return;
      const ms = r.end - Date.now();
      if (ms <= 0) { toast("시간이 끝났어요. 자동 제출해요."); return result(grade()); }
      const m = Math.floor(ms / 60e3), s = Math.floor(ms / 1e3) % 60;
      t.textContent = `${pad2(m)}:${pad2(s)}`; t.classList.toggle("low", m < 10);
    };
    const choose = (k) => { const r = R(); r.picks[r.cur] = k; save(); if (r.cur < 99) r.cur++; draw(); };
    const move = (d) => { const r = R(); r.cur = Math.max(0, Math.min(99, r.cur + d)); save(); draw(); };
    const submit = () => { const r = R(), n = 100 - Object.keys(r.picks).length; if (n && !confirm(`${n}문항을 안 풀었어요. 제출할까요?`)) return; result(grade()); };
    tick = setInterval(upd, 1000);
    host.onclick = (e) => {
      if (!R()) return;
      const o = e.target.closest(".cq-o"); if (o) return choose(+o.dataset.k);
      const mv = e.target.closest("[data-mv]"); if (mv) return move(+mv.dataset.mv);
      const j = e.target.closest("[data-j]"); if (j) { R().cur = +j.dataset.j; draw(); return; }
      if (e.target.closest("#cm-sub")) submit();
    };
    onKey = (e) => {
      if (typing(e) || !host.isConnected || !R()) return;
      const n = +e.key;
      if (n >= 1 && n <= 5) { e.preventDefault(); choose(n - 1); }
      else if (e.key === "ArrowRight") { e.preventDefault(); move(1); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); move(-1); }
    };
    document.addEventListener("keydown", onKey);
    draw();
  }

  function grade() {
    const S = st(), r = S.run, by = { 1: 0, 2: 0, 3: 0 };
    r.ids.forEach((id, i) => { const q = QI[id]; if (!q) return; const p = r.picks[i], ok = p === q.a; if (ok) by[q.s]++; if (p != null) record(q, ok); else S.wrong[id] = { st: 0, due: addDays(today(), 1) }; });
    const total = by[1] + by[2] + by[3], pass = total >= 70 && [1, 2, 3].every((s) => by[s] >= SUBJ[s].q * 0.4);
    const res = { date: today(), by, total, pass, ids: r.ids, picks: r.picks };
    S.mocks.push({ date: res.date, by, total, pass, rid: r.rid }); if (S.mocks.length > 20) S.mocks.shift();
    S.run = null; save(); stop();
    return res;
  }
  function result(res) {
    stop();
    const wrong = res.ids.map((id, i) => ({ q: QI[id], i, p: res.picks[i] })).filter((x) => x.q && x.p !== x.q.a);
    host.innerHTML = `<section class="cim-panel cm-res ${res.pass ? "pass" : "fail"}">
        <div class="cm-score">${ring(res.total / 100, { size: 96, stroke: 7, cls: res.pass ? "ok" : "bad" })}<div><span class="cim-lab">총점</span><b class="cq-big cim-num">${res.total}<small>/100</small></b><span class="cim-status ${res.pass ? "ok" : "bad"}"><span aria-hidden="true">${res.pass ? "✓" : "✕"}</span> ${res.pass ? "합격" : "불합격"}</span></div></div>
        <div class="cim-tscroll"><table class="cim-tbl"><thead><tr><th scope="col">과목</th><th scope="col">맞음</th><th scope="col">과락선</th><th scope="col">판정</th></tr></thead><tbody>${[1, 2, 3].map((s) => { const ok = res.by[s] >= SUBJ[s].q * 0.4; return `<tr><th scope="row">${SUBJ[s].n}</th><td class="cim-num">${res.by[s]}/${SUBJ[s].q}</td><td class="cim-num">${SUBJ[s].q * 0.4}</td><td class="${ok ? "ok" : "bad"}">${ok ? "통과" : "과락"}</td></tr>`; }).join("")}<tr class="sum"><th scope="row">총점</th><td class="cim-num"><b>${res.total}/100</b></td><td class="cim-num">70</td><td class="${res.total >= 70 ? "ok" : "bad"}">${res.total >= 70 ? "통과" : "미달"}</td></tr></tbody></table></div>
        <p>틀린 ${wrong.length}문항은 오답노트에 들어갔어요.</p><div class="cim-row"><button type="button" class="cim-btn line" id="cm-back">모의고사 첫 화면</button><a class="cim-btn ghost" href="#/cim/quiz/due">오답 복습</a></div></section>
      ${wrong.length ? `<h2 class="cm-wh">틀린 문제 해설 <span class="cim-num dim">${wrong.length}</span></h2>` : ""}
      ${wrong.map((x) => `<article class="cim-panel cm-w"><p class="cq-meta"><b class="cim-num">${pad2(x.i + 1)}</b>번 · ${esc(chName(x.q.ch))}${x.p == null ? " · 안 풂" : ""}</p><p class="cq-q">${esc(x.q.q)}</p><div class="cq-opts">${x.q.o.map((t, k) => `<div class="cq-o ${k === x.q.a ? "ok" : k === x.p ? "bad" : ""}"><span class="cq-k" aria-hidden="true">${MARK[k]}</span><span class="cq-ot">${esc(t)}</span></div>`).join("")}</div><div class="cq-x"><p>${esc(x.q.x)}</p></div></article>`).join("")}`;
    host.querySelector("#cm-back").onclick = home;
    host.closest(".main")?.scrollTo({ top: 0 });
  }

  if (st().run) run(); else home();
  return { stop };
}
