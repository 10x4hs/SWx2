// 그날 한 페이지 — 캘린더 오른쪽에 붙어요 (예전 "오늘" 화면 전부 + 그날 한 공부 + 하루 기록 저장).
// 할 일(시간 없는 목표) · 시간표 · 하루 점수 · 실행 기록 · 일기 · 그날 한 공부. 앞으로 올 날은 할 일 · 시간표만.
// 전부 나만 봐요. 할 일 옆 ▶ 를 누르면 집중 타이머가 그 할 일 이름으로 시작하고, 끝나면 그 할 일에 집중 시간이 쌓여요.
import { mountCommand } from "../ai-command.js";
import { whoAnswered } from "../ai-pick.js";
import { api } from "../api.js";
import {
  $, $$, esc, avatar, pad, hm, toMin, toTime, nowTime, ymd, parseYmd, addDays, today,
  DOW, isoWeek, dayOfYear, daysInYear, dayScore, pct, toast, focusOf, englishOf, studyMins, periodKey,
} from "../util.js";
import { MOODS } from "../diary.js";
import { openMenu, closeMenu } from "../ctxmenu.js";
import { askPush } from "../auto-focus.js";
import { icon } from "../icons.js";
import { BLOCKS } from "../english/data.js";
import { mountPlanClip, MOD } from "../plan-clip.js";
import { planUndo } from "../plan-undo.js"; // ⌘Z · ⌘⇧Z: 옮기기 · 길이 · 이름 · 끝냄 · 우선순위 · 미루기 · 지우기 · 추가 · 붙여넣기

const HOUR_PX = 252; // 한 시간 = 252px → 5분 = 21px = 글 한 줄. 언제나 실제 비율
const STEP = 5;     // 시간표를 누르거나 끌 때만 5분 칸 (적는 시각 · 길이는 1분 단위)
const DEFAULT_MINS = 60; // 새 계획의 기본 길이 — 바로 전에 넣은 길이를 따라가지 않아요
const LINE_H = 18;  // 그룹 안 한 줄 높이(px)
const ONE_H = 20;   // 모든 블록의 최소 높이 = 한 줄 (체크 + 이름). 1분 계획도 이만큼은 보여요
// 분 → 세로 위치(px) 표: Y[i] = 시간표 맨 위(m0 분)에서 i분 뒤의 위치 (1시간 = HOUR_PX, 늘이지 않아요)
function axis(m0) {
  const base = HOUR_PX / 60, Y = [0];
  for (let i = 0; i < 1440 - m0; i++) Y.push(Y[i] + base);
  return Y;
}
// 그룹을 접어 둔 것 (이 브라우저에만)
const FOLD_KEY = "dp-fold";
const loadFold = () => { try { return new Set(JSON.parse(localStorage.getItem(FOLD_KEY) || "[]")); } catch { return new Set(); } };
// 세로 위치(px) → 분 (늘어난 칸에서도 실제 시각)
function minuteAt(Y, y, m0) {
  let lo = 0, hi = Y.length - 1;
  if (y <= 0) return m0;
  if (y >= Y[hi]) return m0 + hi;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (Y[mid] <= y) lo = mid; else hi = mid; }
  return m0 + lo + (y - Y[lo]) / (Y[lo + 1] - Y[lo]);
}
const r2 = (v) => Math.round(v * 100) / 100;
// 못함 버튼 — 체크(끝냄) 옆의 빨간 ✕. 누르면 계획이 빨갛게 바뀌어요 (체크리스트도 같이 써요)
export const missBtn = (p) => `<button type="button" class="miss-btn" data-miss="${esc(p.id)}" aria-pressed="${p.missed ? "true" : "false"}" aria-label="${esc(p.text)} 못함" title="${p.missed ? "못함 되돌리기" : "못 했어요 (빨간색 표시)"}"><svg viewBox="0 0 12 12" width="8" height="8" aria-hidden="true"><path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></button>`;
// 우선순위 1~5순위 · 예상 시간 — public/js/prio.js (색은 styles.css 의 --p-*). 다른 화면이 여기서 PRIOS 를 가져가요
import { PRIOS, PRIO_RANK, prioSelect, prioPill, openPrioDrop, hoursPill, openHoursDrop, parseMins, MINS_HINT, prioLabel } from "../prio.js";
export { PRIOS };
// 끝 시각 글자 — 자정을 넘으면 "→ 00:10" (다음 날 시각)
const endLab = (e) => (e > 1440 ? `→ ${toTime(e - 1440)}` : toTime(e));
const span2 = (start, e) => (e > 1440 ? `${start} ${endLab(e)}` : `${start}–${toTime(e)}`);
const longDate = (d) => `${d.getMonth() + 1}월 ${d.getDate()}일 ${DOW[d.getDay()]}요일`;
function relDay(k, tk) {
  const n = Math.round((parseYmd(k) - parseYmd(tk)) / 864e5);
  return n === 0 ? "오늘" : n === 1 ? "내일" : n === -1 ? "어제" : n > 0 ? `${n}일 뒤` : `${-n}일 전`;
}
const stamp = (ms) => { const d = new Date(ms); return `${d.getMonth() + 1}월 ${d.getDate()}일 ${pad(d.getHours())}:${pad(d.getMinutes())}`; };

// el 안에 그날 페이지를 그려요. onChange(kind) = 달력 칸을 새로 그려야 할 때. 돌려주는 함수 = 정리(쓰던 일기 저장).
export function mountDay(el, ctx, day, { onChange, who: startWho } = {}) {
  const date = parseYmd(day), tk = ymd(today()), key = "D:" + day, prevDay = ymd(addDays(date, -1)), prevKey = "D:" + prevDay;
  const isToday = day === tk, isPast = day < tk, future = day > tk;
  const me = ctx.me;
  // 누구의 하루를 볼지. 친구 것은 그 사람이 open 했을 때만, 읽기 전용 (추가 · 고치기 · 끌기 없음)
  let who = startWho && ctx.users.some((u) => u.id === startWho) ? startWho : me.id; // 홈의 친구 차트에서 오면 그 친구로 시작 (보기만)
  const ro = () => who !== me.id;
  const S = { plans: null, spill: [], goals: null, diary: undefined, logs: [], english: null, record: null, notes: [], carry: 0, editSlot: null,
    sel: new Set(), hoverId: null, hoverMin: null, // 복사 · 붙여넣기 · 여러 개 고르기
    form: null, fold: loadFold(), pendingLoad: false, pendingDraw: false }; // form = 열린 추가 · 고치기 창의 칸 값 (다시 그려도 그대로) · fold = 접은 그룹
  let drag = null, lasso = null, justDragged = 0;
  // 글을 쓰는 중(추가 · 고치기 창, 이름 고치기)이거나 끄는 중이면 다시 그리지 않고 미뤄요 — 쓰던 게 날아가지 않게
  const busy = () => !!(drag || lasso || $("[data-slot-form]", el) || el.querySelector('[contenteditable="true"]'));
  function flush() {
    if (!alive || busy()) return;
    if (S.pendingLoad) { S.pendingLoad = false; S.pendingDraw = false; load(); }
    else if (S.pendingDraw) { S.pendingDraw = false; drawAll(); }
  } // 복사 · 붙여넣기: 고른 계획(Shift+클릭 · ⌘A) · 마우스를 올린 계획 · 시간표 위 시각
  const wKey = periodKey("week", date), mKey = periodKey("month", date), yKey = periodKey("year", date);
  const GOAL_KEY = { week: wKey, month: mKey, year: yKey }, GOAL_LAB = { week: "이번 주", month: "이번 달", year: "올해" };
  const wk = isoWeek(date);
  let alive = true;
  const changed = (kind) => onChange?.(kind);
  const pu = planUndo(ctx);
  const scroller = () => $("#dp-scroll", el); // 계획표만 따로 스크롤되는 칸
  const phone = () => matchMedia("(max-width: 720px)").matches;

  el.innerHTML = `
    <header class="cd-head">
      <div>
        <span class="cd-rel${isToday ? " now" : ""}">${relDay(day, tk)}</span>
        <h2 class="cd-date">${longDate(date)}</h2>
        <p class="dp-sub">${wk.w}주차 · 올해 ${dayOfYear(date)}/${daysInYear(date.getFullYear())}일째<span class="chip accent" id="dp-streak" hidden></span></p>
      </div>
      <div class="pager">
        <div class="who-switch dp-who" role="tablist" aria-label="누구의 하루를 볼까요">${ctx.users.map((u) => `<button type="button" role="tab" data-dpwho="${u.id}" aria-selected="${u.id === who}" style="--c:${esc(u.color)}" title="${esc(u.display_name)}${u.id !== me.id && u.plans_open === false ? " · 비공개" : ""}">${avatar(u, "sm")}${esc(u.username.toUpperCase())}</button>`).join("")}</div>
        <a class="icon-btn sm" href="#/calendar/${ymd(addDays(date, -1))}" aria-label="전날">${icon.left(16)}</a>
        <a class="icon-btn sm" href="#/calendar/${ymd(addDays(date, 1))}" aria-label="다음날">${icon.right(16)}</a>
        <label class="icon-btn sm dp-pick" aria-label="날짜 고르기">${icon.calendar(15)}<input type="date" id="dp-date" value="${day}"></label>
      </div>
    </header>
    <div id="dp-aic"></div>
    <div class="dp-ai-score" id="dp-ai-score" hidden></div>
    ${future ? `<p class="dp-note">앞으로 올 날이에요. 시간표를 미리 적어 두면 그날 홈 차트에 그대로 나와요.</p>` : ""}
    <!-- 그날 판은 AI 와 시간표만 (체크리스트 · 목표 · 점수 · 일기는 각자 페이지에서: #/checklist · #/goals · 홈 차트) -->
    <section class="cd-sec dp-tt" aria-labelledby="dp-tt-t">
      <div class="cd-sh"><h3 id="dp-tt-t">하루 계획표</h3><span class="row" style="gap:8px"><span class="faint" id="dp-tt-sum"></span><a class="faint dp-more" href="#/checklist/${day}">체크리스트 ›</a></span></div>
      <p class="dp-hint">빈 시각을 누르면 바로 적을 수 있어요. 시각 · 길이는 1분 단위로 고쳐도 돼요. Enter 추가 · Esc 닫기.</p>
      <div class="dp-allday" id="dp-allday" hidden></div>
      <div class="dp-scroll" id="dp-scroll"><div class="day-grid" id="dp-grid"></div></div>
      <div class="dp-selbar" id="dp-selbar" hidden></div>
    </section>`;

  // ---------- data ----------
  let loadSeq = 0; // 늦게 온 옛 답은 버려요 (마지막으로 부른 것만)
  async function load() {
    const my = ++loadSeq;
    try {
      const w = who;
      const [p, d, g, di] = await Promise.all([api.plans([key, prevKey], ro() ? who : undefined), api.calendarDay(day), Promise.resolve({ plans: [] }), future ? Promise.resolve({ diary: null }) : api.diary(day).catch(() => ({ diary: null }))]);
      if (!alive || w !== who || my !== loadSeq) return;
      S.closed = !!p.closed;
      // 전날 계획 중 자정을 넘는 것 → 이 날 00:00 부터 이어진 칸 (보기만 · 누르면 원래 계획)
      const all = p.plans || [];
      S.plans = all.filter((x) => x.period !== prevKey);
      S.spill = all.filter((x) => x.period === prevKey && x.start && toMin(x.start) + (x.mins || 30) > 1440);
      S.goals = g.plans || []; S.diary = di.diary;
      Object.assign(S, { logs: d.logs || [], english: d.english, record: d.record, notes: d.notes || [] });
      for (const id of [...S.sel]) if (!S.plans.some((x) => x.id === id)) S.sel.delete(id);
      if (busy()) S.pendingDraw = true; else drawAll();
    } catch (e) { if (alive && my === loadSeq) toast(e.message, "err"); }
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
  // 자정 AI 점수: 지난 날(내 하루)에 점수 · 한 줄 평 · 매긴 모델을 작게 (오늘은 아직 없고, 친구 하루엔 내 기록이 아니라서 안 보여요)
  function drawScore() {
    const box = $("#dp-ai-score", el); if (!box) return;
    const r = S.record;
    if (isToday || future || ro() || !r || r.ai_score == null) { box.hidden = true; return; }
    box.hidden = false;
    box.innerHTML = `<span class="dp-ais-n">${esc(r.ai_score)}</span><div class="dp-ais-b"><p class="dp-ais-k">${icon.spark(12)} AI 점수 · 자정에 매겼어요<span data-ai-model></span></p>${r.ai_note ? `<p class="dp-ais-t">${esc(r.ai_note)}</p>` : ""}</div>`;
    if (r.ai_model) whoAnswered(r.ai_model).then((w) => { const m = $("[data-ai-model]", box); if (m && w) m.textContent = ` · ${w.label}`; });
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
    const c = $("#dp-carry", el); if (!c) return;
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
    if (p.missed) return "fail";
    if (!p.start) return isPast ? "miss" : "";
    const end = toMin(p.start) + (p.mins || 0);
    return isPast || (isToday && end <= toMin(nowTime())) ? "miss" : "";
  }
  const focusTag = (p) => (p.focus_mins > 0 ? `<span class="dp-focus" title="이 할 일에 쌓인 집중 시간">집중 ${hm(p.focus_mins)}</span>` : "");
  const playBtn = (p) => (isToday && !p.done ? `<button class="icon-btn sm dp-play" type="button" data-play="${esc(p.id)}" aria-label="${esc(p.text)} 집중 시작" title="이 할 일로 집중 타이머 시작">${icon.play(13)}</button>` : "");

  function drawGrid() {
    const plans = S.plans || [];
    const timed = plans.filter((p) => p.start).sort((a, b) => toMin(a.start) - toMin(b.start));
    // 시간 없는 일(체크리스트)도 계획표 위에 한 줄로 — 종일 일정이 안 보인다는 헷갈림 방지
    const loose = plans.filter((p) => !p.start), ad = $("#dp-allday", el);
    if (ad) { ad.hidden = !loose.length; ad.innerHTML = loose.length ? `<span class="dp-ad-k">시간 없는 일</span>${loose.map((p) => `<a class="dp-ad ${p.done ? "done" : ""}" href="#/checklist/${day}" data-p="${esc(p.priority || "")}" title="체크리스트에서 보기">${esc(p.text)}</a>`).join("")}` : ""; }
    const startH = 0; // 시간표는 언제나 00:00–24:00 (처음엔 06:00 · 첫 계획 · 지금 근처로 스크롤해 둬요)
    const nowM = toMin(nowTime());
    const m0 = startH * 60;
    const Y = axis(m0), yAt = (m) => Y[Math.max(0, Math.min(1440, m) - m0)], PPM = HOUR_PX / 60;
    // 그릴 것: 어제에서 이어진 칸 · 그룹(같은 group_id 2개 이상) · 계획 블록 (길이와 상관없이 모두 같은 모양 · 체크 있음)
    // 자정을 넘는 계획은 e 가 1440 을 넘어요 (위치는 24:00 까지만). le = 겹침 계산용 끝 = 진짜 끝, 짧은 계획은 최소 높이가 닿는 데까지 (걸치면 나란히)
    const items = (S.spill || []).map((p) => { const e = toMin(p.start) + (p.mins || 30) - 1440; return { p, s: 0, e, le: Math.max(e, 1), cont: true }; });
    const byGrp = new Map();
    for (const p of timed) if (p.group_id) byGrp.set(p.group_id, [...(byGrp.get(p.group_id) || []), p]);
    for (const p of timed) {
      const s = toMin(p.start), e = s + Math.max(1, p.mins || 30);
      if (p.group_id && byGrp.get(p.group_id).length > 1) continue;
      items.push({ p, s, e, le: Math.max(e, s + ONE_H / PPM) }); // 최소 높이로 다음 계획에 걸치면 옆 칸으로 (위치는 그대로)
    }
    for (const [gid, ms] of byGrp) {
      if (ms.length < 2) continue;
      const s = Math.min(...ms.map((p) => toMin(p.start))), e = Math.max(...ms.map((p) => toMin(p.start) + (p.mins || 30)));
      items.push({ grp: gid, ms, s, e, le: e });
    }
    items.sort((a, b) => a.s - b.s || b.le - a.le);
    // 겹치면 옆으로 나눠요 (구글 캘린더처럼) — 서로 이어진 묶음마다 칸 수를 같이 쓰고, 오른쪽이 비면 넓게 펴요
    const placed = [];
    let group = [], groupEnd = -1;
    const flushCols = () => {
      const cols = [];
      for (const it of group) { let c = cols.findIndex((end) => end <= it.s); if (c < 0) { c = cols.length; cols.push(it.le); } else cols[c] = it.le; it.c = c; }
      for (const it of group) {
        it.n = cols.length; it.span = 1;
        while (it.c + it.span < it.n && !group.some((o) => o !== it && o.c === it.c + it.span && o.s < it.le && it.s < o.le)) it.span++;
      }
      placed.push(...group); group = [];
    };
    for (const it of items) { if (group.length && it.s >= groupEnd) flushCols(); group.push(it); groupEnd = Math.max(groupEnd, it.le); }
    if (group.length) flushCols();
    // 화면 위치: 언제나 실제 시각 위치 (시간 눈금 · 지금 선과 딱 맞게). 아주 짧은 계획이 최소 높이로 다음 계획에 걸치면 다음 계획이 위에 그려져요 — 밀어내지 않아요 (밀면 쌓여서 뒤 블록이 몇 분씩 어긋났어요)
    const hOf = (it) => it.grp ? Math.max(yAt(it.e) - yAt(it.s) - 2, (S.fold.has(it.grp) ? 1 : it.ms.length + 1) * LINE_H + 8) : it.cont ? Math.max(yAt(it.e) - yAt(0) - 2, ONE_H) : Math.max(yAt(it.e) - yAt(it.s) - 2, ONE_H);
    for (const it of placed) { it.h = hOf(it); it.top = (it.cont ? yAt(0) : yAt(it.s)) + 1; }
    // 1시간 칸 (늘이지 않아요 — 15분 눈금은 CSS 배경)
    let hours = "";
    for (let h = startH; h < 24; h++) {
      const past = isPast || (isToday && (h + 1) * 60 <= nowM);
      const slot = `${pad(h)}:00`, cur = isToday && Math.floor(nowM / 60) === h;
      hours += `<div class="hour${past ? " past" : ""}${cur ? " cur" : ""}" data-h="${h}"><span>${slot}</span><button type="button" data-slot="${slot}" tabindex="-1">+ ${slot}에 추가</button></div>`;
    }
    const pos = (top, h, c, n, span) => { const w = 100 / n; return `top:${r2(top)}px;height:${r2(h)}px;left:calc(${c * w}% + ${c ? 2 : 0}px);right:auto;width:calc(${w * span}% - ${n > 1 ? 2 : 0}px)`; };
    const sel = (id) => (S.sel.has(id) ? " sel" : "");
    const tipOf = (p, s, e) => `${span2(p.start, e)} · ${p.text}${p.priority ? ` · ${p.priority}` : ""}`;
    const blocks = placed.map((it) => {
      const { p, s, e, c, n, span, cont, top } = it;
      if (cont) { // 어제에서 이어진 칸: 체크 · 버튼 없이 보기만, 누르면 어제 하루로
        const h = it.h;
        return `<div class="block cont ${p.done ? "done" : p.missed ? "fail" : ""}${h < 30 ? " thin tiny" : h < 50 ? " thin" : ""}" data-p="${p.priority || ""}" data-cont="${esc(p.id)}" title="${esc(`어제 ${p.start}부터 · ${p.text} · 누르면 어제 계획표`)}" style="${pos(top, h, c, n, span)};opacity:.6;border-style:dashed">
          <div class="txt"><span class="when-i">← ${esc(p.start)}</span><span>${esc(p.text)}</span>${h >= 50 ? `<span class="when">어제 ${esc(p.start)}부터 · 00:00–${toTime(e)}</span>` : ""}</div></div>`;
      }
      if (it.grp) { // 그룹: 머리 줄(접기 · 시각 · 이름 · 풀기) + 묶인 계획들
        const fold = S.fold.has(it.grp), allSel = it.ms.every((x) => S.sel.has(x.id)), h = it.h;
        const done = it.ms.filter((x) => x.done).length;
        return `<div class="block grp${allSel ? " sel" : ""}${fold ? " folded" : ""}" data-grp="${esc(it.grp)}" style="${pos(top, h, c, n, span)}">
          <div class="grp-h"><button type="button" class="grp-fold" data-fold="${esc(it.grp)}" aria-expanded="${!fold}" aria-label="${fold ? "펼치기" : "접기"}">${fold ? "▸" : "▾"}</button><span class="when-i">${esc(toTime(s))}–${esc(endLab(e))}</span><span class="grp-n">${esc(it.ms[0].text)} 외 ${it.ms.length - 1}개</span><span class="grp-c">${done}/${it.ms.length}</span><button type="button" class="grp-un" data-ungroup="${esc(it.grp)}" title="그룹 풀기">풀기</button></div>
          ${fold ? "" : it.ms.map((x) => `<div class="grp-row ${status(x)}${sel(x.id)}" data-id="${esc(x.id)}" data-p="${x.priority || ""}" title="${esc(tipOf(x, toMin(x.start), toMin(x.start) + (x.mins || 30)))}"><input type="checkbox" class="check" data-toggle="${esc(x.id)}" ${x.done ? "checked" : ""} aria-label="${esc(x.text)} 완료"><span class="when-i">${esc(x.start)}</span><span class="mini-t" data-edit="${esc(x.id)}">${esc(x.text)}</span></div>`).join("")}
        </div>`;
      }
      const h = it.h, frac = span / n, hh = Math.round(h);
      // 크기에 맞춰: tiny(한 줄 · 작은 글씨) · thin(한 줄 + 시각) · narrow(좁으면 버튼은 숨기고 우클릭 메뉴로)
      const size = hh < 30 ? " thin tiny" : hh < 50 ? " thin" : "";
      const narrow = (frac < 0.5 ? " narrow xnarrow" : frac < 1 ? " narrow" : "") + (frac < 1 && c + span === n ? " edge-r" : "");
      return `<div class="block ${status(p)}${size}${narrow}${sel(p.id)}" data-p="${p.priority || ""}" data-s="${s}" data-e="${e}" title="${esc(tipOf(p, s, e))}" style="${pos(top, h, c, n, span)}" data-id="${esc(p.id)}">
        <input type="checkbox" class="check" data-toggle="${esc(p.id)}" ${p.done ? "checked" : ""} aria-label="${esc(p.text)} 완료">${missBtn(p)}
        <div class="txt"><span data-edit="${esc(p.id)}">${esc(p.text)}</span>${p.auto_focus && !p.done ? `<span class="af-tag" title="${esc(p.start)}에 집중 모드가 저절로 켜져요">◎ 자동 집중 ${hm(p.auto_focus)}</span>` : ""}${h < 50 ? `<span class="when-i">${esc(span2(p.start, e))} · ${hm(e - s)}</span>` : ""}${h >= 50 ? `<span class="when">${esc(span2(p.start, e))} · ${hm(e - s)}${p.focus_mins > 0 ? ` · 집중 ${hm(p.focus_mins)}` : ""}</span>` : ""}</div>
        ${playBtn(p)}
        <button class="icon-btn sm" type="button" data-later="${esc(p.id)}" aria-label="다음 날로 미루기" title="다음 날로 미루기">${icon.later(14)}</button>
        <button class="icon-btn sm" type="button" data-del="${esc(p.id)}" aria-label="삭제">${icon.x(14)}</button>
        <i class="bk-rs top" data-rs="top" title="끌어서 시작 시각 바꾸기" aria-hidden="true"></i><i class="bk-rs bot" data-rs="bot" title="끌어서 길이 바꾸기" aria-hidden="true"></i>
      </div>`;
    }).join("");
    // 추가 창: 칸을 늘리지 않고 누른 시각 위치에 떠요 (블록 위로)
    // 추가 창 · 고치기 창(우클릭 → 편집)은 같은 모양. 고칠 땐 값이 채워지고 버튼이 '저장'. 적던 값(S.form)은 다시 그려도 그대로
    const ed = S.editId ? plans.find((x) => x.id === S.editId) : null;
    const F = S.form || {};
    const MINS = [1, 2, 3, 5, 10, 15, 20, 25, 30, 40, 45, 50, 60, 75, 90, 120, 150, 180, 240];
    const mins0 = ed ? ed.mins || 30 : DEFAULT_MINS, minsList = MINS.includes(mins0) ? MINS : [...MINS, mins0].sort((a, b) => a - b);
    const minsSel = F.mins ?? String(mins0), custom = minsSel === "custom";
    const at0 = F.at || S.editSlot, text0 = F.text ?? (ed ? ed.text : ""), prio0 = F.priority ?? (ed ? ed.priority || "" : S.editPrio || "");
    const pop = S.editSlot ? `<form class="slot-add slot-pop${ed ? " editing" : ""}" data-slot-form="${S.editSlot}" ${ed ? `data-edit-id="${esc(ed.id)}"` : ""} autocomplete="off" style="top:${r2(Math.max(0, yAt(toMin(S.editSlot)) + 2))}px">
        ${ed ? `<span class="sp-t">계획 고치기</span>` : ""}
        <input class="input slot-at" type="time" name="at" step="60" value="${esc(at0)}" aria-label="시작 시각 (1분 단위)">
        <input class="input" name="text" maxlength="200" placeholder="${esc(at0)}에 할 일" aria-label="할 일" value="${esc(text0)}" autofocus>
        <select class="select" name="mins" aria-label="걸리는 시간"${custom ? " hidden" : ""}>${minsList.map((m) => `<option value="${m}" ${String(m) === minsSel ? "selected" : ""}>${hm(m)}</option>`).join("")}<option value="custom"${custom ? " selected" : ""}>직접 입력…</option></select><input class="input slot-mins" name="mins_text" placeholder="${MINS_HINT}" aria-label="걸리는 시간 직접 입력" autocomplete="off" value="${esc(F.mins_text || "")}"${custom ? "" : " hidden"}>
        ${prioSelect("priority", prio0)}
        <button class="btn accent sm" type="submit">${ed ? "저장" : "추가"}</button><button class="icon-btn sm" type="button" data-slot-close aria-label="닫기">${icon.x(14)}</button></form>` : "";
    const nowLine = isToday && nowM >= startH * 60 ? `<div class="now-line" style="top:${r2(yAt(nowM))}px" aria-hidden="true"></div>` : "";
    // 폰: 추가 · 고치기 창은 시간표 위가 아니라 화면 아래에서 올라오는 시트로 (손가락 · 키보드에 안 가려지게)
    el.classList.toggle("ro", ro());
    const u = ctx.users.find((x) => x.id === who);
    const hintEl = $(".dp-hint", el);
    if (hintEl) hintEl.textContent = ro() ? (S.closed ? `${u?.display_name || "친구"} 님은 하루 계획표를 공개하지 않았어요 (not open).` : `${u?.display_name || "친구"} 님의 하루 계획표예요 · 보기만 할 수 있어요.`) : `빈 시각을 누르면 바로 적을 수 있어요. 시각 · 길이는 1분 단위로 고쳐도 돼요. Enter 추가 · Esc 닫기.${matchMedia("(hover: hover) and (pointer: fine)").matches ? ` 계획에 마우스를 대고 ${MOD}C · 붙일 시각에 대고 ${MOD}V (Shift+클릭 여러 개 · ${MOD}A 전체).` : ""}`;
    if (ro()) { S.editSlot = null; S.editId = null; }
    const sheet = phone();
    const fa = document.activeElement, focusName = fa?.closest?.("[data-slot-form]") ? fa.name : null; // 다시 그린 뒤에도 쓰던 칸에 커서
    $("#dp-grid", el).innerHTML = hours + `<div class="blocks">${blocks}</div>` + nowLine + (sheet ? "" : pop);
    let host = $("#dp-sheet", el);
    if (sheet && pop) {
      // <dialog> 맨 위층에 띄워요 — 유리 카드(backdrop-filter) 안에선 position: fixed 가 화면 기준이 안 돼요
      if (!host) {
        host = document.createElement("dialog"); host.id = "dp-sheet"; el.append(host);
        host.addEventListener("cancel", (e) => { e.preventDefault(); S.editSlot = null; S.editId = null; S.form = null; drawGrid(); });
      }
      host.innerHTML = `<div class="sheet-back" data-slot-close></div>` + pop.replace('class="slot-add slot-pop', 'class="slot-add slot-pop slot-sheet');
      if (!host.open) host.showModal();
    } else if (host) { host.open && host.close(); host.remove(); }
    // 처음 열 때는 지금 시각(오늘) 또는 첫 계획 근처로 계획표 칸만 스크롤해 둬요
    if (!S.scrolled) {
      S.scrolled = true;
      const at = isToday ? nowM - 60 : timed.length ? toMin(timed[0].start) - 30 : 6 * 60;
      scroller().scrollTop = Math.max(0, yAt(at));
    }
    S.axis = { m0, Y }; // 끌기 · 빈 칸 누르기가 같은 위치 표로 시각을 읽어요
    const f = $("[data-slot-form]", el);
    if (f) { const i = (focusName && f.elements[focusName]) || f.text; i.focus({ preventScroll: true }); if (i === f.text) i.setSelectionRange(i.value.length, i.value.length); }
    drawSelBar();
    if (!S.editSlot) queueMicrotask(flush); // 창이 닫혔으면 미뤄 둔 다시 불러오기 · 다시 그리기
    $("#dp-tt-sum", el).textContent = timed.length ? `${timed.length}개 · ${hm(timed.reduce((a, p) => a + (p.mins || 0), 0))}` : "";
  }

  // 시간이 없는 하루 계획 = 그날 꼭 할 것
  function drawGoals() {
    const ul = $("#dp-goals", el);
    if (!ul || !S.plans) return;
    // 시간 정해진 계획도 같은 체크리스트에 (시각 순서 → 시간 없는 것)
    // 시간 있는 건 시각 순, 시간 없는 할 일은 우선순위 높은 것부터
    const list = S.plans.slice().sort((a, b) => (a.start || "99:99").localeCompare(b.start || "99:99") || (PRIO_RANK[b.priority] || 0) - (PRIO_RANK[a.priority] || 0) || (a.sort || 0) - (b.sort || 0)), done = list.filter((p) => p.done).length;
    $("#dp-goal-sum", el).innerHTML = list.length ? `<span class="chip ${done === list.length ? "good" : ""}">${done}/${list.length} 끝냄</span>` : "";
    ul.innerHTML = list.length ? list.map((p) => `
      <li class="todo ${p.done ? "done" : ""}" data-id="${esc(p.id)}" data-p="${p.priority || ""}">
        <input type="checkbox" class="check" data-toggle="${esc(p.id)}" ${p.done ? "checked" : ""} aria-label="${esc(p.text)} 끝냄">
        ${p.start ? `<span class="t-when">${esc(p.start)}${p.mins ? ` · ${hm(p.mins)}` : ""}</span>` : ""}<span class="txt" data-edit="${esc(p.id)}">${esc(p.text)}</span>
        ${prioPill(p)}${p.start ? "" : hoursPill(p)}${focusTag(p)}${playBtn(p)}
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
    const wasMissed = p.missed;
    p.done = done ? 1 : 0; if (done) p.missed = 0; drawAll();
    try {
      await api.updatePlan(id, { done });
      let logId = null;
      if (done && isToday) {
        const { log } = await api.addLog({ day, at: nowTime(), text: `완료 · ${p.text}`, kind: "done" });
        logId = log?.id || null;
        S.logs.push(log); S.logs.sort((a, b) => a.at.localeCompare(b.at)); drawStudy();
      }
      // 되돌리면 같이 적힌 '완료' 실행 기록도 지워요
      pu.patched(id, { done: !done, missed: wasMissed }, { done, missed: done ? 0 : wasMissed }, done ? "끝냄" : "끝냄 취소", { undo: () => (logId ? api.deleteLog(logId).catch(() => {}) : null), redo: () => { logId = null; } });
      changed("plans");
    } catch (e) { p.done = done ? 0 : 1; p.missed = wasMissed; drawAll(); toast(e.message, "err"); }
  }
  // 못함 표시 켜기/끄기 — 켜면 끝냄은 꺼져요
  async function setMissed(id, on) {
    const p = S.plans.find((x) => x.id === id); if (!p) return;
    const old = { done: p.done, missed: p.missed };
    p.missed = on ? 1 : 0; if (on) p.done = 0; drawAll();
    try { await api.updatePlan(id, { missed: on }); pu.patched(id, old, { done: on ? 0 : old.done, missed: on }, on ? "못함" : "못함 취소"); changed("plans"); }
    catch (e) { Object.assign(p, old); drawAll(); toast(e.message, "err"); }
  }
  function editInline(t, save) {
    const old = t.textContent;
    t.contentEditable = "true"; t.focus();
    document.getSelection().selectAllChildren(t);
    const finish = async (commit) => {
      t.contentEditable = "false";
      t.removeEventListener("keydown", onKey); t.removeEventListener("blur", onBlur);
      const v = t.textContent.trim();
      if (!commit || !v || v === old) { t.textContent = old; flush(); return; }
      try { await save(v); } catch (e) { t.textContent = old; toast(e.message, "err"); }
      flush();
    };
    const onKey = (e) => { if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); finish(true); } if (e.key === "Escape") finish(false); };
    const onBlur = () => finish(true);
    t.addEventListener("keydown", onKey); t.addEventListener("blur", onBlur);
  }
  async function addPlan(b) {
    const { plan } = await api.addPlan({ scope: "day", period: key, ...b });
    pu.added([plan], "계획 추가");
    S.plans.push(plan); drawAll(); changed("plans");
  }

  el.addEventListener("change", onElChange);
  el.addEventListener("click", onElClick);
  el.addEventListener("dblclick", onElDbl);
  function onElChange(e) {
    const t = e.target.closest("[data-toggle]");
    if (t && S.plans) { if (ro()) { t.checked = !t.checked; return; } toggle(t.dataset.toggle, t.checked); }
    if (e.target.id === "dp-date" && e.target.value) ctx.go("#/calendar/" + e.target.value);
    // 계획 창의 시간에서 "직접 입력…" 을 고르면 그 자리에 입력칸이 열려요
    const f = e.target.name === "mins" && e.target.closest("[data-slot-form]");
    if (f && f.mins.value === "custom") { f.mins.hidden = true; f.mins_text.hidden = false; f.mins_text.focus(); }
    if (e.target.matches("#dp-selbar select")) { const v = e.target.value; e.target.value = ""; batch("prio", v || null); } // 고른 것 우선순위
  }
  // 친구 계획표: 블록을 누르면 상세 카드 (이름 · 시각 · 길이 · 우선순위 · 끝냄/못함 · 쌓인 집중 시간)
  function showPlanCard(p, at) {
    closeMenu();
    const u = ctx.users.find((x) => x.id === who);
    const end = endLab(toMin(p.start) + (p.mins || 30));
    const state = p.done ? "끝냄" : p.missed ? "못함" : isPast ? "안 함" : "예정";
    openMenu(at, {
      title: `${u?.display_name || ""} · ${p.start}–${end}`,
      items: [
        { k: "text", label: p.text, hint: hm(p.mins || 30) },
        { k: "state", label: state + (p.priority ? ` · ${prioLabel(p.priority)}순위` : ""), hint: p.focus_mins > 0 ? `집중 ${hm(p.focus_mins)}` : "" },
      ],
      onPick: () => {},
    });
  }
  async function onElClick(e) {
    const cb = e.target.closest("#dp-grid [data-cont]");
    if (cb) { ctx.go(`#/calendar/${prevDay}${ro() ? `/u/${who}` : ""}`); return; } // 어제에서 이어진 칸 → 원래 계획이 있는 어제 계획표
    // Shift · ⌘(Ctrl)+클릭 = 고르기에 넣고 빼기 (노션처럼)
    const sb = !ro() && (e.shiftKey || e.metaKey || e.ctrlKey) && e.target.closest("#dp-grid [data-id]");
    if (sb && !e.target.closest("button, input, select, a")) { e.preventDefault(); const id = sb.dataset.id; S.sel.has(id) ? S.sel.delete(id) : S.sel.add(id); drawSelBar(); return; }
    // 그냥 클릭 = 그 블록 하나만 고르기 (다시 누르면 풀려요). 체크 · 버튼 · 이름 고치는 중엔 그대로
    const one = !ro() && !e.shiftKey && !e.metaKey && !e.ctrlKey && e.target.closest("#dp-grid .block[data-id]:not(.cont), #dp-grid .grp-row[data-id]");
    if (one && !e.target.closest("button, input, select, a, [contenteditable], [data-toggle], [data-miss], [data-play], [data-prio], [data-fold], [data-ungroup]")) {
      const id = one.dataset.id, only = S.sel.size === 1 && S.sel.has(id);
      S.sel = only ? new Set() : new Set([id]); drawSelBar(); return;
    }
    const fold = e.target.closest("[data-fold]");
    if (fold) { const g = fold.dataset.fold; S.fold.has(g) ? S.fold.delete(g) : S.fold.add(g); try { localStorage.setItem(FOLD_KEY, JSON.stringify([...S.fold].slice(-200))); } catch {} drawGrid(); return; }
    const ug = e.target.closest("[data-ungroup]");
    if (ug && S.plans) { batch("ungroup", null, S.plans.filter((p) => p.group_id === ug.dataset.ungroup).map((p) => p.id)); return; }
    const sbar = e.target.closest("[data-sb]");
    if (sbar) { const op = sbar.dataset.sb, n = Math.max(1, Math.min(720, Math.round(+($("#dp-sb-min", el)?.value) || 15))); if (op === "clear") { S.sel.clear(); drawSelBar(); } else batch(op, op === "fwd" ? n : op === "back" ? -n : null); return; }
    const wb = e.target.closest("[data-dpwho]");
    if (wb) { if (wb.dataset.dpwho === who) return; who = wb.dataset.dpwho; S.sel.clear(); $$("[data-dpwho]", el).forEach((b) => b.setAttribute("aria-selected", String(b.dataset.dpwho === who))); S.plans = null; S.closed = false; S.editSlot = null; S.editId = null; drawGrid(); load(); return; }
    if (ro()) { const b = e.target.closest("#dp-grid .block"); const p = b && S.plans?.find((x) => x.id === b.dataset.id); if (p) showPlanCard(p, e); return; } // 친구 계획표는 보기만 · 누르면 상세
    const mb = e.target.closest("[data-miss]");
    if (mb && S.plans) { const p = S.plans.find((x) => x.id === mb.dataset.miss); if (p) setMissed(p.id, !p.missed); return; }
    const slot = e.target.closest("[data-slot]");
    if (slot) { if (S.sel.size) S.sel.clear(); S.editSlot = slotAt(slot, e.clientY); S.form = null; S.editId = null; drawGrid(); return; }
    const pr = e.target.closest("[data-prio]");
    if (pr) { // 아래로 펼쳐지는 1~5순위 고르기
      const p = S.plans.find((x) => x.id === pr.dataset.prio); if (!p) return;
      openPrioDrop(pr, p.priority || "", async (v) => {
        const nx = v || null, old = p.priority; if (nx === (old || null)) return;
        p.priority = nx; drawAll();
        try { await api.updatePlan(p.id, { priority: nx }); pu.patched(p.id, { priority: old }, { priority: nx }, "우선순위"); changed("plans"); } catch (ex) { p.priority = old; drawAll(); toast(ex.message, "err"); }
      });
      return;
    }
    const hb = e.target.closest("[data-hours]");
    if (hb) { // 예상 시간 (시각 없는 할 일만)
      const p = S.plans.find((x) => x.id === hb.dataset.hours); if (!p) return;
      openHoursDrop(hb, p.mins || null, async (m) => {
        const old = p.mins; if (m === (old || null)) return;
        p.mins = m; drawAll();
        try { await api.updatePlan(p.id, { mins: m }); pu.patched(p.id, { mins: old }, { mins: m }, "예상 시간"); changed("plans"); } catch (ex) { p.mins = old; drawAll(); toast(ex.message, "err"); }
      });
      return;
    }
    if (e.target.closest("[data-slot-close]")) { S.editSlot = null; S.editId = null; S.form = null; drawGrid(); return; }
    const play = e.target.closest("[data-play]");
    if (play) { const p = S.plans.find((x) => x.id === play.dataset.play); if (p) ctx.timer?.startFor(p); return; }
    const del = e.target.closest("[data-del]");
    if (del) {
      const id = del.dataset.del, keep = S.plans, gone = S.plans.find((p) => p.id === id);
      S.plans = S.plans.filter((p) => p.id !== id); drawAll();
      try { await api.deletePlan(id); if (gone) pu.deleted(gone, "계획 지우기"); changed("plans"); } catch (ex) { S.plans = keep; drawAll(); toast(ex.message, "err"); }
      return;
    }
    const later = e.target.closest("[data-later]");
    if (later) {
      const id = later.dataset.later, lp = S.plans.find((p) => p.id === id), next = "D:" + ymd(addDays(date, 1));
      try { await api.updatePlan(id, { period: next }); pu.patched(id, { period: key, missed: lp?.missed }, { period: next, missed: 0 }, "다음 날로 미루기"); S.plans = S.plans.filter((p) => p.id !== id); drawAll(); toast("다음 날로 미뤘어요."); changed("plans"); }
      catch (ex) { toast(ex.message, "err"); }
      return;
    }
  }
  function onElDbl(e) {
    if (ro()) return;
    // 블록을 누르면 끌기용으로 포인터를 잡아서(setPointerCapture) dblclick 이 블록에 와요 — 누른 자리의 이름 칸을 직접 찾아요
    const ed = e.target.closest("[data-edit]") || document.elementFromPoint(e.clientX, e.clientY)?.closest?.("#dp-grid [data-edit]");
    if (ed) return editInline(ed, async (text) => { const p = S.plans.find((x) => x.id === ed.dataset.edit), old = p?.text; await api.updatePlan(ed.dataset.edit, { text }); if (p) { pu.patched(p.id, { text: old }, { text }, "이름 고치기"); p.text = text; } changed("plans"); });
  }

  $("#dp-goal-add", el)?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.currentTarget, text = f.text.value.trim();
    if (!text || !S.plans) return f.text.focus();
    if (mins === null) { toast(`시간을 못 읽었어요. ${MINS_HINT}`, "err"); f.mins_text.focus(); f.mins_text.select(); return; }
    try { await addPlan({ text, ...(f.priority?.value ? { priority: f.priority.value } : {}) }); f.text.value = ""; } catch (ex) { toast(ex.message, "err"); }
    f.text.focus();
  });
  el.addEventListener("submit", async (e) => {
    const f = e.target.closest("[data-slot-form]");
    if (!f) return;
    e.preventDefault();
    const text = f.text.value.trim(), start = /^\d{2}:\d{2}$/.test(f.at?.value || "") ? f.at.value : f.dataset.slotForm, mins = f.mins.value === "custom" ? parseMins(f.mins_text.value) : +f.mins.value, priority = f.priority?.value || null;
    if (!text || !S.plans) return f.text.focus();
    if (!mins) { toast(`시간을 못 읽었어요. ${MINS_HINT}`, "err"); f.mins_text.focus(); return; }
    if (f.dataset.editId) { // 우클릭 → 편집 → 저장 — 바뀐 칸만 보내요 (안 건드린 칸이 그 사이 다른 곳에서 바뀌었어도 덮지 않게)
      const p = S.plans.find((x) => x.id === f.dataset.editId); if (!p) return;
      const old = { text: p.text, start: p.start, mins: p.mins, priority: p.priority }, shown = { ...old, mins: p.mins || 30, priority: p.priority || null };
      const ch = Object.fromEntries(Object.entries({ text, start, mins, priority }).filter(([k, v]) => (shown[k] ?? null) !== (v ?? null)));
      S.editSlot = null; S.editId = null; S.form = null;
      if (!Object.keys(ch).length) { drawAll(); return; }
      Object.assign(p, ch); drawAll();
      try { await api.updatePlan(p.id, ch); pu.patched(p.id, old, ch, "계획 고치기"); changed("plans"); toast("계획을 고쳤어요."); }
      catch (ex) { Object.assign(p, old); drawAll(); toast(ex.message, "err"); }
      return;
    }
    S.editPrio = priority || "";
    try {
      await addPlan({ text, start, mins, ...(priority ? { priority } : {}) });
      // 끝난 시각에서 바로 이어서 적을 수 있게 열어 둬요 (5분 단위)
      const next = toMin(start) + mins;
      S.editSlot = next < 24 * 60 ? toTime(next) : null; S.form = null;
      drawGrid();
    } catch (ex) { toast(ex.message, "err"); }
  });
  el.addEventListener("keydown", (e) => { if (e.key === "Escape" && e.target.closest("[data-slot-form]")) { S.editSlot = null; S.editId = null; S.form = null; drawGrid(); } });
  // 우클릭 → 편집 · 끝냄 · 우선순위 · 다음 날로 · 삭제
  // 자동 집중 켜기 · 끄기 · 분 바꾸기 (우클릭 메뉴에서). 화면 먼저 바꾸고, 실패하면 되돌려요
  async function setFocus(p, mins) {
    const old = p.auto_focus ?? null; if (old === mins) return;
    p.auto_focus = mins; drawAll();
    if (mins && !old) askPush(); // 알림 허락은 누른 순간에 물어야 해요
    try { await api.updatePlan(p.id, { auto_focus: mins }); pu.patched(p.id, { auto_focus: old }, { auto_focus: mins }, "자동 집중"); changed("plans"); }
    catch (ex) { p.auto_focus = old; drawAll(); toast(ex.message, "err"); }
  }
  el.addEventListener("contextmenu", (e) => {
    if (ro()) return;
    const b = e.target.closest("#dp-grid [data-id]"); if (!b) return;
    const p = S.plans?.find((x) => x.id === b.dataset.id); if (!p) return;
    openMenu(e, {
      title: `${span2(p.start, toMin(p.start) + (p.mins || 30))} · ${p.text}`,
      items: [{ k: "edit", label: "편집", hint: "이름 · 시각 · 길이" }, { k: "done", label: p.done ? "끝냄 되돌리기" : "끝냄" }, { k: "miss", label: p.missed ? "못함 되돌리기" : "못함", danger: !p.missed }, { k: "prio", prio: p.priority || "" }, ...(p.start && !p.done ? [{ sep: true }, { k: "focus", on: !!p.auto_focus, start: p.start, mins: p.auto_focus, max: p.mins || 30, onFocus: ({ on, mins }) => setFocus(p, on ? mins : null) }] : []), { sep: true }, { k: "later", label: "다음 날로 미루기" }, { k: "del", label: "삭제", danger: true }],
      onPick: async (k, v) => {
        if (k === "edit") { S.editId = p.id; S.editSlot = p.start; S.form = null; drawGrid(); return; }
        if (k === "done") return toggle(p.id, !p.done);
        if (k === "miss") return setMissed(p.id, !p.missed);
        if (k === "prio") { const old = p.priority; p.priority = v || null; drawAll(); try { await api.updatePlan(p.id, { priority: p.priority }); pu.patched(p.id, { priority: old }, { priority: p.priority }, "우선순위"); changed("plans"); } catch (ex) { p.priority = old; drawAll(); toast(ex.message, "err"); } return; }
        if (k === "later") { const next = "D:" + ymd(addDays(date, 1)); try { await api.updatePlan(p.id, { period: next }); pu.patched(p.id, { period: key, missed: p.missed }, { period: next, missed: 0 }, "다음 날로 미루기"); S.plans = S.plans.filter((x) => x.id !== p.id); drawAll(); toast("다음 날로 미뤘어요."); changed("plans"); } catch (ex) { toast(ex.message, "err"); } return; }
        if (k === "del") { const keep = S.plans; S.plans = S.plans.filter((x) => x.id !== p.id); drawAll(); try { await api.deletePlan(p.id); pu.deleted(p, "계획 지우기"); changed("plans"); toast(`삭제했어요 · ${MOD}Z 되돌리기`); } catch (ex) { S.plans = keep; drawAll(); toast(ex.message, "err"); } }
      },
    });
  });

  // ---------- 블록 끌기: 가운데를 잡으면 옮기기, 위·아래 모서리를 잡으면 늘리기/줄이기 (5분 단위) ----------
  const axY = (m) => S.axis.Y[Math.max(0, Math.min(1440, m) - S.axis.m0)];
  const edgeOf = (b, y) => { const r = b.getBoundingClientRect(), k = Math.min(8, r.height / 4); return y - r.top <= k ? "top" : r.bottom - y <= k ? "bot" : "move"; };
  // 가장자리에 올리면 커서를 위아래 화살표로
  el.addEventListener("mousemove", (e) => { const b = e.target.closest?.("#dp-grid .block[data-id]"); if (!b || drag) return; b.style.cursor = e.target.closest("button, input") ? "" : edgeOf(b, e.clientY) === "move" ? "" : "ns-resize"; });
  // 폰(터치): 끌기 대신 꾹 누르면(0.45초) 우클릭과 같은 메뉴. 손가락이 움직이면 스크롤로 보고 취소
  let press = null;
  const cancelPress = () => {
    if (press?.fired) { // 손을 뗄 때 생기는 click 이 방금 뜬 메뉴 항목을 누르지 않게 한 번 막아요
      const stop = (ev) => { ev.stopPropagation(); ev.preventDefault(); };
      window.addEventListener("click", stop, { capture: true, once: true }); setTimeout(() => window.removeEventListener("click", stop, true), 400);
    }
    if (press) { clearTimeout(press.t); press = null; }
  };
  el.addEventListener("pointerdown", (e) => {
    if (e.pointerType !== "touch" || ro()) return;
    const b = e.target.closest?.("#dp-grid .block:not(.cont)"); if (!b || e.target.closest("button, input, select, a")) return;
    const { clientX, clientY } = e;
    press = { x: clientX, y: clientY, t: setTimeout(() => {
      press = { fired: true }; navigator.vibrate?.(10);
      b.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX, clientY }));
    }, 450) };
  });
  el.addEventListener("pointermove", (e) => { if (press && !press.fired && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 8) cancelPress(); });
  ["pointerup", "pointercancel"].forEach((t) => window.addEventListener(t, cancelPress));
  el.addEventListener("pointerdown", (e) => {
    const b = e.target.closest?.("#dp-grid .block[data-id]:not(.in-pop)"); if (!b || e.button !== 0 || e.pointerType === "touch" || ro()) return;
    if (e.target.closest("button, input, select, a, [data-edit].editing") || e.shiftKey || e.metaKey || e.ctrlKey) return;
    const mode = edgeOf(b, e.clientY); // 위·아래 가장자리 8px 안이면 길이 조절, 아니면 옮기기
    drag = { b, id: b.dataset.id, mode, y0: e.clientY, sc0: scroller().scrollTop, s: +b.dataset.s, e: +b.dataset.e, ns: +b.dataset.s, ne: +b.dataset.e, moved: false };
    // 여러 개를 골라 둔 상태에서 그중 하나를 잡아 옮기면 고른 것 전부 같이 움직여요
    if (mode === "move" && S.sel.size > 1 && S.sel.has(drag.id)) drag.mates = $$("#dp-grid .block[data-id]:not(.in-pop):not(.cont)", el).filter((x) => x !== b && S.sel.has(x.dataset.id) && x.dataset.s !== "").map((x) => ({ b: x, id: x.dataset.id, s: +x.dataset.s, e: +x.dataset.e }));
    b.setPointerCapture?.(e.pointerId);
  });
  el.addEventListener("pointermove", (e) => {
    if (!drag) return;
    // 계획표 칸 위 · 아래 끝 가까이 끌면 칸이 저절로 스크롤돼요 (페이지는 그대로)
    const sc = scroller(), r = sc.getBoundingClientRect();
    if (e.clientY < r.top + 36) sc.scrollTop -= 14; else if (e.clientY > r.bottom - 36) sc.scrollTop += 14;
    // 잡은 쪽(시작 · 끝) 자리 + 움직인 px → 분. 늘어난 칸에서도 실제 시각으로, 5분 단위
    const dy = e.clientY - drag.y0 + sc.scrollTop - drag.sc0;
    const from = drag.mode === "bot" ? Math.min(1440, drag.e) : drag.s;
    const d = Math.round((minuteAt(S.axis.Y, axY(from) + dy, S.axis.m0) - from) / STEP) * STEP;
    if (!drag.moved && Math.abs(e.clientY - drag.y0) < 4) return;
    drag.moved = true; drag.b.classList.add("dragging");
    let ns = drag.s, ne = drag.e;
    // 자정을 넘어도 돼요 (시작은 23:55 까지, 끝은 다음 날로 이어져요)
    if (drag.mode === "move" && drag.mates?.length) {
      const all = [drag, ...drag.mates], lo = Math.min(...all.map((x) => x.s)), hi = Math.max(...all.map((x) => x.s));
      const dd = Math.max(-lo, Math.min(1440 - STEP - hi, d)); drag.dd = dd;
      ns = drag.s + dd; ne = drag.e + dd;
      for (const m of drag.mates) { m.b.classList.add("dragging"); m.b.style.top = r2(axY(m.s + dd) + 1) + "px"; m.b.style.height = r2(Math.max(ONE_H, axY(m.e + dd) - axY(m.s + dd) - 2)) + "px"; }
    }
    else if (drag.mode === "move") { const len = drag.e - drag.s; ns = Math.max(0, Math.min(1440 - STEP, drag.s + d)); ne = ns + len; }
    else if (drag.mode === "top") ns = Math.max(0, Math.min(drag.e - STEP, 1440 - STEP, drag.s + d));
    else { const base = Math.min(1440, drag.e); ne = base + d; if (ne >= 1440 && drag.e > 1440) ne = drag.e; ne = Math.max(drag.s + STEP, Math.min(Math.max(1440, drag.e), ne)); }
    drag.ns = ns; drag.ne = ne;
    drag.b.style.top = r2(axY(ns) + 1) + "px";
    drag.b.style.height = r2(Math.max(ONE_H, axY(ne) - axY(ns) - 2)) + "px";
    let tag = drag.b.querySelector(".drag-tag"); if (!tag) { tag = document.createElement("span"); tag.className = "drag-tag"; drag.b.appendChild(tag); }
    tag.textContent = `${span2(toTime(ns), ne)} · ${hm(ne - ns)}${drag.mates?.length ? ` · ${drag.mates.length + 1}개 같이` : ""}`;
    e.preventDefault();
  });
  const endDrag = async () => {
    if (!drag) return; const g = drag; drag = null;
    g.b.classList.remove("dragging"); g.mates?.forEach((m) => m.b.classList.remove("dragging"));
    if (g.mates?.length && g.moved && g.dd) {
      justDragged = Date.now();
      const ents = [g, ...g.mates].map((m) => { const p = S.plans.find((x) => x.id === m.id); return p && { p, id: p.id, before: { start: p.start }, after: { start: toTime(m.s + g.dd) } }; }).filter(Boolean);
      for (const x of ents) x.p.start = x.after.start; drawAll();
      try { await Promise.all(ents.map((x) => api.updatePlan(x.id, x.after))); pu.patchedMany(ents.map(({ id, before, after }) => ({ id, before, after })), `계획 이동 · ${ents.length}개`); changed("plans"); toast(`${ents.length}개를 ${g.dd > 0 ? `${hm(g.dd)} 뒤로` : `${hm(-g.dd)} 앞으로`} 옮겼어요`); }
      catch (ex) { for (const x of ents) x.p.start = x.before.start; drawAll(); toast(ex.message, "err"); }
      return;
    }
    if (!g.moved || (g.ns === g.s && g.ne === g.e)) { if (g.moved) drawGrid(); else flush(); return; }
    justDragged = Date.now();
    const p = S.plans.find((x) => x.id === g.id); if (!p) return;
    const old = { start: p.start, mins: p.mins };
    p.start = toTime(g.ns); p.mins = g.ne - g.ns; drawAll();
    try { await api.updatePlan(p.id, { start: p.start, mins: p.mins }); pu.patched(p.id, old, { start: p.start, mins: p.mins }, g.mode === "move" ? "계획 이동" : "길이 바꾸기"); changed("plans"); toast(`${p.text} · ${span2(p.start, g.ne)}`); }
    catch (ex) { Object.assign(p, old); drawAll(); toast(ex.message, "err"); }
  };
  el.addEventListener("pointerup", endDrag);
  el.addEventListener("pointercancel", () => { if (drag) { drag = null; drawGrid(); } });
  // 끌고 난 직후의 클릭(체크 · 추가 창 열기)은 무시
  el.addEventListener("click", (e) => { if (Date.now() - justDragged < 250) { e.stopPropagation(); e.preventDefault(); } }, true);

  // ---------- 여러 개 고르기 (노션처럼): 빈 곳을 끌어 상자로 고르기 · Shift/⌘+클릭 · 떠 있는 막대로 한 번에 ----------
  function drawSelBar() {
    $$("#dp-grid [data-id]", el).forEach((b) => b.classList.toggle("sel", S.sel.has(b.dataset.id)));
    $$("#dp-grid .grp", el).forEach((g) => { const ids = $$("[data-id]", g).map((x) => x.dataset.id); g.classList.toggle("sel", ids.length > 0 && ids.every((id) => S.sel.has(id))); });
    const bar = $("#dp-selbar", el); if (!bar) return;
    const list = ro() || !S.plans ? [] : S.plans.filter((p) => S.sel.has(p.id));
    // 하나만 고른 건 막대 없이 (우클릭 메뉴로 다 돼요) — 블록 위에 겹쳐 뜨지 않게
    bar.hidden = list.length < 2;
    if (list.length < 2) { bar.innerHTML = ""; return; }
    const g0 = list[0].group_id, oneGroup = !!g0 && list.every((p) => p.group_id === g0), allDone = list.every((p) => p.done);
    bar.innerHTML = `<span class="sb-n">${list.length}개 선택</span>
      <button type="button" class="btn sm" data-sb="${oneGroup ? "ungroup" : "group"}"${!oneGroup && list.length < 2 ? " disabled" : ""}>${oneGroup ? "그룹 풀기" : "그룹으로 묶기"}</button>
      <span class="sb-shift" title="시간 옮기기"><span class="faint">시간 옮기기</span><button type="button" class="btn sm ghost" data-sb="back" aria-label="앞으로 옮기기">−</button><input class="input" type="number" id="dp-sb-min" value="15" min="1" max="720" step="5" aria-label="옮길 분"><span class="faint">분</span><button type="button" class="btn sm ghost" data-sb="fwd" aria-label="뒤로 옮기기">+</button></span>
      ${prioSelect("sb_prio", "")}
      <button type="button" class="btn sm" data-sb="done">${allDone ? "완료 취소" : "완료"}</button>
      <button type="button" class="btn sm danger" data-sb="del">삭제</button>
      <button type="button" class="icon-btn sm" data-sb="clear" aria-label="선택 풀기">${icon.x(14)}</button>`;
  }
  // 고른 계획들에 한 번에: group · ungroup · fwd/back(분) · prio · done · del — 한 번의 ⌘Z 로 되돌려요 (plan-undo)
  async function batch(op, v, ids = [...S.sel]) {
    if (ro() || !S.plans) return;
    const list = ids.map((id) => S.plans.find((p) => p.id === id)).filter(Boolean); if (!list.length) return;
    if (op === "del") {
      const keep = S.plans; S.plans = S.plans.filter((p) => !ids.includes(p.id)); S.sel.clear(); drawAll();
      try { await Promise.all(list.map((p) => api.deletePlan(p.id))); pu.deletedMany(list, `${list.length}개 지우기`); changed("plans"); toast(`${list.length}개를 지웠어요 · ${MOD}Z 되돌리기`); }
      catch (ex) { S.plans = keep; drawAll(); toast(ex.message, "err"); load(); }
      return;
    }
    const allDone = list.every((p) => p.done), gid = "g" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const next = {
      group: () => ({ group_id: gid }),
      ungroup: () => ({ group_id: null }),
      fwd: (p) => (p.start ? { start: toTime(Math.max(0, Math.min(1439, toMin(p.start) + v))) } : null),
      back: (p) => (p.start ? { start: toTime(Math.max(0, Math.min(1439, toMin(p.start) + v))) } : null),
      prio: () => ({ priority: v }),
      done: (p) => ({ done: !allDone, missed: allDone ? p.missed : 0 }),
    }[op];
    if (!next || (op === "group" && list.length < 2)) return;
    const LAB = { group: "그룹으로 묶기", ungroup: "그룹 풀기", fwd: `${v}분 뒤로`, back: `${-v}분 앞으로`, prio: "우선순위", done: allDone ? "완료 취소" : "완료" };
    const ents = list.map((p) => { const a = next(p); return a && { p, id: p.id, before: pu.pickOld(p, Object.keys(a)), after: a }; }).filter(Boolean);
    if (!ents.length) return;
    const olds = ents.map((x) => ({ ...x.p }));
    for (const x of ents) Object.assign(x.p, x.after, "done" in x.after ? { done: x.after.done ? 1 : 0 } : {});
    if (op === "group") S.fold.delete(gid);
    drawAll();
    try {
      await Promise.all(ents.map((x) => api.updatePlan(x.id, x.after)));
      pu.patchedMany(ents.map(({ id, before, after }) => ({ id, before, after })), `${LAB[op]} · ${ents.length}개`);
      changed("plans");
    } catch (ex) { ents.forEach((x, i) => Object.assign(x.p, olds[i])); drawAll(); toast(ex.message, "err"); load(); }
  }
  // 빈 곳(블록이 아닌 시간 칸)을 누른 채 끌면 상자 — 닿은 계획이 골라져요. Shift/⌘ 를 누르고 시작하면 지금 고른 것에 더해요
  el.addEventListener("pointerdown", (e) => {
    if (ro() || e.button !== 0 || e.pointerType === "touch" || !S.plans) return;
    const g = $("#dp-grid", el);
    if (!g || !g.contains(e.target) || e.target.closest("[data-id], .grp, [data-slot-form]")) return;
    lasso = { x0: e.clientX, y0: e.clientY, sc0: scroller().scrollTop, base: e.shiftKey || e.metaKey || e.ctrlKey ? new Set(S.sel) : new Set(), moved: false, box: null };
    e.preventDefault(); // 끄는 동안 글자가 골라지지 않게
  });
  el.addEventListener("pointermove", (e) => {
    if (!lasso) return;
    if (!lasso.moved && Math.hypot(e.clientX - lasso.x0, e.clientY - lasso.y0) < 5) return;
    const g = $("#dp-grid", el), sc = scroller(); if (!g) return;
    const sr = sc.getBoundingClientRect();
    if (e.clientY < sr.top + 30) sc.scrollTop -= 12; else if (e.clientY > sr.bottom - 30) sc.scrollTop += 12;
    if (!lasso.moved) { lasso.moved = true; lasso.box = document.createElement("div"); lasso.box.className = "dp-lasso"; g.appendChild(lasso.box); }
    const gr = g.getBoundingClientRect(), y0 = lasso.y0 - (sc.scrollTop - lasso.sc0);
    const L = Math.min(lasso.x0, e.clientX), R = Math.max(lasso.x0, e.clientX), T = Math.min(y0, e.clientY), B = Math.max(y0, e.clientY);
    Object.assign(lasso.box.style, { left: r2(L - gr.left) + "px", top: r2(T - gr.top) + "px", width: r2(R - L) + "px", height: r2(B - T) + "px" });
    const hit = new Set(lasso.base);
    for (const b of $$("#dp-grid [data-id]", el)) { const r = b.getBoundingClientRect(); if (r.width && r.left < R && r.right > L && r.top < B && r.bottom > T) hit.add(b.dataset.id); }
    S.sel = hit; drawSelBar();
  });
  const endLasso = () => {
    if (!lasso) return; const l = lasso; lasso = null;
    l.box?.remove();
    if (l.moved) justDragged = Date.now(); // 끝낸 뒤의 클릭(추가 창 열기)은 무시
    flush();
  };
  window.addEventListener("pointerup", endLasso); window.addEventListener("pointercancel", endLasso);

  // 마우스 위치 → 5분 단위 시각 ("+ 14:35에 추가")
  function slotAt(btn, y) {
    const row = btn.closest(".hour"), r = row.getBoundingClientRect(), h = +row.dataset.h, A = S.axis;
    // 그 칸 맨 위 자리 + 칸 안에서 내려온 px → 분 (칸이 늘어나 있어도 실제 시각)
    const at = A ? minuteAt(A.Y, A.Y[h * 60 - A.m0] + (y - r.top), A.m0) - h * 60 : ((y - r.top) / r.height) * 60;
    const m = Math.max(0, Math.min(55, Math.floor(at / STEP) * STEP));
    return `${pad(h)}:${pad(m)}`;
  }
  el.addEventListener("pointermove", (e) => { const b = e.target.closest?.(".hour [data-slot]"); if (b) b.textContent = `+ ${slotAt(b, e.clientY)}에 추가`; });
  el.addEventListener("input", (e) => {
    if (e.target.closest("[data-slot-form]")) keepForm(e.target.form);
    // 시각을 바꾸면 '…에 할 일' 안내도 새 시각으로
    if (e.target.matches("[data-slot-form] [name=at]") && e.target.value) { const t = e.target.form?.querySelector("[name=text]"); if (t) t.placeholder = `${e.target.value}에 할 일`; }
  });

  // 창의 칸 값을 그대로 기억 (시각 · 길이 · 우선순위 · 이름) — 다시 그려도, 고치기 창에서도 그대로
  function keepForm(f) { if (f) S.form = { at: f.at?.value || "", text: f.text?.value ?? "", mins: f.mins?.value, mins_text: f.mins_text?.value || "", priority: f.priority?.value ?? "" }; }
  el.addEventListener("change", (e) => { if (e.target.closest?.("[data-slot-form]")) keepForm(e.target.form); });
  // 다른 곳에서 바꿨다는 알림 · 1분마다 다시 그리기: 쓰는 중이면 닫힐 때까지 미뤄요
  const onChanged = (e) => { if (["logs", "plans"].includes(e.detail?.kind)) { if (busy()) S.pendingLoad = true; else load(); } };
  window.addEventListener("trio:changed", onChanged);
  const tick = setInterval(() => { if (isToday && S.plans) { if (busy()) S.pendingDraw = true; else drawGrid(); } }, 60_000);
  load();
  loadExtras();
  if (!future) loadTrend();
  const stopAic = mountCommand(el.querySelector("#dp-aic"), { day: () => day, onDone: () => changed("plans") });

  // ---------- 계획 복사 · 붙여넣기 (⌘C · ⌘V · ⌘Z — plan-clip.js) ----------
  // 마우스가 올라간 계획 · 시간표 위 시각(5분 단위, 늘어난 칸에서도 실제 시각)
  el.addEventListener("pointermove", (e) => {
    const g = $("#dp-grid", el);
    if (!g || !S.axis) return;
    S.hoverId = e.target.closest?.("#dp-grid .block:not(.cont)")?.dataset.id || null;
    const r = g.getBoundingClientRect(), inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    S.hoverMin = inside ? Math.max(0, Math.min(1435, Math.floor(minuteAt(S.axis.Y, e.clientY - r.top, S.axis.m0) / STEP) * STEP)) : null;
  });
  el.addEventListener("pointerleave", () => { S.hoverId = null; S.hoverMin = null; });
  el.addEventListener("mousedown", (e) => { if ((e.shiftKey || e.metaKey || e.ctrlKey) && e.target.closest("#dp-grid [data-id]")) e.preventDefault(); }); // Shift+클릭이 글자를 고르지 않게
  // Esc = 고른 것 풀기 · ⌘A = 이날 시각 있는 계획 전부 고르기 (입력 중엔 원래대로)
  const onSelKey = (e) => {
    if (!alive || !el.isConnected || ro() || !S.plans) return;
    const a = document.activeElement;
    if (a && (a.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName))) return;
    if (e.key === "Escape" && S.sel.size) { S.sel.clear(); drawSelBar(); }
    else if ((e.key === "Delete" || e.key === "Backspace") && S.sel.size) { e.preventDefault(); batch("del"); }
    else if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "a") {
      const timed = S.plans.filter((p) => p.start);
      if (!timed.length) return;
      e.preventDefault();
      S.sel = new Set(timed.map((p) => p.id)); drawSelBar();
      toast(`계획 ${timed.length}개를 골랐어요 — ${MOD}C 로 복사`);
    }
  };
  document.addEventListener("keydown", onSelKey);
  const stopClip = mountPlanClip({
    active: () => alive && el.isConnected && !!S.plans,
    pick: () => (S.sel.size ? [...S.sel] : S.hoverId ? [S.hoverId] : []).map((id) => S.plans.find((p) => p.id === id)).filter(Boolean),
    target: () => (ro() ? null : { at: S.hoverMin }), // 친구 계획표엔 못 붙여요 (복사는 돼요)
    paste: async (list) => {
      const made = [];
      for (const b of list) made.push((await api.addPlan({ scope: "day", period: key, text: b.text, start: b.start, mins: b.mins, ...(b.priority ? { priority: b.priority } : {}) })).plan);
      if (made.length) pu.added(made, made.length > 1 ? `붙여넣기 ${made.length}개` : "붙여넣기");
      S.plans.push(...made); S.sel = new Set(made.map((p) => p.id)); drawAll(); changed("plans");
      return made.map((p) => p.id);
    },
  });

  return () => {
    alive = false; stopAic?.(); closeMenu();
    ["pointerup", "pointercancel"].forEach((t) => window.removeEventListener(t, cancelPress));
    window.removeEventListener("pointerup", endLasso); window.removeEventListener("pointercancel", endLasso);
    window.removeEventListener("trio:changed", onChanged);
    el.removeEventListener("change", onElChange);
    el.removeEventListener("click", onElClick);
    el.removeEventListener("dblclick", onElDbl);
    stopClip(); pu.dispose(); document.removeEventListener("keydown", onSelKey);
    clearInterval(tick);
  };
}
