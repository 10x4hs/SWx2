// CIM 오늘 — D-day · 14일 계획 · 오늘 체크리스트 · 과목별 정답률(과락선 · 최근 14일) · 공부한 날(12주) · 모의고사 기록
import { st, save, today, addDays, diff, dueIds, wrongIds, subjStat, trend } from "./store.js";
import { CH, SUBJ, TOTAL_Q, CALC } from "./meta.js";
import { NOTES } from "./notes.js";
import { esc, ring, spark, pad2, pctTxt } from "./ui.js";

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
// 하루 할 일 — 열기는 그 화면 주소로
export function tasksFor(d) {
  const p = PLAN[d - 1], t = [];
  (p.ch || []).forEach((id) => {
    t.push({ k: "r" + id, t: `읽기 · ${CH[id].c}장 ${CH[id].t} (★★★ 먼저)`, go: `#/cim/book/${id}` });
    t.push({ k: "q" + id, t: `문제 · ${CH[id].c}장 20문제 (먼저 떠올리고 확인)`, go: `#/cim/quiz/ch/${id}/20` });
  });
  if (p.mix) t.push({ k: "mix", t: "섞어 풀기 · 계산 파트 30문제", go: `#/cim/quiz/mix/${CALC.join(",")}` });
  if (p.mock) t.push({ k: "mock", t: "실전 모의고사 100문항 · 120분", go: "#/cim/mock" });
  if (p.nums) t.push({ k: "nums", t: "숫자표 플래시카드 한 바퀴", go: "#/cim/table" });
  t.push({ k: "due", t: "오답 복습 (1·3·7일 돌아온 문제)", go: "#/cim/quiz/due" });
  t.push({ k: "sleep", t: p.last ? "일찍 자기 — 기억은 잠잘 때 굳어요" : "자기 전 10분: 오늘 카드 제목만 보고 내용 떠올리기", go: null });
  return t;
}
const PH = { 계산: "calc", 법규: "law", 실전: "real" };

export function mountDash(host, env) {
  let selDay = null;
  const S = st();

  function todayPanel() {
    const td = planDay(S), d = selDay || td, p = PLAN[d - 1], tasks = tasksFor(d), done = S.done[d] || {};
    const n = tasks.filter((t) => done[t.k]).length, due = dueIds().length;
    return `<header class="cim-ph"><div><span class="cim-lab">${d === td ? "오늘" : "고른 날"} · ${pad2(d)} / 14</span><h2>${d}일차 — ${esc(p.t)}</h2></div>
        <div class="cd-frac"><b class="cim-num">${n}<small>/${tasks.length}</small></b><span class="cim-bar" aria-hidden="true"><i style="width:${(n / tasks.length) * 100}%"></i></span></div></header>
      ${d !== td ? `<p class="cd-note">다른 날을 보고 있어요. <button type="button" class="cim-link" data-day="${td}">오늘로</button></p>` : ""}
      <ul class="cd-tasks">${tasks.map((t) => `<li class="${done[t.k] ? "done" : ""}"><label class="cim-chk"><input type="checkbox" data-tk="${t.k}" ${done[t.k] ? "checked" : ""}><span>${esc(t.t)}${t.k === "due" ? ` <b class="cim-num">${due}개</b>` : ""}</span></label>${t.go ? `<a class="cim-go" href="${t.go}">열기<span aria-hidden="true">→</span></a>` : ""}</li>`).join("")}</ul>`;
  }
  function planPanel() {
    const td = planDay(S), d = selDay || td;
    return `<header class="cim-ph"><div><span class="cim-lab">14일 계획</span><h2>계산 먼저 → 법규 · 숫자 → 실전</h2></div>
        <ul class="cd-legend" aria-label="구간"><li class="ph-calc">1–8 계산</li><li class="ph-law">9–11 법규</li><li class="ph-real">12–14 실전</li></ul></header>
      <div class="cd-days">${PLAN.map((x, i) => {
        const dn = S.done[i + 1] || {}, ts = tasksFor(i + 1), k = ts.filter((t) => dn[t.k]).length;
        return `<button type="button" data-day="${i + 1}" class="ph-${PH[x.ph]}${i + 1 === td ? " today" : ""}${k === ts.length ? " full" : ""}" aria-pressed="${i + 1 === d}" title="${i + 1}일차 · ${esc(x.t)}"><span class="cd-dn">${pad2(i + 1)}</span><span class="cd-dph">${x.ph}</span><span class="cd-dbar" aria-hidden="true"><i style="width:${(k / ts.length) * 100}%"></i></span></button>`;
      }).join("")}</div>`;
  }
  function subjPanel() {
    const due = dueIds().length, wn = wrongIds().length, last = S.mocks[S.mocks.length - 1];
    return `<header class="cim-ph"><div><span class="cim-lab">과목별 정답률</span><h2>과락선 40% · 합격선 70%</h2></div><span class="cim-lab">최근 14일</span></header>
      <div class="cd-subjs">${[1, 2, 3].map((s) => {
        const x = subjStat(s), pct = x.acc == null ? null : Math.round(x.acc * 100);
        const risk = pct != null && x.n >= 10 && pct < 40, soso = !risk && pct != null && x.n >= 10 && pct < 60;
        const tr = trend(s);
        return `<div class="cd-s${risk ? " risk" : soso ? " soso" : ""}">
          <div class="cd-sh"><span class="cd-sn">${SUBJ[s].n}</span><b class="cd-pct">${pct == null ? "—" : pct + "<small>%</small>"}</b></div>
          <div class="cd-meter" role="meter" aria-label="${SUBJ[s].n} 정답률" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct ?? 0}"><i style="width:${pct || 0}%"></i><span class="cut" style="left:40%" title="과락선 40%"></span><span class="cut pass" style="left:70%" title="합격선 70%"></span></div>
          <div class="cd-sf"><span class="cim-num">${x.n}<small>/${x.tot}</small> 풀었어요</span>${spark(tr, { label: `${SUBJ[s].n} 최근 14일 정답률: ${tr.map((v) => (v == null ? "없음" : Math.round(v * 100) + "%")).join(", ")}` })}</div>
          ${risk ? `<p class="cim-status bad"><span aria-hidden="true">▲</span> 과락 위험 (40% 미만)</p>` : soso ? `<p class="cim-status warn"><span aria-hidden="true">●</span> 조금 더 (60% 미만)</p>` : ""}
        </div>`;
      }).join("")}</div>
      <p class="cd-foot">오늘 다시 볼 오답 <b class="cim-num">${due}</b>개 · 전체 오답노트 <b class="cim-num">${wn}</b>개${last ? ` · 최근 모의고사 <b class="cim-num">${last.total}</b>점 ${last.pass ? "합격" : "불합격"}` : ""}</p>`;
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
    return `<header class="cim-ph"><div><span class="cim-lab">공부한 날 · 최근 12주</span><h2><span class="cim-num">${active}</span>일 · <span class="cim-num">${total.toLocaleString("ko-KR")}</span>문제</h2></div></header>
      <div class="cd-heat"><div class="cd-wd" aria-hidden="true"><span>월</span><span></span><span>수</span><span></span><span>금</span><span></span><span>일</span></div><div class="cd-grid7">${cells}</div></div>
      <div class="cd-hl"><span>적게</span><i></i><i class="l1"></i><i class="l2"></i><i class="l3"></i><i class="l4"></i><span>많이</span></div>
      <p class="cd-foot">진할수록 많이 푼 날이에요. 매일 조금씩이 몰아서보다 오래 남아요.</p>`;
  }
  function mockPanel() {
    const ms = S.mocks.slice(-10);
    if (!ms.length) return `<header class="cim-ph"><div><span class="cim-lab">모의고사 기록</span><h2>아직 없어요</h2></div></header>
      <p class="cd-foot">12 · 13일차에 100문항 · 120분으로 실전처럼 풀어요.</p><a class="cim-btn line" href="#/cim/mock">모의고사 보러 가기</a>`;
    const W = 320, H = 132, bw = Math.min(26, (W - 30) / ms.length - 6), y = (v) => H - 18 - (v / 100) * (H - 30);
    const bars = ms.map((m, i) => { const x = 24 + i * ((W - 30) / ms.length) + 3; return `<rect class="${m.pass ? "ok" : "bad"}" x="${x.toFixed(1)}" y="${y(m.total).toFixed(1)}" width="${bw.toFixed(1)}" height="${(y(0) - y(m.total)).toFixed(1)}" rx="3"><title>${m.date} · ${m.total}점 · ${m.pass ? "합격" : "불합격"}</title></rect>${i === ms.length - 1 ? `<text class="lab" x="${(x + bw / 2).toFixed(1)}" y="${(y(m.total) - 5).toFixed(1)}" text-anchor="middle">${m.total}</text>` : ""}`; }).join("");
    const last = ms[ms.length - 1];
    return `<header class="cim-ph"><div><span class="cim-lab">모의고사 기록 · 최근 ${ms.length}회</span><h2>${last.total}점 · ${last.pass ? "합격" : "불합격"}</h2></div></header>
      <svg class="cd-mock" viewBox="0 0 ${W} ${H}" role="img" aria-label="모의고사 점수: ${ms.map((m) => m.total).join(", ")}점 (합격선 70)">
        ${[0, 50, 100].map((v) => `<line class="g" x1="22" x2="${W}" y1="${y(v)}" y2="${y(v)}"/><text class="ax" x="16" y="${y(v) + 3}" text-anchor="end">${v}</text>`).join("")}
        <line class="pass" x1="22" x2="${W}" y1="${y(70)}" y2="${y(70)}"/><text class="ax pass" x="${W}" y="${y(70) - 4}" text-anchor="end">합격 70</text>${bars}</svg>
      <p class="cd-foot">초록 = 합격 · 빨강 = 불합격 (과락 포함). <a href="#/cim/mock">기록 전체</a></p>`;
  }

  function draw() {
    const td = planDay(S), seen = Object.keys(S.ans).length, todayN = S.days[today()] || 0, due = dueIds().length, last = S.mocks[S.mocks.length - 1];
    const left = S.exam ? diff(today(), S.exam) : null;
    host.innerHTML = `
      <section class="cim-panel cd-hero" aria-label="요약">
        <div class="cd-kpi cd-dday"><span class="cim-lab">시험까지</span><b class="cd-big${left != null && left <= 3 && left >= 0 ? " hot" : ""}">${ddayText(S)}</b>
          <label class="cd-date"><span>시험일</span><input type="date" id="cd-exam" value="${esc(S.exam)}"></label></div>
        <div class="cd-kpi"><span class="cim-lab">계획</span><b class="cd-mid cim-num">${pad2(td)}<small>/14</small></b><span class="cd-sub">${esc(PLAN[td - 1].ph)} · ${esc(PLAN[td - 1].t)}</span></div>
        <div class="cd-kpi cd-ringk"><div class="cd-rw">${ring(seen / TOTAL_Q, { size: 58, stroke: 5 })}<span class="cim-num">${Math.round((seen / TOTAL_Q) * 100)}%</span></div><div><span class="cim-lab">풀어 본 문제</span><b class="cd-mid cim-num">${seen.toLocaleString("ko-KR")}<small>/${TOTAL_Q.toLocaleString("ko-KR")}</small></b></div></div>
        <div class="cd-kpi"><span class="cim-lab">오늘 푼 문제</span><b class="cd-mid cim-num">${todayN}</b><a class="cd-sub" href="#/cim/quiz/due">오답 복습 ${due}개 →</a></div>
        <div class="cd-kpi"><span class="cim-lab">최근 모의고사</span><b class="cd-mid cim-num">${last ? last.total : "—"}</b><span class="cd-sub">${last ? (last.pass ? "합격" : "불합격") + " · " + last.date.slice(5) : "아직 없어요"}</span></div>
      </section>
      <p class="cd-rule">합격: 100문항 중 70개 이상 + 과목마다 40% 이상 (1과목 8 · 2과목 12 · 3과목 20개).</p>
      <div class="cd-row">
        <section class="cim-panel cd-today" id="cd-today">${todayPanel()}</section>
        <section class="cim-panel" id="cd-subj">${subjPanel()}</section>
      </div>
      <section class="cim-panel cd-plan" id="cd-plan">${planPanel()}</section>
      <div class="cd-row two">
        <section class="cim-panel" id="cd-heat">${heatPanel()}</section>
        <section class="cim-panel" id="cd-mocks">${mockPanel()}</section>
      </div>`;
    host.querySelector("#cd-exam").onchange = (e) => { S.exam = e.target.value; selDay = null; save(); draw(); env.top(); };
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
    redrawToday(`[data-tk="${c.dataset.tk}"]`);
  });
  host.addEventListener("click", (e) => {
    const b = e.target.closest("[data-day]"); if (!b) return;
    const n = +b.dataset.day; selDay = n === planDay(S) ? null : n;
    redrawToday(`[data-day="${n}"]`);
  });
  draw();
  return { redraw: draw };
}
