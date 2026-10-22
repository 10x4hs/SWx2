// CIM 오늘 (#/cim) — 할 일은 버튼 하나. D-day · 오늘 할 공부 · 4단계 진행 · '오늘 공부 시작' · 과목 3개 · 한 줄 안내
// 계획 · 기록 (#/cim/log) — 14일 계획 · 공부한 날(12주) · 모의고사 기록 (오늘 화면에서 뺀 것들)
import { st, save, today, addDays, diff, dueIds } from "./store.js";
import { CH, SUBJ } from "./meta.js";
import { PLAN, STEPS, READ_CAP, Q_CAP, planDay, dateKo, todayChs, todayRun, subjPct } from "./plan.js";
import { setAi } from "./ai.js";
import { esc, verdict, pad2 } from "./ui.js";

export function mountToday(host, r, env) {
  const S = st();
  let editDate = false;

  function draw() {
    const td = planDay(S), p = PLAN[td - 1], chs = todayChs(S), run = todayRun(S), due = dueIds().length;
    const left = S.exam ? diff(today(), S.exam) : null;
    const step = run ? run.step : -1, done = step >= 4;
    const label = done ? "오늘 공부 끝 ✓" : run ? "이어서 하기" : "오늘 공부 시작";
    const side = done ? "결과 보기 →" : run ? `${STEPS[step]} 차례 →` : `약 ${Math.round((READ_CAP * 2 + Q_CAP * 1.2 + 6) / 5) * 5}분 →`;
    // "2과목 6장 · 4장 · 3과목 6장" — 같은 과목은 한 번만
    const chLine = chs.map((id, i) => (i && CH[chs[i - 1]].s === CH[id].s ? "" : `${CH[id].s}과목 `) + `${CH[id].c}장`).join(" · ");
    const hint = p.mock ? "오늘은 시험 탭에서 모의고사도 한 번 풀어요." : due ? `오늘 돌아온 오답 ${due}개는 3단계에서 나와요.` : "틀린 문제는 1 · 3 · 7일 뒤에 알아서 다시 나와요.";
    const big = left == null ? "" : left > 0 ? "D-" + left : left === 0 ? "D-DAY" : "끝";
    const dateRow = `<label class="c-pick"><span>${S.exam ? "시험일 바꾸기" : "시험일 정하기"}</span><input type="date" id="c-exam" value="${esc(S.exam)}" min="${today()}"></label>`;
    host.innerHTML = `<div class="c-today">
      <div class="c-dday">${S.exam && !editDate
        ? `<span class="k">시험까지</span><span class="v num">${big}</span><span class="d">${dateKo(S.exam)} · 14일 계획 중 ${td}일째 <button type="button" class="c-ghost press" data-edit>바꾸기</button></span>`
        : `<span class="k">${S.exam ? "시험일 바꾸기" : "먼저, 시험이 언제예요?"}</span>${dateRow}<span class="d">날짜를 고르면 14일 계획이 그 날에 맞춰 짜여요.${S.exam ? ` <button type="button" class="c-ghost press" data-edit>그대로 두기</button>` : ""}</span>`}</div>
      <div class="c-plan">
        <span class="t">오늘 할 공부 · ${td}일째</span>
        <h2>${esc(p.t)}<br><span class="dim">${esc(chLine)} · 카드 ${run ? run.cards.length : READ_CAP}장 · 문제 ${run ? run.qs.length : Q_CAP}개</span></h2>
        <div class="c-steps" role="list" aria-label="오늘 진행">${STEPS.map((t, j) => `<div role="listitem" class="${j < step || done ? "done" : j === Math.max(0, step) && !done ? "now" : ""}"><i></i>${t}</div>`).join("")}</div>
      </div>
      <a class="c-go press" href="#/cim/go" id="c-start">${label} <span>${side}</span></a>
      <div class="c-subj num">${[1, 2, 3].map((s) => { const [v, t, cls] = verdict(subjPct(s)); return `<div class="${cls}" title="${esc(SUBJ[s].n)}"><span class="k">${s}과목</span><span class="v">${v}</span><span class="s">${t}</span></div>`; }).join("")}</div>
      <p class="c-hint">${esc(hint)}</p>
      <p class="c-hint"><a class="c-link" href="#/cim/log">계획 · 기록 보기</a></p>
    </div>`;
    const inp = host.querySelector("#c-exam");
    if (inp) inp.onchange = () => { if (!inp.value) return; S.exam = inp.value; editDate = false; save(); draw(); env.top(); };
    setAi({ kind: "general", topic: `오늘 계획 ${td}일째: ${p.t} (${chLine}) · 진행 ${run ? (done ? "끝" : STEPS[step] + " 단계") : "시작 전"} · 과목 정답률 ${[1, 2, 3].map((s) => `${s}과목 ${verdict(subjPct(s))[0]}`).join(", ")} · 오늘 돌아온 오답 ${due}개${left != null ? ` · 시험까지 ${left}일` : ""}` });
  }
  host.addEventListener("click", (e) => { if (e.target.closest("[data-edit]")) { editDate = !editDate; draw(); if (editDate) host.querySelector("#c-exam")?.focus(); } });
  draw();
  return { redraw: draw };
}

// 계획 · 기록 — 14일 줄 · 12주 잔디 · 모의고사 표
export function mountLog(host) {
  const S = st(), td = planDay(S);
  const t = today(), dow = (new Date(t + "T00:00:00Z").getUTCDay() + 6) % 7, start = addDays(t, -(11 * 7 + dow));
  let cells = "", total = 0, active = 0;
  for (let i = 0; i < 84; i++) {
    const d = addDays(start, i), n = S.days[d] || 0, fut = d > t;
    if (!fut && n) { total += n; active++; }
    cells += `<i class="${fut ? "f" : n === 0 ? "" : n < 10 ? "l1" : n < 30 ? "l2" : n < 60 ? "l3" : "l4"}${d === t ? " now" : ""}" title="${d} · ${n}문제"></i>`;
  }
  const ms = S.mocks.slice().reverse();
  host.innerHTML = `<div class="c-list">
    <div class="c-shead"><a class="c-ghost press" href="#/cim">← 오늘</a><span></span></div>
    <h1>계획 · 기록</h1>
    <section class="c-grp"><div class="gh"><span>14일 계획</span><span>계산 → 법규 → 실전</span></div>
      ${PLAN.map((x, i) => { const d = i + 1, ok = Object.values(S.done[d] || {}).some(Boolean); return `<div class="c-row static${d === td ? " now" : ""}"><span class="n num">${pad2(d)}</span><b>${esc(x.t)}</b><span class="p">${ok ? "✓ 했어요" : esc(x.ph)}</span></div>`; }).join("")}</section>
    <section class="c-grp"><div class="gh"><span>공부한 날 · 최근 12주</span><span class="num">${active}일 · ${total.toLocaleString("ko-KR")}문제</span></div>
      <div class="c-heat" role="img" aria-label="최근 12주 동안 ${active}일 공부, ${total}문제"><div class="c-grid7">${cells}</div></div></section>
    <section class="c-grp"><div class="gh"><span>모의고사 기록</span><span class="num">${ms.length}회</span></div>
      ${ms.length ? ms.map((m) => `<div class="c-row static"><span class="n num">${esc(m.date.slice(5))}</span><b class="num">${m.total}점 <span class="${m.pass ? "ok" : "bad"}">${m.pass ? "합격" : "불합격"}</span></b><span class="p num">${[1, 2, 3].map((s) => `<span class="${m.by[s] < SUBJ[s].q * 0.4 ? "bad" : ""}">${m.by[s]}/${SUBJ[s].q}</span>`).join(" · ")}</span></div>`).join("") : `<p class="c-empty">아직 없어요. 12 · 13일째에 시험 탭에서 풀어요.</p>`}</section>
  </div>`;
  setAi({ kind: "general", topic: `계획 · 기록 화면 · 14일 계획 중 ${td}일째` });
  return {};
}
