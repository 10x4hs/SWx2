// 그날 한 페이지 — 캘린더 오른쪽에 붙어요 (예전 "오늘" 화면 전부 + 그날 한 공부 + 하루 기록 저장).
// 할 일(시간 없는 목표) · 시간표 · 하루 점수 · 실행 기록 · 일기 · 그날 한 공부. 앞으로 올 날은 할 일 · 시간표만.
// 전부 나만 봐요. 할 일 옆 ▶ 를 누르면 집중 타이머가 그 할 일 이름으로 시작하고, 끝나면 그 할 일에 집중 시간이 쌓여요.
import { mountCommand } from "../ai-command.js";
import { api } from "../api.js";
import {
  $, esc, pad, hm, toMin, toTime, nowTime, ymd, parseYmd, addDays, today,
  DOW, isoWeek, dayOfYear, daysInYear, dayScore, pct, toast, focusOf, englishOf, studyMins, periodKey,
} from "../util.js";
import { MOODS } from "../diary.js";
import { icon } from "../icons.js";
import { BLOCKS } from "../english/data.js";

const HOUR_PX = 96; // 한 시간 = 96px → 5분 = 8px (5분 단위까지 보이게)
const STEP = 5;     // 시간표는 5분 단위
// 우선순위 (색은 styles.css 의 --p-*)
export const PRIOS = [
  { k: "low", label: "Low" }, { k: "medium", label: "Medium" }, { k: "high", label: "High" }, { k: "xhigh", label: "XHigh" }, { k: "max", label: "Max" },
];
const PRIO_RANK = { max: 5, xhigh: 4, high: 3, medium: 2, low: 1 };
const prioSelect = (name = "priority", cur = "") => `<select class="select sm prio-sel" name="${name}" aria-label="우선순위"><option value="">우선순위</option>${PRIOS.map((p) => `<option value="${p.k}" ${cur === p.k ? "selected" : ""}>${p.label}</option>`).join("")}</select>`;
const prioPill = (p) => `<button type="button" class="prio" data-prio="${esc(p.id)}" data-p="${p.priority || ""}" title="우선순위 바꾸기 (누를 때마다 다음 단계)">${p.priority ? PRIOS.find((x) => x.k === p.priority)?.label : "우선순위"}</button>`;
const longDate = (d) => `${d.getMonth() + 1}월 ${d.getDate()}일 ${DOW[d.getDay()]}요일`;
function relDay(k, tk) {
  const n = Math.round((parseYmd(k) - parseYmd(tk)) / 864e5);
  return n === 0 ? "오늘" : n === 1 ? "내일" : n === -1 ? "어제" : n > 0 ? `${n}일 뒤` : `${-n}일 전`;
}
const stamp = (ms) => { const d = new Date(ms); return `${d.getMonth() + 1}월 ${d.getDate()}일 ${pad(d.getHours())}:${pad(d.getMinutes())}`; };

// el 안에 그날 페이지를 그려요. onChange(kind) = 달력 칸을 새로 그려야 할 때. 돌려주는 함수 = 정리(쓰던 일기 저장).
export function mountDay(el, ctx, day, { onChange } = {}) {
  const date = parseYmd(day), tk = ymd(today()), key = "D:" + day;
  const isToday = day === tk, isPast = day < tk, future = day > tk;
  const me = ctx.me;
  const S = { plans: null, goals: null, diary: undefined, logs: [], english: null, record: null, notes: [], carry: 0, editSlot: null, editMins: 60 };
  const wKey = periodKey("week", date), mKey = periodKey("month", date), yKey = periodKey("year", date);
  const GOAL_KEY = { week: wKey, month: mKey, year: yKey }, GOAL_LAB = { week: "이번 주", month: "이번 달", year: "올해" };
  const wk = isoWeek(date);
  let alive = true;
  const changed = (kind) => onChange?.(kind);

  el.innerHTML = `
    <header class="cd-head">
      <div>
        <span class="cd-rel${isToday ? " now" : ""}">${relDay(day, tk)}</span>
        <h2 class="cd-date">${longDate(date)}</h2>
        <p class="dp-sub">${wk.w}주차 · 올해 ${dayOfYear(date)}/${daysInYear(date.getFullYear())}일째<span class="chip accent" id="dp-streak" hidden></span></p>
      </div>
      <div class="pager">
        <a class="icon-btn sm" href="#/calendar/${ymd(addDays(date, -1))}" aria-label="전날">${icon.left(16)}</a>
        <a class="icon-btn sm" href="#/calendar/${ymd(addDays(date, 1))}" aria-label="다음날">${icon.right(16)}</a>
        <label class="icon-btn sm dp-pick" aria-label="날짜 고르기">${icon.calendar(15)}<input type="date" id="dp-date" value="${day}"></label>
      </div>
    </header>
    <div id="dp-aic"></div>
    ${future ? `<p class="dp-note">앞으로 올 날이에요. 할 일과 시간표를 미리 적어 두면 그날 홈 차트에 그대로 나와요.</p>` : ""}
    <div id="dp-carry"></div>
    <div class="dp-cols">
      <div class="dp-col">
        <section class="cd-sec" aria-labelledby="dp-goals-t">
          <div class="cd-sh"><h3 id="dp-goals-t">체크리스트</h3><span id="dp-goal-sum"></span></div>
          <ul class="todos dp-todos" id="dp-goals"><li class="cd-loading faint">불러오는 중…</li></ul>
          <form class="cd-add dp-goal-add" id="dp-goal-add" autocomplete="off">
            <input class="input" name="text" maxlength="200" placeholder="해야 할 일 추가" aria-label="할 일 추가">
            ${prioSelect()}
            <button class="icon-btn sm add-go" type="submit" aria-label="할 일 추가">${icon.plus(15)}</button>
          </form>
        </section>
        ${future ? "" : `<section class="cd-sec sc-card" aria-labelledby="dp-sc-t">
          <div class="cd-sh"><h3 id="dp-sc-t">하루 점수</h3><span class="faint" id="dp-sc-sub"></span></div>
          <div class="sc-top"><div class="sc-ring" id="dp-sc-ring"></div><div class="sc-prio" id="dp-sc-prio"></div></div>
          <p class="sc-note" id="dp-sc-note"></p>
          <div class="sc-trend" id="dp-sc-trend"></div>
          <div class="dp-rec" id="dp-rec"></div>
        </section>`}

        ${future ? "" : `<section class="cd-sec" aria-labelledby="dp-diary-t">
          <div class="cd-sh"><h3 id="dp-diary-t">일기</h3></div>
          <a class="dp-diary glass" id="dp-diary" href="#/calendar/diary/${day}"><span class="faint">불러오는 중…</span></a>
        </section>`}
        <section class="cd-sec" aria-labelledby="dp-tt-t">
          <div class="cd-sh"><h3 id="dp-tt-t">시간표</h3><span class="faint" id="dp-tt-sum"></span></div>
          <p class="dp-hint">빈 시각을 누르면 그 자리에서 바로 적을 수 있어요. Enter로 추가, Esc로 닫기.</p>
          <div class="day-grid" id="dp-grid"></div>
        </section>
      </div>
      ${future ? "" : `
      <div class="dp-col">
        <section class="cd-sec" aria-labelledby="dp-study-t">
          <div class="cd-sh"><h3 id="dp-study-t">그날 한 공부</h3></div>
          <div id="dp-study"><p class="faint">불러오는 중…</p></div>
        </section>
      </div>`}
    </div>`;

  // ---------- data ----------
  async function load() {
    try {
      const [p, d, g, di] = await Promise.all([api.plans([key]), api.calendarDay(day), Promise.resolve({ plans: [] }), future ? Promise.resolve({ diary: null }) : api.diary(day).catch(() => ({ diary: null }))]);
      if (!alive) return;
      S.plans = p.plans || []; S.goals = g.plans || []; S.diary = di.diary;
      Object.assign(S, { logs: d.logs || [], english: d.english, record: d.record, notes: d.notes || [] });
      drawAll();
    } catch (e) { if (alive) toast(e.message, "err"); }
  }
  async function loadExtras() {
    if (!isToday) return;
    try {
      const { days } = await api.heatmap(date.getFullYear());
      const doneByDay = new Map(days.map((d) => [d.period.slice(2), d.done]));
      let d = today(), n = 0;
      if (!doneByDay.get(ymd(d))) d = addDays(d, -1);
      while (doneByDay.get(ymd(d)) > 0) { n++; d = addDays(d, -1); }
      const c = $("#dp-streak", el);
      if (c && alive) { c.hidden = n < 2; c.textContent = `연속 ${n}일 달성`; }
    } catch {}
    try {
      const { plans } = await api.plans(["D:" + ymd(addDays(date, -1))]);
      S.carry = plans.filter((p) => !p.done).length;
      if (alive) drawCarry();
    } catch {}
  }

  // ---------- drawing ----------
  function drawAll() { drawGoals(); drawDiary(); drawGrid(); if (!future) { drawStudy(); drawRecord(); drawScore(); } }

  // ---------- 하루 점수: 유리 링 + 우선순위 색 차트 + 내 점수 + 14일 흐름 ----------
  const PRIO_COL = { low: "var(--p-low)", medium: "var(--p-medium)", high: "var(--p-high)", xhigh: "var(--p-xhigh)", max: "var(--p-max)", none: "var(--ink-3)" };
  function glassRing(v, big, cap) {
    const R = 44, C = 2 * Math.PI * R, len = Math.max(0, Math.min(1, v)) * C;
    return `<svg viewBox="0 0 110 110" class="gl-ring" role="img" aria-label="${esc(cap)} ${esc(big)}">
      <defs><linearGradient id="glr-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset="1" stop-color="#fff" stop-opacity=".45"/></linearGradient>
        <linearGradient id="glr-s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".22"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>
      <circle cx="55" cy="55" r="52" class="gl-disc"/>
      <circle cx="55" cy="55" r="${R}" class="gl-track" stroke-width="9"/>
      ${len ? `<circle cx="55" cy="55" r="${R}" class="gl-val" stroke="url(#glr-g)" stroke-width="9" stroke-linecap="round" stroke-dasharray="${len.toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 55 55)"/>` : ""}
      <circle cx="55" cy="55" r="${R}" fill="none" stroke="url(#glr-s)" stroke-width="9"/>
      <text x="55" y="58" text-anchor="middle" class="gl-big">${esc(big)}</text><text x="55" y="75" text-anchor="middle" class="gl-cap">${esc(cap)}</text>
    </svg>`;
  }
  function drawScore() {
    const ring = $("#dp-sc-ring", el); if (!ring || !S.plans) return;
    const sc = dayScore(S.plans, me.day_goal), ai = S.record?.ai_score;
    // 점수는 자정에 AI 가 매겨요. 오늘은 지금까지 모습으로 미리보기(참고)만
    if (ai != null) ring.innerHTML = glassRing(ai / 100, String(ai), "AI 점수");
    else ring.innerHTML = glassRing(sc.score == null ? 0 : sc.score / 100, sc.score == null ? "–" : String(sc.score), isToday ? "미리보기" : "계산");
    $("#dp-sc-sub", el).textContent = sc.count ? `실행 ${pct(sc.exec)}% · 계획 ${pct(sc.plan)}%` : "할 일을 넣으면 점수가 생겨요";
    const note = $("#dp-sc-note", el);
    if (note) note.innerHTML = ai != null ? `${icon.spark(12)} <b>AI</b> ${esc(S.record.ai_note || "")}` : isToday ? `${icon.spark(12)} 자정이 지나면 AI가 오늘을 보고 점수와 한 줄 평을 기록해요.` : `<span class="faint">이날은 AI 점수가 아직 없어요.</span>`;
    // 우선순위 색 차트: 단계마다 끝낸 수 / 전체 (진한 색 = 끝낸 몫)
    const rows = [...PRIOS.map((p) => p.k).reverse(), "none"].map((k) => {
      const list = S.plans.filter((p) => (p.priority || "none") === k); return { k, n: list.length, d: list.filter((p) => p.done).length };
    }).filter((r) => r.n);
    const max = Math.max(1, ...rows.map((r) => r.n));
    $("#dp-sc-prio", el).innerHTML = rows.length ? rows.map((r) => `<div class="pb" style="--pc:${PRIO_COL[r.k]}"><span class="pb-l">${r.k === "none" ? "없음" : PRIOS.find((x) => x.k === r.k).label}</span><span class="pb-t" style="--w:${(r.n / max) * 100}%"><i style="--f:${(r.d / r.n) * 100}%"></i></span><span class="pb-n">${r.d}/${r.n}</span></div>`).join("")
      : `<p class="faint pb-empty">우선순위를 고르면 여기에 색으로 쌓여요.</p>`;
    drawTrend();
  }
  function drawTrend() {
    const box = $("#dp-sc-trend", el); if (!box || !S.trend) return;
    const live = dayScore(S.plans || [], me.day_goal).score;
    const byDay = new Map(S.trend.map((d) => [d.day, d]));
    const days = []; for (let i = 13; i >= 0; i--) { const d = ymd(addDays(date, -i)); const r = byDay.get(d) || {}; const ai = d === day ? S.record?.ai_score ?? r.ai_score : r.ai_score; days.push({ day: d, score: ai ?? (d === day && isToday ? live : r.score), ai: ai != null, note: r.ai_note || "" }); }
    const W = 280, H = 76, bw = W / 14, y = (v) => H - 14 - (v / 100) * (H - 22);
    const bars = days.map((d, i) => `${d.score != null ? `<rect x="${(i * bw + 3).toFixed(1)}" y="${y(d.score).toFixed(1)}" width="${(bw - 6).toFixed(1)}" height="${(H - 14 - y(d.score)).toFixed(1)}" rx="3" class="tb${d.day === day ? " on" : ""}${d.ai ? "" : " pre"}"><title>${d.day} ${d.ai ? "AI 점수" : "미리보기"} ${d.score}${d.note ? ` · ${esc(d.note)}` : ""}</title></rect>` : `<rect x="${(i * bw + 3).toFixed(1)}" y="${H - 16}" width="${(bw - 6).toFixed(1)}" height="2" rx="1" class="tb none"/>`}`).join("");
    const lab = [0, 7, 13].map((i) => `<text x="${(i * bw + bw / 2).toFixed(1)}" y="${H - 2}" text-anchor="middle" class="tl">${+days[i].day.slice(8)}일</text>`).join("");
    box.innerHTML = `<div class="sc-leg"><span><i class="lg-b"></i>AI 점수</span><span><i class="lg-b pre"></i>미리보기</span><span class="faint">최근 14일</span></div><svg viewBox="0 0 ${W} ${H}" class="gl-trend" preserveAspectRatio="none">${bars}${lab}</svg>`;
  }
  async function loadTrend() { try { const r = await api.recentRecords(day, 14); if (!alive) return; S.trend = r.days || []; drawTrend(); } catch { S.trend = []; } }

  function drawCarry() {
    const c = $("#dp-carry", el);
    c.innerHTML = S.carry ? `<div class="banner dp-banner"><p>어제 못 끝낸 일이 <b>${S.carry}개</b> 있어요. 오늘로 가져와서 다시 계획할까요?</p>
      <button class="btn sm" type="button" id="dp-carry-btn">오늘로 가져오기</button></div>` : "";
    $("#dp-carry-btn", c)?.addEventListener("click", async () => {
      try {
        const { moved } = await api.carry("day", "D:" + ymd(addDays(date, -1)), key);
        toast(`${moved}개를 오늘로 옮겼어요.`);
        S.carry = 0; drawCarry(); load(); changed("plans");
      } catch (e) { toast(e.message, "err"); }
    });
  }

  function status(p) {
    if (p.done) return "done";
    if (!p.start) return isPast ? "miss" : "";
    const end = toMin(p.start) + (p.mins || 0);
    return isPast || (isToday && end <= toMin(nowTime())) ? "miss" : "";
  }
  const focusTag = (p) => (p.focus_mins > 0 ? `<span class="dp-focus" title="이 할 일에 쌓인 집중 시간">집중 ${hm(p.focus_mins)}</span>` : "");
  const playBtn = (p) => (isToday && !p.done ? `<button class="icon-btn sm dp-play" type="button" data-play="${esc(p.id)}" aria-label="${esc(p.text)} 집중 시작" title="이 할 일로 집중 타이머 시작">${icon.play(13)}</button>` : "");

  function drawGrid() {
    const plans = S.plans || [];
    const timed = plans.filter((p) => p.start).sort((a, b) => toMin(a.start) - toMin(b.start));
    const startH = Math.min(6, timed.length ? Math.floor(toMin(timed[0].start) / 60) : 6);
    const nowM = toMin(nowTime());
    let hours = "";
    for (let h = startH; h < 24; h++) {
      const past = isPast || (isToday && (h + 1) * 60 <= nowM);
      const slot = `${pad(h)}:00`, cur = isToday && Math.floor(nowM / 60) === h;
      const editing = S.editSlot && S.editSlot.slice(0, 2) === pad(h);
      hours += editing
        ? `<div class="hour editing${cur ? " cur" : ""}"><span>${slot}</span><form class="slot-add" data-slot-form="${S.editSlot}" autocomplete="off">
            <input class="input slot-at" type="time" name="at" step="300" value="${S.editSlot}" aria-label="시작 시각 (5분 단위)">
            <input class="input" name="text" maxlength="200" placeholder="${S.editSlot}에 할 일" aria-label="${S.editSlot}에 할 일" autofocus>
            <select class="select" name="mins" aria-label="걸리는 시간">${[5, 10, 15, 20, 25, 30, 40, 45, 50, 60, 75, 90, 120, 150, 180].map((m) => `<option value="${m}" ${m === S.editMins ? "selected" : ""}>${hm(m)}</option>`).join("")}</select>
            ${prioSelect("priority", S.editPrio || "")}
            <button class="btn accent sm" type="submit">추가</button><button class="icon-btn sm" type="button" data-slot-close aria-label="닫기">${icon.x(14)}</button></form></div>`
        : `<div class="hour${past ? " past" : ""}${cur ? " cur" : ""}" data-h="${h}"><span>${slot}</span><button type="button" data-slot="${slot}" tabindex="-1">+ ${slot}에 추가</button></div>`;
    }
    // 겹치면 옆으로 나눠요
    const cols = [], placed = [];
    for (const p of timed) {
      const s = toMin(p.start), e = s + (p.mins || 30);
      let c = cols.findIndex((end) => end <= s);
      if (c < 0) { c = cols.length; cols.push(e); } else cols[c] = e;
      placed.push({ p, s, e, c });
    }
    const blocks = placed.map(({ p, s, e, c }) => {
      let n = 1;
      for (const y of placed) if (y.p !== p && y.s < e && s < y.e) n = Math.max(n, y.c + 1, c + 1);
      const top = ((s - startH * 60) / 60) * HOUR_PX + 1, h = Math.max(14, ((e - s) / 60) * HOUR_PX - 2), w = 100 / n;
      return `<div class="block ${status(p)}${h < 30 ? " thin" : ""}" data-p="${p.priority || ""}" style="top:${top}px;height:${h}px;left:calc(${c * w}% + ${c ? 3 : 0}px);right:auto;width:calc(${w}% - ${n > 1 ? 3 : 0}px)" data-id="${esc(p.id)}">
        <input type="checkbox" class="check" data-toggle="${esc(p.id)}" ${p.done ? "checked" : ""} aria-label="${esc(p.text)} 완료">
        <div class="txt"><span data-edit="${esc(p.id)}">${esc(p.text)}</span>${h >= 30 ? `<span class="when">${esc(p.start)}–${toTime(e)} · ${hm(e - s)}${p.focus_mins > 0 ? ` · 집중 ${hm(p.focus_mins)}` : ""}</span>` : ""}</div>
        ${playBtn(p)}
        <button class="icon-btn sm" type="button" data-later="${esc(p.id)}" aria-label="다음 날로 미루기" title="다음 날로 미루기">${icon.later(14)}</button>
        <button class="icon-btn sm" type="button" data-del="${esc(p.id)}" aria-label="삭제">${icon.x(14)}</button>
      </div>`;
    }).join("");
    const nowLine = isToday && nowM >= startH * 60 ? `<div class="now-line" style="top:${((nowM - startH * 60) / 60) * HOUR_PX}px" aria-hidden="true"></div>` : "";
    $("#dp-grid", el).innerHTML = hours + `<div class="blocks">${blocks}</div>` + nowLine;
    const f = $("[data-slot-form]", el);
    if (f) { const i = f.text; i.focus(); i.value = S.editText || ""; i.setSelectionRange(i.value.length, i.value.length); }
    $("#dp-tt-sum", el).textContent = timed.length ? `${timed.length}개 · ${hm(timed.reduce((a, p) => a + (p.mins || 0), 0))}` : "";
  }

  // 시간이 없는 하루 계획 = 그날 꼭 할 것
  function drawGoals() {
    const ul = $("#dp-goals", el);
    if (!S.plans) return;
    // 시간 정해진 계획도 같은 체크리스트에 (시각 순서 → 시간 없는 것)
    // 시간 있는 건 시각 순, 시간 없는 할 일은 우선순위 높은 것부터
    const list = S.plans.slice().sort((a, b) => (a.start || "99:99").localeCompare(b.start || "99:99") || (PRIO_RANK[b.priority] || 0) - (PRIO_RANK[a.priority] || 0) || (a.sort || 0) - (b.sort || 0)), done = list.filter((p) => p.done).length;
    $("#dp-goal-sum", el).innerHTML = list.length ? `<span class="chip ${done === list.length ? "good" : ""}">${done}/${list.length} 끝냄</span>` : "";
    ul.innerHTML = list.length ? list.map((p) => `
      <li class="todo ${p.done ? "done" : ""}" data-id="${esc(p.id)}" data-p="${p.priority || ""}">
        <input type="checkbox" class="check" data-toggle="${esc(p.id)}" ${p.done ? "checked" : ""} aria-label="${esc(p.text)} 끝냄">
        ${p.start ? `<span class="t-when">${esc(p.start)}${p.mins ? ` · ${hm(p.mins)}` : ""}</span>` : ""}<span class="txt" data-edit="${esc(p.id)}">${esc(p.text)}</span>
        ${prioPill(p)}${focusTag(p)}${playBtn(p)}
        <span class="acts"><button class="icon-btn sm" type="button" data-later="${esc(p.id)}" aria-label="다음 날로 미루기" title="다음 날로 미루기">${icon.later(14)}</button><button class="icon-btn sm danger" type="button" data-del="${esc(p.id)}" aria-label="삭제">${icon.x(14)}</button></span>
      </li>`).join("")
      : "";
  }
  function drawDiary() {
    const a = $("#dp-diary", el); if (!a || S.diary === undefined) return;
    const d = S.diary, m = d && MOODS.find((x) => x.v === d.mood);
    a.innerHTML = d ? `<span class="dd-top">${m ? `<span class="chip">${esc(m.label)}</span>` : ""}<span class="faint">${(d.body || "").length.toLocaleString()}자</span><span class="dd-go">이어 쓰기 ${icon.right(13)}</span></span><span class="dd-sn">${esc((d.body || "").replace(/\s+/g, " ").slice(0, 140)) || "기분만 남겼어요."}</span>`
      : `<span class="dd-top"><b>${isToday ? "오늘 일기 쓰기" : "이날 일기 쓰기"}</b><span class="dd-go">${icon.right(13)}</span></span><span class="dd-sn faint">기분과 한 줄이면 충분해요. 나만 볼 수 있어요.</span>`;
  }


  // 그날 한 공부: 숫자 넷 + 영어 블록 + 이날 쓴 노트
  function drawStudy() {
    const box = $("#dp-study", el);
    if (!box) return;
    const plans = S.plans || [], en = S.english;
    const focus = focusOf(S.logs), english = englishOf(en), study = studyMins({ focus, english });
    const sessions = S.logs.filter((l) => l.kind === "focus").length;
    const enBlocks = en ? Object.entries(en.blocks || {}).filter(([b, m]) => BLOCKS[b] && m > 0) : [];
    const enMax = Math.max(1, ...enBlocks.map(([, m]) => m));
    const stat = (k, v, s = "") => `<div class="cd-stat"><span>${k}</span><b>${v}</b>${s ? `<small>${s}</small>` : ""}</div>`;
    const doneN = plans.filter((p) => p.done).length;
    if (!plans.length && !S.logs.length && !en && !S.notes.length) { box.innerHTML = `<p class="empty">${isToday ? "오늘은 아직 남은 공부 기록이 없어요." : "이날은 남은 공부 기록이 없어요."}</p>`; return; }
    box.innerHTML = `
      <div class="cd-stats">
        ${stat("공부 시간", study ? hm(study) : "—", study ? "집중 + 영어" : "")}
        ${stat("집중", focus ? hm(focus) : "—", sessions ? `${sessions}번` : "")}
        ${stat("영어", english ? hm(english) : "—", en?.spoken ? `입 연 ${hm(en.spoken)}` : "")}
        ${stat("끝낸 일", plans.length ? `${doneN}/${plans.length}` : "—")}
      </div>
      ${en ? `<div class="cd-block"><h4>영어 <a class="faint cd-link" href="#/english/today/${day}">영어 페이지 ${icon.right(12)}</a></h4>
        ${enBlocks.length ? `<ul class="cd-en">${enBlocks.map(([b, m]) => `<li style="--c:${BLOCKS[b].color}"><span>${esc(BLOCKS[b].short)}</span><i><b style="width:${((m / enMax) * 100).toFixed(1)}%"></b></i><small>${hm(m)}</small></li>`).join("")}</ul>` : ""}
        ${en.sentence ? `<p class="cd-sentence" lang="en">“${esc(en.sentence)}”</p>` : ""}
        ${en.newwords || en.mistakes ? `<p class="faint cd-mini">새 단어 ${en.newwords} · 틀린 수 ${en.mistakes}</p>` : ""}</div>` : ""}
      ${S.notes.length ? `<div class="cd-block"><h4>이날 쓴 노트</h4><ul class="cd-list">${S.notes.map((n) => `<li>${icon.notes(12)}<a href="#/notes/${esc(n.id)}">${esc(n.title)}</a><small>${n.created ? "새로 씀" : "고침"}</small></li>`).join("")}</ul></div>` : ""}`;
  }

  // 하루 기록: 그날 계획·실행을 얼려 두는 사본 (자정이 지나면 자동으로도 저장돼요)
  function drawRecord() {
    const box = $("#dp-rec", el);
    if (!box) return;
    const r = S.record;
    box.innerHTML = `
      <p>${r ? `<b>하루 기록 ${r.score ?? "–"}점</b> · ${r.auto ? "자정 자동 저장" : "직접 저장"} ${r.saved_at ? stamp(r.saved_at) : ""}`
        : `<b>하루 기록</b> · ${isToday ? "저장하지 않아도 자정이 지나면 자동으로 저장돼요." : "아직 저장된 기록이 없어요."}`}</p>
      <button class="btn sm ${r ? "ghost" : "accent"}" type="button" id="dp-rec-save">${r ? "지금 상태로 다시 저장" : "하루 기록 저장"}</button>`;
    $("#dp-rec-save", box).addEventListener("click", async (e) => {
      const b = e.currentTarget; b.disabled = true; b.textContent = "저장하는 중…";
      try {
        const { record } = await api.saveRecord(day);
        S.record = record || S.record; toast("그날 기록을 저장했어요.");
        drawRecord(); changed("record");
      } catch (ex) { toast(ex.message, "err"); if (b.isConnected) { b.disabled = false; drawRecord(); } }
    });
  }

  // ---------- actions ----------
  async function toggle(id, done) {
    const p = S.plans.find((x) => x.id === id);
    if (!p) return;
    p.done = done ? 1 : 0; drawAll();
    try {
      await api.updatePlan(id, { done });
      if (done && isToday) {
        const { log } = await api.addLog({ day, at: nowTime(), text: `완료 · ${p.text}`, kind: "done" });
        S.logs.push(log); S.logs.sort((a, b) => a.at.localeCompare(b.at)); drawStudy();
      }
      changed("plans");
    } catch (e) { p.done = done ? 0 : 1; drawAll(); toast(e.message, "err"); }
  }
  function editInline(t, save) {
    const old = t.textContent;
    t.contentEditable = "true"; t.focus();
    document.getSelection().selectAllChildren(t);
    const finish = async (commit) => {
      t.contentEditable = "false";
      t.removeEventListener("keydown", onKey); t.removeEventListener("blur", onBlur);
      const v = t.textContent.trim();
      if (!commit || !v || v === old) { t.textContent = old; return; }
      try { await save(v); } catch (e) { t.textContent = old; toast(e.message, "err"); }
    };
    const onKey = (e) => { if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); finish(true); } if (e.key === "Escape") finish(false); };
    const onBlur = () => finish(true);
    t.addEventListener("keydown", onKey); t.addEventListener("blur", onBlur);
  }
  async function addPlan(b) {
    const { plan } = await api.addPlan({ scope: "day", period: key, ...b });
    S.plans.push(plan); drawAll(); changed("plans");
  }

  el.addEventListener("change", onElChange);
  el.addEventListener("click", onElClick);
  el.addEventListener("dblclick", onElDbl);
  function onElChange(e) {
    const t = e.target.closest("[data-toggle]");
    if (t && S.plans) toggle(t.dataset.toggle, t.checked);
    if (e.target.id === "dp-date" && e.target.value) ctx.go("#/calendar/" + e.target.value);
  }
  async function onElClick(e) {
    const slot = e.target.closest("[data-slot]");
    if (slot) { S.editSlot = slotAt(slot, e.clientY); S.editText = ""; drawGrid(); return; }
    const pr = e.target.closest("[data-prio]");
    if (pr) {
      const p = S.plans.find((x) => x.id === pr.dataset.prio); if (!p) return;
      const order = ["", ...PRIOS.map((x) => x.k)], nx = order[(order.indexOf(p.priority || "") + 1) % order.length] || null, old = p.priority;
      p.priority = nx; drawAll();
      try { await api.updatePlan(p.id, { priority: nx }); changed("plans"); } catch (ex) { p.priority = old; drawAll(); toast(ex.message, "err"); }
      return;
    }
    if (e.target.closest("[data-slot-close]")) { S.editSlot = null; drawGrid(); return; }
    const play = e.target.closest("[data-play]");
    if (play) { const p = S.plans.find((x) => x.id === play.dataset.play); if (p) ctx.timer?.startFor(p); return; }
    const del = e.target.closest("[data-del]");
    if (del) {
      const id = del.dataset.del, keep = S.plans;
      S.plans = S.plans.filter((p) => p.id !== id); drawAll();
      try { await api.deletePlan(id); changed("plans"); } catch (ex) { S.plans = keep; drawAll(); toast(ex.message, "err"); }
      return;
    }
    const later = e.target.closest("[data-later]");
    if (later) {
      const id = later.dataset.later;
      try { await api.updatePlan(id, { period: "D:" + ymd(addDays(date, 1)) }); S.plans = S.plans.filter((p) => p.id !== id); drawAll(); toast("다음 날로 미뤘어요."); changed("plans"); }
      catch (ex) { toast(ex.message, "err"); }
      return;
    }
  }
  function onElDbl(e) {
    const ed = e.target.closest("[data-edit]");
    if (ed) return editInline(ed, async (text) => { await api.updatePlan(ed.dataset.edit, { text }); const p = S.plans.find((x) => x.id === ed.dataset.edit); if (p) p.text = text; changed("plans"); });
  }

  $("#dp-goal-add", el).addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.currentTarget, text = f.text.value.trim();
    if (!text || !S.plans) return f.text.focus();
    try { await addPlan({ text, ...(f.priority?.value ? { priority: f.priority.value } : {}) }); f.text.value = ""; } catch (ex) { toast(ex.message, "err"); }
    f.text.focus();
  });
  el.addEventListener("submit", async (e) => {
    const f = e.target.closest("[data-slot-form]");
    if (!f) return;
    e.preventDefault();
    const text = f.text.value.trim(), start = /^\d{2}:\d{2}$/.test(f.at?.value || "") ? f.at.value : f.dataset.slotForm, mins = +f.mins.value, priority = f.priority?.value || null;
    if (!text || !S.plans) return f.text.focus();
    S.editMins = mins; S.editPrio = priority || "";
    try {
      await addPlan({ text, start, mins, ...(priority ? { priority } : {}) });
      // 끝난 시각에서 바로 이어서 적을 수 있게 열어 둬요 (5분 단위)
      const next = toMin(start) + mins;
      S.editSlot = next < 24 * 60 ? toTime(next) : null; S.editText = "";
      drawGrid();
    } catch (ex) { toast(ex.message, "err"); }
  });
  el.addEventListener("keydown", (e) => { if (e.key === "Escape" && e.target.closest("[data-slot-form]")) { S.editSlot = null; drawGrid(); } });

  // 마우스 위치 → 5분 단위 시각 ("+ 14:35에 추가")
  function slotAt(btn, y) {
    const row = btn.closest(".hour"), r = row.getBoundingClientRect(), h = +row.dataset.h;
    const m = Math.max(0, Math.min(55, Math.floor(((y - r.top) / r.height) * 60 / STEP) * STEP));
    return `${pad(h)}:${pad(m)}`;
  }
  el.addEventListener("pointermove", (e) => { const b = e.target.closest?.(".hour [data-slot]"); if (b) b.textContent = `+ ${slotAt(b, e.clientY)}에 추가`; });
  el.addEventListener("input", (e) => { if (e.target.matches("[data-slot-form] [name=text]")) S.editText = e.target.value; });

  const onChanged = (e) => { if (["logs", "plans"].includes(e.detail?.kind)) load(); };
  window.addEventListener("trio:changed", onChanged);
  const tick = setInterval(() => { if (isToday && S.plans) drawGrid(); }, 60_000);
  load();
  loadExtras();
  if (!future) loadTrend();
  const stopAic = mountCommand(el.querySelector("#dp-aic"), { day: () => day, onDone: () => changed("plans") });

  return () => {
    alive = false; stopAic?.();
    window.removeEventListener("trio:changed", onChanged);
    el.removeEventListener("change", onElChange);
    el.removeEventListener("click", onElClick);
    el.removeEventListener("dblclick", onElDbl);
    clearInterval(tick);
  };
}
