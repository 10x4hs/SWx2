// 그날 한 페이지 — 캘린더 오른쪽에 붙어요 (예전 "오늘" 화면 전부 + 그날 한 공부 + 하루 기록 저장).
// 할 일(시간 없는 목표) · 시간표 · 하루 점수 · 실행 기록 · 일기 · 그날 한 공부. 앞으로 올 날은 할 일 · 시간표만.
// 전부 나만 봐요. 할 일 옆 ▶ 를 누르면 집중 타이머가 그 할 일 이름으로 시작하고, 끝나면 그 할 일에 집중 시간이 쌓여요.
import { api } from "../api.js";
import {
  $, esc, pad, hm, toMin, toTime, nowTime, ymd, parseYmd, addDays, today,
  DOW, isoWeek, dayOfYear, daysInYear, dayScore, pct, toast, focusOf, englishOf, studyMins,
} from "../util.js";
import { icon } from "../icons.js";
import { mountDiary } from "../diary.js";
import { BLOCKS } from "../english/data.js";

const HOUR_PX = 48;
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
  const S = { plans: null, logs: [], english: null, record: null, notes: [], carry: 0 };
  const wk = isoWeek(date);
  let alive = true, stopDiary = null;
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
    ${future ? `<p class="dp-note">앞으로 올 날이에요. 할 일과 시간표를 미리 적어 두면 그날 홈 차트에 그대로 나와요.</p>` : ""}
    <div id="dp-carry"></div>
    <div class="dp-cols">
      <div class="dp-col">
        <section class="cd-sec" aria-labelledby="dp-goals-t">
          <div class="cd-sh"><h3 id="dp-goals-t">할 일</h3><span id="dp-goal-sum"></span></div>
          <ul class="todos dp-todos" id="dp-goals"><li class="cd-loading faint">불러오는 중…</li></ul>
          <form class="cd-add dp-goal-add" id="dp-goal-add" autocomplete="off">
            <input class="input" name="text" maxlength="200" placeholder="${future ? "이날 꼭 할 것을 적어 두세요" : "꼭 할 것 · 예: 기출 1회분 80점 넘기"}" aria-label="할 일 추가">
            <button class="btn accent sm" type="submit">${icon.plus(14)} 추가</button>
          </form>
        </section>
        <section class="cd-sec" aria-labelledby="dp-tt-t">
          <div class="cd-sh"><h3 id="dp-tt-t">시간표</h3><span class="faint" id="dp-tt-sum"></span></div>
          <form class="quick dp-quick" id="dp-quick" autocomplete="off">
            <input class="input mono" type="time" name="start" aria-label="시작 시각" required value="${isToday ? pad(Math.min(23, new Date().getHours() + 1)) + ":00" : "09:00"}">
            <select class="select" name="mins" aria-label="걸리는 시간">${[15, 30, 45, 60, 90, 120, 180].map((m) => `<option value="${m}" ${m === 60 ? "selected" : ""}>${hm(m)}</option>`).join("")}</select>
            <input class="input grow" name="text" maxlength="200" placeholder="그 시간에 할 일" aria-label="시간표 할 일">
            <button class="btn sm" type="submit">${icon.plus(14)} 추가</button>
          </form>
          <p class="dp-hint">시간이 정해진 할 일이에요. 빈 칸을 누르면 그 시각이 채워지고, 다음 칸은 이어서 채워져요.</p>
          <div class="day-grid" id="dp-grid"></div>
        </section>
      </div>
      ${future ? "" : `
      <div class="dp-col">
        <section class="cd-sec" aria-labelledby="dp-score-t"><div id="dp-score"></div></section>
        <section class="cd-sec" aria-labelledby="dp-log-t">
          <div class="cd-sh"><h3 id="dp-log-t">실행 기록</h3><span class="faint">시간 순서대로 쌓여요</span></div>
          <form class="log-input" id="dp-log-form" autocomplete="off">
            <input class="input mono" type="time" name="at" value="${isToday ? nowTime() : "21:00"}" aria-label="기록 시각">
            <input class="input" name="text" maxlength="500" placeholder="방금 한 일, 떠오른 생각…" aria-label="기록 내용">
            <button class="btn sm" type="submit">기록</button>
          </form>
          <ol class="timeline" id="dp-logs"></ol>
        </section>
        <section class="cd-sec" aria-labelledby="dp-diary-t">
          <div class="cd-sh"><h3 id="dp-diary-t">일기</h3><span class="faint">${icon.lock(12)} 나만 봐요 · AI에도 안 보내요</span></div>
          <div id="dp-diary"></div>
        </section>
        <section class="cd-sec" aria-labelledby="dp-study-t">
          <div class="cd-sh"><h3 id="dp-study-t">그날 한 공부</h3></div>
          <div id="dp-study"><p class="faint">불러오는 중…</p></div>
          <div class="dp-rec" id="dp-rec"></div>
        </section>
      </div>`}
    </div>`;

  // ---------- data ----------
  async function load() {
    try {
      const [p, d] = await Promise.all([api.plans([key]), api.calendarDay(day)]);
      if (!alive) return;
      S.plans = p.plans || [];
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
  function drawAll() { drawGoals(); drawGrid(); if (!future) { drawScore(); drawLogs(); drawStudy(); drawRecord(); } }

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
      hours += `<div class="hour${past ? " past" : ""}"><span>${pad(h)}:00</span><button type="button" data-slot="${pad(h)}:00" tabindex="-1">+ ${pad(h)}:00에 추가</button></div>`;
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
      const top = ((s - startH * 60) / 60) * HOUR_PX + 2, h = Math.max(24, ((e - s) / 60) * HOUR_PX - 4), w = 100 / n;
      return `<div class="block ${status(p)}" style="top:${top}px;height:${h}px;left:calc(${c * w}% + ${c ? 3 : 0}px);right:auto;width:calc(${w}% - ${n > 1 ? 3 : 0}px)" data-id="${esc(p.id)}">
        <input type="checkbox" class="check" data-toggle="${esc(p.id)}" ${p.done ? "checked" : ""} aria-label="${esc(p.text)} 완료">
        <div class="txt"><span data-edit="${esc(p.id)}">${esc(p.text)}</span>${h > 34 ? `<span class="when">${esc(p.start)}–${toTime(e)} · ${hm(e - s)}${p.focus_mins > 0 ? ` · 집중 ${hm(p.focus_mins)}` : ""}</span>` : ""}</div>
        ${playBtn(p)}
        <button class="icon-btn sm" type="button" data-later="${esc(p.id)}" aria-label="다음 날로 미루기" title="다음 날로 미루기">${icon.later(14)}</button>
        <button class="icon-btn sm" type="button" data-del="${esc(p.id)}" aria-label="삭제">${icon.x(14)}</button>
      </div>`;
    }).join("");
    const nowLine = isToday && nowM >= startH * 60 ? `<div class="now-line" style="top:${((nowM - startH * 60) / 60) * HOUR_PX}px" aria-hidden="true"></div>` : "";
    $("#dp-grid", el).innerHTML = hours + `<div class="blocks">${blocks}</div>` + nowLine;
    $("#dp-tt-sum", el).textContent = timed.length ? `${timed.length}개 · ${hm(timed.reduce((a, p) => a + (p.mins || 0), 0))}` : "";
  }

  // 시간이 없는 하루 계획 = 그날 꼭 할 것
  function drawGoals() {
    const ul = $("#dp-goals", el);
    if (!S.plans) return;
    const list = S.plans.filter((p) => !p.start), done = list.filter((p) => p.done).length;
    $("#dp-goal-sum", el).innerHTML = list.length ? `<span class="chip ${done === list.length ? "good" : ""}">${done}/${list.length} 끝냄</span>` : "";
    ul.innerHTML = list.length ? list.map((p) => `
      <li class="todo ${p.done ? "done" : ""}" data-id="${esc(p.id)}">
        <input type="checkbox" class="check" data-toggle="${esc(p.id)}" ${p.done ? "checked" : ""} aria-label="${esc(p.text)} 끝냄">
        <span class="txt" data-edit="${esc(p.id)}">${esc(p.text)}</span>
        ${focusTag(p)}${playBtn(p)}
        <span class="acts"><button class="icon-btn sm" type="button" data-later="${esc(p.id)}" aria-label="다음 날로 미루기" title="다음 날로 미루기">${icon.later(14)}</button><button class="icon-btn sm danger" type="button" data-del="${esc(p.id)}" aria-label="삭제">${icon.x(14)}</button></span>
      </li>`).join("")
      : `<li class="empty cd-empty">${future ? "아직 적어 둔 일이 없어요." : isPast ? "이날은 시간 없는 할 일이 없었어요." : "오늘 꼭 이루고 싶은 것을 1~3개 적어 보세요."}</li>`;
  }

  function drawScore() {
    const box = $("#dp-score", el);
    if (!box) return;
    const sc = dayScore(S.plans || [], me.day_goal);
    const study = studyMins({ focus: focusOf(S.logs), english: englishOf(S.english) });
    const verdict = sc.score == null ? ["", "계획을 세우면 점수가 생겨요"] : sc.score >= 80 ? ["good", "아주 잘했어요"] : sc.score >= 50 ? ["warn", "조금만 더 힘내요"] : ["bad", isPast ? "다음엔 더 잘할 수 있어요" : "아직 시간이 있어요"];
    box.innerHTML = `
      <div class="cd-sh"><h3 id="dp-score-t">${isToday ? "오늘 점수" : "그날 점수"}</h3>${verdict[0] ? `<span class="chip ${verdict[0]}">${verdict[1]}</span>` : `<span class="faint">${verdict[1]}</span>`}</div>
      <div class="score-card">
        <div class="big">${sc.score ?? "–"}<small>/ 100</small></div>
        <div class="meters">
          <div class="meter"><span>계획</span><div class="bar"><i style="width:${pct(sc.plan)}%;opacity:.55"></i></div><em>${pct(sc.plan)}%</em></div>
          <div class="meter"><span>실행</span><div class="bar"><i style="width:${pct(sc.exec)}%"></i></div><em>${pct(sc.exec)}%</em></div>
          <div class="meter"><span>공부</span><div class="bar"><i style="width:${pct(study / Math.max(30, me.day_goal))}%;background:var(--accent)"></i></div><em>${study ? hm(study).replace("시간", "h").replace("분", "m").replace(" ", "") : "0m"}</em></div>
        </div>
      </div>
      <p class="dp-hint">계획 = 세운 시간 ${hm(sc.planned)} ÷ 목표 ${hm(me.day_goal)} · 실행 = 해낸 ${sc.planned ? hm(sc.doneMins) : sc.doneCount + "개"} · 점수 = 계획 40 + 실행 60 · 공부 = 집중 + 영어
        · <button class="linkbtn dp-goal-btn" type="button" id="dp-goal-btn">목표 바꾸기</button></p>
      <form class="row" id="dp-goal-form" hidden>
        <label class="muted" for="dp-goal-in" style="font-size:12.5px">하루 목표</label>
        <select class="select" id="dp-goal-in">${[60, 120, 180, 240, 300, 360, 480, 600].map((m) => `<option value="${m}" ${m === me.day_goal ? "selected" : ""}>${hm(m)}</option>`).join("")}</select>
        <button class="btn sm" type="submit">저장</button>
      </form>`;
    $("#dp-goal-btn", box).addEventListener("click", () => { const f = $("#dp-goal-form", box); f.hidden = !f.hidden; });
    $("#dp-goal-form", box).addEventListener("submit", async (e) => {
      e.preventDefault();
      try {
        const { user } = await api.updateMe({ day_goal: +$("#dp-goal-in", box).value });
        me.day_goal = user.day_goal;
        window.dispatchEvent(new CustomEvent("trio:me", { detail: user }));
        drawScore();
      } catch (ex) { toast(ex.message, "err"); }
    });
  }

  function drawLogs() {
    const ol = $("#dp-logs", el);
    if (!ol) return;
    ol.innerHTML = S.logs.length ? S.logs.map((l) => `
      <li class="tl-item ${esc(l.kind)}">
        <time>${esc(l.at)}</time><span class="pin"></span>
        <span class="t" data-logedit="${esc(l.id)}">${esc(l.text)}</span>
        <button class="icon-btn sm danger" type="button" data-logdel="${esc(l.id)}" aria-label="기록 삭제">${icon.x(13)}</button>
      </li>`).join("") : `<li class="empty" style="list-style:none">할 일을 체크하거나, 방금 한 일을 적으면 여기에 시간 순서대로 남아요.</li>`;
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
        S.logs.push(log); S.logs.sort((a, b) => a.at.localeCompare(b.at)); drawLogs();
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
    if (slot) { const f = $("#dp-quick", el); f.start.value = slot.dataset.slot; f.text.focus(); return; }
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
    const ld = e.target.closest("[data-logdel]");
    if (ld) {
      try { await api.deleteLog(ld.dataset.logdel); S.logs = S.logs.filter((l) => l.id !== ld.dataset.logdel); drawLogs(); drawScore(); drawStudy(); changed("logs"); } catch (ex) { toast(ex.message, "err"); }
    }
  }
  function onElDbl(e) {
    const ed = e.target.closest("[data-edit]");
    if (ed) return editInline(ed, async (text) => { await api.updatePlan(ed.dataset.edit, { text }); const p = S.plans.find((x) => x.id === ed.dataset.edit); if (p) p.text = text; changed("plans"); });
    const le = e.target.closest("[data-logedit]");
    if (le) editInline(le, async (text) => { await api.updateLog(le.dataset.logedit, { text }); const l = S.logs.find((x) => x.id === le.dataset.logedit); if (l) l.text = text; });
  }

  $("#dp-goal-add", el).addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.currentTarget, text = f.text.value.trim();
    if (!text || !S.plans) return f.text.focus();
    try { await addPlan({ text }); f.text.value = ""; } catch (ex) { toast(ex.message, "err"); }
    f.text.focus();
  });
  $("#dp-quick", el).addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.currentTarget, text = f.text.value.trim(), start = f.start.value, mins = +f.mins.value;
    if (!text || !S.plans) { f.text.focus(); return; }
    if (!start) { f.start.focus(); toast("시작 시각을 골라 주세요.", "err"); return; }
    try {
      await addPlan({ text, start, mins });
      f.text.value = ""; f.start.value = toTime(Math.min(23 * 60, toMin(start) + mins)); // 다음 블록은 이어서
    } catch (ex) { toast(ex.message, "err"); }
  });
  if (!future) {
    $("#dp-log-form", el).addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = e.currentTarget, text = f.text.value.trim();
      if (!text) return;
      try {
        const { log } = await api.addLog({ day, at: f.at.value || nowTime(), text });
        S.logs.push(log); S.logs.sort((a, b) => a.at.localeCompare(b.at) || a.created_at - b.created_at);
        f.text.value = ""; if (isToday) f.at.value = nowTime();
        drawLogs(); changed("logs");
      } catch (ex) { toast(ex.message, "err"); }
    });
    stopDiary = mountDiary($("#dp-diary", el), day, { rows: 5, onSaved: () => changed("diary") });
  }

  const onChanged = (e) => { if (["logs", "plans"].includes(e.detail?.kind)) load(); };
  window.addEventListener("trio:changed", onChanged);
  const tick = setInterval(() => { if (isToday && S.plans) drawGrid(); }, 60_000);
  load();
  loadExtras();

  return () => {
    alive = false;
    stopDiary?.();
    window.removeEventListener("trio:changed", onChanged);
    el.removeEventListener("change", onElChange);
    el.removeEventListener("click", onElClick);
    el.removeEventListener("dblclick", onElDbl);
    clearInterval(tick);
  };
}
