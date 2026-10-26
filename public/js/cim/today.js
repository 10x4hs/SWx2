// CIM 오늘 (#/cim) — 할 일은 버튼 하나. D-day · 오늘 할 공부 · 4단계 진행 · '오늘 공부 시작' · 과목 3개 · 한 줄 안내
// 계획 · 기록 (#/cim/log) — 교재 진도(장마다) · 공부한 날(12주) · 모의고사 기록 (오늘 화면에서 뺀 것들)
//   오늘 할 공부 = 교재 순서로 이어 읽기 (plan.js todayPlan) — "교재 N쪽부터" 를 보여 줘요 (쪽은 그 장 JSON 을 받은 뒤 채워요)
import { st, save, today, addDays, diff, dueIds } from "./store.js";
import { CH, CHS, SUBJ } from "./meta.js";
import { PI, chapter } from "./data.js";
import { STEPS, Q_CAP, BOOK, dateKo, todayPlan, todayRun, subjPct, chLine as chLineOf, bookDone, readIn, nextKey } from "./plan.js";
import { setAi } from "./ai.js";
import { esc, verdict, pad2 } from "./ui.js";

export function mountToday(host, r, env) {
  const S = st();
  let editDate = false;

  function draw() {
    const plan = todayPlan(S), run = todayRun(S), due = dueIds().length, chs = run ? [...new Set(run.cards.map((k) => k.slice(0, k.indexOf("-"))))] : plan.chs;
    const left = S.exam ? diff(today(), S.exam) : null;
    const step = run ? run.step : -1, done = step >= 4, review = run ? run.mode === "review" : plan.mode === "review";
    const nCards = run ? run.cards.length : plan.n, nQ = run ? run.qs.length : Math.min(Q_CAP, nCards * 2);
    const label = done ? "오늘 공부 끝 ✓" : run ? "이어서 하기" : "오늘 공부 시작";
    const side = done ? "결과 보기 →" : run ? `${STEPS[step]} 차례 →` : `약 ${Math.max(10, Math.round((nCards * 2 + nQ * 1.2 + 6) / 5) * 5)}분 →`;
    const chLine = chLineOf(chs);
    // 오늘 첫 카드의 교재 쪽 — 그 장을 받았으면 바로, 아니면 받아서 다시 그려요
    const first = run ? run.cards[0] : plan.keys?.[0], fp = first && PI[first];
    if (first && !fp) chapter(first.slice(0, first.indexOf("-"))).then(() => host.isConnected && draw()).catch(() => {});
    const lastK = run ? run.cards[run.cards.length - 1] : plan.keys?.[plan.keys.length - 1], lp = lastK && PI[lastK];
    const pages = fp?.pg ? `교재 ${fp.pg}쪽${lp?.pg && lp.pg !== fp.pg ? `–${lp.pg}쪽` : ""}` : "";
    const title = review ? "약한 장 다시 보기" : fp ? `${CH[first.slice(0, first.indexOf("-"))].t} · ${fp.t}부터` : "교재 이어 읽기";
    const pct = Math.round((bookDone(S) / BOOK.length) * 100);
    const hint = review ? "시험 전 마지막 며칠이에요. 시험 탭에서 모의고사도 한 번 풀어요." : due ? `오늘 돌아온 오답 ${due}개는 3단계에서 나와요.` : "교재 순서대로 읽고, 방금 읽은 카드의 문제를 풀어요.";
    const big = left == null ? "" : left > 0 ? "D-" + left : left === 0 ? "D-DAY" : "끝";
    const pace = left == null ? `하루 ${nCards}장씩` : plan.mode === "read" ? `남은 ${plan.unread}장 · 하루 ${plan.n}장이면 시험 3일 전에 다 읽어요` : "교재 진도 끝 · 복습 차례";
    const dateRow = `<label class="c-pick"><span>${S.exam ? "시험일 바꾸기" : "시험일 정하기"}</span><input type="date" id="c-exam" value="${esc(S.exam)}" min="${today()}"></label>`;
    host.innerHTML = `<div class="c-today">
      <div class="c-dday">${S.exam && !editDate
        ? `<span class="k">시험까지</span><span class="v num">${big}</span><span class="d">${dateKo(S.exam)} · 교재 ${pct}% 읽음 <button type="button" class="c-ghost press" data-edit>바꾸기</button></span>`
        : `<span class="k">${S.exam ? "시험일 바꾸기" : "먼저, 시험이 언제예요?"}</span>${dateRow}<span class="d">날짜를 고르면 하루 분량이 그 날에 맞춰져요.${S.exam ? ` <button type="button" class="c-ghost press" data-edit>그대로 두기</button>` : ""}</span>`}</div>
      <div class="c-plan">
        <span class="t">오늘 할 공부 · 교재 순서</span>
        <h2>${esc(title)}<br><span class="dim">${esc(chLine)}${pages ? ` · <b class="c-pgs num">${esc(pages)}</b>` : ""} · 카드 ${nCards}장 · 문제 ${nQ}개</span></h2>
        <p class="c-pace num">${esc(pace)}</p>
        <div class="c-steps" role="list" aria-label="오늘 진행">${STEPS.map((t, j) => `<div role="listitem" class="${j < step || done ? "done" : j === Math.max(0, step) && !done ? "now" : ""}"><i></i>${t}</div>`).join("")}</div>
      </div>
      <a class="c-go press" href="#/cim/go" id="c-start">${label} <span>${side}</span></a>
      <div class="c-subj num">${[1, 2, 3].map((s) => { const [v, t, cls] = verdict(subjPct(s)); return `<div class="${cls}" title="${esc(SUBJ[s].n)}"><span class="k">${s}과목</span><span class="v">${v}</span><span class="s">${t}</span></div>`; }).join("")}</div>
      <p class="c-hint">${esc(hint)}</p>
      <p class="c-hint"><a class="c-link" href="#/cim/log">진도 · 기록 보기</a></p>
    </div>`;
    const inp = host.querySelector("#c-exam");
    if (inp) inp.onchange = () => { if (!inp.value) return; S.exam = inp.value; editDate = false; save(); draw(); env.top(); };
    setAi({ kind: "general", topic: `오늘 할 공부(교재 순서): ${title} (${chLine}${pages ? " · " + pages : ""}) · 진행 ${run ? (done ? "끝" : STEPS[step] + " 단계") : "시작 전"} · 과목 정답률 ${[1, 2, 3].map((s) => `${s}과목 ${verdict(subjPct(s))[0]}`).join(", ")} · 오늘 돌아온 오답 ${due}개${left != null ? ` · 시험까지 ${left}일` : ""}` });
  }
  host.addEventListener("click", (e) => { if (e.target.closest("[data-edit]")) { editDate = !editDate; draw(); if (editDate) host.querySelector("#c-exam")?.focus(); } });
  draw();
  return { redraw: draw };
}

// 진도 · 기록 — 교재 진도(장마다) · 12주 잔디 · 모의고사 표
export function mountLog(host) {
  const S = st(), nk = nextKey(S), nch = nk ? nk.slice(0, nk.indexOf("-")) : null;
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
    <h1>진도 · 기록</h1>
    <section class="c-grp"><div class="gh"><span>교재 진도</span><span class="num">${bookDone(S)} / ${BOOK.length}장</span></div>
      ${CHS.map((c) => { const r = readIn(c.id, S), ok = r >= c.np; return `<a class="c-row press${c.id === nch ? " now" : ""}" href="#/cim/study/${c.id}"><span class="n num">${c.s}-${c.c}</span><b>${esc(c.t)} <span class="dim num">${esc(c.pg)}쪽~</span></b><span class="p num">${ok ? "✓ 다 읽음" : `${r}/${c.np}`}</span></a>`; }).join("")}</section>
    <section class="c-grp"><div class="gh"><span>공부한 날 · 최근 12주</span><span class="num">${active}일 · ${total.toLocaleString("ko-KR")}문제</span></div>
      <div class="c-heat" role="img" aria-label="최근 12주 동안 ${active}일 공부, ${total}문제"><div class="c-grid7">${cells}</div></div></section>
    <section class="c-grp"><div class="gh"><span>모의고사 기록</span><span class="num">${ms.length}회</span></div>
      ${ms.length ? ms.map((m) => `<div class="c-row static"><span class="n num">${esc(m.date.slice(5))}</span><b class="num">${m.total}점 <span class="${m.pass ? "ok" : "bad"}">${m.pass ? "합격" : "불합격"}</span></b><span class="p num">${[1, 2, 3].map((s) => `<span class="${m.by[s] < SUBJ[s].q * 0.4 ? "bad" : ""}">${m.by[s]}/${SUBJ[s].q}</span>`).join(" · ")}</span></div>`).join("") : `<p class="c-empty">아직 없어요. 시험 3일 전부터 시험 탭에서 풀어요.</p>`}</section>
  </div>`;
  setAi({ kind: "general", topic: `진도 · 기록 화면 · 교재 ${bookDone(S)}/${BOOK.length}장 읽음` });
  return {};
}
