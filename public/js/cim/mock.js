// CIM 모의고사 (#/cim/exam/mock) — 100문항(1과목 20 · 2과목 30 · 3과목 50) · 120분 · 과목별 과락 40% + 총점 70. 해설은 끝나고.
// 진행 중인 시험(S.run)은 서버에 저장돼서 새로 고침 · 다른 기기에서도 이어서 풀어요.
import { st, save, record, today, addDays } from "./store.js";
import { CH, ORDER, SUBJ, TOTAL_Q, chName, chOf } from "./meta.js";
import { chapters, QI } from "./data.js";
import { interleave } from "./quiz.js";
import { setAi } from "./ai.js";
import { esc, pad2, loading, errorBox, typing } from "./ui.js";
import { toast } from "../util.js";

const SUBJ_AT = (i) => (i < 20 ? 1 : i < 50 ? 2 : 3);

export function mountMock(host) {
  let tick = null, onKey = null;
  const stop = () => { clearInterval(tick); tick = null; if (onKey) document.removeEventListener("keydown", onKey); onKey = null; host.closest(".cim")?.classList.remove("c-focus"); };
  const top = () => host.closest(".main")?.scrollTo({ top: 0 });

  function home() {
    stop();
    const S = st();
    host.innerHTML = `<div class="c-exam"><div class="c-shead"><a class="c-ghost press" href="#/cim/exam">← 시험</a><span></span></div>
      <h1>모의고사</h1>
      <div class="c-spec num"><div><span class="k">문항</span><span class="v">100</span></div><div><span class="k">시간</span><span class="v">120<small>분</small></span></div><div><span class="k">합격</span><span class="v">70<small>개</small></span></div></div>
      <p class="c-lead">과목마다 40% 이상(1과목 8 · 2과목 12 · 3과목 20개)이어야 해요. 하나라도 모자라면 총점과 관계없이 과락이에요. 해설은 다 풀고 나서 보여 줘요.</p>
      <button type="button" class="c-go press" id="cm-go">시작하기 <span>${TOTAL_Q.toLocaleString("ko-KR")}문제에서 섞어 뽑아요 →</span></button>
      ${S.mocks.length ? `<section class="c-grp"><div class="gh"><span>지난 기록</span><span class="num">${S.mocks.length}회</span></div>${S.mocks.slice().reverse().map((m) => `<div class="c-row static"><span class="n num">${esc(m.date.slice(5))}</span><b class="num">${m.total}점 <span class="${m.pass ? "ok" : "bad"}">${m.pass ? "합격" : "불합격"}</span></b><span class="p num">${[1, 2, 3].map((s) => `<span class="${m.by[s] < SUBJ[s].q * 0.4 ? "bad" : ""}">${m.by[s]}/${SUBJ[s].q}</span>`).join(" · ")}</span></div>`).join("")}</section>` : ""}
    </div>`;
    host.querySelector("#cm-go").onclick = async () => {
      host.querySelector("#cm-go").disabled = true;
      if (!(await need(ORDER))) return;
      const ids = [];
      [1, 2, 3].forEach((s) => ids.push(...interleave(ORDER.filter((id) => CH[id].s === s), SUBJ[s].q).map((q) => q.id)));
      st().run = { rid: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), ids, picks: {}, end: Date.now() + 120 * 60e3, cur: 0 };
      save(); run();
    };
    setAi({ kind: "general", topic: "모의고사 첫 화면" });
  }
  // 필요한 장을 받아요 (모의고사는 19장 전부 · 약 2MB, 한 번 받으면 캐시)
  async function need(ids) {
    host.innerHTML = loading("문제 은행 불러오는 중");
    try { await chapters(ids, (n, t) => { if (host.isConnected) host.innerHTML = loading(`문제 은행 불러오는 중 <span class="num">${n}/${t}</span>`); }); return host.isConnected; }
    catch (e) { host.innerHTML = errorBox(esc(e.message)); return false; }
  }

  async function run() {
    stop();
    const r0 = st().run;
    if (!r0) return home();
    if (r0.ids.some((id) => !QI[id]) && !(await need(r0.ids.map(chOf)))) return;
    host.closest(".cim")?.classList.add("c-focus"); // 시험 중에는 아래 탭을 숨겨요
    const R = () => st().run; // 다른 기기 기록과 합쳐져도 늘 지금 것
    const draw = () => {
      const r = R(); if (!r) return home();
      const i = r.cur, q = QI[r.ids[i]], n = Object.keys(r.picks).length, s = SUBJ_AT(i);
      host.innerHTML = `<div class="c-session cm-run">
        <div class="cm-bar num"><span class="cm-timer" id="cm-tm" role="timer" aria-label="남은 시간"></span><span class="cm-ans"><b>${n}</b> / 100 답함</span><button type="button" class="c-btn dark sm press" id="cm-sub">제출</button></div>
        <div class="c-bar" aria-hidden="true"><i style="transform:scaleX(${n / 100})"></i></div>
        <div class="c-shead num"><span>${i + 1} / 100</span><span>${esc(SUBJ[s].n)}</span></div>
        <p class="c-qstem">${esc(q?.q || "문제를 찾지 못했어요.")}</p>
        <div class="c-opts" role="group" aria-label="보기">${(q?.o || []).map((t, k) => `<button type="button" class="c-opt${r.picks[i] === k ? " pick" : ""}" data-k="${k}" aria-pressed="${r.picks[i] === k}"><span class="k num" aria-hidden="true">${k + 1}</span><span>${esc(t)}</span></button>`).join("")}</div>
        <div class="c-navrow c-col2"><button type="button" class="c-btn press" data-mv="-1" ${i ? "" : "disabled"}>← 이전</button><button type="button" class="c-btn press" data-mv="1" ${i < 99 ? "" : "disabled"}>다음 →</button></div>
        <details class="cm-map"><summary>문항 지도 <span class="num">${n} / 100</span></summary>
          ${[1, 2, 3].map((sj) => { const a = sj === 1 ? 0 : sj === 2 ? 20 : 50, b = a + SUBJ[sj].q; return `<div class="cm-grp"><span class="k">${esc(SUBJ[sj].n)}</span><div class="cm-grid">${r.ids.slice(a, b).map((_, j) => { const k = a + j; return `<button type="button" data-j="${k}" class="num${r.picks[k] != null ? " a" : ""}${k === i ? " cur" : ""}" aria-label="${k + 1}번${r.picks[k] != null ? " 답함" : ""}"${k === i ? ' aria-current="true"' : ""}>${k + 1}</button>`; }).join("")}</div></div>`; }).join("")}</details></div>`;
      upd();
      setAi({ kind: "general", topic: "모의고사 푸는 중 (실전 연습이라 문제 풀이는 끝나고 물어봐요)" });
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
      const o = e.target.closest(".c-opt"); if (o) return choose(+o.dataset.k);
      const mv = e.target.closest("[data-mv]"); if (mv) return move(+mv.dataset.mv);
      const j = e.target.closest("[data-j]"); if (j) { R().cur = +j.dataset.j; draw(); return; }
      if (e.target.closest("#cm-sub")) submit();
    };
    onKey = (e) => {
      if (typing(e) || !host.isConnected || !R()) return;
      const n = +e.key;
      if (n >= 1 && n <= 4) { e.preventDefault(); choose(n - 1); }
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
    host.innerHTML = `<div class="c-exam cm-res">
      <div class="c-done"><span class="k">모의고사 결과</span><span class="big num">${res.total}<small> / 100</small></span><span class="c-verdict ${res.pass ? "ok" : "bad"}">${res.pass ? "합격이에요" : "불합격이에요"}</span></div>
      <div class="c-subj num">${[1, 2, 3].map((s) => { const ok = res.by[s] >= SUBJ[s].q * 0.4; return `<div class="${ok ? "" : "bad"}"><span class="k">${s}과목</span><span class="v">${res.by[s]}<small>/${SUBJ[s].q}</small></span><span class="s">${ok ? "통과" : `과락 · ${SUBJ[s].q * 0.4}개부터`}</span></div>`; }).join("")}</div>
      <p class="c-lead">틀린 ${wrong.length}문항은 1 · 3 · 7일 뒤에 다시 나와요.</p>
      <div class="c-col2"><button type="button" class="c-btn press" id="cm-back">모의고사 첫 화면</button><a class="c-btn lime press" href="#/cim/exam/due">오답 다시 풀기</a></div>
      ${wrong.length ? `<section class="c-grp"><div class="gh"><span>틀린 문제 해설</span><span class="num">${wrong.length}</span></div>
      ${wrong.map((x) => `<article class="cm-w"><p class="c-qmeta num">${x.i + 1}번 · ${esc(chName(x.q.ch))} · ${x.p == null ? "안 풂" : "오답"}</p><p class="c-qstem sm">${esc(x.q.q)}</p><div class="c-opts">${x.q.o.map((t, k) => `<div class="c-opt still ${k === x.q.a ? "right" : k === x.p ? "wrong" : ""}"><span class="k num" aria-hidden="true">${k + 1}</span><span>${esc(t)}</span></div>`).join("")}</div><div class="c-expl show"><div><div class="in"><b>정답 ${x.q.a + 1}번</b>${esc(x.q.x)}</div></div></div></article>`).join("")}</section>` : ""}</div>`;
    host.querySelector("#cm-back").onclick = home;
    top();
    setAi({ kind: "general", topic: `모의고사 결과 ${res.total}점 (${res.pass ? "합격" : "불합격"}) · 과목별 ${[1, 2, 3].map((s) => `${s}과목 ${res.by[s]}/${SUBJ[s].q}`).join(", ")}` });
  }

  if (st().run) run(); else home();
  return { stop };
}
