// 오늘: 시간 블록 플래너 · 실행 타임라인 · 데일리 노트 · 오늘 점수
import { api } from "../api.js";
import {
  $, esc, pad, hm, toMin, toTime, nowTime, ymd, parseYmd, addDays, today, sameDay, relativeDay,
  DOW, DOW_EN, MON_EN, isoWeek, dayOfYear, daysInYear, dayScore, pct, debounce, toast, initial,
} from "../util.js";
import { icon } from "../icons.js";
import { mountDiary } from "../diary.js";

const HOUR_PX = 48;

export function mount(root, ctx, r) {
  const date = parseYmd(r.date);
  const day = ymd(date);
  const key = "D:" + day;
  const owner = r.user ? ctx.user(r.user) : ctx.me;
  if (!owner) { root.innerHTML = `<div class="view"><p class="empty">멤버를 찾을 수 없어요.</p></div>`; return; }
  const mine = owner.id === ctx.me.id;
  const isToday = sameDay(date, today());
  const isPast = date < today();
  const S = { plans: [], logs: [], note: null, carry: 0, streak: 0, preview: false };
  const base = mine ? "#/today/" : `#/u/${owner.id}/today/`;
  const rel = relativeDay(date);
  const wk = isoWeek(date);

  root.innerHTML = `
    <div class="view" style="--me:${esc(owner.color)}">
      <header class="vhead">
        <div class="title">
          <span class="eyebrow">${mine ? "Daily" : esc(owner.display_name) + "의 하루 · 보기 전용"} · W${pad(wk.w)} · ${dayOfYear(date)}/${daysInYear(date.getFullYear())}</span>
          <div class="date-hero">
            <span class="serif">${DOW_EN[date.getDay()]}</span>
            <span class="kr">${date.getMonth() + 1}월 ${date.getDate()}일 ${DOW[date.getDay()]}요일${rel ? ` · ${rel}` : ""}</span>
          </div>
        </div>
        <div class="row">
          <span class="chip accent" id="streak" hidden></span>
          <div class="pager">
            <a class="icon-btn" href="${base}${ymd(addDays(date, -1))}" aria-label="전날">${icon.left()}</a>
            <a class="btn ghost sm" href="${base}${ymd(today())}">오늘</a>
            <a class="icon-btn" href="${base}${ymd(addDays(date, 1))}" aria-label="다음날">${icon.right()}</a>
            <label class="icon-btn" style="position:relative" aria-label="날짜 고르기">${icon.calendar()}
              <input type="date" id="pick-date" value="${day}" style="position:absolute;inset:0;opacity:0;cursor:pointer">
            </label>
          </div>
        </div>
      </header>
      <div id="carry"></div>
      <div class="today-top">
        <section class="panel goals-panel" aria-labelledby="h-goals">
          <div class="panel-head"><h2 class="h2" id="h-goals">오늘의 목표</h2><span id="goal-sum"></span></div>
          <ul class="todos" id="goals"></ul>
          ${mine ? `
          <form class="addrow" id="goal-add" autocomplete="off">
            <input class="input" id="g-text" maxlength="200" placeholder="오늘 꼭 이룰 것 · 예: 기출 1회분 80점 넘기" aria-label="오늘의 목표 추가">
            <button class="btn" type="submit">${icon.plus(15)}추가</button>
          </form>` : ""}
        </section>
        <section class="panel" aria-labelledby="h-score"><div id="score"></div></section>
      </div>
      <div class="grid-2">
        <section class="panel" aria-labelledby="h-tt">
          <div class="panel-head"><h2 class="h2" id="h-tt">시간표</h2><span class="faint" id="tt-sum" style="font-size:13px"></span></div>
          ${mine ? `
          <form class="quick" id="quick" autocomplete="off">
            <input class="input mono" type="time" id="q-start" aria-label="시작 시각" required value="${isToday ? pad(Math.min(23, new Date().getHours() + 1)) + ":00" : "09:00"}">
            <select class="select" id="q-mins" aria-label="걸리는 시간">${[15, 30, 45, 60, 90, 120, 180].map((m) => `<option value="${m}" ${m === 60 ? "selected" : ""}>${hm(m)}</option>`).join("")}</select>
            <input class="input grow" id="q-text" maxlength="200" placeholder="그 시간에 할 일 · 예: 영단어 50개 암기" aria-label="시간표 할 일">
            <button class="btn" type="submit">${icon.plus(15)}추가</button>
          </form>
          <p class="faint" style="margin:-6px 0 0;font-size:12.5px">시간이 정해진 할 일이에요. 빈 칸을 누르면 그 시각이 채워지고, 다음 칸은 이어서 채워져요.</p>` : ""}
          <div class="day-grid" id="grid"></div>
        </section>
        <div class="stack">
          <section class="panel" aria-labelledby="h-log">
            <div class="panel-head"><h2 class="h2" id="h-log">실행 기록</h2><span class="faint" style="font-size:13px">시간 순서대로 쌓여요</span></div>
            ${mine ? `
            <form class="log-input" id="log-form" autocomplete="off">
              <input class="input mono" type="time" id="l-at" value="${nowTime()}" aria-label="기록 시각">
              <input class="input" id="l-text" maxlength="500" placeholder="방금 한 일, 떠오른 생각…" aria-label="기록 내용">
              <button class="btn" type="submit">기록</button>
            </form>` : ""}
            <ol class="timeline" id="logs"></ol>
          </section>
          ${mine ? `
          <section class="panel diary-panel" aria-labelledby="h-diary">
            <div class="panel-head"><h2 class="h2" id="h-diary">오늘의 일기</h2><a class="linkbtn faint" href="#/diary/${day}" style="font-size:13px">일기장 ${icon.right(13)}</a></div>
            <div id="diary"></div>
          </section>` : ""}
        </div>
      </div>
    </div>`;

  // ---------- data ----------
  async function load() {
    try {
      const [p, l] = await Promise.all([api.plans([key], owner.id), api.logs(day, owner.id)]);
      S.plans = p.plans; S.logs = l.logs;
      drawAll();
    } catch (e) { toast(e.message, "err"); }
  }
  async function loadExtras() {
    try {
      const { days } = await api.heatmap(date.getFullYear(), owner.id);
      const doneByDay = new Map(days.map((d) => [d.period.slice(2), d.done]));
      let d = today(), n = 0;
      if (!doneByDay.get(ymd(d))) d = addDays(d, -1);
      while (doneByDay.get(ymd(d)) > 0) { n++; d = addDays(d, -1); }
      S.streak = n;
      const el = $("#streak", root);
      if (el) { el.hidden = n < 2; el.textContent = `연속 ${n}일 달성`; }
    } catch {}
    if (mine && isToday) {
      try {
        const y = "D:" + ymd(addDays(date, -1));
        const { plans } = await api.plans([y]);
        S.carry = plans.filter((p) => !p.done).length;
        drawCarry();
      } catch {}
    }
  }

  // ---------- drawing ----------
  function drawAll() { drawGrid(); drawGoals(); drawScore(); drawLogs(); }

  function drawCarry() {
    const el = $("#carry", root);
    el.innerHTML = S.carry ? `<div class="banner"><p>어제 못 끝낸 일이 <b>${S.carry}개</b> 있어요. 오늘로 가져와서 다시 계획할까요?</p>
      <button class="btn sm" type="button" id="carry-btn">오늘로 가져오기</button></div>` : "";
    const b = $("#carry-btn", el);
    if (b) b.addEventListener("click", async () => {
      try {
        const { moved } = await api.carry("day", "D:" + ymd(addDays(date, -1)), key);
        toast(`${moved}개를 오늘로 옮겼어요.`);
        S.carry = 0; drawCarry(); load();
      } catch (e) { toast(e.message, "err"); }
    });
  }

  function status(p) {
    if (p.done) return "done";
    if (!p.start) return isPast ? "miss" : "";
    const end = toMin(p.start) + (p.mins || 0);
    if (isPast || (isToday && end <= toMin(nowTime()))) return "miss";
    return "";
  }

  function drawGrid() {
    const timed = S.plans.filter((p) => p.start).sort((a, b) => toMin(a.start) - toMin(b.start));
    const first = timed.length ? Math.floor(toMin(timed[0].start) / 60) : 6;
    const startH = Math.min(6, first), endH = 24;
    const nowM = toMin(nowTime());
    let hours = "";
    for (let h = startH; h < endH; h++) {
      const past = isPast || (isToday && (h + 1) * 60 <= nowM);
      hours += `<div class="hour${past ? " past" : ""}"><span>${pad(h)}:00</span>${mine ? `<button type="button" data-slot="${pad(h)}:00" tabindex="-1">+ ${pad(h)}:00에 추가</button>` : "<i></i>"}</div>`;
    }
    // overlap → columns
    const cols = [], placed = [];
    for (const p of timed) {
      const s = toMin(p.start), e = s + (p.mins || 30);
      let c = cols.findIndex((end) => end <= s);
      if (c < 0) { c = cols.length; cols.push(e); } else cols[c] = e;
      placed.push({ p, s, e, c });
    }
    const clusterCols = placed.map((x) => {
      let n = 1;
      for (const y of placed) if (y !== x && y.s < x.e && x.s < y.e) n = Math.max(n, y.c + 1, x.c + 1);
      return n;
    });
    const blocks = placed.map(({ p, s, e, c }, i) => {
      const top = ((s - startH * 60) / 60) * HOUR_PX + 2;
      const h = Math.max(24, ((e - s) / 60) * HOUR_PX - 4);
      const n = clusterCols[i], w = 100 / n;
      const st = status(p);
      return `<div class="block ${st}" style="top:${top}px;height:${h}px;left:calc(${c * w}% + ${c ? 3 : 0}px);right:auto;width:calc(${w}% - ${n > 1 ? 3 : 0}px)" data-id="${esc(p.id)}">
        <input type="checkbox" class="check" data-toggle="${esc(p.id)}" ${p.done ? "checked" : ""} ${mine ? "" : "disabled"} aria-label="${esc(p.text)} 완료">
        <div class="txt"><span data-edit="${esc(p.id)}">${esc(p.text)}</span>${h > 34 ? `<span class="when">${esc(p.start)}–${toTime(e)} · ${hm(e - s)}</span>` : ""}</div>
        ${mine ? `<button class="icon-btn sm" type="button" data-later="${esc(p.id)}" aria-label="내일로 미루기" title="내일로 미루기">${icon.later(14)}</button>
        <button class="icon-btn sm" type="button" data-del="${esc(p.id)}" aria-label="삭제">${icon.x(14)}</button>` : ""}
      </div>`;
    }).join("");
    const nowLine = isToday && nowM >= startH * 60 ? `<div class="now-line" style="top:${((nowM - startH * 60) / 60) * HOUR_PX}px" aria-hidden="true"></div>` : "";
    $("#grid", root).innerHTML = hours + `<div class="blocks">${blocks}</div>` + nowLine;
    const sc = dayScore(S.plans, owner.day_goal);
    $("#tt-sum", root).textContent = S.plans.length ? `${S.plans.length}개 · ${hm(sc.planned)} 계획` : "";
  }

  // 시간이 없는 하루 계획 = 오늘의 목표
  function drawGoals() {
    const list = S.plans.filter((p) => !p.start), done = list.filter((p) => p.done).length;
    $("#goal-sum", root).innerHTML = list.length ? `<span class="chip ${done === list.length ? "good" : ""}">${done}/${list.length} 달성</span>` : "";
    $("#goals", root).innerHTML = list.length ? `${list.map((p) => `
        <li class="todo ${p.done ? "done" : ""}">
          <input type="checkbox" class="check" data-toggle="${esc(p.id)}" ${p.done ? "checked" : ""} ${mine ? "" : "disabled"} aria-label="${esc(p.text)} 완료">
          <span class="txt" data-edit="${esc(p.id)}">${esc(p.text)}</span>
          ${mine ? `<span class="acts"><button class="icon-btn sm" type="button" data-later="${esc(p.id)}" aria-label="내일로 미루기">${icon.later(14)}</button><button class="icon-btn sm danger" type="button" data-del="${esc(p.id)}" aria-label="삭제">${icon.x(14)}</button></span>` : ""}
        </li>`).join("")}` : `<li class="empty">${mine ? "오늘 하루 꼭 이루고 싶은 것을 1~3개 적어 보세요." : "아직 오늘의 목표가 없어요."}</li>`;
  }

  function drawScore() {
    const sc = dayScore(S.plans, owner.day_goal);
    const focusMins = S.logs.filter((l) => l.kind === "focus").reduce((n, l) => n + (l.mins || 0), 0);
    const verdict = sc.score == null ? ["", "계획을 세우면 점수가 생겨요"] : sc.score >= 80 ? ["good", "아주 잘하고 있어요"] : sc.score >= 50 ? ["warn", "조금만 더 힘내요"] : ["bad", isPast ? "다음엔 더 잘할 수 있어요" : "아직 시간이 있어요"];
    $("#score", root).innerHTML = `
      <div class="panel-head"><h2 class="h2" id="h-score">오늘 점수</h2>${verdict[0] ? `<span class="chip ${verdict[0]}">${verdict[1]}</span>` : `<span class="faint" style="font-size:12.5px">${verdict[1]}</span>`}</div>
      <div class="score-card">
        <div class="big">${sc.score ?? "–"}<small>/ 100</small></div>
        <div class="meters">
          <div class="meter"><span>계획</span><div class="bar"><i style="width:${pct(sc.plan)}%;opacity:.55"></i></div><em>${pct(sc.plan)}%</em></div>
          <div class="meter"><span>실행</span><div class="bar"><i style="width:${pct(sc.exec)}%"></i></div><em>${pct(sc.exec)}%</em></div>
          <div class="meter"><span>집중</span><div class="bar"><i style="width:${pct(focusMins / Math.max(30, owner.day_goal))}%;background:var(--accent)"></i></div><em>${focusMins ? hm(focusMins).replace("시간", "h").replace("분", "m").replace(" ", "") : "0m"}</em></div>
        </div>
      </div>
      <p class="faint" style="margin:0;font-size:12px">계획 = 세운 시간 ${hm(sc.planned)} ÷ 목표 ${hm(owner.day_goal)} · 실행 = 해낸 ${sc.planned ? hm(sc.doneMins) : sc.doneCount + "개"} · 점수 = 계획 40 + 실행 60
        ${mine ? ` · <button class="linkbtn" type="button" id="goal-btn" style="background:none;border:0;padding:0;color:var(--ink-2);text-decoration:underline;font-size:12px">목표 바꾸기</button>` : ""}</p>
      <form class="row" id="goal-form" hidden>
        <label class="muted" for="goal-in" style="font-size:12.5px">하루 목표</label>
        <select class="select" id="goal-in">${[60, 120, 180, 240, 300, 360, 480, 600].map((m) => `<option value="${m}" ${m === owner.day_goal ? "selected" : ""}>${hm(m)}</option>`).join("")}</select>
        <button class="btn sm" type="submit">저장</button>
      </form>`;
    const gb = $("#goal-btn", root);
    if (gb) gb.addEventListener("click", () => { const f = $("#goal-form", root); f.hidden = !f.hidden; });
    const gf = $("#goal-form", root);
    if (gf) gf.addEventListener("submit", async (e) => {
      e.preventDefault();
      try {
        const { user } = await api.updateMe({ day_goal: +$("#goal-in", root).value });
        owner.day_goal = user.day_goal;
        window.dispatchEvent(new CustomEvent("trio:me", { detail: user }));
        drawScore();
      } catch (ex) { toast(ex.message, "err"); }
    });
  }

  function drawLogs() {
    const el = $("#logs", root);
    el.innerHTML = S.logs.length ? S.logs.map((l) => `
      <li class="tl-item ${l.kind}">
        <time>${esc(l.at)}</time><span class="pin"></span>
        <span class="t" ${mine ? `data-logedit="${esc(l.id)}"` : ""}>${esc(l.text)}</span>
        ${mine ? `<button class="icon-btn sm danger" type="button" data-logdel="${esc(l.id)}" aria-label="기록 삭제">${icon.x(13)}</button>` : "<span></span>"}
      </li>`).join("") : `<li class="empty" style="list-style:none">${mine ? "할 일을 체크하거나, 방금 한 일을 적으면 여기에 시간 순서대로 남아요." : "아직 기록이 없어요."}</li>`;
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
    } catch (e) { p.done = done ? 0 : 1; drawAll(); toast(e.message, "err"); }
  }
  function editInline(el, save) {
    const old = el.textContent;
    el.contentEditable = "true"; el.focus();
    document.getSelection().selectAllChildren(el);
    const finish = async (commit) => {
      el.contentEditable = "false";
      el.removeEventListener("keydown", onKey); el.removeEventListener("blur", onBlur);
      const v = el.textContent.trim();
      if (!commit || !v || v === old) { el.textContent = old; return; }
      try { await save(v); } catch (e) { el.textContent = old; toast(e.message, "err"); }
    };
    const onKey = (e) => { if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); finish(true); } if (e.key === "Escape") finish(false); };
    const onBlur = () => finish(true);
    el.addEventListener("keydown", onKey); el.addEventListener("blur", onBlur);
  }

  root.addEventListener("change", (e) => {
    const t = e.target.closest("[data-toggle]");
    if (t && mine) toggle(t.dataset.toggle, t.checked);
    if (e.target.id === "pick-date" && e.target.value) ctx.go(base + e.target.value);
  });
  root.addEventListener("click", async (e) => {
    const slot = e.target.closest("[data-slot]");
    if (slot) { $("#q-start", root).value = slot.dataset.slot; $("#q-text", root).focus(); return; }
    const del = e.target.closest("[data-del]");
    if (del) {
      const id = del.dataset.del, keep = S.plans;
      S.plans = S.plans.filter((p) => p.id !== id); drawAll();
      try { await api.deletePlan(id); } catch (ex) { S.plans = keep; drawAll(); toast(ex.message, "err"); }
      return;
    }
    const later = e.target.closest("[data-later]");
    if (later) {
      const id = later.dataset.later;
      try { await api.updatePlan(id, { period: "D:" + ymd(addDays(date, 1)) }); S.plans = S.plans.filter((p) => p.id !== id); drawAll(); toast("내일로 미뤘어요."); }
      catch (ex) { toast(ex.message, "err"); }
      return;
    }
    const ld = e.target.closest("[data-logdel]");
    if (ld) {
      try { await api.deleteLog(ld.dataset.logdel); S.logs = S.logs.filter((l) => l.id !== ld.dataset.logdel); drawLogs(); } catch (ex) { toast(ex.message, "err"); }
    }
  });
  root.addEventListener("dblclick", (e) => {
    if (!mine) return;
    const ed = e.target.closest("[data-edit]");
    if (ed) return editInline(ed, async (text) => { await api.updatePlan(ed.dataset.edit, { text }); const p = S.plans.find((x) => x.id === ed.dataset.edit); if (p) p.text = text; });
    const le = e.target.closest("[data-logedit]");
    if (le) editInline(le, async (text) => { await api.updateLog(le.dataset.logedit, { text }); const l = S.logs.find((x) => x.id === le.dataset.logedit); if (l) l.text = text; });
  });

  if (mine) {
    $("#quick", root).addEventListener("submit", async (e) => {
      e.preventDefault();
      const text = $("#q-text", root).value.trim();
      if (!text) { $("#q-text", root).focus(); return; }
      const start = $("#q-start", root).value;
      if (!start) { $("#q-start", root).focus(); toast("시작 시각을 골라 주세요.", "err"); return; }
      const mins = +$("#q-mins", root).value;
      try {
        const { plan } = await api.addPlan({ scope: "day", period: key, text, start, mins });
        S.plans.push(plan);
        $("#q-text", root).value = "";
        $("#q-start", root).value = toTime(Math.min(23 * 60, toMin(start) + mins)); // 다음 블록은 이어서
        drawAll();
      } catch (ex) { toast(ex.message, "err"); }
    });
    $("#log-form", root).addEventListener("submit", async (e) => {
      e.preventDefault();
      const text = $("#l-text", root).value.trim();
      if (!text) return;
      try {
        const { log } = await api.addLog({ day, at: $("#l-at", root).value || nowTime(), text });
        S.logs.push(log); S.logs.sort((a, b) => a.at.localeCompare(b.at) || a.created_at - b.created_at);
        $("#l-text", root).value = ""; $("#l-at", root).value = nowTime();
        drawLogs();
      } catch (ex) { toast(ex.message, "err"); }
    });

    $("#goal-add", root).addEventListener("submit", async (e) => {
      e.preventDefault();
      const input = $("#g-text", root), text = input.value.trim();
      if (!text) return input.focus();
      try { const { plan } = await api.addPlan({ scope: "day", period: key, text }); S.plans.push(plan); input.value = ""; drawAll(); }
      catch (ex) { toast(ex.message, "err"); }
    });
    const stopDiary = mountDiary($("#diary", root), day, { rows: 5 });
    root._flush = () => stopDiary();
  }

  const onChanged = (e) => { if (["logs", "plans"].includes(e.detail.kind)) load(); };
  window.addEventListener("trio:changed", onChanged);
  const tick = setInterval(() => { if (isToday) drawGrid(); }, 60_000);

  load();
  loadExtras();
  if (mine) setTimeout(() => $("#q-text", root)?.focus({ preventScroll: true }), 50);

  return () => {
    if (root._flush) { root._flush(); root._flush = null; }
    window.removeEventListener("trio:changed", onChanged);
    clearInterval(tick);
  };
}
