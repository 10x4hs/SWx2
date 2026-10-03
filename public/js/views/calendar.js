// 캘린더 — 머리에서 월 | 연 을 골라요. 전부 나만 봐요.
// 월: 왼쪽 한 달 칸(그날 할 일 · 일기 · 공부 시간이 한눈에), 오른쪽 누른 날 한 페이지(views/day.js — 예전 오늘 화면 전부).
// 연: 한 해 잔디(일기 | 기록 탭). 칸을 누르면 월 보기의 그날로 가요.
import { api } from "../api.js";
import { $, esc, ymd, today, parseYmd, addDays, pad, hm, toast, debounce, studyMins } from "../util.js";
import { icon } from "../icons.js";
import { mountDay } from "./day.js";

const DOW = ["월", "화", "수", "목", "금", "토", "일"]; // 월요일부터 (잔디·주간 차트와 같게)
const DOW_SUN = ["일", "월", "화", "수", "목", "금", "토"];
const monthStart = (d) => new Date(d.getFullYear(), d.getMonth(), 1);
const gridStart = (m) => addDays(m, -((m.getDay() + 6) % 7));
const STUDY_FULL = 180; // 칸 아래 막대가 꽉 차는 공부 시간(분)
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const longDate = (d) => `${d.getMonth() + 1}월 ${d.getDate()}일 ${DOW_SUN[d.getDay()]}요일`;
const num = (d) => `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;

// 라우트 → 보기 상태. #/calendar/2026-09-29 · #/calendar/year/rec/2026
function stateOf(r, tk, prev) {
  if (r.mode === "year") return { mode: "year", sel: prev?.sel || tk, tab: r.tab === "rec" ? "rec" : "diary", year: r.year || parseYmd(prev?.sel || tk).getFullYear() };
  return { mode: "month", sel: r.day && DAY_RE.test(r.day) ? r.day : tk, tab: prev?.tab || "diary" };
}

let inst = null;
export function update(r) { inst?.update(r); }

export function mount(root, ctx, r) {
  const tk = ymd(today());
  let st = stateOf(r, tk);
  let month = monthStart(parseYmd(st.sel));
  let days = {}, alive = true, monthReq = 0, stopDay = null, stopYear = null;

  root.innerHTML = `
    <div class="view cal-view">
      <header class="vhead">
        <div class="title">
          <span class="row" style="gap:8px"><button type="button" class="icon-btn back-btn" id="cal-back" aria-label="뒤로">${icon.left(18)}</button><span class="eyebrow">캘린더</span></span>
          <h1 class="h1" id="cal-h1"></h1>
          <p class="cal-sub faint" id="cal-sub"></p>
        </div>
        <div class="row cal-tools">
          <nav class="seg cal-mode" aria-label="보기">
            <a data-mode="month">월</a><a data-mode="year">연</a>
          </nav>
          <div class="pager cal-pager" id="cal-pager"></div>
        </div>
      </header>
      <div id="cal-body"></div>
    </div>`;
  root.addEventListener("click", (e) => { if (e.target.closest("#cal-back")) window.trioBack?.(); });
  const body = $("#cal-body", root);

  function drawHead() {
    const selY = parseYmd(st.sel).getFullYear();
    root.querySelectorAll("[data-mode]").forEach((a) => {
      const on = a.dataset.mode === st.mode;
      a.href = a.dataset.mode === "month" ? `#/calendar/${st.mode === "year" && selY !== st.year ? `${st.year}-01-01` : st.sel}` : `#/calendar/year/${st.tab}/${st.mode === "year" ? st.year : month.getFullYear()}`;
      if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
    const pg = $("#cal-pager", root);
    if (st.mode === "month") {
      pg.innerHTML = `<button class="icon-btn" type="button" data-month="-1" aria-label="지난달">${icon.left()}</button>
        <button class="btn ghost sm" type="button" data-month="0">오늘</button>
        <button class="icon-btn" type="button" data-month="1" aria-label="다음 달">${icon.right()}</button>`;
    } else {
      const base = `#/calendar/year/${st.tab}/`, ty = today().getFullYear();
      pg.innerHTML = `<a class="icon-btn" href="${base}${st.year - 1}" aria-label="${st.year - 1}년">${icon.left()}</a>
        <a class="btn ghost sm" href="${base}${ty}">${ty}</a>
        <a class="icon-btn" href="${base}${st.year + 1}" aria-label="${st.year + 1}년">${icon.right()}</a>`;
      $("#cal-h1", root).textContent = `${st.year}년`;
    }
  }

  function drawBody() {
    stopDay?.(); stopDay = null; stopYear?.(); stopYear = null;
    if (st.mode === "year") { stopYear = mountYear(); return; }
    body.innerHTML = `
      <div class="cal-layout">
        <section class="cal-month" aria-label="한 달 달력">
          <div class="cal-dows" aria-hidden="true">${DOW.map((d, i) => `<span class="${i === 5 ? "sat" : i === 6 ? "sun" : ""}">${d}</span>`).join("")}</div>
          <div class="cal-grid" id="cal-grid" role="grid"></div>
          <div class="cal-legend">
            <span><i class="lg-todo"></i>할 일</span>
            <span><i class="lg-done"></i>끝낸 일</span>
            <span>${icon.diary(12)}일기 쓴 날</span>
            <span><i class="lg-bar"></i>공부 시간 (집중 + 영어, 3시간이면 꽉)</span>
          </div>
        </section>
        <article class="cal-page" id="cal-day" aria-label="그날 페이지"></article>
      </div>`;
    loadMonth();
    openDay();
  }

  // ---------- 월: 한 달 칸 ----------
  function drawMonth() {
    const grid = $("#cal-grid", root);
    if (!grid) return;
    const m = month, y = m.getFullYear(), mo = m.getMonth();
    $("#cal-h1", root).textContent = `${y}년 ${mo + 1}월`;
    const start = gridStart(m);
    const weeks = Math.ceil(((new Date(y, mo + 1, 0) - start) / 864e5 + 1) / 7);
    let html = "";
    for (let i = 0; i < weeks * 7; i++) {
      const d = addDays(start, i), k = ymd(d), info = days[k];
      const cls = ["cal-cell", d.getMonth() !== mo ? "out" : "", k === tk ? "today" : "", k === st.sel ? "sel" : "", k < tk ? "past" : "", i % 7 === 5 ? "sat" : i % 7 === 6 ? "sun" : ""].filter(Boolean).join(" ");
      const todos = info?.todos || [];
      const study = studyMins(info || {});
      const fw = Math.min(100, ((info?.focus || 0) / STUDY_FULL) * 100), ew = Math.min(100 - fw, ((info?.english || 0) / STUDY_FULL) * 100);
      const label = [longDate(d), info?.total ? `할 일 ${info.done}/${info.total}` : "", info?.diary || info?.mood ? "일기 씀" : "", study ? `공부 ${hm(study)}` : ""].filter(Boolean).join(", ");
      const more = info ? info.total - Math.min(3, todos.length) : 0;
      html += `<a class="${cls}" href="#/calendar/${k}" role="gridcell" aria-label="${esc(label)}"${k === st.sel ? ' aria-selected="true"' : ""}>
        <span class="cal-n">${d.getDate() === 1 && d.getMonth() !== mo ? `${d.getMonth() + 1}/1` : d.getDate()}</span>
        ${info?.diary || info?.mood ? `<span class="cal-diary" title="일기 씀">${icon.diary(12)}</span>` : ""}
        ${todos.length ? `<ul class="cal-todos">${todos.slice(0, 3).map((t) => `<li class="${t.done ? "done" : ""}">${t.start ? `<time>${esc(t.start)}</time>` : ""}${esc(t.text)}</li>`).join("")}${more > 0 ? `<li class="more">+${more}개 더</li>` : ""}</ul>` : ""}
        ${info?.total ? `<span class="cal-count" aria-hidden="true">${info.done}/${info.total}</span>` : ""}
        ${study ? `<span class="cal-bar" aria-hidden="true"><i style="width:${fw.toFixed(1)}%"></i><i class="en" style="width:${ew.toFixed(1)}%"></i></span>` : ""}
      </a>`;
    }
    grid.innerHTML = html;
    // 이번 달 요약
    const inMonth = Object.entries(days).filter(([k]) => k.startsWith(`${y}-${pad(mo + 1)}`)).map(([, v]) => v);
    const total = inMonth.reduce((a, v) => a + v.total, 0), done = inMonth.reduce((a, v) => a + v.done, 0);
    const diaryN = inMonth.filter((v) => v.diary || v.mood).length, mins = inMonth.reduce((a, v) => a + studyMins(v), 0);
    $("#cal-sub", root).textContent = [total ? `할 일 ${done}/${total} 끝냄` : "아직 할 일이 없어요 — 날짜를 누르고 적어 보세요", diaryN ? `일기 ${diaryN}일` : "", mins ? `공부 ${hm(mins)}` : ""].filter(Boolean).join(" · ");
  }
  async function loadMonth() {
    const my = ++monthReq, start = gridStart(month), end = addDays(start, 41);
    drawMonth();
    try {
      const res = await api.calendar(ymd(start), ymd(end));
      if (!alive || my !== monthReq || st.mode !== "month") return;
      days = res.days || {};
      drawMonth();
    } catch (e) { if (alive) toast(e.message, "err"); }
  }
  const reloadMonth = debounce(() => { if (st.mode === "month") loadMonth(); }, 400);

  // ---------- 월: 오른쪽 그날 한 페이지 ----------
  function openDay() {
    stopDay?.();
    const el = $("#cal-day", root);
    if (!el) return;
    stopDay = mountDay(el, ctx, st.sel, { onChange: () => reloadMonth() });
  }

  // ---------- 연: 한 해 잔디 (일기 | 기록) ----------
  function mountYear() {
    const year = st.year, tab = st.tab, t = today();
    let written = new Set(), size = new Map(), live = true; // size: 일기 = 글자 수, 기록 = 점수 (잔디 진하기)
    body.innerHTML = `
      <section class="grass-panel cal-year" aria-label="${year}년 ${tab === "rec" ? "하루 기록" : "일기"} 잔디">
        <div class="cy-head">
          <nav class="seg" aria-label="일기 · 기록">
            <a href="#/calendar/year/diary/${year}" ${tab === "diary" ? 'aria-current="page"' : ""}>${icon.diary(14)} 일기</a>
            <a href="#/calendar/year/rec/${year}" ${tab === "rec" ? 'aria-current="page"' : ""}>${icon.today(14)} 기록</a>
          </nav>
          <span class="faint" id="cy-stats"></span>
        </div>
        <div class="grass-scroll"><div class="grass" id="grass"></div></div>
        <div class="grass-legend">${tab === "rec"
          ? `<span><i></i>기록 없음</span><span>점수 낮음 <i class="on l1"></i><i class="on l2"></i><i class="on l3"></i><i class="on l4"></i> 높음</span><span><i class="today"></i>오늘</span>`
          : `<span><i></i>안 쓴 날</span><span>적게 <i class="on l1"></i><i class="on l2"></i><i class="on l3"></i><i class="on l4"></i> 많이</span><span><i class="today"></i>오늘</span>`}</div>
        <p class="cy-note">${icon.lock(13)} 칸을 누르면 그날 페이지로 가요. ${tab === "rec"
          ? "하루 기록은 그날 계획과 실행을 얼려 둔 사본이에요. 자정이 지나면 자동으로 저장돼요."
          : "일기는 나만 볼 수 있어요. 다른 두 사람에게도, AI에게도 보내지 않아요."}</p>
      </section>`;
    $("#cal-sub", root).textContent = "";

    function drawGrass() {
      // 첫 주는 1월 1일이 든 주의 월요일부터
      const jan1 = new Date(year, 0, 1), start = addDays(jan1, -((jan1.getDay() + 6) % 7)), end = new Date(year, 11, 31);
      const weeks = Math.ceil(((end - start) / 864e5 + 1) / 7);
      let months = "", cells = "", lastMonth = -1;
      for (let w = 0; w < weeks; w++) {
        const monday = addDays(start, w * 7);
        const m = (monday.getFullYear() < year ? jan1 : monday).getMonth();
        months += `<span style="grid-column:${w + 2}">${m !== lastMonth && monday <= end ? m + 1 : ""}</span>`;
        lastMonth = m;
        for (let d = 0; d < 7; d++) {
          const day = addDays(monday, d), k = ymd(day);
          if (day.getFullYear() !== year) { cells += `<span class="g out" style="grid-column:${w + 2};grid-row:${d + 2}"></span>`; continue; }
          const len = size.get(k) || 0, lv = tab === "rec" ? (len >= 80 ? 4 : len >= 55 ? 3 : len >= 30 ? 2 : 1) : len >= 700 ? 4 : len >= 300 ? 3 : len >= 100 ? 2 : 1;
          const cls = [written.has(k) ? `on l${lv}` : "", k === tk ? "today" : "", k === st.sel ? "sel" : "", day > t ? "future" : ""].filter(Boolean).join(" ");
          const tip = written.has(k) ? (tab === "rec" ? ` · ${size.get(k) ?? "–"}점` : " · 씀") : "";
          cells += `<a class="g ${cls}" href="#/calendar/${k}" style="grid-column:${w + 2};grid-row:${d + 2}" title="${num(day)}${tip}" aria-label="${num(day)}${tip}"></a>`;
        }
      }
      const dows = ["월", "", "수", "", "금", "", "일"].map((l, i) => `<span class="dw" style="grid-row:${i + 2}">${l}</span>`).join("");
      const g = $("#grass", root);
      g.style.gridTemplateColumns = `18px repeat(${weeks}, var(--cell))`;
      g.innerHTML = `<span class="mh"></span>${months}${dows}${cells}`;
    }
    function stats() {
      let streak = 0, d = t;
      if (!written.has(ymd(d))) d = addDays(d, -1);
      while (written.has(ymd(d))) { streak++; d = addDays(d, -1); }
      const txt = !written.size ? (tab === "rec" ? "아직 저장한 날이 없어요" : "아직 쓴 날이 없어요")
        : `${year}년 ${written.size}일 ${tab === "rec" ? "저장" : "씀"}${streak > 1 && year === t.getFullYear() ? ` · 연속 ${streak}일` : ""}`;
      $("#cy-stats", root).textContent = txt;
      $("#cal-sub", root).textContent = tab === "rec" ? "하루 기록 잔디 — 점수만큼 진해져요" : "일기 잔디 — 많이 쓴 날일수록 진해져요";
    }
    async function load() {
      try {
        if (tab === "rec") {
          const { days: list } = await api.recordDays(year);
          written = new Set(list.map((x) => x.day));
          size = new Map(list.map((x) => [x.day, x.score ?? 0]));
        } else {
          const { days: list } = await api.diaryDays(year);
          written = new Set(list.filter((x) => x.len > 0 || x.mood).map((x) => x.day));
          size = new Map(list.map((x) => [x.day, x.len || 0]));
        }
        if (!live) return;
        drawGrass(); stats();
      } catch (e) { if (live) toast(e.message, "err"); }
    }
    drawGrass(); stats();
    // 고른 날(없으면 오늘)이 보이도록 잔디를 옮겨요
    requestAnimationFrame(() => {
      const s = $(".g.sel", root) || $(".g.today", root), sc = $(".grass-scroll", root);
      if (s && sc) sc.scrollLeft = Math.max(0, s.offsetLeft - sc.clientWidth / 2);
    });
    load();
    return () => { live = false; };
  }

  // ---------- 이동 ----------
  root.querySelector(".cal-tools").addEventListener("click", (e) => {
    const b = e.target.closest("[data-month]");
    if (!b) return;
    const n = +b.dataset.month;
    if (n === 0) { if (st.sel !== tk) ctx.go("#/calendar/" + tk); else { month = monthStart(today()); loadMonth(); } return; }
    month = new Date(month.getFullYear(), month.getMonth() + n, 1);
    loadMonth();
    drawHead();
  });
  const onKey = (e) => {
    if (e.target.closest("input, textarea, select, [contenteditable]") || e.metaKey || e.ctrlKey || e.altKey) return;
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    if (!step || !e.target.closest(".cal-grid")) return;
    e.preventDefault();
    ctx.go("#/calendar/" + ymd(addDays(parseYmd(st.sel), step)));
  };
  root.addEventListener("keydown", onKey);

  inst = {
    update(nr) {
      const next = stateOf(nr, tk, st);
      if (next.mode !== st.mode || (next.mode === "year" && (next.year !== st.year || next.tab !== st.tab))) {
        st = next;
        if (st.mode === "month") month = monthStart(parseYmd(st.sel));
        drawHead(); drawBody();
        return;
      }
      if (next.mode === "year" || next.sel === st.sel) return;
      st = next;
      const m = monthStart(parseYmd(st.sel));
      if (+m !== +month) { month = m; loadMonth(); } else drawMonth();
      drawHead();
      openDay();
      if (matchMedia("(max-width: 1100px)").matches) $("#cal-day", root)?.scrollIntoView({ behavior: "smooth", block: "start" });
      else root.querySelector(`.cal-cell[href="#/calendar/${st.sel}"]`)?.focus({ preventScroll: true });
    },
  };

  const onChanged = () => reloadMonth();
  window.addEventListener("trio:changed", onChanged);
  drawHead();
  drawBody();
  return () => {
    alive = false; inst = null;
    stopDay?.(); stopYear?.();
    window.removeEventListener("trio:changed", onChanged);
  };
}
