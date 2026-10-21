// CIM 문제 — 한 문제씩 풀기(교과서 카드 안 · 문제 탭 공용) · 오답 복습 1·3·7일 · 장별 · 섞어 풀기(교차 연습)
//   #/cim/quiz                    설정
//   #/cim/quiz/ch/<장>/<수>        장별 (수 = 10 · 20 · 999 전부)
//   #/cim/quiz/mix/<장,장,…>       섞어 풀기 30문제
//   #/cim/quiz/due · /wrong       오늘 복습 · 오답노트 전체
import { st, record, dueIds, wrongIds, seenIn } from "./store.js";
import { CH, ORDER, CALC, LAW, chName, chShort, chOf } from "./meta.js";
import { chapters, QI, QS_BY } from "./data.js";
import { esc, shuffle, loading, errorBox, chev } from "./ui.js";
import { toast } from "../util.js";

const typing = (e) => e.target.closest?.("input, textarea, select, [contenteditable]") || e.metaKey || e.ctrlKey || e.altKey;

// 한 문제씩: 고르면 바로 정답 · 해설(펼쳐져요), 기록은 store.record (오답노트에 들어가요)
// o.inline = 카드 안 (키보드는 그 상자 안에서만) · o.onEnd = 설정으로 · 돌려주는 함수 = 정리
// 진행: 30문제까지는 점(맞음 초록 · 틀림 빨강 · 지금 파랑), 그보다 많으면 막대
export function runQuiz(box, qs, o = {}) {
  let i = 0, right = 0, answered = false;
  const res = [];
  const prog = () => qs.length <= 30
    ? `<span class="cq-dots" aria-hidden="true">${qs.map((_, j) => `<i class="${res[j] === true ? "ok" : res[j] === false ? "no" : j === i ? "cur" : ""}"></i>`).join("")}</span>`
    : `<span class="cq-pbar" aria-hidden="true"><i style="width:${(i / qs.length) * 100}%"></i></span>`;
  const draw = () => {
    answered = false;
    if (i >= qs.length) {
      const wrong = qs.length - right;
      box.innerHTML = `<div class="cq cq-end${o.inline ? " inline" : ""}"><div class="cq-res"><span class="cim-lab">결과</span><b class="cq-big cim-num">${right}<small>/ ${qs.length}</small></b><span class="badge ${wrong ? (right / qs.length >= 0.7 ? "b" : "r") : "g"}">${wrong ? `${Math.round((right / qs.length) * 100)}% 맞혔어요` : "모두 맞았어요"}</span></div>
        <p>${wrong ? `틀린 ${wrong}개는 오답노트에 들어갔어요. 내일 · 3일 뒤 · 7일 뒤에 다시 나와요.` : "잘했어요. 이 내용은 단단해요."}</p>
        <div class="cim-row"><button type="button" class="cim-btn press" data-again>다시 풀기</button>${o.onEnd ? `<button type="button" class="cim-btn line press" data-back>설정으로</button>` : ""}</div></div>`;
      box.querySelector("[data-again]").onclick = () => { stop(); stopper = runQuiz(box, shuffle(qs), o); };
      const bk = box.querySelector("[data-back]"); if (bk) bk.onclick = o.onEnd;
      if (!o.inline) box.querySelector("[data-again]").focus({ preventScroll: true });
      return;
    }
    const q = qs[i];
    box.innerHTML = `<div class="cq${o.inline ? " inline" : ""}">
      <div class="cq-head"><span class="cq-cnt cim-num">문제 <b>${i + 1}</b> / ${qs.length}</span>${prog()}<span class="cim-num cq-sc vh">맞힌 수 ${right} / 푼 수 ${i}</span></div>
      ${o.inline ? "" : `<p class="cq-meta">${esc(chName(q.ch))} · 핵심 ${q.pt.n}. ${esc(q.pt.t)}</p>`}
      <p class="cq-q">${esc(q.q)}</p>
      <div class="cq-opts" role="group" aria-label="보기">${q.o.map((t, k) => `<button type="button" class="cq-o" data-k="${k}"><span class="cq-k" aria-hidden="true">${k + 1}</span><span class="cq-ot">${esc(t)}</span></button>`).join("")}</div>
      <div class="cq-ex" aria-live="polite"><div></div></div>
      <div class="cq-nav"></div>
      ${o.inline ? "" : `<p class="cq-hint" aria-hidden="true"><kbd>1</kbd>–<kbd>${q.o.length}</kbd> 고르기 · <kbd>Enter</kbd> 다음</p>`}</div>`;
  };
  const pick = (k) => {
    if (answered || i >= qs.length) return;
    answered = true;
    const q = qs[i], ok = k === q.a; if (ok) right++;
    res[i] = ok;
    record(q, ok);
    box.querySelectorAll(".cq-o").forEach((x) => { x.disabled = true; const kk = +x.dataset.k; if (kk === q.a) x.classList.add("ok"); else if (kk === k) x.classList.add("bad"); });
    const dot = box.querySelectorAll(".cq-dots i")[i]; if (dot) dot.className = ok ? "ok" : "no";
    box.querySelector(".cq-sc").textContent = `맞힌 수 ${right} / 푼 수 ${i + 1}`;
    const ex = box.querySelector(".cq-ex");
    ex.firstElementChild.innerHTML = `<div class="cq-x ${ok ? "ok" : "bad"}"><b class="cq-v">${ok ? "맞았어요" : `틀렸어요 · 정답 ${q.a + 1}번`}</b><p>${esc(q.x)}</p></div>`;
    requestAnimationFrame(() => ex.classList.add("show"));
    box.querySelector(".cq-nav").innerHTML = `<button type="button" class="cim-btn press${o.inline ? " sm" : " lg"}" data-next>${i + 1 < qs.length ? "다음 문제" : "결과 보기"}</button>`;
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
    let nPick = "20";
    host.innerHTML = `
      <header class="cim-vh"><span class="cim-lab">문제</span><h1>먼저 떠올리고, 고른 뒤에 확인해요</h1><p>틀린 문제는 1일 → 3일 → 7일 뒤에 다시 나와요. 세 번 연속 맞히면 오답노트에서 졸업해요.</p></header>
      <div class="cqz-grid">
        <section class="cim-panel"><header class="cim-ph"><div><span class="cim-lab">오답 복습</span><h2>틀린 문제부터</h2></div></header>
          <div class="cqz-big"><a class="cim-btn lg press${due ? "" : " off"}" ${due ? 'href="#/cim/quiz/due"' : 'aria-disabled="true"'}><span>오늘 복습</span><b class="cim-num">${due}개</b></a><a class="cim-btn lg line press${wn ? "" : " off"}" ${wn ? 'href="#/cim/quiz/wrong"' : 'aria-disabled="true"'}><span>오답노트 전체</span><b class="cim-num">${wn}개</b></a></div></section>
        <section class="cim-panel"><header class="cim-ph"><div><span class="cim-lab">장별로 풀기</span><h2>한 장을 집중해서</h2></div></header>
          <div class="cqz-ch"><label class="cim-field"><span>장</span><select id="cqz-ch">${ORDER.map((id) => `<option value="${id}">${chShort(id)} ${esc(CH[id].t)} (${seenIn(id)}/${CH[id].nq})</option>`).join("")}</select></label>
            <div class="cim-row"><div class="cim-segc" role="group" aria-label="문제 수" id="cqz-n">${[["10", "10개"], ["20", "20개"], ["999", "전부"]].map(([v, t]) => `<button type="button" data-n="${v}" aria-pressed="${v === nPick}">${t}</button>`).join("")}</div>
            <button type="button" class="cim-btn press" data-start="ch">시작</button></div></div></section>
      </div>
      <section class="cim-panel"><header class="cim-ph"><div><span class="cim-lab">섞어 풀기 · 교차 연습</span><h2>어떤 공식을 쓸지 고르는 힘</h2></div></header>
        <p class="cqz-p">여러 장을 번갈아 풀면 실전처럼 '이 문제엔 어떤 공식?'을 고르는 연습이 돼요.</p>
        <div class="chips" id="cqz-mix">${ORDER.map((id) => `<label class="cim-pill"><input type="checkbox" value="${id}" ${CALC.includes(id) ? "checked" : ""}><b>${chShort(id)}</b> ${esc(CH[id].t.split(/[\s(]/)[0])}</label>`).join("")}</div>
        <div class="cim-row cqz-sel"><button type="button" class="cim-btn ghost sm" data-sel="calc">계산 파트</button><button type="button" class="cim-btn ghost sm" data-sel="law">법규 · 윤리 · 세제</button><button type="button" class="cim-btn ghost sm" data-sel="all">전체</button><span class="cim-sp"></span><button type="button" class="cim-btn press" data-start="mix">30문제 시작</button></div></section>
      <section class="cim-panel"><header class="cim-ph"><div><span class="cim-lab">장별 현황</span><h2>푼 문제 · 정답률</h2></div></header>
        <ul class="cqz-tbl">${ORDER.map((id) => { const n = seenIn(id), a = acc(id), p = a == null ? null : Math.round(a * 100), low = p != null && p < 40; return `<li><a class="row-i press" href="#/cim/quiz/ch/${id}/20" aria-label="${esc(chName(id))} 20문제 풀기"><span class="ic ${p == null ? "n" : low ? "r" : p >= 70 ? "g" : "b"}">${chShort(id)}</span><span class="tx"><b>${esc(CH[id].t)}</b><span class="cim-num">${n} / ${CH[id].nq} 풀었어요</span></span><span class="prog-mini${low ? " low" : ""}" aria-hidden="true"><i style="width:${(n / CH[id].nq) * 100}%"></i></span><span class="end cim-num${low ? " bad" : ""}">${p == null ? "—" : p + "%"}</span>${chev}</a></li>`; }).join("")}</ul></section>`;
    host.onclick = (e) => {
      const nb = e.target.closest("[data-n]"); if (nb) { nPick = nb.dataset.n; host.querySelectorAll("#cqz-n [data-n]").forEach((b) => b.setAttribute("aria-pressed", String(b === nb))); return; }
      const s = e.target.closest("[data-start]");
      if (s?.dataset.start === "ch") location.hash = `#/cim/quiz/ch/${host.querySelector("#cqz-ch").value}/${nPick}`;
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
    host.innerHTML = `<div class="cqz-run"><div class="cim-crumb"><a class="cim-back press" href="#/cim/quiz"><span aria-hidden="true">←</span> 설정</a><b>${esc(label || "문제")}</b></div><div id="cqz-box">${loading("문제 불러오는 중")}</div></div>`;
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

