// CIM 실전 CBT (#/cim/exam/cbt[/<회차>]) — 정해진 15회 × 100문항 (public/cim/cbt.json, scripts/cim-cbt-build.mjs 가 만들어요)
//   목록: 15회 · 상태(안 풂 · 푸는 중 · 점수) → 한 회 누르면 시작 / 이어서 / 결과
//   푸는 중: 남은 시간 · 1–100 번호판(답함 · 안 답함 · 표시) · '표시' 토글 · ←/→ · 1–4 · 제출 전에 안 푼 수 확인
//   결과: 점수 · 과목별(과락 40%) · 해설 다시 보기 · 틀린 문제는 오답 SRS(store record) 로
//   진행 중인 회차(S.cbtRun)는 서버에 저장돼서 새로 고침 · 다른 기기에서 이어서 풀어요.
import { st, save, record, today, addDays } from "./store.js";
import { SUBJ, CH, chName, chOf } from "./meta.js";
import { chapters, QI } from "./data.js";
import { setAi } from "./ai.js";
import { esc, pad2, loading, errorBox, typing } from "./ui.js";
import { toast } from "../util.js";

const SUBJ_AT = (i) => (i < 20 ? 1 : i < 50 ? 2 : 3);
const RANGE = { 1: [0, 20], 2: [20, 50], 3: [50, 100] };
// 번호판 숨김(B) · 폰 바텀시트 열림 — 화면 상태일 뿐 시험 기록(S.cbtRun)엔 안 넣어요
let HIDE = localStorage.getItem("cim-cbt-hide") === "1", SHEET = false;
let SETS = null; // cbt.json (한 번 받으면 그대로)
export const cbtSets = () => (SETS ||= fetch("/cim/cbt.json").then((r) => { if (!r.ok) throw new Error("/cim/cbt.json " + r.status); return r.json(); }).catch((e) => { SETS = null; throw e; }));
export const CBT_N = 15;

// 1~10회는 시간 없이 넉넉히 (바로 채점 / 끝까지 풀고 채점 고르기), 11~15회만 실전처럼 120분
const TIMED = (n) => n > 10;

export function mountCbt(host, no) {
  let tick = null, onKey = null;
  const stop = () => { clearInterval(tick); tick = null; if (onKey) document.removeEventListener("keydown", onKey); onKey = null; host.closest(".cim")?.classList.remove("c-focus"); host.onclick = null; };
  const top = () => host.closest(".main")?.scrollTo({ top: 0 });
  const R = () => st().cbtRun;

  async function need(ids) {
    host.innerHTML = loading("문제 불러오는 중");
    try { await chapters(ids.map(chOf), (n, t) => { if (host.isConnected) host.innerHTML = loading(`문제 불러오는 중 <span class="num">${n}/${t}</span>`); }); return host.isConnected; }
    catch (e) { host.innerHTML = errorBox(esc(e.message)); return false; }
  }

  // 15회 목록
  // 시간 없는 회차(1~10)가 하나도 안 풀고 끝난 기록(예전 120분 시계가 저절로 낸 0점)은 없던 일로 — 안 푼 문제로 들어간 오답도 같이 빼요
  async function dropEmpty(sets) {
    const S = st(); let ch = false;
    for (const e of sets.exams) {
      const r = S.cbt[e.no];
      if (TIMED(e.no) || !r || Object.keys(r.picks || {}).length) continue;
      for (const id of e.ids) if (S.wrong[id]?.st === 0 && !S.ans[id]) delete S.wrong[id];
      S.mocks = S.mocks.filter((m) => m.rid !== r.rid);
      delete S.cbt[e.no]; ch = true;
    }
    if (ch) save();
  }

  async function list() {
    stop();
    host.innerHTML = loading("CBT 불러오는 중");
    let sets; try { sets = await cbtSets(); } catch (e) { host.innerHTML = errorBox(esc(e.message)); return; }
    if (!host.isConnected) return;
    await dropEmpty(sets);
    const S = st(), run = R(), done = Object.keys(S.cbt).length;
    host.innerHTML = `<div class="c-exam cb-list"><div class="c-shead"><a class="c-ghost press" href="#/cim/exam">← 시험</a><span></span></div>
      <h1>실전 CBT</h1>
      <p class="c-lead">1~10회는 시간 제한 없이 공부하듯 풀고, 11~15회는 실제 시험처럼 120분이에요. 15회 모두 서로 다른 문제예요. 과목마다 40% 넘고 총 70개면 합격.</p>
      <section class="c-grp"><div class="gh"><span>15회</span><span class="num">${done} / ${sets.exams.length} 끝</span></div>
      ${sets.exams.map((e) => { const r = S.cbt[e.no], on = run?.no === e.no;
        const p = on ? `<span class="hot">푸는 중 · ${Object.keys(run.picks).length}/100</span>` : r ? `<b class="num">${r.total}점</b> <span class="${r.pass ? "ok" : "bad"}">${r.pass ? "합격" : "불합격"}</span>` : `<span class="dim">안 풂</span>`;
        return `<a class="c-row press cb-row${on ? " now" : ""}" href="#/cim/exam/cbt/${e.no}" data-no="${e.no}"><span class="n num">${pad2(e.no)}</span><b>${e.no}회</b>${TIMED(e.no) ? `<span class="cb-tag num">120분</span>` : `<span class="cb-tag free">시간 없음</span>`}<span class="p num">${p}</span></a>`; }).join("")}</section></div>`;
    setAi({ kind: "general", topic: `실전 CBT 목록 · ${done}회 끝` });
  }

  // 한 회차 입구 — 진행 중이면 이어서, 끝났으면 결과, 아니면 시작 화면
  async function open(n, fresh = false) {
    let sets; try { sets = await cbtSets(); } catch (e) { host.innerHTML = errorBox(esc(e.message)); return; }
    const ex = sets.exams.find((e) => e.no === n);
    if (!ex) { location.replace("#/cim/exam/cbt"); return; }
    await dropEmpty(sets);
    const S = st();
    if (R()?.no === n) return run();
    if (S.cbt[n]?.picks && !fresh) { if (!(await need(ex.ids))) return; return result(n, ex.ids, S.cbt[n]); }
    stop();
    const other = R();
    host.innerHTML = `<div class="c-exam"><div class="c-shead"><a class="c-ghost press" href="#/cim/exam/cbt">← CBT 목록</a><span></span></div>
      <h1>실전 CBT ${n}회</h1>
      <div class="c-spec num"><div><span class="k">문항</span><span class="v">100</span></div><div><span class="k">시간</span><span class="v">${TIMED(n) ? `120<small>분</small>` : `<small>제한 없음</small>`}</span></div><div><span class="k">합격</span><span class="v">70<small>개</small></span></div></div>
      <p class="c-lead">1과목 20 · 2과목 30 · 3과목 50문항. 헷갈리는 문제는 '표시'해 두고 번호판에서 다시 가요. ${TIMED(n) ? "해설은 제출한 뒤에 봐요." : "시간 제한이 없어요. 채점 방식을 골라요."}</p>
      ${TIMED(n) ? "" : `<div class="cb-mode" role="radiogroup" aria-label="채점 방식"><label><input type="radio" name="cb-mode" value="now" checked> <b>바로 채점</b> <span>고르면 바로 정답 · 해설</span></label><label><input type="radio" name="cb-mode" value="end"> <b>끝까지 풀고 채점</b> <span>시험처럼, 제출한 뒤에 해설</span></label></div>`}
      ${other ? `<p class="c-hint">${other.no}회를 푸는 중이에요. 시작하면 그 회차는 그만둬요.</p>` : ""}
      <button type="button" class="c-go press" id="cb-go">시작하기 <span>${TIMED(n) ? "120분" : "시간 없음"} →</span></button></div>`;
    host.querySelector("#cb-go").onclick = async () => {
      if (other && !confirm(`${other.no}회 푸는 중이에요. 그만두고 ${n}회를 시작할까요?`)) return;
      const mode = TIMED(n) ? "end" : host.querySelector("[name=cb-mode]:checked")?.value || "now"; // 불러오기 전에 읽어요 (불러오는 동안 화면이 바뀌어요)
      host.querySelector("#cb-go").disabled = true;
      if (!(await need(ex.ids))) return;
      st().cbtRun = { rid: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), no: n, ids: ex.ids.slice(), picks: {}, flags: {}, end: TIMED(n) ? Date.now() + 120 * 60e3 : null, t0: Date.now(), mode, cur: 0 };
      save(); run();
    };
    setAi({ kind: "general", topic: `실전 CBT ${n}회 시작 화면` });
  }

  async function run() {
    stop();
    const r0 = R(); if (!r0) return list();
    if (r0.ids.some((id) => !QI[id]) && !(await need(r0.ids))) return;
    if (!R()) return list();
    // 1~10회는 시간 없음 — 예전에 120분으로 시작한 회차도 고른 답은 두고 시계만 없애요
    { const r = R(); if (!TIMED(r.no) && r.end) { r.end = null; r.t0 ||= Date.now(); r.mode ||= "end"; save(); } }
    host.closest(".cim")?.classList.add("c-focus");
    if (location.hash !== `#/cim/exam/cbt/${r0.no}`) history.replaceState(null, "", `#/cim/exam/cbt/${r0.no}`);
    const draw = () => {
      const r = R(); if (!r) return list();
      r.flags ||= {};
      const i = r.cur, q = QI[r.ids[i]], n = Object.keys(r.picks).length, nf = Object.keys(r.flags).length, s = SUBJ_AT(i), fl = !!r.flags[i];
      const ch = CH[chOf(r.ids[i])];
      const shown = r.mode === "now" && r.picks[i] != null && !!q; // 바로 채점: 고른 문제는 정답 · 해설을 바로
      // 화면 = 위 한 줄(회차 · 시계 · 답함 · 번호판 · 제출) + 읽기 칸(가운데 760px) + 오른쪽 얇은 번호판
      host.innerHTML = `<div class="cb-run${HIDE ? " hide" : ""}${SHEET ? " sheet" : ""}">
        <div class="cm-bar cb-bar num"><span class="cb-no">${r.no}회</span><span class="cm-timer${r.end ? "" : " free"}" id="cm-tm" role="timer" aria-label="${r.end ? "남은 시간" : "걸린 시간"}"></span>${r.end ? "" : `<button type="button" class="cb-pad press" id="cb-mode" aria-pressed="${r.mode === "now"}" title="채점 방식 바꾸기">${r.mode === "now" ? "바로 채점" : "끝까지 풀기"}</button>`}<span class="cm-ans"><b>${n}</b> / 100 답함</span><button type="button" class="cb-pad press" id="cb-pad" aria-expanded="${HIDE ? !1 : !0}" title="번호판 (B)">번호판</button><button type="button" class="c-btn dark sm press" id="cb-sub">제출</button></div>
        <div class="cb-main">
          <div class="cb-read">
            <p class="cb-meta num"><b>${i + 1}</b> / 100 · ${esc(SUBJ[s].n)}${ch ? ` · ${esc(ch.t)}` : ""}</p>
            <p class="c-qstem cb-q" id="cb-q">${esc(q?.q || "문제를 찾지 못했어요.")}</p>
            <div class="c-opts cb-opts" role="group" aria-label="보기">${(q?.o || []).map((t, k) => `<button type="button" class="c-opt${r.picks[i] === k ? " pick" : ""}${shown && k === q.a ? " ok" : ""}${shown && r.picks[i] === k && k !== q.a ? " bad" : ""}" data-k="${k}" aria-pressed="${r.picks[i] === k}"${shown ? " disabled" : ""}><span class="k num" aria-hidden="true">${k + 1}</span><span>${esc(t)}</span></button>`).join("")}</div>
            ${shown ? `<div class="cb-ex ${r.picks[i] === q.a ? "ok" : "bad"}"><b>${r.picks[i] === q.a ? "정답이에요" : `오답 · 정답은 ${q.a + 1}번`}</b><p>${esc(q.x || "")}</p></div>` : ""}
            <div class="cb-foot">
              <div class="cb-nav"><button type="button" class="c-btn press" data-mv="-1" ${i ? "" : "disabled"}>← 이전</button><button type="button" class="c-btn press cb-flag${fl ? " on" : ""}" id="cb-flag" aria-pressed="${fl}">${fl ? "★ 표시됨" : "☆ 표시"}</button><button type="button" class="c-btn press" data-mv="1" ${i < 99 ? "" : "disabled"}>다음 →</button></div>
              <p class="cb-keys"><kbd>1</kbd>–<kbd>4</kbd> 고르기 · <kbd>←</kbd><kbd>→</kbd> 이동 · <kbd>F</kbd> 표시 · <kbd>B</kbd> 번호판</p>
            </div>
          </div>
        </div>
        <div class="cb-scrim" data-sheet-close></div>
        <aside class="cb-side" aria-label="문항 번호판">
          <div class="cb-legend num"><span><i class="a"></i>답함 ${n}</span><span><i></i>안 답함 ${100 - n}</span><span><i class="f"></i>표시 ${nf}</span></div>
          ${[1, 2, 3].map((sj) => { const [a, b] = RANGE[sj]; return `<div class="cm-grp"><span class="k">${esc(SUBJ[sj].n)}</span><div class="cm-grid cb-grid">${r.ids.slice(a, b).map((_, j) => { const k = a + j; return `<button type="button" data-j="${k}" class="num${r.picks[k] != null ? " a" : ""}${r.flags[k] ? " f" : ""}${k === i ? " cur" : ""}" aria-label="${k + 1}번${r.picks[k] != null ? " 답함" : ""}${r.flags[k] ? " 표시" : ""}"${k === i ? ' aria-current="true"' : ""}>${k + 1}</button>`; }).join("")}</div></div>`; }).join("")}
        </aside></div>`;
      upd();
      setAi({ kind: "general", topic: `실전 CBT ${r.no}회 푸는 중 (실전 연습이라 문제 풀이는 끝나고 물어봐요)` });
    };
    const upd = () => {
      const t = host.querySelector("#cm-tm"), r = R(); if (!t || !r) return;
      if (!r.end) { const e = Math.floor((Date.now() - (r.t0 || Date.now())) / 1e3); t.textContent = `${pad2(Math.floor(e / 60))}:${pad2(e % 60)}`; return; }
      const ms = r.end - Date.now();
      if (ms <= 0) { toast("시간이 끝났어요. 자동 제출해요."); return finish(); }
      const m = Math.floor(ms / 60e3), s = Math.floor(ms / 1e3) % 60;
      t.textContent = `${pad2(m)}:${pad2(s)}`; t.classList.toggle("low", m < 10);
    };
    const choose = (k) => { const r = R(); if (r.mode === "now" && r.picks[r.cur] != null) return; r.picks[r.cur] = k; save(); if (r.mode !== "now" && r.cur < 99) r.cur++; draw(); };
    const move = (d) => { const r = R(); r.cur = Math.max(0, Math.min(99, r.cur + d)); save(); draw(); };
    const flag = () => { const r = R(); r.flags ||= {}; if (r.flags[r.cur]) delete r.flags[r.cur]; else r.flags[r.cur] = 1; save(); draw(); };
    // 번호판: 넓은 화면은 오른쪽 칸 숨김/보임(기억해요), 폰은 바텀시트 열기/닫기
    const pad = () => {
      if (matchMedia("(max-width: 899px)").matches) SHEET = !SHEET;
      else { HIDE = !HIDE; localStorage.setItem("cim-cbt-hide", HIDE ? "1" : "0"); }
      draw();
    };
    const submit = () => {
      const r = R(), left = 100 - Object.keys(r.picks).length, nf = Object.keys(r.flags || {}).length;
      const msg = left ? `안 푼 문항이 ${left}개 있어요${nf ? ` (표시 ${nf}개)` : ""}. 제출할까요?` : `100문항 다 풀었어요${nf ? ` (표시 ${nf}개)` : ""}. 제출할까요?`;
      if (!confirm(msg)) return;
      finish();
    };
    tick = setInterval(upd, 1000); // 시간 없는 회차는 걸린 시간만 보여 줘요
    host.onclick = (e) => {
      if (!R()) return;
      const o = e.target.closest(".c-opt"); if (o) return choose(+o.dataset.k);
      const mv = e.target.closest("[data-mv]"); if (mv) return move(+mv.dataset.mv);
      const j = e.target.closest("[data-j]"); if (j) { R().cur = +j.dataset.j; SHEET = false; save(); draw(); return; }
      if (e.target.closest("#cb-pad")) return pad();
      if (e.target.closest("[data-sheet-close]")) { SHEET = false; return draw(); }
      if (e.target.closest("#cb-flag")) return flag();
      if (e.target.closest("#cb-mode")) { const r = R(); r.mode = r.mode === "now" ? "end" : "now"; save(); return draw(); }
      if (e.target.closest("#cb-sub")) submit();
    };
    onKey = (e) => {
      if (typing(e) || !host.isConnected || !R()) return;
      const n = +e.key;
      if (n >= 1 && n <= 4) { e.preventDefault(); choose(n - 1); }
      else if (e.key === "ArrowRight") { e.preventDefault(); move(1); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); move(-1); }
      else if (e.metaKey || e.ctrlKey || e.altKey) return;
      else if (e.key === "f" || e.key === "F") { e.preventDefault(); flag(); }
      else if (e.key === "b" || e.key === "B") { e.preventDefault(); pad(); }
      else if (e.key === "Escape" && SHEET) { SHEET = false; draw(); }
    };
    document.addEventListener("keydown", onKey);
    draw();
  }

  // 채점 → S.cbt[회차] · 맞힘/틀림은 오답 SRS 로 (안 푼 문제도 내일 다시)
  function finish() {
    const S = st(), r = S.cbtRun; if (!r) return list();
    const by = { 1: 0, 2: 0, 3: 0 };
    r.ids.forEach((id, i) => { const q = QI[id]; if (!q) return; const p = r.picks[i], ok = p === q.a; if (ok) by[SUBJ_AT(i)]++; if (p != null) record(q, ok); else S.wrong[id] = { st: 0, due: addDays(today(), 1) }; });
    const total = by[1] + by[2] + by[3], pass = total >= 70 && [1, 2, 3].every((s) => by[s] >= SUBJ[s].q * 0.4);
    const res = { rid: r.rid, date: today(), at: Date.now(), by, total, pass, picks: r.picks };
    S.cbt[r.no] = res; S.cbtRun = null;
    S.mocks.push({ date: res.date, by, total, pass, rid: r.rid }); if (S.mocks.length > 20) S.mocks.shift();
    save(); stop();
    result(r.no, r.ids, res);
  }

  function result(no, ids, res, all = false) {
    stop();
    const items = ids.map((id, i) => ({ q: QI[id], i, p: res.picks[i] })).filter((x) => x.q);
    const wrong = items.filter((x) => x.p !== x.q.a), show = all ? items : wrong;
    if (location.hash !== `#/cim/exam/cbt/${no}`) history.replaceState(null, "", `#/cim/exam/cbt/${no}`);
    host.innerHTML = `<div class="c-exam cm-res cb-res">
      <div class="c-shead"><a class="c-ghost press" href="#/cim/exam/cbt">← CBT 목록</a><span class="num">${esc(res.date || "")}</span></div>
      <div class="c-done"><span class="k">실전 CBT ${no}회</span><span class="big num" id="cb-score">${res.total}<small> / 100</small></span><span class="c-verdict ${res.pass ? "ok" : "bad"}">${res.pass ? "합격이에요" : "불합격이에요"}</span></div>
      <div class="c-subj num">${[1, 2, 3].map((s) => { const ok = res.by[s] >= SUBJ[s].q * 0.4; return `<div class="${ok ? "" : "bad"}"><span class="k">${s}과목</span><span class="v">${res.by[s]}<small>/${SUBJ[s].q}</small></span><span class="s">${ok ? "통과" : `과락 · ${SUBJ[s].q * 0.4}개부터`}</span></div>`; }).join("")}</div>
      <p class="c-lead">틀리거나 안 푼 ${wrong.length}문항은 오답노트에 들어가서 내일부터 1 · 3 · 7일 뒤에 다시 나와요.</p>
      <div class="c-col2"><button type="button" class="c-btn press" id="cb-again">${no}회 다시 풀기</button><a class="c-btn lime press" href="#/cim/exam/due">오답 다시 풀기</a></div>
      <section class="c-grp"><div class="gh"><span>해설 다시 보기</span><span class="c-seg" role="group" aria-label="보기"><button type="button" class="press" data-all="0" aria-pressed="${!all}">틀린 것 ${wrong.length}</button><button type="button" class="press" data-all="1" aria-pressed="${all}">전체 100</button></span></div>
      ${show.map((x) => { const ok = x.p === x.q.a; return `<article class="cm-w cb-rv${ok ? " right" : ""}"><p class="c-qmeta num">${x.i + 1}번 · ${esc(chName(x.q.ch))} · ${x.p == null ? "안 풂" : ok ? "정답" : "오답"}</p><p class="c-qstem sm">${esc(x.q.q)}</p><div class="c-opts">${x.q.o.map((t, k) => `<div class="c-opt still ${k === x.q.a ? "right" : k === x.p ? "wrong" : ""}"><span class="k num" aria-hidden="true">${k + 1}</span><span>${esc(t)}</span></div>`).join("")}</div><div class="c-expl show"><div><div class="in"><b>정답 ${x.q.a + 1}번</b>${esc(x.q.x)}</div></div></div></article>`; }).join("")}</section></div>`;
    host.onclick = (e) => {
      const b = e.target.closest("[data-all]"); if (b) return result(no, ids, res, b.dataset.all === "1");
      if (e.target.closest("#cb-again")) { if (!confirm(`${no}회를 처음부터 다시 풀까요? 지금 점수는 새 점수로 바뀌어요.`)) return; open(no, true); }
    };
    top();
    setAi({ kind: "general", topic: `실전 CBT ${no}회 결과 ${res.total}점 (${res.pass ? "합격" : "불합격"}) · 과목별 ${[1, 2, 3].map((s) => `${s}과목 ${res.by[s]}/${SUBJ[s].q}`).join(", ")}` });
  }

  const n = +no;
  if (n) open(n); else list();
  return { stop };
}
