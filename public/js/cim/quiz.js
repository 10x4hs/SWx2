// CIM 문제 — 한 문제씩 풀기(교과서 카드 안 · 문제 탭 공용) · 오답 복습 1·3·7일 · 장별 · 섞어 풀기(교차 연습)
//   #/cim/quiz                    설정
//   #/cim/quiz/ch/<장>/<수>        장별 (수 = 10 · 20 · 999 전부)
//   #/cim/quiz/mix/<장,장,…>       섞어 풀기 30문제
//   #/cim/quiz/due · /wrong       오늘 복습 · 오답노트 전체
import { st, record, dueIds, wrongIds, seenIn } from "./store.js";
import { CH, ORDER, MARK, CALC, LAW, chName, chShort, chOf } from "./meta.js";
import { chapters, QI, QS_BY } from "./data.js";
import { esc, shuffle, pad2, loading, errorBox, ring } from "./ui.js";
import { toast } from "../util.js";

const typing = (e) => e.target.closest?.("input, textarea, select, [contenteditable]") || e.metaKey || e.ctrlKey || e.altKey;

// 한 문제씩: 고르면 바로 정답 · 해설, 기록은 store.record (오답노트에 들어가요)
// o.inline = 카드 안 (키보드는 그 상자 안에서만) · o.onEnd = 설정으로 · 돌려주는 함수 = 정리
export function runQuiz(box, qs, o = {}) {
  let i = 0, right = 0, answered = false;
  const draw = () => {
    answered = false;
    if (i >= qs.length) {
      const wrong = qs.length - right;
      box.innerHTML = `<div class="cq cq-end${o.inline ? " inline" : ""}"><div class="cq-res">${ring(right / qs.length, { size: 72, stroke: 6 })}<div><span class="cim-lab">결과</span><b class="cq-big cim-num">${right}<small>/${qs.length}</small></b></div></div>
        <p>${wrong ? `틀린 ${wrong}개는 오답노트에 들어갔어요. 내일 · 3일 뒤 · 7일 뒤에 다시 나와요.` : "모두 맞았어요."}</p>
        <div class="cim-row"><button type="button" class="cim-btn" data-again>다시 풀기</button>${o.onEnd ? `<button type="button" class="cim-btn ghost" data-back>설정으로</button>` : ""}</div></div>`;
      box.querySelector("[data-again]").onclick = () => { stop(); stopper = runQuiz(box, shuffle(qs), o); };
      const bk = box.querySelector("[data-back]"); if (bk) bk.onclick = o.onEnd;
      if (!o.inline) box.querySelector("[data-again]").focus({ preventScroll: true });
      return;
    }
    const q = qs[i];
    box.innerHTML = `<div class="cq${o.inline ? " inline" : ""}">
      <div class="cq-top"><span class="cim-num cq-cnt">${pad2(i + 1)}<small>/${pad2(qs.length)}</small></span><span class="cq-prog" aria-hidden="true"><i style="width:${(i / qs.length) * 100}%"></i></span><span class="cim-num cq-sc" title="맞힌 수 / 푼 수">${right}<small>/${i}</small></span></div>
      <p class="cq-meta">${esc(chName(q.ch))} · 핵심 ${q.pt.n}. ${esc(q.pt.t)}</p>
      <p class="cq-q">${esc(q.q)}</p>
      <div class="cq-opts" role="group" aria-label="보기">${q.o.map((t, k) => `<button type="button" class="cq-o" data-k="${k}"><span class="cq-k" aria-hidden="true">${MARK[k]}</span><span class="cq-ot">${esc(t)}</span></button>`).join("")}</div>
      <div class="cq-ex" aria-live="polite"></div>
      ${o.inline ? "" : `<p class="cq-hint" aria-hidden="true"><kbd>1</kbd>–<kbd>${q.o.length}</kbd> 고르기 · <kbd>Enter</kbd> 다음</p>`}</div>`;
  };
  const pick = (k) => {
    if (answered || i >= qs.length) return;
    answered = true;
    const q = qs[i], ok = k === q.a; if (ok) right++;
    record(q, ok);
    box.querySelectorAll(".cq-o").forEach((x) => { x.disabled = true; const kk = +x.dataset.k; if (kk === q.a) x.classList.add("ok"); else if (kk === k) x.classList.add("bad"); });
    box.querySelector(".cq-sc").innerHTML = `${right}<small>/${i + 1}</small>`;
    box.querySelector(".cq-ex").innerHTML = `<div class="cq-x ${ok ? "ok" : "bad"}"><b class="cq-v">${ok ? "맞았어요" : "틀렸어요 — 정답 " + MARK[q.a]}</b><p>${esc(q.x)}</p></div><div class="cq-nav"><button type="button" class="cim-btn" data-next>${i + 1 < qs.length ? "다음" : "결과 보기"} <span aria-hidden="true">→</span></button></div>`;
    box.querySelector("[data-next]").focus({ preventScroll: true });
  };
  const next = () => { if (!answered) return; i++; draw(); if (!o.inline) box.scrollIntoView({ block: "start", behavior: "instant" }); };
  const onClick = (e) => {
    const b = e.target.closest(".cq-o"); if (b && box.contains(b)) return pick(+b.dataset.k);
    if (e.target.closest("[data-next]")) next();
  };
  const onKey = (e) => {
    if (typing(e) || !box.isConnected) return;
    if (o.inline && !box.contains(document.activeElement)) return;
    const n = +e.key;
    if (n >= 1 && n <= 5 && box.querySelector(`.cq-o[data-k="${n - 1}"]`)) { e.preventDefault(); pick(n - 1); }
    else if (e.key === "Enter" && answered && !e.target.closest("button")) { e.preventDefault(); next(); }
  };
  box.addEventListener("click", onClick);
  document.addEventListener("keydown", onKey);
  let stopper = null;
  const stop = () => { box.removeEventListener("click", onClick); document.removeEventListener("keydown", onKey); };
  draw();
  return () => { stop(); stopper?.(); };
}

const pickN = (pool, n) => shuffle(pool).slice(0, n);
// 섞어 풀기: 장을 번갈아 가며 (같은 장이 연달아 나오지 않게)
export function interleave(chs, n) {
  const buckets = chs.map((id) => shuffle(QS_BY[id] || [])), out = [];
  while (out.length < n && buckets.some((b) => b.length)) for (const b of shuffle(buckets)) { if (b.length && out.length < n) out.push(b.pop()); }
  return out;
}

export function mountQuiz(host, r) {
  let stop = null;
  if (r.id) runMode(r); else setup();

  function setup() {
    const S = st(), due = dueIds().length, wn = wrongIds().length;
    const acc = (id) => { let a = 0, b = 0; const p = id + "-"; for (const [k, v] of Object.entries(S.ans)) if (k.startsWith(p)) { a += v[0]; b += v[1]; } return a + b ? a / (a + b) : null; };
    host.innerHTML = `
      <header class="cim-vh"><h1>문제 풀기</h1><p>먼저 떠올리고, 고른 뒤에 해설을 확인해요. 틀린 문제는 1일 → 3일 → 7일 뒤에 다시 나와요.</p></header>
      <div class="cqz-grid">
        <section class="cim-panel"><header class="cim-ph"><div><span class="cim-lab">오답 복습</span><h2>세 번 연속 맞히면 졸업</h2></div></header>
          <div class="cqz-big"><a class="cim-btn${due ? "" : " off"}" ${due ? 'href="#/cim/quiz/due"' : 'aria-disabled="true"'}>오늘 복습 <b class="cim-num">${due}</b>개</a><a class="cim-btn line${wn ? "" : " off"}" ${wn ? 'href="#/cim/quiz/wrong"' : 'aria-disabled="true"'}>오답노트 전체 <b class="cim-num">${wn}</b>개</a></div></section>
        <section class="cim-panel"><header class="cim-ph"><div><span class="cim-lab">장별로 풀기</span><h2>한 장을 집중해서</h2></div></header>
          <div class="cqz-ch"><label class="cim-field"><span>장</span><select id="cqz-ch">${ORDER.map((id) => `<option value="${id}">${chShort(id)} ${esc(CH[id].t)} (${seenIn(id)}/${CH[id].nq})</option>`).join("")}</select></label>
            <label class="cim-field narrow"><span>문제 수</span><select id="cqz-n"><option>10</option><option selected>20</option><option value="999">전부</option></select></label>
            <button type="button" class="cim-btn" data-start="ch">시작</button></div></section>
      </div>
      <section class="cim-panel"><header class="cim-ph"><div><span class="cim-lab">섞어 풀기 · 교차 연습</span><h2>어떤 공식을 쓸지 고르는 힘</h2></div></header>
        <p class="cqz-p">여러 장을 번갈아 풀면 '어떤 공식을 쓸지 고르는 힘'이 길러져요. 실전과 같아요.</p>
        <div class="cim-chips" id="cqz-mix">${ORDER.map((id) => `<label class="cim-chk chip"><input type="checkbox" value="${id}" ${CALC.includes(id) ? "checked" : ""}><span><b class="cim-num">${chShort(id)}</b> ${esc(CH[id].t.split(/[\s(]/)[0])}</span></label>`).join("")}</div>
        <div class="cim-row cqz-sel"><button type="button" class="cim-btn ghost sm" data-sel="calc">계산 파트</button><button type="button" class="cim-btn ghost sm" data-sel="law">법규 · 윤리 · 세제</button><button type="button" class="cim-btn ghost sm" data-sel="all">전체</button><span class="cim-sp"></span><button type="button" class="cim-btn" data-start="mix">30문제 시작</button></div></section>
      <section class="cim-panel"><header class="cim-ph"><div><span class="cim-lab">장별 현황</span><h2>푼 문제 · 정답률</h2></div></header>
        <div class="cim-tscroll"><table class="cim-tbl cqz-tbl"><thead><tr><th scope="col">장</th><th scope="col">푼 문제</th><th scope="col">정답률</th><th scope="col"><span class="vh">풀기</span></th></tr></thead><tbody>${ORDER.map((id) => { const n = seenIn(id), a = acc(id), p = a == null ? null : Math.round(a * 100); return `<tr><th scope="row"><span class="cim-num dim">${chShort(id)}</span> ${esc(CH[id].t)}</th><td class="cim-num"><span class="cqz-cov"><i style="width:${(n / CH[id].nq) * 100}%"></i></span>${n}/${CH[id].nq}</td><td class="cim-num${p != null && p < 40 ? " bad" : ""}">${p == null ? "—" : p + "%"}</td><td><a class="cim-go" href="#/cim/quiz/ch/${id}/20">20문제<span aria-hidden="true">→</span></a></td></tr>`; }).join("")}</tbody></table></div></section>`;
    host.onclick = (e) => {
      const s = e.target.closest("[data-start]");
      if (s?.dataset.start === "ch") location.hash = `#/cim/quiz/ch/${host.querySelector("#cqz-ch").value}/${host.querySelector("#cqz-n").value}`;
      if (s?.dataset.start === "mix") { const ids = [...host.querySelectorAll("#cqz-mix input:checked")].map((x) => x.value); if (!ids.length) return toast("장을 하나 이상 골라 주세요."); location.hash = `#/cim/quiz/mix/${ids.join(",")}`; }
      const sl = e.target.closest("[data-sel]");
      if (sl) { const set = { calc: CALC, law: LAW, all: ORDER }[sl.dataset.sel]; host.querySelectorAll("#cqz-mix input").forEach((x) => (x.checked = set.includes(x.value))); }
    };
  }

  async function runMode(r) {
    const mode = r.id, arg = r.sub || "";
    let ids = [], label = "";
    if (mode === "ch" && ORDER.includes(arg)) { ids = [arg]; label = chName(arg); }
    else if (mode === "mix") { ids = arg.split(",").filter((x) => ORDER.includes(x)); label = "섞어 풀기"; }
    else if (mode === "due") { ids = dueIds().map(chOf); label = "오늘의 오답 복습"; }
    else if (mode === "wrong") { ids = wrongIds().map(chOf); label = "오답노트 전체"; }
    host.innerHTML = `<div class="cqz-run"><div class="cim-crumb"><a href="#/cim/quiz"><span aria-hidden="true">←</span> 설정</a><b>${esc(label || "문제")}</b></div><div id="cqz-box">${loading("문제 불러오는 중")}</div></div>`;
    const box = host.querySelector("#cqz-box");
    try { await chapters(ids, (n, t) => { if (t > 1) box.innerHTML = loading(`문제 은행 불러오는 중 ${n}/${t}`); }); }
    catch (e) { box.innerHTML = errorBox(esc(e.message)); return; }
    if (!host.isConnected) return;
    let qs = [];
    if (mode === "ch") qs = pickN(QS_BY[arg] || [], +r.item || 20);
    else if (mode === "mix") qs = interleave(ids, 30);
    else if (mode === "due") qs = shuffle(dueIds().map((id) => QI[id]).filter(Boolean));
    else if (mode === "wrong") qs = shuffle(wrongIds().map((id) => QI[id]).filter(Boolean));
    if (!qs.length) { toast(mode === "due" ? "오늘 다시 볼 오답이 없어요." : "문제가 없어요."); location.replace("#/cim/quiz"); return; }
    stop = runQuiz(box, qs, { onEnd: () => { location.hash = "#/cim/quiz"; } });
  }
  return { stop: () => stop?.() };
}

