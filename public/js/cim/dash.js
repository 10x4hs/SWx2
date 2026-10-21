// CIM 오늘 — D-day · 14일 계획 · 오늘 할 일 · 과목별 정답률(과락선 · 최근 14일) · 공부한 날(12주) · 모의고사 기록
// 금융 앱처럼: 파란 D-day 카드 · 작은 숫자 카드 · 숫자는 세어 올라가고 막대는 차올라요 (ui.fill)
import { st, save, today, addDays, diff, dueIds, wrongIds, subjStat, trend } from "./store.js";
import { CH, SUBJ, TOTAL_Q, CALC } from "./meta.js";
import { NOTES } from "./notes.js";
import { esc, spark, pad2, fill, chev } from "./ui.js";

const PLAN = NOTES.PLAN;
export function planDay(S = st()) {
  if (S.exam) return Math.max(1, Math.min(14, 15 - diff(today(), S.exam)));
  return Math.max(1, Math.min(14, diff(S.start, today()) + 1));
}
export function ddayText(S = st()) {
  if (!S?.exam) return "D-?";
  const left = diff(today(), S.exam);
  return left > 0 ? "D-" + left : left === 0 ? "D-DAY" : "끝";
}
// 하루 할 일 — t 제목 · s 한 줄 설명 · go 그 화면 주소
export function tasksFor(d) {
  const p = PLAN[d - 1], t = [];
  (p.ch || []).forEach((id) => {
    t.push({ k: "r" + id, t: `${CH[id].c}장 ${CH[id].t} 읽기`, s: `★★★ 카드 먼저 · 핵심 ${CH[id].np}개`, go: `#/cim/book/${id}` });
    t.push({ k: "q" + id, t: `${CH[id].c}장 문제 20개`, s: "먼저 떠올리고, 그다음 확인해요", go: `#/cim/quiz/ch/${id}/20` });
  });
  if (p.mix) t.push({ k: "mix", t: "계산 파트 섞어 풀기 30문제", s: "어떤 공식을 쓸지 고르는 연습", go: `#/cim/quiz/mix/${CALC.join(",")}` });
  if (p.mock) t.push({ k: "mock", t: "실전 모의고사 100문항", s: "120분 · 실제 시험처럼", go: "#/cim/mock" });
  if (p.nums) t.push({ k: "nums", t: "숫자표 한 바퀴", s: "플래시카드로 숫자만 빠르게", go: "#/cim/table" });
  t.push({ k: "due", t: "오답 다시 보기", s: "1일 · 3일 · 7일 전에 틀린 문제", go: "#/cim/quiz/due" });
  t.push(p.last ? { k: "sleep", t: "일찍 자기", s: "기억은 잠잘 때 굳어요", go: null } : { k: "sleep", t: "자기 전 10분", s: "오늘 카드 제목만 보고 내용 떠올리기", go: null });
  return t;
}
const PH = { 계산: "calc", 법규: "law", 실전: "real" };
const WD = ["일", "월", "화", "수", "목", "금", "토"];
const dateKo = (d) => { const t = new Date(d + "T00:00:00Z"); return `${t.getUTCMonth() + 1}월 ${t.getUTCDate()}일 ${WD[t.getUTCDay()]}요일`; };

// 최근 7일 정답률 · 연속 공부한 날
function recentAcc(S) {
  let r = 0, w = 0;
  for (let i = 0; i < 7; i++) { const h = S.hist[addDays(today(), -i)]; if (h) for (const s of [1, 2, 3]) if (h[s]) { r += h[s][0]; w += h[s][1]; } }
  return r + w ? Math.round((r / (r + w)) * 100) : null;
}
function streak(S) {
  let d = today(), n = 0;
  if (!S.days[d]) d = addDays(d, -1);
  while (S.days[d]) { n++; d = addDays(d, -1); }
  return n;
}

export function mountDash(host, env) {
  let selDay = null;
  const S = st();

  function todayPanel() {
    const td = planDay(S), d = selDay || td, tasks = tasksFor(d), done = S.done[d] || {};
    const n = tasks.filter((t) => done[t.k]).length, due = dueIds().length;
    return `<header class="cim-ph"><div><span class="cim-lab">${d === td ? "오늘" : "고른 날"} · ${d}일차</span><h2>${d === td ? "오늘 할 일" : `${d}일차 할 일`}</h2></div><span class="badge b cim-num cd-frac">${n} / ${tasks.length}</span></header>
      ${d !== td ? `<p class="cd-note">다른 날을 보고 있어요. <button type="button" class="cim-link" data-day="${td}">오늘로 돌아가기</button></p>` : ""}
      <ul class="cd-tasks">${tasks.map((t) => `<li class="${done[t.k] ? "done" : ""}"><label class="cim-chk"><input type="checkbox" data-tk="${t.k}" ${done[t.k] ? "checked" : ""} aria-label="${esc(t.t)} 했어요"><span class="tx"><b>${esc(t.t)}${t.k === "due" ? ` <span class="cim-num">${due}개</span>` : ""}</b><span>${esc(t.s)}</span></span></label>${t.go ? `<a class="cim-go press" href="${t.go}">열기${chev}</a>` : ""}</li>`).join("")}</ul>`;
  }
  function planPanel() {
    const td = planDay(S), d = selDay || td;
    return `<header class="cim-ph"><div><span class="cim-lab">14일 계획</span><h2>계산 먼저 → 법규 · 숫자 → 실전</h2></div></header>
      <ul class="cd-legend" aria-label="구간" style="margin:-2px 0 14px"><li class="ph-calc">1–8일 계산</li><li class="ph-law">9–11일 법규</li><li class="ph-real">12–14일 실전</li></ul>
      <div class="cd-days">${PLAN.map((x, i) => {
        const dn = S.done[i + 1] || {}, ts = tasksFor(i + 1), k = ts.filter((t) => dn[t.k]).length;
        return `<button type="button" data-day="${i + 1}" class="press ph-${PH[x.ph]}${i + 1 === td ? " today" : ""}${k === ts.length ? " full" : ""}" aria-pressed="${i + 1 === d}" title="${i + 1}일차 · ${esc(x.t)}"><span class="cd-dn">${pad2(i + 1)}</span><span class="cd-dph">${x.ph}</span><span class="cd-dbar" aria-hidden="true"><i style="width:${(k / ts.length) * 100}%"></i></span></button>`;
      }).join("")}</div>`;
  }
  function subjPanel() {
    const due = dueIds().length, wn = wrongIds().length, last = S.mocks[S.mocks.length - 1];
    return `<header class="cim-ph"><h2>과목별 정답률</h2><span class="badge n">최근 14일 흐름</span></header>
      <div class="cd-subjs">${[1, 2, 3].map((s) => {
        const x = subjStat(s), pct = x.acc == null ? null : Math.round(x.acc * 100);
        const risk = pct != null && x.n >= 10 && pct < 40, soso = !risk && pct != null && x.n >= 10 && pct < 60, good = pct != null && x.n >= 10 && pct >= 70;
        const tr = trend(s);
        return `<div class="cd-s${risk ? " risk" : soso ? " soso" : ""}">
          <div class="cd-sh"><span>${SUBJ[s].n}</span><span class="r">${risk ? `<span class="badge r">과락 위험</span>` : soso ? `<span class="badge y">조금 더</span>` : good ? `<span class="badge g">합격선 넘음</span>` : ""}<b class="cd-pct cim-num">${pct == null ? "—" : `<span data-count="${pct}">${pct}</span>%`}</b></span></div>
          <div class="meter${risk ? " low" : good ? " ok" : ""}" role="meter" aria-label="${SUBJ[s].n} 정답률" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct ?? 0}"><i data-w="${pct || 0}"></i><span class="ln" style="left:40%" title="과락선 40%"></span><span class="ln" style="left:70%" title="합격선 70%"></span></div>
          <div class="cd-sf"><span class="cim-num">${x.n.toLocaleString("ko-KR")} / ${x.tot.toLocaleString("ko-KR")} 풀었어요</span>${spark(tr, { label: `${SUBJ[s].n} 최근 14일 정답률: ${tr.map((v) => (v == null ? "없음" : Math.round(v * 100) + "%")).join(", ")}` })}</div>
        </div>`;
      }).join("")}
      <div class="legend"><span>세로선 왼쪽 과락 40%</span><span>오른쪽 합격 70%</span></div></div>
      <p class="cd-foot">오늘 다시 볼 오답 <b class="cim-num">${due}</b>개 · 오답노트 <b class="cim-num">${wn}</b>개${last ? ` · 최근 모의고사 <b class="cim-num">${last.total}</b>점 ${last.pass ? "합격" : "불합격"}` : ""}</p>`;
  }
  function heatPanel() {
    // 12주: 열 = 주(월요일 시작), 행 = 요일. 오늘이 마지막 열
    const t = today(), dow = (new Date(t + "T00:00:00Z").getUTCDay() + 6) % 7, start = addDays(t, -(11 * 7 + dow));
    let cells = "", total = 0, active = 0;
    for (let i = 0; i < 84; i++) {
      const d = addDays(start, i), n = S.days[d] || 0, future = d > t;
      if (!future && n) { total += n; active++; }
      const l = future ? "f" : n === 0 ? "" : n < 10 ? "l1" : n < 30 ? "l2" : n < 60 ? "l3" : "l4";
      cells += `<i class="${l}${d === t ? " now" : ""}" title="${d} · ${n}문제"></i>`;
    }
    return `<header class="cim-ph"><div><span class="cim-lab">공부한 날 · 최근 12주</span><h2><span class="cim-num" data-count="${active}">${active}</span>일 · <span class="cim-num" data-count="${total}">${total.toLocaleString("ko-KR")}</span>문제</h2></div></header>
      <div class="cd-heat"><div class="cd-wd" aria-hidden="true"><span>월</span><span></span><span>수</span><span></span><span>금</span><span></span><span>일</span></div><div class="cd-grid7">${cells}</div></div>
      <div class="cd-hl"><span>적게</span><i></i><i class="l1"></i><i class="l2"></i><i class="l3"></i><i class="l4"></i><span>많이</span></div>
      <p class="cd-foot">진할수록 많이 푼 날이에요. 매일 조금씩이 몰아서보다 오래 남아요.</p>`;
  }
  function mockPanel() {
    const ms = S.mocks.slice(-10);
    if (!ms.length) return `<header class="cim-ph"><div><span class="cim-lab">모의고사 기록</span><h2>아직 없어요</h2></div></header>
      <p class="cd-foot" style="margin:0 0 16px">12 · 13일차에 100문항 · 120분으로 실전처럼 풀어요.</p><a class="cim-btn line press" href="#/cim/mock">모의고사 보러 가기</a>`;
    const W = 320, H = 140, bw = Math.min(26, (W - 30) / ms.length - 8), y = (v) => H - 18 - (v / 100) * (H - 30);
    const bars = ms.map((m, i) => { const x = 24 + i * ((W - 30) / ms.length) + 4; return `<rect class="${m.pass ? "ok" : "bad"}" x="${x.toFixed(1)}" y="${y(m.total).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(2, y(0) - y(m.total)).toFixed(1)}" rx="5"><title>${m.date} · ${m.total}점 · ${m.pass ? "합격" : "불합격"}</title></rect>${i === ms.length - 1 ? `<text class="lab" x="${(x + bw / 2).toFixed(1)}" y="${(y(m.total) - 6).toFixed(1)}" text-anchor="middle">${m.total}</text>` : ""}`; }).join("");
    const last = ms[ms.length - 1];
    return `<header class="cim-ph"><div><span class="cim-lab">모의고사 기록 · 최근 ${ms.length}회</span><h2>${last.total}점 <span class="badge ${last.pass ? "g" : "r"}">${last.pass ? "합격" : "불합격"}</span></h2></div></header>
      <svg class="cd-mock" viewBox="0 0 ${W} ${H}" role="img" aria-label="모의고사 점수: ${ms.map((m) => m.total).join(", ")}점 (합격선 70)">
        ${[0, 50, 100].map((v) => `<line class="g" x1="22" x2="${W}" y1="${y(v)}" y2="${y(v)}"/><text class="ax" x="16" y="${y(v) + 4}" text-anchor="end">${v}</text>`).join("")}
        <line class="pass" x1="22" x2="${W}" y1="${y(70)}" y2="${y(70)}"/><text class="ax pass" x="${W}" y="${y(70) - 5}" text-anchor="end">합격 70</text>${bars}</svg>
      <p class="cd-foot">초록 = 합격 · 빨강 = 불합격 (과락 포함). <a href="#/cim/mock">기록 전체</a></p>`;
  }

  function draw() {
    const td = planDay(S), p = PLAN[td - 1], seen = Object.keys(S.ans).length, todayN = S.days[today()] || 0, due = dueIds().length;
    const left = S.exam ? diff(today(), S.exam) : null, acc = recentAcc(S), stk = streak(S), planPct = Math.round((td / 14) * 100);
    const chs = (p.ch || []).map((id) => CH[id].c + "장");
    const line = p.mock ? `실전처럼 100문항을 120분 안에 풀어요. 오답 ${due}개도 다시 봐요.`
      : chs.length ? `${chs.join(" · ")}을 읽고 20문제씩 풀어요. 오답 ${due}개도 다시 봐요.` : `오답 ${due}개를 다시 보고, 숫자표를 한 바퀴 돌아요.`;
    const big = left == null ? `D-?<small>시험일을 골라 주세요</small>` : left > 0 ? `D-<span data-count="${left}">${left}</span><small>${dateKo(S.exam)}</small>` : left === 0 ? `D-DAY<small>오늘이 시험이에요</small>` : `끝<small>${dateKo(S.exam)}</small>`;
    host.innerHTML = `<div class="cd-grid">
      <div class="cd-col">
        <div class="cd-greet"><span class="cim-lab">${td}일차 · ${esc(p.ph)} 파트</span><h1>${esc(p.t)}</h1><p>${esc(line)}</p></div>
        <section class="cim-panel cd-today" id="cd-today">${todayPanel()}</section>
        <section class="cim-panel cd-plan" id="cd-plan">${planPanel()}</section>
        <section class="cim-panel" id="cd-heat">${heatPanel()}</section>
      </div>
      <div class="cd-col">
        <section class="cd-hero" aria-label="요약">
          <div class="cd-kpi cd-dday${left != null && left <= 3 && left >= 0 ? " hot" : ""}"><span class="k">시험까지</span><span class="v cim-num">${big}</span>
            <div class="track" aria-hidden="true"><i data-w="${planPct}"></i></div>
            <div class="rowx cim-num"><span>14일 계획 중 ${td}일째</span><span>${planPct}%</span></div>
            <label class="cd-date"><span>시험일</span><input type="date" id="cd-exam" value="${esc(S.exam)}"></label></div>
          <div class="cd-mini">
            <div class="cd-kpi"><span class="cim-lab">풀어 본 문제</span><span class="v cim-num"><span data-count="${seen}">${seen.toLocaleString("ko-KR")}</span></span><span class="s cim-num">/ ${TOTAL_Q.toLocaleString("ko-KR")}</span></div>
            <div class="cd-kpi"><span class="cim-lab">정답률</span><span class="v cim-num">${acc == null ? "—" : `<span data-count="${acc}">${acc}</span><small>%</small>`}</span><span class="s">최근 7일</span></div>
            <div class="cd-kpi"><span class="cim-lab">연속</span><span class="v cim-num"><span data-count="${stk}">${stk}</span><small>일</small></span><span class="s">매일 공부</span></div>
            <div class="cd-kpi"><span class="cim-lab">오늘 푼 문제</span><span class="v cim-num"><span data-count="${todayN}">${todayN}</span></span><a class="s" href="#/cim/quiz/due">오답 복습 ${due}개 →</a></div>
          </div>
        </section>
        <section class="cim-panel" id="cd-subj">${subjPanel()}</section>
        <section class="cim-panel" id="cd-mocks">${mockPanel()}</section>
      </div></div>
      <p class="cim-note" style="padding:0 4px">합격: 100문항 중 70개 이상 + 과목마다 40% 이상 (1과목 8 · 2과목 12 · 3과목 20개).</p>`;
    host.querySelector("#cd-exam").onchange = (e) => { S.exam = e.target.value; selDay = null; save(); draw(); env.top(); };
    fill(host);
  }
  const redrawToday = (focusSel) => {
    host.querySelector("#cd-today").innerHTML = todayPanel();
    host.querySelector("#cd-plan").innerHTML = planPanel();
    if (focusSel) host.querySelector(focusSel)?.focus();
  };
  host.addEventListener("change", (e) => {
    const c = e.target.closest("[data-tk]"); if (!c) return;
    const d = selDay || planDay(S);
    (S.done[d] ||= {})[c.dataset.tk] = c.checked; save();
    // 체크 동그라미가 채워지는 걸 보이고 나서 다시 그려요
    c.closest("li")?.classList.toggle("done", c.checked);
    setTimeout(() => redrawToday(`[data-tk="${c.dataset.tk}"]`), 220);
  });
  host.addEventListener("click", (e) => {
    const b = e.target.closest("[data-day]"); if (!b) return;
    const n = +b.dataset.day; selDay = n === planDay(S) ? null : n;
    redrawToday(`[data-day="${n}"]`);
  });
  draw();
  return { redraw: draw };
}
