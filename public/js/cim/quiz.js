// CIM 문제 — 한 화면에 한 문제. 오늘 공부(2 문제 · 3 오답)와 시험 탭(오답 · 장별 · 섞어서)이 같은 모양을 써요.
//   고르면 바로: 맞으면 라임, 틀리면 빨강으로 살짝 흔들리고 정답이 라임 → 해설이 펼쳐져요 → '다음'
//   기록은 store.record (정답률 · 오답 1 · 3 · 7일)
import { record } from "./store.js";
import { QS_BY } from "./data.js";
import { chLabel } from "./render.js";
import { setAi } from "./ai.js";
import { esc, shuffle, typing } from "./ui.js";

// 문제 한 개 — o.top(머리 HTML) · o.picked(이미 고른 답 → 고른 상태로) · o.onPick(k, ok) · o.onNext() · o.nextLabel(ok)
//   돌려주는 값: { pick(k), next(), done }
export function mountQ(box, q, o = {}) {
  box.innerHTML = `${o.top || ""}
    <p class="c-qmeta">${esc(chLabel(q.ch))} · ${esc(q.pt.t)}</p>
    <p class="c-qstem">${esc(q.q)}</p>
    <div class="c-opts" role="group" aria-label="보기">${q.o.map((t, k) => `<button type="button" class="c-opt" data-k="${k}"><span class="k num" aria-hidden="true">${k + 1}</span><span>${esc(t)}</span></button>`).join("")}</div>
    <div class="c-expl" aria-live="polite"><div><div class="in"></div></div></div>
    <div class="c-qnav"></div>`;
  const ctx = (picked) => setAi({ kind: "quiz", key: q.pt?.key, chapter: `${chLabel(q.ch)} · ${q.pt.t}`, question: q.q, options: q.o, answer: q.a, picked, explain: picked == null ? "" : q.x });
  const C = { done: false };
  const show = (k, anim) => {
    C.done = true;
    const ok = k === q.a;
    box.querySelectorAll(".c-opt").forEach((x) => { x.disabled = true; const kk = +x.dataset.k; if (kk === q.a) x.classList.add("right"); else if (kk === k) x.classList.add("wrong"); if (!anim) x.classList.add("still"); });
    box.querySelector(".c-expl .in").innerHTML = `<b>${ok ? "맞았어요" : `틀렸어요 · 정답 ${q.a + 1}번`}</b>${esc(q.x)}`;
    const ex = box.querySelector(".c-expl");
    if (anim) requestAnimationFrame(() => ex.classList.add("show")); else ex.classList.add("show");
    box.querySelector(".c-qnav").innerHTML = `<button type="button" class="c-btn ${ok ? "lime" : "dark"} press wide" data-qnext>${esc(o.nextLabel ? o.nextLabel(ok) : "다음 문제")}</button>`;
    if (anim) box.querySelector("[data-qnext]").focus({ preventScroll: true });
    ctx(k);
  };
  C.pick = (k) => { if (C.done || !q.o[k]) return; show(k, true); o.onPick?.(k, k === q.a); };
  C.next = () => { if (C.done) o.onNext?.(); };
  box.onclick = (e) => {
    const b = e.target.closest(".c-opt"); if (b && box.contains(b)) return C.pick(+b.dataset.k);
    if (e.target.closest("[data-qnext]")) C.next();
  };
  if (o.picked != null) show(o.picked, false); else ctx(null);
  return C;
}

// 키보드: 1–4 고르기 · Enter / → 다음
export function qKeys(get) {
  const on = (e) => {
    const C = get(); if (!C || typing(e)) return;
    const n = +e.key;
    if (n >= 1 && n <= 5) { e.preventDefault(); C.pick(n - 1); }
    else if ((e.key === "Enter" && !e.target.closest("button, a")) || e.key === "ArrowRight") { if (C.done) { e.preventDefault(); C.next(); } }
  };
  document.addEventListener("keydown", on);
  return () => document.removeEventListener("keydown", on);
}

// 시험 탭의 문제 풀기 — 기록은 남지만 진행 위치는 이 화면 동안만 (o.title · o.back)
export function runQuiz(box, qs, o = {}) {
  let i = 0, right = 0, C = null;
  const top = () => `<div class="c-shead num"><a class="c-ghost press" href="${o.back || "#/cim/exam"}">← 시험</a><span>${esc(o.title || "문제")} · ${i + 1} / ${qs.length}</span><button type="button" class="c-ghost press" data-ai-open>AI에게 묻기</button></div><div class="c-bar" aria-hidden="true"><i style="transform:scaleX(${i / qs.length})"></i></div>`;
  const draw = () => {
    if (i >= qs.length) {
      C = null;
      const wrong = qs.length - right;
      setAi({ kind: "general", topic: `시험 탭 · ${o.title || "문제"} 결과 ${right}/${qs.length}` });
      box.innerHTML = `<div class="c-done"><span class="k">${esc(o.title || "문제")} 끝</span><span class="big num">${right}<small> / ${qs.length}</small></span>
        <p>${wrong ? `틀린 ${wrong}문제는 1 · 3 · 7일 뒤에 다시 나와요.` : "모두 맞았어요. 이 내용은 단단해요."}</p>
        <div class="c-col2"><button type="button" class="c-btn press" data-again>다시 풀기</button><a class="c-btn lime press" href="${o.back || "#/cim/exam"}">시험으로</a></div></div>`;
      box.querySelector("[data-again]").onclick = () => { qs = shuffle(qs); i = 0; right = 0; draw(); };
      return;
    }
    C = mountQ(box, qs[i], { top: top(), onPick: (k, ok) => { if (ok) right++; record(qs[i], ok); }, onNext: () => { i++; draw(); box.closest(".main")?.scrollTo({ top: 0 }); }, nextLabel: (ok) => (i + 1 < qs.length ? (ok ? "맞았어요 · 다음" : "다음 문제") : "결과 보기") });
  };
  const offKeys = qKeys(() => C);
  draw();
  return () => offKeys();
}

// 섞어 풀기: 장을 번갈아 가며 (같은 장이 연달아 나오지 않게)
export function interleave(chs, n) {
  const buckets = chs.map((id) => shuffle(QS_BY[id] || [])), out = [];
  while (out.length < n && buckets.some((b) => b.length)) for (const b of shuffle(buckets)) { if (b.length && out.length < n) out.push(b.pop()); }
  return out;
}
