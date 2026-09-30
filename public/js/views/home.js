// 홈 — 차트 다섯 쪽을 넘겨 봐요: 전체(링 넷) · 한 달 · 한 주 · 하루 · 우리 셋(주간 회고).
// 멤버 칩에는 "공부 중 · n분째"(숫자·상태만), 다른 사람 차트를 볼 땐 👏 응원(하루 한 번).
// 읽는 법은 어디서나 같아요: 진한 색 = 이룬 목표/끝낸 일 · 옅은 색 = 이미 지난 시간 · 회색 = 남은 것 · 흰 눈금 = 지금.
// 링이나 칸을 누르면 그 기간의 계획(또는 그날)으로 들어가요.
import { api } from "../api.js";
import { $, $$, esc, ymd, today, periodKey, periodStart, periodEnd, elapsed, dayScore, pct, nowTime, toast, daysInYear, dayOfYear, initial, addDays, isoWeek } from "../util.js";
import { ringHud, ringRows, gapText, RINGS } from "../ringhud.js";
import { periodChart } from "../charts/period.js";
import { dayClock } from "../charts/day.js";
import { mountPager, savedPage } from "../charts/pager.js";
import { teamWeek } from "../charts/team.js";
import { scramble } from "../fx.js";
import { mountCommand } from "../ai-command.js";
import { prioDonut, prioStats, PRIO_COLOR, PRIO_LABEL } from "../charts/prio.js";

const greet = (h) => (h < 5 ? "Good night" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening");
const daysLeft = (key) => Math.max(0, Math.ceil((periodEnd(key) - Date.now()) / 864e5));
const PAGES = [{ key: "all", label: "All" }, { key: "month", label: "Month" }, { key: "week", label: "Week" }, { key: "day", label: "Day" }, { key: "team", label: "Trio" }, { key: "check", label: "CheckList" }];

// 아래 범례 — 페이지마다 같은 문법, 말만 조금씩
const LEGEND = {
  all: ["진한 색 = 이룬 목표", "옅은 색 = 이미 지난 시간", "회색 = 남은 목표"],
  month: ["진한 색 = 이룬 목표 · 다 한 날", "옅을수록 = 덜 한 날 · 지난 시간", "회색 = 남은 목표 · 빈 날"],
  week: ["진한 색 = 이룬 목표 · 다 한 날", "옅을수록 = 덜 한 날 · 지난 시간", "회색 = 남은 목표 · 빈 날"],
  day: ["진한 색 = 끝낸 일", "옅은 색 = 이미 지난 시간", "회색 = 아직 안 한 일"],
  check: ["진한 색 = 끝낸 할 일", "옅은 색 = 남은 할 일", "색 = 우선순위 (Max → Low)"],
};
const HINT = { all: "링을 누르면 그 기간 목표 · 오늘은 하루 계획표", check: "도넛 · 요일을 누르면 체크리스트로", month: "누르면 이번 달 목표", week: "누르면 이번 주 목표", day: "누르면 시간 순 하루 계획표" };
const COLOR = { all: "var(--r-week)", check: "var(--p-max)", month: "var(--r-month)", week: "var(--r-week)", day: "var(--r-day)", team: "var(--m0)" };
// 서버 시각은 ms · 초 · ISO 어느 쪽이 와도 ms 로
const ms = (v) => (v == null ? null : typeof v === "string" ? Date.parse(v) : v < 1e12 ? v * 1000 : v);
// 이름 뒤 조사: 받침 있으면 "이", 없거나 영문이면 "가"
const iga = (w) => { const c = w.charCodeAt(w.length - 1); return c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 ? "이" : "가"; };

export function mount(root, ctx) {
  const t = today();
  const K = { year: periodKey("year", t), month: periodKey("month", t), week: periodKey("week", t), day: periodKey("day", t) };
  const left = daysInYear(t.getFullYear()) - dayOfYear(t);
  const HREF = { year: "#/goals/year", month: "#/goals/month", week: "#/goals/week", day: `#/calendar/${ymd(t)}`, check: "#/checklist" }; // 링 → 그 기간 목표 페이지 · 오늘 → 시간 순 하루 계획표
  const S = { who: ctx.me.id, items: null, data: null, score: null, hover: null, tip: null, wide: null, first: true,
    pres: null, presAt: 0, cheers: { received: [], sent: [] }, cheering: false,
    wk: { off: 0, cache: {}, busy: false, error: null } };
  let alive = true;

  // 이번 달의 모든 날 + 이번 주의 모든 날 (주가 달을 넘어가도)
  const monthDays = [], weekDays = [];
  for (let d = periodStart(K.month); d < periodEnd(K.month); d = addDays(d, 1)) monthDays.push(d);
  for (let i = 0; i < 7; i++) weekDays.push(addDays(periodStart(K.week), i));
  const dayKeys = [...new Set([...monthDays, ...weekDays].map((d) => periodKey("day", d)))];

  root.innerHTML = `
    <div class="stage" id="stage">
      <div class="spot" aria-hidden="true"></div>
      <div class="hud-layer">
        <div class="hud-tl">
          <span class="eyebrow">${t.getMonth() + 1}월 ${t.getDate()}일 ${"일월화수목금토"[t.getDay()]}요일 · ${+K.week.slice(7).replace("W", "")}주차</span>
          <h1 class="stage-hi" id="hi">${greet(new Date().getHours())}, <b></b></h1>
          <div class="hud-cheer" id="cheer" aria-live="polite"></div>
        </div>
        <div class="hud-tr mono" id="clock"></div>
        <div class="stage-chart v9" id="chart">
          <button type="button" class="pg-arrow prev" data-page-prev>‹</button>
          <div class="pg-view" id="pg-view" role="tabpanel"></div>
          <button type="button" class="pg-arrow next" data-page-next>›</button>
        </div>
        <nav class="pg-nav" aria-label="차트 넘기기">
          <button type="button" class="pg-mini" data-page-prev>‹</button>
          <div class="pg-tabs" role="tablist" aria-label="차트 고르기"></div>
          <button type="button" class="pg-mini" data-page-next>›</button>
        </nav>
        <div class="stage-rows" id="rows"></div>
        <div class="hud-ai" id="hud-ai" hidden aria-label="AI 챗봇"><div class="hud-ai-h"><span class="orb mini" aria-hidden="true"><span class="orb-glass"></span></span><b>AI 챗봇</b><span class="faint">묻거나 시키기</span></div><div id="hud-ai-box"></div></div>
        <section class="guide glass" id="guide" hidden aria-label="시작하기"></section>
        <div class="hud-bc" id="focus-line"></div>
        <div class="hud-br">
          <div class="who-switch" role="tablist" aria-label="누구의 현황을 볼까요">
            ${ctx.users.map((u) => `<button type="button" role="tab" data-who="${u.id}" style="--c:${esc(u.color)}"><span class="av sm" style="--c:${esc(u.color)}">${esc(initial(u.display_name))}</span>${esc(u.username.toUpperCase())}</button>`).join("")}
          </div>
        </div>
      </div>
      <i class="corner tl"></i><i class="corner tr"></i><i class="corner bl"></i><i class="corner br"></i>
    </div>`;

  const chart = $("#chart", root), view = $("#pg-view", root);
  const mine = () => S.who === ctx.me.id;
  const target = (key) => (mine() ? HREF[key] : "#/"); // 다른 사람은 차트만 (눌러도 안내만)
  // 한 달 · 한 주 차트는 어디를 눌러도 그 기간 페이지로 (달은 달치만 · 주는 주치만)
  const dayTarget = (d) => (pageKey() === "month" ? "#/goals/month" : pageKey() === "week" ? "#/goals/week" : `#/calendar/${d}`);
  const pageKey = () => PAGES[pager.index].key;

  function drawFocusLine() {
    const pk = pageKey(), it = pk === "all" ? S.items?.find((x) => x.key === S.hover) : null, line = $("#focus-line", root);
    line.dataset.page = pk;
    line.style.setProperty("--kc", COLOR[pk]);
    if (S.tip) { line.innerHTML = `<span>${esc(S.tip.text)}</span>${S.tip.go ? `<span class="fl-go">${esc(S.tip.go)}</span>` : ""}`; return; }
    if (it) { line.innerHTML = `<span class="fl-key">${esc(it.en)}</span><span>${it.total ? `${pct(it.value)}% 달성` : "목표 없음"} · ${pct(it.time)}% 지남 · ${esc(gapText(it))}</span><span class="fl-go">${mine() ? "눌러서 계획 →" : "눌러서 하루 보기 →"}</span>`; return; }
    if (pk === "team") {
      line.innerHTML = `${ctx.users.map((u, i) => `<span class="key"><i class="k-done" style="background:var(--m${i % 3})"></i>${esc(u.username.toUpperCase())}</span>`).join("")}<span class="key"><i class="k-todo"></i>회색 = 남은 계획</span><span class="faint">공부 시간 = 집중 + 영어 · 숫자는 셋 다, 글은 나만</span>`;
      return;
    }
    const [a, b, c] = LEGEND[pk];
    line.innerHTML = `<span class="key"><i class="k-done"></i>${a}</span><span class="key"><i class="k-past"></i>${b}</span><span class="key"><i class="k-todo"></i>${c}</span>${pk === "day" ? `<span class="key"><i class="k-now"></i>바늘 = 지금</span>` : ""}<span class="faint">${mine() ? HINT[pk] : "다른 사람은 차트만 보여요 · 내용은 비공개"}</span>`;
  }

  // 체크리스트 쪽: 오늘 할 일을 얼마나 했는지 (우선순위 색 도넛) + 이번 주 날마다 + 남은 할 일
  function checkPage(wide) {
    const c = S.data.check, items = c.items, own = mine();
    const rows = prioStats(items), max = Math.max(1, ...rows.map((r) => r.n));
    const left = items.filter((p) => !p.done).sort((a, b) => (PR_RANK[b.priority] || 0) - (PR_RANK[a.priority] || 0) || (a.start || "99").localeCompare(b.start || "99")).slice(0, 5);
    const wkMax = Math.max(1, ...c.week.map((d) => d.total));
    const go = (h, inner, cls = "") => (own ? `<a class="${cls}" href="${h}">${inner}</a>` : `<span class="${cls}">${inner}</span>`);
    return `<div class="hc${wide ? " wide" : ""}">
      ${go("#/checklist", prioDonut(items, { size: wide ? 360 : 260 }), "hc-donut")}
      <div class="hc-side">
        <div class="hc-h"><b>오늘 체크리스트</b>${own ? `<span class="faint">도넛을 누르면 적기</span>` : ""}</div>
        <div class="hc-bars">${rows.length ? rows.map((r) => `<div class="pb" style="--pc:${PRIO_COLOR[r.k]}"><span class="pb-l">${PRIO_LABEL[r.k]}</span><span class="pb-t" style="--w:${(r.n / max) * 100}%"><i style="--f:${(r.d / r.n) * 100}%"></i></span><span class="pb-n">${r.d}/${r.n}</span></div>`).join("") : `<p class="faint">${own ? "아직 오늘 할 일이 없어요. 도넛을 눌러 적어 보세요." : "오늘 할 일이 없어요."}</p>`}</div>
        ${own && left.length ? `<ul class="hc-left">${left.map((p) => `<li><i style="background:${PRIO_COLOR[p.priority || "none"]}"></i>${p.start ? `<em>${esc(p.start)}</em>` : ""}<span>${esc(p.text)}</span></li>`).join("")}</ul>` : ""}
        <div class="hc-week" aria-label="이번 주 체크리스트">${c.week.map((d) => go(`#/checklist/${d.ymd}`, `<span class="hw-bar${d.today ? " today" : ""}${d.future ? " future" : ""}" style="--h:${d.total ? Math.max(8, (d.total / wkMax) * 100) : 4}%;--f:${d.total ? (d.done / d.total) * 100 : 0}%"><i></i></span><span class="hw-d">${"일월화수목금토"[d.date.getDay()]}</span><span class="hw-n">${d.total ? `${d.done}/${d.total}` : ""}</span>`, "hw")).join("")}</div>
      </div>
    </div>`;
  }
  const PR_RANK = { max: 5, xhigh: 4, high: 3, medium: 2, low: 1 };

  // 쪽 하나 그리기
  function render(i) {
    if (!S.items) return "";
    const key = PAGES[i].key, wide = S.wide;
    if (key === "team") return renderTeam();
    if (key === "all") return ringHud(S.items, { wide, center: S.score == null ? "–" : String(S.score), caption: mine() ? "오늘 점수" : "오늘" });
    if (key === "day") return dayClock(S.data.day, { wide });
    if (key === "check") return checkPage(wide);
    return periodChart(S.data[key], { wide });
  }

  // 그린 뒤: 처음 차오르는 모션, 가운데 숫자, 화살표 자리, 좁은 화면용 목록
  function after(el, enter) {
    const svg = el.querySelector(":scope > svg");
    if (pageKey() === "team") loadWeek();
    if (svg && enter) { svg.classList.add("enter"); requestAnimationFrame(() => requestAnimationFrame(() => svg.classList.remove("enter"))); }
    if (pageKey() === "all") { const c = $(".rh-center", el); if (c && S.score != null && enter) scramble(c, String(S.score)); }
    $("#rows", root).innerHTML = !S.wide && pageKey() === "all" && S.items ? ringRows(S.items, target) : "";
    fitArrows(el);
    // 시작하기: 전체 쪽에선 펼쳐 두고, 다른 쪽에선 차트를 가리지 않게 작게 접어요 (누르면 펼쳐져요)
    const g = $("#guide", root); g.classList.toggle("mini", pageKey() !== "all"); g.classList.remove("open");
    S.tip = null;
    focus(pageKey() === "all" ? S.hover : null);
  }
  // 화살표를 차트 바로 옆에 붙여요 (svg 가 칸에 맞춰 줄어든 실제 폭으로)
  // 홈 AI 챗봇: 넓은 화면 · 전체 쪽 · 내 현황일 때 "오늘" 줄 바로 아래(오른쪽 숫자 열)에 붙어요
  const hudAi = $("#hud-ai", root);
  const stopAi = mountCommand($("#hud-ai-box", root), { day: () => ymd(today()) }); // 계획이 바뀌면 trio:changed 로 홈이 알아서 다시 그려요
  function placeAi(slide) {
    const svg = slide?.querySelector(":scope > svg.rh.wide");
    const show = !!svg && pageKey() === "all" && S.wide && mine();
    hudAi.hidden = !show; if (!show) return;
    const vb = svg.viewBox.baseVal, r = svg.getBoundingClientRect(), host = hudAi.offsetParent?.getBoundingClientRect() || { left: 0, top: 0 };
    const k = Math.min(r.width / vb.width, r.height / vb.height), ox = r.left + (r.width - vb.width * k) / 2, oy = r.top + (r.height - vb.height * k) / 2;
    const x0 = 2 * 260 + 64; // ringhud.js 의 숫자 열 시작점
    hudAi.style.left = ox + (x0 - 18) * k - host.left + "px";
    const rowsEnd = svg.querySelectorAll(".rh-row").length > 4 ? 16 + 4 * 46 + 60 : 196; // 마지막 줄 아래
    hudAi.style.top = oy + rowsEnd * k - host.top + "px";
    hudAi.style.width = Math.max(300, (vb.width - x0 + 18) * k) + "px";
  }
  function fitArrows(slide) {
    placeAi(slide);
    const svg = slide?.querySelector(":scope > svg");
    if (!svg) { const w = slide?.firstElementChild?.offsetWidth; if (w) chart.style.setProperty("--cw", w + "px"); return; }
    const vb = svg.viewBox.baseVal, w = svg.clientWidth, h = svg.clientHeight;
    if (!vb || !w || !h) return;
    chart.style.setProperty("--cw", Math.min(w, (vb.width * h) / vb.height) + "px");
  }

  const pager = mountPager({
    area: chart, view, tabs: $(".pg-tabs", root), pages: PAGES, index: savedPage(PAGES.length),
    render, onChange: (i, el) => { S.hover = null; after(el, true); },
  });

  function draw(enter = S.first) {
    if (!S.items) return;
    S.wide = chart.clientWidth >= 860;
    chart.classList.toggle("wide", S.wide);
    after(pager.redraw(), enter);
    S.first = false;
  }
  function focus(key) {
    S.hover = key;
    const svg = $("svg", view.querySelector(".pg-slide:not(.out)") || view);
    if (svg) svg.dataset.focus = key || "";
    $$("[data-ring]", root).forEach((el) => el.classList.toggle("on", el.dataset.ring === key));
    drawFocusLine();
  }

  async function load(assemble) {
    try {
      const u = ctx.user(S.who) || ctx.me;
      const now = new Date(), dayPassed = (now.getHours() * 60 + now.getMinutes()) / 1440;
      // 한 번에: 올해·이번 달·이번 주 목표 + 이번 달·이번 주 날짜 범위 (예전엔 20개씩 나눠 3번 불렀어요)
      const dayList = [...monthDays, ...weekDays].map((d) => ymd(d)).sort();
      const plans = (await api.plans([K.year, K.month, K.week], u.id, `${dayList[0]}..${dayList[dayList.length - 1]}`)).plans || [];
      const of = (key) => plans.filter((p) => p.period === key).sort((a, b) => (b.done ? 1 : 0) - (a.done ? 1 : 0) || (a.sort ?? 0) - (b.sort ?? 0));
      const year = of(K.year), month = of(K.month), week = of(K.week), day = of(K.day);
      const sc = dayScore(day, u.day_goal);
      const segs = (list) => list.map((p) => ({ done: !!p.done, title: p.text || "비공개 목표" })); // 다른 사람 것은 서버가 내용을 비워 보내요
      const done = (list) => list.filter((p) => p.done).length;
      const period = (list, key, dLeft) => ({ segs: segs(list), value: list.length ? done(list) / list.length : 0, total: list.length, time: elapsed(key), detail: `D-${dLeft}` + (list.length ? ` · ${done(list)}/${list.length} 이룸` : "") });
      // 오늘: 시각이 있는 할 일은 24시간 시계 위 제자리에
      const blocks = day.filter((p) => /^\d\d:\d\d$/.test(p.start || "")).map((p) => {
        const [h, m] = p.start.split(":").map(Number), a0 = (h * 60 + m) / 1440;
        return { a0, a1: Math.min(1, a0 + (p.mins || 30) / 1440), done: !!p.done, title: p.text || "비공개", time: p.start };
      }).sort((a, b) => a.a0 - b.a0);
      const val = {
        year: period(year, K.year, left),
        month: period(month, K.month, daysLeft(K.month)),
        week: period(week, K.week, daysLeft(K.week)),
        day: { blocks, value: sc.exec || 0, total: sc.count, time: dayPassed, detail: sc.count ? `실행 ${sc.doneCount}/${sc.count}` + (blocks.length ? ` · 시간표 ${blocks.length}개` : "") : "" },
      };
      // 체크리스트 링 (가장 안쪽): 오늘 할 일마다 칸, 색 = 우선순위
      const ckSegs = day.slice().sort((a, b) => (PR_RANK[b.priority] || 0) - (PR_RANK[a.priority] || 0)).map((p) => ({ done: !!p.done, title: p.text || "비공개", color: PRIO_COLOR[p.priority || "none"] }));
      const ckDone = day.filter((p) => p.done).length;
      val.check = { segs: ckSegs, value: day.length ? ckDone / day.length : 0, total: day.length, time: dayPassed, detail: day.length ? `${ckDone}/${day.length} 끝냄` + prioStats(day).filter((r) => r.k === "max" || r.k === "xhigh").map((r) => ` · ${PRIO_LABEL[r.k]} ${r.d}/${r.n}`).join("") : "" };
      S.items = [...RINGS, { key: "check", label: "체크리스트", en: "CHECK", color: "var(--r-check)" }].map((r) => ({ ...r, ...val[r.key] }));
      S.score = sc.score ?? null;

      // 한 달 · 한 주: 날마다 끝낸 수 / 전체 수
      const stat = (d) => { const k = periodKey("day", d), list = of(k); return { date: d, ymd: ymd(d), total: list.length, done: done(list), future: d > t, today: k === K.day }; };
      S.data = {
        month: { scope: "month", title: `${t.getMonth() + 1}월 한 달`, color: "var(--r-month)", goals: month, time: elapsed(K.month), dLeft: daysLeft(K.month), days: monthDays.map(stat) },
        week: { scope: "week", title: `${+K.week.slice(7).replace("W", "")}주차 한 주`, color: "var(--r-week)", goals: week, time: elapsed(K.week), dLeft: daysLeft(K.week), days: weekDays.map(stat) },
        check: { items: day, week: weekDays.map(stat) },
        day: { color: "var(--r-day)", blocks, time: dayPassed, score: S.score, count: sc.count, doneCount: sc.doneCount, now: nowTime(), mine: mine() },
      };
      if (assemble) S.first = true;

      $("#hi b", root).textContent = u.display_name;
      $("#clock", root).innerHTML = `<span>${nowTime()}</span><span>올해 ${pct(elapsed(K.year))}% 지남</span><span>D-${left}</span>`;
      if (mine()) drawGuide({ day: sc.count > 0, year: year.length > 0 }); else $("#guide", root).hidden = true;
      $$("[data-who]", root).forEach((b) => b.setAttribute("aria-selected", String(b.dataset.who === S.who)));
      drawCheer();
      draw();
    } catch (e) { toast(e.message, "err"); }
  }

  // ---------- 시작하기: 처음 쓰는 사람을 위한 3단계 ----------
  const GUIDE_KEY = "trio-guide-off";
  const guideOff = () => { try { return localStorage.getItem(GUIDE_KEY) === "1"; } catch { return false; } };
  let hasNotes = null;
  async function drawGuide(done) {
    const g = $("#guide", root);
    if (hasNotes === null) hasNotes = await api.notes().then((r) => r.notes.length > 0).catch(() => true);
    const steps = [
      { ok: done.day, n: 1, t: "오늘 할 일 적기", d: "캘린더의 오늘 페이지에서 시간표에 할 일을 넣고, 끝나면 체크해요. 가장 안쪽 분홍 링이 차요.", href: `#/calendar/${ymd(t)}`, go: "오늘로" },
      { ok: done.year, n: 2, t: "올해 목표 정하기", d: "홈 링을 누르면 올해·이번 달·이번 주 목표 페이지가 열려요. 이룰 때마다 링이 차요.", href: "#/goals/year", go: "목표 세우기" },
      { ok: hasNotes, n: 3, t: "배운 것 노트에 쓰기 → AI 정리", d: "AI가 주제·태그·링크를 달아 주고, 그래프에서 연결이 보여요.", href: "#/notes", go: "노트로" },
    ];
    const left = steps.filter((x) => !x.ok).length;
    if (guideOff() || !left) { g.hidden = true; return; }
    g.hidden = false;
    g.innerHTML = `<header><b>시작하기</b><span>${3 - left}/3 완료</span><button type="button" class="icon-btn sm" id="guide-x" aria-label="안내 닫기">${"×"}</button></header>
      <ol>${steps.map((x) => `<li class="${x.ok ? "ok" : ""}"><span class="num">${x.ok ? "✓" : x.n}</span><div><b>${x.t}</b><p>${x.d}</p></div>${x.ok ? "" : `<a class="btn sm accent" href="${x.href}">${x.go}</a>`}</li>`).join("")}</ol>`;
    $("#guide-x", root).addEventListener("click", (e) => { e.stopPropagation(); try { localStorage.setItem(GUIDE_KEY, "1"); } catch {} g.hidden = true; });
    $("header", g).addEventListener("click", () => { if (g.classList.contains("mini")) g.classList.toggle("open"); });
  }

  root.addEventListener("click", (e) => {
    const wk = e.target.closest("[data-wk]");
    if (wk) { const off = +wk.dataset.wk; if (off !== S.wk.off) { S.wk.off = off; S.wk.error = null; redrawTeam(); } return; }
    if (e.target.closest("#wk-ai-btn")) { makeReview(); return; }
    if (e.target.closest("#cheer-btn")) { sendCheer(); return; }
    const b = e.target.closest("[data-who]");
    if (b && b.dataset.who !== S.who) { S.who = b.dataset.who; S.hover = null; load(true); return; }
    const d = e.target.closest("svg [data-day]");
    if ((d || e.target.closest("svg [data-ring]")) && !mine()) { toast("서로는 차트만 볼 수 있어요. 계획 내용은 본인만 봐요."); return; }
    if (d) { ctx.go(dayTarget(d.dataset.day)); return; }
    const r = e.target.closest("svg [data-ring]");
    if (r) ctx.go(target(r.dataset.ring));
  });
  root.addEventListener("keydown", (e) => { const r = e.target.closest?.("svg [data-ring]"); if (r && (e.key === "Enter" || e.key === " ") && mine()) { e.preventDefault(); ctx.go(target(r.dataset.ring)); } });
  // 가리키면: 칸 설명(data-tip)이 있으면 그걸, 전체 쪽에선 링 요약을 아래 줄에
  root.addEventListener("mouseover", (e) => {
    const tipEl = e.target.closest("svg [data-tip]");
    const tip = tipEl ? { text: tipEl.dataset.tip, go: tipEl.hasAttribute("data-day") ? (mine() ? "눌러서 그날 보기 →" : "차트만 공개") : "" } : null;
    const r = e.target.closest("[data-ring]"), k = r?.dataset.ring || null;
    if (tip?.text !== S.tip?.text || k !== S.hover) { S.tip = tip; focus(pageKey() === "all" || !tip ? k : null); }
  });
  root.addEventListener("focusin", (e) => { const r = e.target.closest("[data-ring]"); if (r) focus(r.dataset.ring); });

  let lastW = 0;
  const ro = new ResizeObserver(() => {
    const w = chart.clientWidth, slide = $(".pg-slide:not(.out)", view);
    if (Math.abs(w - lastW) > 4) { lastW = w; if (S.items && (w >= 860) !== S.wide) { draw(false); return; } }
    fitArrows(slide);
  });
  ro.observe(chart);
  // ---------- 같이 하기: 지금 공부 중 · 응원 ----------
  async function loadTogether() {
    const day = ymd(t);
    const [p, c] = await Promise.all([api.presence().catch(() => null), api.cheers(day).catch(() => null)]);
    if (!alive) return;
    if (p) { S.pres = p; S.presAt = Date.now(); }
    if (c) S.cheers = { received: c.received || [], sent: c.sent || [] };
    drawChips(); drawCheer();
  }
  function drawChips() {
    const now = ms(S.pres?.now) ?? Date.now(), lag = Date.now() - S.presAt;
    $$("[data-who]", root).forEach((b) => {
      const u = ctx.user(b.dataset.who), m = (S.pres?.members || []).find((x) => x.user_id === b.dataset.who);
      const on = !!(m?.focus && b.dataset.who !== ctx.me.id);
      let live = $(".ws-live", b);
      if (!on) { live?.remove(); b.removeAttribute("title"); b.setAttribute("aria-label", `${u?.display_name || ""} 현황 보기`); return; }
      const mins = Math.max(1, Math.floor((now + lag - (ms(m.started_at) ?? now)) / 60000));
      const txt = `공부 중 · ${mins}분째`;
      if (!live) { live = document.createElement("span"); live.className = "ws-live"; b.append(live); }
      live.innerHTML = `<i aria-hidden="true"></i>${txt}`;
      b.title = `${u?.display_name || ""} · ${txt}`;
      b.setAttribute("aria-label", `${u?.display_name || ""} 현황 보기 · ${txt}`);
    });
  }
  function drawCheer() {
    const el = $("#cheer", root);
    if (!el) return;
    if (!mine()) {
      const u = ctx.user(S.who), sent = S.cheers.sent.includes(S.who);
      el.innerHTML = `<button type="button" class="btn sm ghost cheer-btn" id="cheer-btn" ${sent || S.cheering ? "disabled" : ""} title="하루 한 번 응원을 보낼 수 있어요">👏 ${sent ? "오늘 응원했어요" : `${esc(u?.username.toUpperCase() || "")} 응원하기`}</button>`;
      return;
    }
    const names = [...new Set(S.cheers.received.map((r) => ctx.user(r.from_id)?.username.toUpperCase()).filter(Boolean))];
    el.innerHTML = names.length ? `<p class="cheer-got">오늘 ${esc(names.join("·"))}${iga(names.at(-1))} 응원했어요 👏</p>` : "";
  }
  async function sendCheer() {
    const to = S.who, u = ctx.user(to);
    if (to === ctx.me.id || S.cheering) return;
    S.cheering = true; drawCheer();
    try {
      await api.cheer(to);
      S.cheers.sent = [...S.cheers.sent, to];
      toast(`👏 ${u?.username.toUpperCase() || ""}에게 응원을 보냈어요.`);
    } catch (e) {
      if (e.status === 409) { S.cheers.sent = [...S.cheers.sent, to]; toast("오늘은 이미 응원했어요"); }
      else toast(e.message, "err");
    } finally { S.cheering = false; if (alive) drawCheer(); }
  }

  // ---------- 5쪽 우리 셋: 한 주 숫자 + 내 AI 회고 ----------
  const weekOf = (off) => {
    const d = addDays(t, 7 * off), key = periodKey("week", d).slice(2);
    const from = periodStart("W:" + key);
    return { key, from, to: addDays(from, 6), no: isoWeek(from).w };
  };
  function renderTeam() {
    const w = weekOf(S.wk.off);
    return teamWeek({ data: S.wk.cache[w.key], users: ctx.users, meId: ctx.me.id, off: S.wk.off, weekNo: w.no, from: w.from, to: w.to, busy: S.wk.busy, error: S.wk.error });
  }
  function redrawTeam() {
    if (pageKey() !== "team") return;
    const el = pager.redraw();
    fitArrows(el);
    loadWeek();
  }
  let wkReq = 0;
  async function loadWeek(force = false) {
    const w = weekOf(S.wk.off);
    if (!force && (S.wk.cache[w.key] || S.wk.error)) return;
    const my = ++wkReq;
    try {
      const res = await api.reviewWeek(w.key);
      if (!alive || my !== wkReq) return;
      S.wk.cache[w.key] = res; S.wk.error = null;
    } catch (e) {
      if (!alive || my !== wkReq) return;
      if (!S.wk.cache[w.key]) S.wk.error = e.message || "잠시 뒤 다시 해 주세요.";
    }
    if (pageKey() === "team") fitArrows(pager.redraw());
  }
  async function makeReview() {
    if (S.wk.busy) return;
    const w = weekOf(S.wk.off);
    S.wk.busy = true; redrawTeam();
    try {
      const r = await api.reviewWeekAi(w.key);
      const m = r?.mine || r?.review || (r?.body ? r : null);
      if (m?.body && S.wk.cache[w.key]) S.wk.cache[w.key] = { ...S.wk.cache[w.key], mine: { body: m.body, created_at: m.created_at } };
      else await loadWeek(true);
      toast(`${S.wk.off === 0 ? "이번 주" : "지난주"} 회고를 만들었어요. 나만 볼 수 있어요.`);
    } catch (e) { toast(e.message || "AI 회고를 만들지 못했어요.", "err"); }
    finally { S.wk.busy = false; if (alive) redrawTeam(); }
  }

  load(true);
  loadTogether();
  const tick = setInterval(() => { load(false); loadTogether(); if (pageKey() === "team") loadWeek(true); }, 60_000);
  const onChanged = () => { load(false); loadTogether(); };
  window.addEventListener("trio:changed", onChanged);
  return () => { alive = false; stopAi?.(); clearInterval(tick); ro.disconnect(); pager.destroy(); window.removeEventListener("trio:changed", onChanged); };
}
