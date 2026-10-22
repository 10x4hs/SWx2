// CIM 오늘 공부 (#/cim/go) — 버튼 하나로 네 단계: 1 읽기 → 2 문제 → 3 오답 → 4 떠올리기 → 끝
//   · 읽기: 오늘 장의 카드(안 읽은 ★★★ 먼저 → ★★ → ★), 한 화면에 한 장, 넘기면 읽음
//   · 문제: 오늘 카드에 붙은 문제부터 20개 · 오답: 오늘 돌아온 틀린 문제(최대 15) · 떠올리기: 카드 제목 → 눌러서 한 줄 확인
//   · 진행은 S.today 에 저장 → 나갔다 와도(새로 고침 · 다른 기기) 같은 단계 · 같은 장에서 이어요
//   · 키보드: ← → 넘기기 · 1–4 고르기 · Enter 다음
import { st, save, today, record, dueIds } from "./store.js";
import { chOf } from "./meta.js";
import { chapters, QI, QS_BY, PI } from "./data.js";
import { planDay, todayChs, todayRun, STEPS, READ_CAP, Q_CAP, W_CAP } from "./plan.js";
import { cardHtml, mountFigs, summary, cardText, chLabel } from "./render.js";
import { mountQ, qKeys } from "./quiz.js";
import { setAi } from "./ai.js";
import { esc, shuffle, loading, errorBox, typing } from "./ui.js";

// 오늘 공부 새로 짜기 (장 내용은 이미 받은 상태)
function build(S, chs) {
  const all = chs.flatMap((id, ci) => Object.values(PI).filter((p) => p.key.startsWith(id + "-")).map((p) => ({ p, ci })));
  const rank = (x) => [S.read[x.p.key] ? 1 : 0, -(x.p.st || 0), x.ci, x.p.n];
  const cmp = (a, b) => { const A = rank(a), B = rank(b); for (let k = 0; k < A.length; k++) if (A[k] !== B[k]) return A[k] - B[k]; return 0; };
  const sorted = all.sort(cmp);
  let pick = sorted.filter((x) => !S.read[x.p.key]).slice(0, READ_CAP);
  if (pick.length < 4) pick = pick.concat(sorted.filter((x) => S.read[x.p.key] && x.p.st >= 3).slice(0, 6 - pick.length)); // 다 읽은 장이면 ★★★ 다시
  const cards = pick.map((x) => x.p.key);
  // 문제: 오늘 카드마다 안 푼 문제 하나씩 돌아가며 → 그 장의 안 푼 문제 → 나머지
  const pool = chs.flatMap((id) => QS_BY[id] || []), seen = (q) => !!S.ans[q.id], used = new Set(), qs = [];
  const per = cards.map((k) => shuffle(pool.filter((q) => q.pt.key === k && !seen(q))));
  while (qs.length < Q_CAP && per.some((a) => a.length)) for (const a of per) { const q = a.pop(); if (q && qs.length < Q_CAP) { qs.push(q.id); used.add(q.id); } }
  for (const q of shuffle(pool.filter((q) => !seen(q) && !used.has(q.id)))) { if (qs.length >= Q_CAP) break; qs.push(q.id); used.add(q.id); }
  for (const q of shuffle(pool.filter((q) => !used.has(q.id)))) { if (qs.length >= Q_CAP) break; qs.push(q.id); }
  return { d: today(), day: planDay(S), step: 0, i: 0, cards, qs, wq: null, p1: {}, p2: {}, rc: {} };
}
const dueSorted = (S) => dueIds().sort((a, b) => (S.wrong[a].due < S.wrong[b].due ? -1 : 1)).slice(0, W_CAP);
const rightOf = (ids, picks) => ids.reduce((n, id, i) => n + (QI[id] && picks[i] === QI[id].a ? 1 : 0), 0);

export function mountSession(host, r, env) {
  let C = null, T = null, alive = true, revealed = false;
  const S = st();
  const scrollTop = () => host.closest(".main")?.scrollTo({ top: 0 });

  async function start() {
    host.innerHTML = loading("오늘 공부 준비하는 중");
    try {
      T = todayRun(S);
      const chs = T ? [...new Set([...T.cards.map(chOf), ...T.qs.map(chOf), ...(T.wq || []).map(chOf)])] : todayChs(S);
      await chapters(chs, (n, t) => { if (t > 1 && alive) host.innerHTML = loading(`오늘 공부 준비하는 중 <span class="num">${n}/${t}</span>`); });
      if (!alive) return;
      if (!T) { T = S.today = build(S, chs); save(); }
      if (T.step === 2 && T.wq?.length && T.wq.some((id) => !QI[id])) await chapters(T.wq.map(chOf));
    } catch (e) { host.innerHTML = errorBox(esc(e.message)); return; }
    if (alive) draw();
  }
  const go = (step, i = 0) => { T.step = step; T.i = i; revealed = false; save(); draw(); scrollTop(); };
  async function enterWrong() {
    T.wq = dueSorted(S).filter((id) => !T.qs.includes(id) || T.p1[T.qs.indexOf(id)] == null);
    save();
    if (T.wq.length) { host.querySelector("#c-step").innerHTML = loading("오답 불러오는 중"); try { await chapters(T.wq.map(chOf)); } catch (e) { host.innerHTML = errorBox(esc(e.message)); return; } }
    if (!alive) return;
    T.wq = T.wq.filter((id) => QI[id]);
    go(T.wq.length ? 2 : 3);
  }

  const total = () => T.cards.length + T.qs.length + (T.wq ? T.wq.length : 0) + T.cards.length;
  const doneN = () => [0, T.cards.length, T.cards.length + T.qs.length, T.cards.length + T.qs.length + (T.wq?.length || 0), total()][T.step] + (T.step < 4 ? T.i : 0);
  const stepper = () => `<div class="c-stepper" aria-hidden="true">${STEPS.map((_, j) => { const n = [T.cards.length, T.qs.length, T.wq?.length ?? 1, T.cards.length][j] || 1; const k = j < T.step ? 1 : j === T.step ? Math.min(1, T.i / n) : 0; return `<i><b style="transform:scaleX(${k})"></b></i>`; }).join("")}</div>`;
  const head = (label) => `${stepper()}<div class="c-shead num"><span>${label}</span><span class="r">${T.step < 4 ? `<button type="button" class="c-ghost press" data-ai-open>AI에게 묻기</button><a class="c-ghost press" href="#/cim">그만하기</a>` : ""}</span></div>`;

  function draw() {
    if (!alive) return;
    C = null;
    env.prog(T.step >= 4 ? 0 : doneN() / Math.max(1, total()));
    const st0 = T.step;
    if (st0 === 0) {
      const p = PI[T.cards[T.i]];
      if (!p) return go(1);
      host.innerHTML = `<div class="c-session">${head(`1 읽기 · ${T.i + 1} / ${T.cards.length}`)}<div id="c-step">${cardHtml(p)}
        <div class="c-navrow"><button type="button" class="c-btn press" data-prev ${T.i ? "" : "disabled"} aria-label="이전 카드">←</button><button type="button" class="c-btn dark press" data-next>${T.i < T.cards.length - 1 ? "다음 카드" : "다 읽었어요 · 문제로"}</button></div></div></div>`;
      mountFigs(host);
      setAi({ kind: "card", chapter: chLabel(chOf(p.key)), title: p.t, body: cardText(p) });
    } else if (st0 === 1 || st0 === 2) {
      const ids = st0 === 1 ? T.qs : T.wq, picks = st0 === 1 ? T.p1 : T.p2, q = QI[ids[T.i]];
      if (!q) return st0 === 1 ? (T.i + 1 < ids.length ? go(1, T.i + 1) : enterWrong()) : go(T.i + 1 < ids.length ? 2 : 3, T.i + 1 < ids.length ? T.i + 1 : 0);
      host.innerHTML = `<div class="c-session">${head(`${st0 + 1} ${STEPS[st0]} · ${T.i + 1} / ${ids.length}`)}<div id="c-step"></div></div>`;
      const last = T.i + 1 >= ids.length;
      C = mountQ(host.querySelector("#c-step"), q, {
        picked: picks[T.i],
        onPick: (k, ok) => { picks[T.i] = k; record(q, ok); },
        onNext: () => { if (!last) go(st0, T.i + 1); else if (st0 === 1) enterWrong(); else go(3); },
        nextLabel: (ok) => (!last ? (ok ? "맞았어요 · 다음" : "다음 문제") : st0 === 1 ? "오답으로" : "떠올리기로"),
      });
    } else if (st0 === 3) {
      const p = PI[T.cards[T.i]];
      if (!p) return go(4);
      host.innerHTML = `<div class="c-session">${head(`4 떠올리기 · ${T.i + 1} / ${T.cards.length}`)}<div id="c-step" class="c-recall">
        <p class="c-qmeta">${esc(chLabel(chOf(p.key)))} · 핵심 ${p.n}</p><h2>${esc(p.t)}</h2>
        <p class="c-recall-hint">무슨 내용이었는지 먼저 떠올려 보세요.</p>
        <div class="c-reveal" ${revealed ? "" : "hidden"}><div class="c-box tip"><span class="bl">한 줄</span><p>${esc(summary(p))}</p></div></div>
        <div class="c-navrow c-col2">${revealed ? `<button type="button" class="c-btn press" data-rc="0">다시 볼게요</button><button type="button" class="c-btn lime press" data-rc="1">기억났어요</button>` : `<button type="button" class="c-btn dark press wide" data-reveal>눌러서 확인</button>`}</div></div></div>`;
      setAi({ kind: "card", chapter: chLabel(chOf(p.key)), title: p.t, body: cardText(p) });
    } else {
      const r1 = rightOf(T.qs, T.p1), r2 = T.wq ? rightOf(T.wq, T.p2) : 0, nw = T.wq?.length || 0, rc = Object.values(T.rc).filter((v) => v === 1).length;
      (S.done[T.day] ||= {}).go = true; save();
      setAi({ kind: "general", topic: `오늘 공부 끝 · 문제 ${r1}/${T.qs.length} · 오답 ${r2}/${nw}` });
      host.innerHTML = `<div class="c-session">${head("")}<div class="c-done"><span class="k">오늘 공부 끝</span><span class="big num">${r1}<small> / ${T.qs.length}</small></span>
        <p>카드 ${T.cards.length}장을 읽고 ${T.qs.length}문제를 풀었어요.${nw ? `<br>오답 ${nw}개 중 ${r2}개를 맞혔어요.` : ""}<br>떠올리기 ${rc} / ${T.cards.length}</p>
        <p class="c-sub2">틀린 문제는 1 · 3 · 7일 뒤에 알아서 다시 나와요.</p>
        <a class="c-btn lime press wide" href="#/cim">오늘 화면으로</a><button type="button" class="c-ghost press" data-redo>새 카드로 한 번 더</button></div></div>`;
    }
  }

  const next = () => {
    if (T.step === 0) { S.read[T.cards[T.i]] = 1; if (T.i < T.cards.length - 1) go(0, T.i + 1); else go(1); }
    else if (T.step === 3) { if (!revealed) { revealed = true; draw(); } }
  };
  const prev = () => { if (T.step === 0 && T.i > 0) go(0, T.i - 1); };
  const recall = (v) => { T.rc[T.i] = v; if (!v) delete S.read[T.cards[T.i]]; if (T.i < T.cards.length - 1) go(3, T.i + 1); else go(4); };
  host.addEventListener("click", (e) => {
    const t = e.target;
    if (t.closest("[data-next]")) return next();
    if (t.closest("[data-prev]")) return prev();
    if (t.closest("[data-reveal]")) return next();
    const rc = t.closest("[data-rc]"); if (rc) return recall(+rc.dataset.rc);
    if (t.closest("[data-redo]")) { S.today = null; save(); start(); }
  });
  const onKey = (e) => {
    if (typing(e) || !T || C) return;
    if (e.key === "ArrowRight") { e.preventDefault(); if (T.step === 3 && revealed) recall(1); else next(); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); if (T.step === 3 && revealed) recall(0); else prev(); }
  };
  document.addEventListener("keydown", onKey);
  const offQ = qKeys(() => C);
  start();
  return { redraw() { if (!T) return; T = todayRun(S) || T; draw(); }, stop() { alive = false; offQ(); document.removeEventListener("keydown", onKey); env.prog(0); } };
}
