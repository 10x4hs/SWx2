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
import { icon } from "../icons.js";
import { BLOCKS } from "../english/data.js";

const HOUR_PX = 96; // 한 시간 = 96px → 5분 = 8px (5분 단위까지 보이게)
const STEP = 5;     // 시간표를 누르거나 끌 때만 5분 칸 (적는 시각 · 길이는 1분 단위)
const DEFAULT_MINS = 60; // 새 계획의 기본 길이 — 바로 전에 넣은 길이를 따라가지 않아요
const MIN_H = 22;   // 짧은 계획도 글자가 보이는 높이(px) — 바로 뒤에 다른 계획이 있으면 그 앞까지만
const FLOOR = 14;   // 그래도 이만큼은 (한 줄 글자가 보이는 최소 · 10분 = 16px 이라 10분 이상은 원래 자리에 딱 맞아요)
// 못함 버튼 — 체크(끝냄) 옆의 빨간 ✕. 누르면 계획이 빨갛게 바뀌어요 (체크리스트도 같이 써요)
export const missBtn = (p) => `<button type="button" class="miss-btn" data-miss="${esc(p.id)}" aria-pressed="${p.missed ? "true" : "false"}" aria-label="${esc(p.text)} 못함" title="${p.missed ? "못함 되돌리기" : "못 했어요 (빨간색 표시)"}"><svg viewBox="0 0 12 12" width="8" height="8" aria-hidden="true"><path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></button>`;
// 우선순위 1~5순위 · 예상 시간 — public/js/prio.js (색은 styles.css 의 --p-*). 다른 화면이 여기서 PRIOS 를 가져가요
import { PRIOS, PRIO_RANK, prioSelect, prioPill, openPrioDrop, hoursPill, openHoursDrop, parseMins, MINS_HINT, prioLabel } from "../prio.js";
export { PRIOS };
const longDate = (d) => `${d.getMonth() + 1}월 ${d.getDate()}일 ${DOW[d.getDay()]}요일`;
function relDay(k, tk) {
  const n = Math.round((parseYmd(k) - parseYmd(tk)) / 864e5);
  return n === 0 ? "오늘" : n === 1 ? "내일" : n === -1 ? "어제" : n > 0 ? `${n}일 뒤` : `${-n}일 전`;
}
const stamp = (ms) => { const d = new Date(ms); return `${d.getMonth() + 1}월 ${d.getDate()}일 ${pad(d.getHours())}:${pad(d.getMinutes())}`; };

// el 안에 그날 페이지를 그려요. onChange(kind) = 달력 칸을 새로 그려야 할 때. 돌려주는 함수 = 정리(쓰던 일기 저장).
export function mountDay(el, ctx, day, { onChange, who: startWho } = {}) {
  const date = parseYmd(day), tk = ymd(today()), key = "D:" + day;
  const isToday = day === tk, isPast = day < tk, future = day > tk;
  const me = ctx.me;
  // 누구의 하루를 볼지. 친구 것은 그 사람이 open 했을 때만, 읽기 전용 (추가 · 고치기 · 끌기 없음)
  let who = startWho && ctx.users.some((u) => u.id === startWho) ? startWho : me.id; // 홈의 친구 차트에서 오면 그 친구로 시작 (보기만)
  const ro = () => who !== me.id;
  const S = { plans: null, goals: null, diary: undefined, logs: [], english: null, record: null, notes: [], carry: 0, editSlot: null };
  const wKey = periodKey("week", date), mKey = periodKey("month", date), yKey = periodKey("year", date);
  const GOAL_KEY = { week: wKey, month: mKey, year: yKey }, GOAL_LAB = { week: "이번 주", month: "이번 달", year: "올해" };
  const wk = isoWeek(date);
  let alive = true;
  const changed = (kind) => onChange?.(kind);
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
    </section>`;

  // ---------- data ----------
  async function load() {
    try {
      const w = who;
      const [p, d, g, di] = await Promise.all([api.plans([key], ro() ? who : undefined), api.calendarDay(day), Promise.resolve({ plans: [] }), future ? Promise.resolve({ diary: null }) : api.diary(day).catch(() => ({ diary: null }))]);
      if (!alive || w !== who) return;
      S.closed = !!p.closed;
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
    const startH = Math.min(6, timed.length ? Math.floor(toMin(timed[0].start) / 60) : 6);
    const nowM = toMin(nowTime());
    let hours = "";
    for (let h = startH; h < 24; h++) {
      const past = isPast || (isToday && (h + 1) * 60 <= nowM);
      const slot = `${pad(h)}:00`, cur = isToday && Math.floor(nowM / 60) === h;
      hours += `<div class="hour${past ? " past" : ""}${cur ? " cur" : ""}" data-h="${h}"><span>${slot}</span><button type="button" data-slot="${slot}" tabindex="-1">+ ${slot}에 추가</button></div>`;
    }
    // 겹치면 옆으로 나눠요 — 서로 이어진 묶음마다 칸 수를 같이 쓰고, 오른쪽이 비면 넓게 펴요.
    // 겹침은 실제 시각으로 따져요(10분 뒤에 바로 이어지는 계획은 나란히가 아니라 위아래로). 짧은 계획은 뒤 계획 앞까지 높이를 늘려 글자를 보여요.
    const px = (m) => (m / 60) * HOUR_PX;
    const items = timed.map((p) => { const s = toMin(p.start), e = s + (p.mins || 30), real = px(e - s) - 2; return { p, s, e, real, ce: Math.max(e, s + ((FLOOR + 2) / HOUR_PX) * 60) }; }); // ce = 겹침을 따질 끝 (10분 미만만 조금 늘려서)
    const placed = [];
    let group = [], groupEnd = -1, gid = 0;
    const flush = () => {
      const cols = [];
      for (const it of group) { let c = cols.findIndex((end) => end <= it.s); if (c < 0) { c = cols.length; cols.push(it.ce); } else cols[c] = it.ce; it.c = c; it.g = gid; }
      for (const it of group) {
        it.n = cols.length; it.span = 1;
        while (it.c + it.span < it.n && !group.some((o) => o !== it && o.c === it.c + it.span && o.s < it.ce && it.s < o.ce)) it.span++;
      }
      placed.push(...group); group = []; gid++;
    };
    for (const it of items) { if (group.length && it.s >= groupEnd) flush(); group.push(it); groupEnd = Math.max(groupEnd, it.ce); }
    if (group.length) flush();
    // 보이는 높이: 원래 길이 → 짧으면 MIN_H 까지, 단 같은 줄(칸)에서 바로 뒤 계획이 시작하기 전까지만
    const sameLane = (a, b) => a.g !== b.g || (a.c < b.c + b.span && b.c < a.c + a.span);
    for (const it of placed) {
      const next = placed.filter((o) => o.s > it.s && sameLane(it, o)).reduce((m, o) => Math.min(m, o.s), Infinity);
      const room = next === Infinity ? Infinity : px(next - it.s) - 2;
      it.h = Math.max(Math.max(it.real, FLOOR), Math.min(Math.max(it.real, MIN_H), room));
    }
    const blocks = placed.map(({ p, s, e, h, c, n, span }) => {
      const top = ((s - startH * 60) / 60) * HOUR_PX + 1, w = 100 / n, frac = span / n;
      // 크기에 맞춰: tiny(한 줄 · 작은 글씨) · thin(한 줄 + 시각) · narrow(좁으면 버튼은 숨기고 우클릭 메뉴로)
      const size = h < 21 ? " thin tiny micro" : h < 30 ? " thin tiny" : h < 50 ? " thin" : "";
      const narrow = (frac < 0.5 ? " narrow xnarrow" : frac < 1 ? " narrow" : "") + (frac < 1 && c + span === n ? " edge-r" : "");
      const tip = `${p.start}–${toTime(e)} · ${p.text}${p.priority ? ` · ${p.priority}` : ""}`;
      return `<div class="block ${status(p)}${size}${narrow}" data-p="${p.priority || ""}" data-s="${s}" data-e="${e}" title="${esc(tip)}" style="top:${top}px;height:${h}px;left:calc(${c * w}% + ${c ? 2 : 0}px);right:auto;width:calc(${w * span}% - ${n > 1 ? 2 : 0}px)" data-id="${esc(p.id)}">
        <input type="checkbox" class="check" data-toggle="${esc(p.id)}" ${p.done ? "checked" : ""} aria-label="${esc(p.text)} 완료">${missBtn(p)}
        <div class="txt">${h < 50 ? `<span class="when-i">${esc(p.start)}</span>` : ""}<span data-edit="${esc(p.id)}">${esc(p.text)}</span>${h >= 50 ? `<span class="when">${esc(p.start)}–${toTime(e)} · ${hm(e - s)}${p.focus_mins > 0 ? ` · 집중 ${hm(p.focus_mins)}` : ""}</span>` : ""}</div>
        ${playBtn(p)}
        <button class="icon-btn sm" type="button" data-later="${esc(p.id)}" aria-label="다음 날로 미루기" title="다음 날로 미루기">${icon.later(14)}</button>
        <button class="icon-btn sm" type="button" data-del="${esc(p.id)}" aria-label="삭제">${icon.x(14)}</button>
        <i class="bk-rs top" data-rs="top" title="끌어서 시작 시각 바꾸기" aria-hidden="true"></i><i class="bk-rs bot" data-rs="bot" title="끌어서 길이 바꾸기" aria-hidden="true"></i>
      </div>`;
    }).join("");
    // 추가 창: 칸을 늘리지 않고 누른 시각 위치에 떠요 (블록 위로)
    // 추가 창 · 고치기 창(우클릭 → 편집)은 같은 모양. 고칠 땐 값이 채워지고 버튼이 '저장'
    const ed = S.editId ? plans.find((x) => x.id === S.editId) : null;
    const MINS = [1, 2, 3, 5, 10, 15, 20, 25, 30, 40, 45, 50, 60, 75, 90, 120, 150, 180, 240];
    const mins0 = ed ? ed.mins || 30 : DEFAULT_MINS, minsList = MINS.includes(mins0) ? MINS : [...MINS, mins0].sort((a, b) => a - b);
    const pop = S.editSlot ? `<form class="slot-add slot-pop${ed ? " editing" : ""}" data-slot-form="${S.editSlot}" ${ed ? `data-edit-id="${esc(ed.id)}"` : ""} autocomplete="off" style="top:${Math.max(0, ((toMin(S.editSlot) - startH * 60) / 60) * HOUR_PX + 2)}px">
        ${ed ? `<span class="sp-t">계획 고치기</span>` : ""}
        <input class="input slot-at" type="time" name="at" step="60" value="${S.editSlot}" aria-label="시작 시각 (1분 단위)">
        <input class="input" name="text" maxlength="200" placeholder="${S.editSlot}에 할 일" aria-label="할 일" value="${ed ? esc(ed.text) : ""}" autofocus>
        <select class="select" name="mins" aria-label="걸리는 시간">${minsList.map((m) => `<option value="${m}" ${m === mins0 ? "selected" : ""}>${hm(m)}</option>`).join("")}<option value="custom">직접 입력…</option></select><input class="input slot-mins" name="mins_text" placeholder="${MINS_HINT}" aria-label="걸리는 시간 직접 입력" autocomplete="off" hidden>
        ${prioSelect("priority", ed ? ed.priority || "" : S.editPrio || "")}
        <button class="btn accent sm" type="submit">${ed ? "저장" : "추가"}</button><button class="icon-btn sm" type="button" data-slot-close aria-label="닫기">${icon.x(14)}</button></form>` : "";
    const nowLine = isToday && nowM >= startH * 60 ? `<div class="now-line" style="top:${((nowM - startH * 60) / 60) * HOUR_PX}px" aria-hidden="true"></div>` : "";
    // 폰: 추가 · 고치기 창은 시간표 위가 아니라 화면 아래에서 올라오는 시트로 (손가락 · 키보드에 안 가려지게)
    el.classList.toggle("ro", ro());
    const u = ctx.users.find((x) => x.id === who);
    const hintEl = $(".dp-hint", el);
    if (hintEl) hintEl.textContent = ro() ? (S.closed ? `${u?.display_name || "친구"} 님은 하루 계획표를 공개하지 않았어요 (not open).` : `${u?.display_name || "친구"} 님의 하루 계획표예요 · 보기만 할 수 있어요.`) : "빈 시각을 누르면 바로 적을 수 있어요. 시각 · 길이는 1분 단위로 고쳐도 돼요. Enter 추가 · Esc 닫기.";
    if (ro()) { S.editSlot = null; S.editId = null; }
    const sheet = phone();
    $("#dp-grid", el).innerHTML = hours + `<div class="blocks">${blocks}</div>` + nowLine + (sheet ? "" : pop);
    let host = $("#dp-sheet", el);
    if (sheet && pop) {
      // <dialog> 맨 위층에 띄워요 — 유리 카드(backdrop-filter) 안에선 position: fixed 가 화면 기준이 안 돼요
      if (!host) {
        host = document.createElement("dialog"); host.id = "dp-sheet"; el.append(host);
        host.addEventListener("cancel", (e) => { e.preventDefault(); S.editSlot = null; S.editId = null; drawGrid(); });
      }
      host.innerHTML = `<div class="sheet-back" data-slot-close></div>` + pop.replace('class="slot-add slot-pop', 'class="slot-add slot-pop slot-sheet');
      if (!host.open) host.showModal();
    } else if (host) { host.open && host.close(); host.remove(); }
    // 처음 열 때는 지금 시각(오늘) 또는 첫 계획 근처로 계획표 칸만 스크롤해 둬요
    if (!S.scrolled) {
      S.scrolled = true;
      const at = isToday ? nowM - 60 : timed.length ? toMin(timed[0].start) - 30 : 8 * 60;
      scroller().scrollTop = Math.max(0, ((at - startH * 60) / 60) * HOUR_PX);
    }
    S.gridStartH = startH;
    const f = $("[data-slot-form]", el);
    if (f) { const i = f.text; i.focus({ preventScroll: true }); if (!S.editId) i.value = S.editText || ""; i.setSelectionRange(i.value.length, i.value.length); }
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
      if (done && isToday) {
        const { log } = await api.addLog({ day, at: nowTime(), text: `완료 · ${p.text}`, kind: "done" });
        S.logs.push(log); S.logs.sort((a, b) => a.at.localeCompare(b.at)); drawStudy();
      }
      changed("plans");
    } catch (e) { p.done = done ? 0 : 1; p.missed = wasMissed; drawAll(); toast(e.message, "err"); }
  }
  // 못함 표시 켜기/끄기 — 켜면 끝냄은 꺼져요
  async function setMissed(id, on) {
    const p = S.plans.find((x) => x.id === id); if (!p) return;
    const old = { done: p.done, missed: p.missed };
    p.missed = on ? 1 : 0; if (on) p.done = 0; drawAll();
    try { await api.updatePlan(id, { missed: on }); changed("plans"); }
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
    if (t && S.plans) { if (ro()) { t.checked = !t.checked; return; } toggle(t.dataset.toggle, t.checked); }
    if (e.target.id === "dp-date" && e.target.value) ctx.go("#/calendar/" + e.target.value);
    // 계획 창의 시간에서 "직접 입력…" 을 고르면 그 자리에 입력칸이 열려요
    const f = e.target.name === "mins" && e.target.closest("[data-slot-form]");
    if (f && f.mins.value === "custom") { f.mins.hidden = true; f.mins_text.hidden = false; f.mins_text.focus(); }
  }
  // 친구 계획표: 블록을 누르면 상세 카드 (이름 · 시각 · 길이 · 우선순위 · 끝냄/못함 · 쌓인 집중 시간)
  function showPlanCard(p, at) {
    closeMenu();
    const u = ctx.users.find((x) => x.id === who);
    const end = toTime(toMin(p.start) + (p.mins || 30));
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
    const wb = e.target.closest("[data-dpwho]");
    if (wb) { if (wb.dataset.dpwho === who) return; who = wb.dataset.dpwho; $$("[data-dpwho]", el).forEach((b) => b.setAttribute("aria-selected", String(b.dataset.dpwho === who))); S.plans = null; S.closed = false; S.editSlot = null; S.editId = null; drawGrid(); load(); return; }
    if (ro()) { const b = e.target.closest("#dp-grid .block"); const p = b && S.plans?.find((x) => x.id === b.dataset.id); if (p) showPlanCard(p, e); return; } // 친구 계획표는 보기만 · 누르면 상세
    const mb = e.target.closest("[data-miss]");
    if (mb && S.plans) { const p = S.plans.find((x) => x.id === mb.dataset.miss); if (p) setMissed(p.id, !p.missed); return; }
    const slot = e.target.closest("[data-slot]");
    if (slot) { S.editSlot = slotAt(slot, e.clientY); S.editText = ""; S.editId = null; drawGrid(); return; }
    const pr = e.target.closest("[data-prio]");
    if (pr) { // 아래로 펼쳐지는 1~5순위 고르기
      const p = S.plans.find((x) => x.id === pr.dataset.prio); if (!p) return;
      openPrioDrop(pr, p.priority || "", async (v) => {
        const nx = v || null, old = p.priority; if (nx === (old || null)) return;
        p.priority = nx; drawAll();
        try { await api.updatePlan(p.id, { priority: nx }); changed("plans"); } catch (ex) { p.priority = old; drawAll(); toast(ex.message, "err"); }
      });
      return;
    }
    const hb = e.target.closest("[data-hours]");
    if (hb) { // 예상 시간 (시각 없는 할 일만)
      const p = S.plans.find((x) => x.id === hb.dataset.hours); if (!p) return;
      openHoursDrop(hb, p.mins || null, async (m) => {
        const old = p.mins; if (m === (old || null)) return;
        p.mins = m; drawAll();
        try { await api.updatePlan(p.id, { mins: m }); changed("plans"); } catch (ex) { p.mins = old; drawAll(); toast(ex.message, "err"); }
      });
      return;
    }
    if (e.target.closest("[data-slot-close]")) { S.editSlot = null; S.editId = null; drawGrid(); return; }
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
    if (ro()) return;
    const ed = e.target.closest("[data-edit]");
    if (ed) return editInline(ed, async (text) => { await api.updatePlan(ed.dataset.edit, { text }); const p = S.plans.find((x) => x.id === ed.dataset.edit); if (p) p.text = text; changed("plans"); });
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
    if (f.dataset.editId) { // 우클릭 → 편집 → 저장
      const p = S.plans.find((x) => x.id === f.dataset.editId); if (!p) return;
      const old = { text: p.text, start: p.start, mins: p.mins, priority: p.priority };
      Object.assign(p, { text, start, mins, priority }); S.editSlot = null; S.editId = null; drawAll();
      try { await api.updatePlan(p.id, { text, start, mins, priority }); changed("plans"); toast("계획을 고쳤어요."); }
      catch (ex) { Object.assign(p, old); drawAll(); toast(ex.message, "err"); }
      return;
    }
    S.editPrio = priority || "";
    try {
      await addPlan({ text, start, mins, ...(priority ? { priority } : {}) });
      // 끝난 시각에서 바로 이어서 적을 수 있게 열어 둬요 (5분 단위)
      const next = toMin(start) + mins;
      S.editSlot = next < 24 * 60 ? toTime(next) : null; S.editText = "";
      drawGrid();
    } catch (ex) { toast(ex.message, "err"); }
  });
  el.addEventListener("keydown", (e) => { if (e.key === "Escape" && e.target.closest("[data-slot-form]")) { S.editSlot = null; S.editId = null; drawGrid(); } });
  // 우클릭 → 편집 · 끝냄 · 우선순위 · 다음 날로 · 삭제
  el.addEventListener("contextmenu", (e) => {
    if (ro()) return;
    const b = e.target.closest("#dp-grid .block"); if (!b) return;
    const p = S.plans?.find((x) => x.id === b.dataset.id); if (!p) return;
    openMenu(e, {
      title: `${p.start}–${toTime(toMin(p.start) + (p.mins || 30))} · ${p.text}`,
      items: [{ k: "edit", label: "편집", hint: "이름 · 시각 · 길이" }, { k: "done", label: p.done ? "끝냄 되돌리기" : "끝냄" }, { k: "miss", label: p.missed ? "못함 되돌리기" : "못함", danger: !p.missed }, { k: "prio", prio: p.priority || "" }, { sep: true }, { k: "later", label: "다음 날로 미루기" }, { k: "del", label: "삭제", danger: true }],
      onPick: async (k, v) => {
        if (k === "edit") { S.editId = p.id; S.editSlot = p.start; drawGrid(); return; }
        if (k === "done") return toggle(p.id, !p.done);
        if (k === "miss") return setMissed(p.id, !p.missed);
        if (k === "prio") { const old = p.priority; p.priority = v || null; drawAll(); try { await api.updatePlan(p.id, { priority: p.priority }); changed("plans"); } catch (ex) { p.priority = old; drawAll(); toast(ex.message, "err"); } return; }
        if (k === "later") { try { await api.updatePlan(p.id, { period: "D:" + ymd(addDays(date, 1)) }); S.plans = S.plans.filter((x) => x.id !== p.id); drawAll(); toast("다음 날로 미뤘어요."); changed("plans"); } catch (ex) { toast(ex.message, "err"); } return; }
        if (k === "del") { const keep = S.plans; S.plans = S.plans.filter((x) => x.id !== p.id); drawAll(); try { await api.deletePlan(p.id); changed("plans"); toast("삭제했어요."); } catch (ex) { S.plans = keep; drawAll(); toast(ex.message, "err"); } }
      },
    });
  });

  // ---------- 블록 끌기: 가운데를 잡으면 옮기기, 위·아래 모서리를 잡으면 늘리기/줄이기 (5분 단위) ----------
  const PX5 = HOUR_PX / 12;
  const edgeOf = (b, y) => { const r = b.getBoundingClientRect(), k = Math.min(8, r.height / 4); return y - r.top <= k ? "top" : r.bottom - y <= k ? "bot" : "move"; };
  // 가장자리에 올리면 커서를 위아래 화살표로
  el.addEventListener("mousemove", (e) => { const b = e.target.closest?.("#dp-grid .block"); if (!b || drag) return; b.style.cursor = e.target.closest("button, input") ? "" : edgeOf(b, e.clientY) === "move" ? "" : "ns-resize"; });
  let drag = null, justDragged = 0;
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
    const b = e.target.closest?.("#dp-grid .block"); if (!b || e.target.closest("button, input, select, a")) return;
    const { clientX, clientY } = e;
    press = { x: clientX, y: clientY, t: setTimeout(() => {
      press = { fired: true }; navigator.vibrate?.(10);
      b.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX, clientY }));
    }, 450) };
  });
  el.addEventListener("pointermove", (e) => { if (press && !press.fired && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 8) cancelPress(); });
  ["pointerup", "pointercancel"].forEach((t) => window.addEventListener(t, cancelPress));
  el.addEventListener("pointerdown", (e) => {
    const b = e.target.closest?.("#dp-grid .block"); if (!b || e.button !== 0 || e.pointerType === "touch" || ro()) return;
    if (e.target.closest("button, input, select, a, [data-edit].editing")) return;
    const mode = edgeOf(b, e.clientY); // 위·아래 가장자리 8px 안이면 길이 조절, 아니면 옮기기
    drag = { b, id: b.dataset.id, mode, y0: e.clientY, sc0: scroller().scrollTop, s: +b.dataset.s, e: +b.dataset.e, ns: +b.dataset.s, ne: +b.dataset.e, moved: false };
    b.setPointerCapture?.(e.pointerId);
  });
  el.addEventListener("pointermove", (e) => {
    if (!drag) return;
    // 계획표 칸 위 · 아래 끝 가까이 끌면 칸이 저절로 스크롤돼요 (페이지는 그대로)
    const sc = scroller(), r = sc.getBoundingClientRect();
    if (e.clientY < r.top + 36) sc.scrollTop -= 14; else if (e.clientY > r.bottom - 36) sc.scrollTop += 14;
    const d = Math.round((e.clientY - drag.y0 + sc.scrollTop - drag.sc0) / PX5) * STEP;
    if (!drag.moved && Math.abs(e.clientY - drag.y0) < 4) return;
    drag.moved = true; drag.b.classList.add("dragging");
    let ns = drag.s, ne = drag.e;
    if (drag.mode === "move") { const len = drag.e - drag.s; ns = Math.max(0, Math.min(1440 - len, drag.s + d)); ne = ns + len; }
    else if (drag.mode === "top") ns = Math.max(0, Math.min(drag.e - STEP, drag.s + d));
    else ne = Math.min(1440, Math.max(drag.s + STEP, drag.e + d));
    drag.ns = ns; drag.ne = ne;
    const sh = S.gridStartH ?? 6;
    drag.b.style.top = ((ns - sh * 60) / 60) * HOUR_PX + 1 + "px";
    drag.b.style.height = Math.max(MIN_H, ((ne - ns) / 60) * HOUR_PX - 2) + "px";
    let tag = drag.b.querySelector(".drag-tag"); if (!tag) { tag = document.createElement("span"); tag.className = "drag-tag"; drag.b.appendChild(tag); }
    tag.textContent = `${toTime(ns)}–${toTime(ne)} · ${hm(ne - ns)}`;
    e.preventDefault();
  });
  const endDrag = async () => {
    if (!drag) return; const g = drag; drag = null;
    g.b.classList.remove("dragging");
    if (!g.moved || (g.ns === g.s && g.ne === g.e)) { if (g.moved) drawGrid(); return; }
    justDragged = Date.now();
    const p = S.plans.find((x) => x.id === g.id); if (!p) return;
    const old = { start: p.start, mins: p.mins };
    p.start = toTime(g.ns); p.mins = g.ne - g.ns; drawAll();
    try { await api.updatePlan(p.id, { start: p.start, mins: p.mins }); changed("plans"); toast(`${p.text} · ${p.start}–${toTime(g.ne)}`); }
    catch (ex) { Object.assign(p, old); drawAll(); toast(ex.message, "err"); }
  };
  el.addEventListener("pointerup", endDrag);
  el.addEventListener("pointercancel", () => { if (drag) { drag = null; drawGrid(); } });
  // 끌고 난 직후의 클릭(체크 · 추가 창 열기)은 무시
  el.addEventListener("click", (e) => { if (Date.now() - justDragged < 250) { e.stopPropagation(); e.preventDefault(); } }, true);

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
    alive = false; stopAic?.(); closeMenu();
    ["pointerup", "pointercancel"].forEach((t) => window.removeEventListener(t, cancelPress));
    window.removeEventListener("trio:changed", onChanged);
    el.removeEventListener("change", onElChange);
    el.removeEventListener("click", onElClick);
    el.removeEventListener("dblclick", onElDbl);
    clearInterval(tick);
  };
}
