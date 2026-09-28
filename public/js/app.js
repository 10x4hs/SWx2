// Study Trio — app shell: auth, routing, sidebar, command palette, focus timer.
import { api } from "./api.js";
import { $, $$, esc, initial, debounce, ymd, today, nowTime, toast, pad, planHash } from "./util.js";
import { icon, logo } from "./icons.js";
import * as todayView from "./views/today.js";
import * as plansView from "./views/plans.js";
import * as notesView from "./views/notes.js";
import * as graphView from "./views/graph.js";
import * as teamView from "./views/team.js";
import * as aiView from "./views/ai.js";
import * as homeView from "./views/home.js";
import * as diaryView from "./views/diary.js";
import { mountAuth } from "./views/auth.js";

const app = $("#app");
const ctx = {
  me: null,
  users: [],
  user: (id) => ctx.users.find((u) => u.id === id),
  go: (hash) => { if (location.hash !== hash) location.hash = hash; else route(); },
  changed: (kind) => window.dispatchEvent(new CustomEvent("trio:changed", { detail: { kind } })),
  refreshSide: () => refreshSide(),
};
let cleanup = null;

// ---------- boot ----------
async function boot() {
  try {
    const { user } = await api.me();
    await enter(user);
  } catch {
    showAuth();
  }
}
function showAuth() {
  if (cleanup) { cleanup(); cleanup = null; }
  ctx.me = null;
  lastView = null;
  mountAuth(app, { onDone: enter });
}
// 무채색 테마: 멤버 색은 가입 순서대로 먹 · 슬레이트 · 실버 톤
const MEMBER_TONES = ["var(--m0)", "var(--m1)", "var(--m2)"];
const toned = (users) => users.map((u, i) => ({ ...u, color: MEMBER_TONES[i % MEMBER_TONES.length] }));
async function enter(user) {
  ctx.users = toned((await api.users()).users);
  ctx.me = { ...user, color: ctx.users.find((u) => u.id === user.id)?.color || MEMBER_TONES[0] };
  document.documentElement.style.setProperty("--me", ctx.me.color);
  renderShell();
  route();
  refreshSide();
}
window.addEventListener("trio:logout", () => { if (ctx.me) { toast("로그인이 만료됐어요. 다시 로그인해 주세요.", "err"); showAuth(); } });
window.addEventListener("trio:me", (e) => {
  ctx.me = { ...e.detail, color: ctx.me?.color || MEMBER_TONES[0] };
  ctx.users = ctx.users.map((u) => (u.id === ctx.me.id ? { ...u, ...ctx.me } : u));
  document.documentElement.style.setProperty("--me", ctx.me.color);
  renderMeRow();
});

// ---------- shell ----------
const NAV = [
  { key: "home", hash: "#/", label: "홈", icon: icon.home },
  { key: "today", hash: "#/today", label: "오늘", icon: icon.today },
  { key: "plans", hash: "#/plans/month", label: "계획", icon: icon.plans },
  { key: "diary", hash: "#/diary", label: "일기", icon: icon.diary },
  { key: "notes", hash: "#/notes", label: "노트", icon: icon.notes },
  { key: "graph", hash: "#/graph", label: "그래프", icon: icon.graph },
  { key: "ai", hash: "#/ai", label: "AI 튜터", icon: icon.spark },
];
const isMac = /Mac|iPhone|iPad/.test(navigator.platform);

function renderShell() {
  app.innerHTML = `
    <div class="shell">
      <aside class="side glass" aria-label="사이드바">
        <div class="brand">${logo()}<b>Study Trio</b></div>
        <button class="search-btn" type="button" id="open-palette">${icon.search(16)}<span>검색 · 명령</span><kbd>${isMac ? "⌘" : "Ctrl"} K</kbd></button>
        <nav class="nav" aria-label="메뉴">
          ${NAV.map((n) => `<a href="${n.hash}" data-nav="${n.key}">${n.icon()}<span>${n.label}</span></a>`).join("")}
        </nav>
        <section class="side-sec" aria-label="최근 노트">
          <div class="eyebrow"><span>최근 노트</span><button class="icon-btn sm" type="button" id="side-new-note" aria-label="새 노트">${icon.plus(14)}</button></div>
          <div class="side-list" id="side-notes"></div>
        </section>
        <section class="side-sec" aria-label="태그">
          <div class="eyebrow"><span>태그</span></div>
          <div class="tagcloud" id="side-tags"></div>
        </section>
        <div class="side-foot">
          <section class="timer" id="timer" aria-label="집중 타이머"></section>
          <div class="me-row" id="me-row"></div>
          <p class="credit">배경: Golden Gate above the fog · Frank Schulenburg, CC BY-SA 3.0</p>
        </div>
      </aside>
      <main class="main glass" id="main" tabindex="-1"></main>
    </div>`;
  $("#open-palette").addEventListener("click", openPalette);
  $("#side-new-note").addEventListener("click", () => notesView.createNote(ctx, ""));
  renderMeRow();
  renderTimer();
}

function renderMeRow() {
  const el = $("#me-row");
  if (!el || !ctx.me) return;
  const dark = document.documentElement.dataset.theme === "dark" || (!document.documentElement.dataset.theme && matchMedia("(prefers-color-scheme: dark)").matches);
  el.innerHTML = `
    <span class="av" style="--c:${esc(ctx.me.color)}">${esc(initial(ctx.me.display_name))}</span>
    <div class="who"><b>${esc(ctx.me.display_name)}</b><span>@${esc(ctx.me.username)}</span></div>
    <button class="icon-btn sm" type="button" id="theme-btn" aria-label="${dark ? "밝은 테마" : "어두운 테마"}">${dark ? icon.sun(16) : icon.moon(16)}</button>
    <button class="icon-btn sm" type="button" id="logout-btn" aria-label="로그아웃">${icon.logout(16)}</button>`;
  $("#theme-btn").addEventListener("click", () => {
    const next = dark ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("trio-theme", next); } catch {}
    renderMeRow();
  });
  $("#logout-btn").addEventListener("click", async () => { await api.logout().catch(() => {}); showAuth(); });
}

async function refreshSide() {
  if (!ctx.me) return;
  try {
    const [{ notes }, { tags }] = await Promise.all([api.notes(), api.tags()]);
    const sn = $("#side-notes"), st = $("#side-tags");
    if (!sn) return;
    sn.innerHTML = notes.length
      ? notes.slice(0, 6).map((n) => `<a href="#/notes/${n.id}"><span class="dot" style="--c:${esc(ctx.user(n.user_id)?.color || "#999")}"></span><span class="t">${esc(n.title)}</span></a>`).join("")
      : `<span class="faint" style="font-size:12.5px;padding:0 10px">아직 노트가 없어요</span>`;
    st.innerHTML = tags.length
      ? tags.slice(0, 14).map((t) => `<a class="tag" href="#/notes/tag/${encodeURIComponent(t.tag)}">#${esc(t.tag)}</a>`).join("")
      : `<span class="faint" style="font-size:12.5px;padding:0 4px">노트에 #태그 를 써 보세요</span>`;
  } catch {}
}

// ---------- routing ----------
function parseRoute() {
  const parts = location.hash.replace(/^#\/?/, "").split("/").map(decodeURIComponent);
  const [a, b, c, d] = parts;
  if (a === "u" && b) return { view: "today", nav: "home", user: b, date: d || ymd(today()) };
  if (a === "plans") return { view: "plans", nav: "plans", scope: b || "month", key: c || null };
  if (a === "notes" && b === "tag") return { view: "notes", nav: "notes", tag: c };
  if (a === "notes") return { view: "notes", nav: "notes", id: b || null };
  if (a === "graph") return { view: "graph", nav: "graph" };
  if (a === "team" || !a || a === "home") return { view: "home", nav: "home" };
  if (a === "diary") return { view: "diary", nav: "diary", day: b || null };
  if (a === "ai") return { view: "ai", nav: "ai", id: b || null };
  return { view: "today", nav: "today", date: b || ymd(today()) };
}
const VIEWS = { home: homeView, today: todayView, plans: plansView, diary: diaryView, notes: notesView, graph: graphView, team: teamView, ai: aiView };
let lastView = null;

function route() {
  if (!ctx.me) return;
  const r = parseRoute();
  $$("[data-nav]").forEach((a) => { if (a.dataset.nav === r.nav) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
  const main = $("#main");
  // notes view keeps its list mounted while switching notes
  if (lastView === "notes" && r.view === "notes" && notesView.update) { notesView.update(r); return; }
  if (lastView === "ai" && r.view === "ai") return; // the chat view follows its own hash changes
  if (cleanup) { cleanup(); cleanup = null; }
  // fresh host per view so listeners never pile up on <main>
  const host = document.createElement("div");
  host.className = "host host-" + r.view;
  main.replaceChildren(host);
  main.scrollTop = 0;
  lastView = r.view;
  cleanup = VIEWS[r.view].mount(host, ctx, r) || null;
}
window.addEventListener("hashchange", route);

// ---------- command palette ----------
let paletteOpen = false;
function openPalette() {
  if (paletteOpen || !ctx.me) return;
  paletteOpen = true;
  const prevFocus = document.activeElement;
  const back = document.createElement("div");
  back.className = "palette-back";
  back.innerHTML = `
    <div class="palette" role="dialog" aria-modal="true" aria-label="검색과 명령">
      <input id="pal-input" placeholder="노트, 계획, 명령 검색… 없으면 새 노트로 만들어요" autocomplete="off" aria-controls="pal-list">
      <ul id="pal-list" role="listbox"></ul>
      <div class="foot"><span><kbd>↑</kbd> <kbd>↓</kbd> 이동</span><span><kbd>Enter</kbd> 열기</span><span><kbd>Esc</kbd> 닫기</span></div>
    </div>`;
  document.body.appendChild(back);
  const input = $("#pal-input", back), list = $("#pal-list", back);
  let items = [], sel = 0, seq = 0;

  const commands = () => [
    { grp: "이동", t: "홈", s: "차트 · 서로의 현황", run: () => ctx.go("#/") },
    { grp: "이동", t: "오늘로 가기", s: "목표 · 시간표 · 일기", run: () => ctx.go("#/today") },
    { grp: "이동", t: "일기 쓰기", s: "오늘의 일기", run: () => ctx.go("#/diary") },
    { grp: "이동", t: "내일 계획 세우기", s: ymd(new Date(Date.now() + 864e5)), run: () => ctx.go("#/today/" + ymd(new Date(Date.now() + 864e5))) },
    { grp: "이동", t: "올해 계획", s: "연간 목표 · 히트맵", run: () => ctx.go("#/plans/year") },
    { grp: "이동", t: "이번 달 계획", s: "월간 체크리스트", run: () => ctx.go("#/plans/month") },
    { grp: "이동", t: "이번 주 계획", s: "주간 체크리스트", run: () => ctx.go("#/plans/week") },
    { grp: "이동", t: "그래프 보기", s: "노트 연결", run: () => ctx.go("#/graph") },
    { grp: "명령", t: "오늘 데일리 노트 열기", s: ymd(today()), run: () => notesView.openDaily(ctx, ymd(today())) },
    { grp: "명령", t: "새 노트", s: "빈 노트", run: () => notesView.createNote(ctx, "") },
    { grp: "명령", t: "AI에게 묻기", s: "Gemini · MiMo", run: () => ctx.go("#/ai") },
    { grp: "명령", t: "집중 타이머 시작", s: "25분", run: () => timer.start(25) },
  ];
  const draw = () => {
    let grp = "";
    list.innerHTML = items.map((it, i) => {
      const head = it.grp !== grp ? `<li class="grp" role="presentation">${esc((grp = it.grp))}</li>` : "";
      return `${head}<li role="presentation"><button type="button" role="option" data-i="${i}" aria-selected="${i === sel}">${it.ic || ""}<span class="t">${esc(it.t)}</span><span class="s">${esc(it.s || "")}</span></button></li>`;
    }).join("") || `<li class="grp">결과가 없어요</li>`;
    const cur = list.querySelector('[aria-selected="true"]');
    if (cur) cur.scrollIntoView({ block: "nearest" });
  };
  const search = debounce(async (q) => {
    const my = ++seq;
    const cmds = commands().filter((c) => !q || (c.t + c.s).toLowerCase().includes(q.toLowerCase()));
    let found = { notes: [], plans: [] };
    if (q) { try { found = await api.search(q); } catch {} }
    if (my !== seq) return;
    const scopeName = { year: "올해", month: "월간", week: "주간", day: "하루" };
    items = [
      ...found.notes.map((n) => ({ grp: "노트", t: n.title, s: (n.snippet || "").replace(/\s+/g, " "), ic: `<span class="dot" style="--c:${esc(ctx.user(n.user_id)?.color || "#999")}"></span>`, run: () => ctx.go("#/notes/" + n.id) })),
      ...found.plans.map((p) => ({ grp: "내 계획", t: p.text, s: `${scopeName[p.scope]} · ${p.period.slice(2)}${p.done ? " · 완료" : ""}`, run: () => ctx.go(planHash(p)) })),
      ...cmds,
      ...(q && !found.notes.some((n) => n.title.toLowerCase() === q.toLowerCase()) ? [{ grp: "만들기", t: `새 노트: ${q}`, s: "Enter로 만들기", run: () => notesView.createNote(ctx, q) }] : []),
    ];
    sel = 0;
    draw();
  }, 120);
  const close = () => { paletteOpen = false; back.remove(); document.removeEventListener("keydown", onKey, true); if (prevFocus && prevFocus.focus) prevFocus.focus(); };
  const runSel = () => { const it = items[sel]; if (it) { close(); it.run(); } };
  const onKey = (e) => {
    if (e.key === "Escape") { e.preventDefault(); close(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); sel = Math.min(items.length - 1, sel + 1); draw(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); sel = Math.max(0, sel - 1); draw(); }
    else if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); runSel(); }
  };
  document.addEventListener("keydown", onKey, true);
  input.addEventListener("input", () => search(input.value.trim()));
  list.addEventListener("click", (e) => { const b = e.target.closest("[data-i]"); if (b) { sel = +b.dataset.i; runSel(); } });
  back.addEventListener("mousedown", (e) => { if (e.target === back) close(); });
  search.flush("");
  input.focus();
}
document.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); openPalette(); }
});

// ---------- focus timer ----------
const timer = {
  total: 25 * 60, left: 25 * 60, running: false, t: null, label: "",
  start(min) {
    if (min) { this.total = this.left = min * 60; }
    if (this.left <= 0) this.left = this.total;
    this.running = true;
    const end = Date.now() + this.left * 1000;
    clearInterval(this.t);
    this.t = setInterval(() => {
      this.left = Math.max(0, Math.round((end - Date.now()) / 1000));
      if (this.left === 0) this.finish();
      this.paint();
    }, 250);
    renderTimer();
  },
  pause() { this.running = false; clearInterval(this.t); renderTimer(); },
  reset() { this.pause(); this.left = this.total; renderTimer(); },
  async finish() {
    clearInterval(this.t);
    this.running = false;
    const mins = Math.round(this.total / 60);
    chime();
    document.title = "Study Trio";
    try {
      await api.addLog({ day: ymd(today()), at: nowTime(), text: `집중 ${mins}분${this.label ? " · " + this.label : ""}`, kind: "focus", mins });
      toast(`집중 ${mins}분 완료. 오늘 기록에 남겼어요.`);
      ctx.changed("logs");
    } catch (e) { toast(e.message, "err"); }
    this.left = this.total;
    renderTimer();
  },
  paint() {
    const el = $("#timer .clock"), bar = $("#timer .bar > i");
    if (!el) return;
    const t = `${pad(Math.floor(this.left / 60))}:${pad(this.left % 60)}`;
    el.textContent = t;
    bar.style.width = `${(1 - this.left / this.total) * 100}%`;
    document.title = this.running ? `${t} · 집중 중` : "Study Trio";
  },
};
function renderTimer() {
  const el = $("#timer");
  if (!el) return;
  el.classList.toggle("running", timer.running);
  el.innerHTML = `
    <div class="eyebrow">집중 타이머</div>
    <div class="row" style="justify-content:space-between">
      <span class="clock">00:00</span>
      <span class="row" style="gap:2px">
        <button class="icon-btn sm" type="button" id="tm-toggle" aria-label="${timer.running ? "일시정지" : "시작"}">${timer.running ? icon.pause(15) : icon.play(15)}</button>
        <button class="icon-btn sm" type="button" id="tm-reset" aria-label="처음으로">${icon.reset(15)}</button>
      </span>
    </div>
    <div class="bar"><i style="width:0"></i></div>
    <div class="row">
      <select class="select" id="tm-len" aria-label="집중 시간" ${timer.running ? "disabled" : ""}>
        ${[15, 25, 50, 90].map((m) => `<option value="${m}" ${m * 60 === timer.total ? "selected" : ""}>${m}분</option>`).join("")}
      </select>
    </div>
    <input class="input" id="tm-label" placeholder="무엇에 집중할까요?" value="${esc(timer.label)}" style="padding:6px 10px;font-size:12.5px">`;
  timer.paint();
  $("#tm-toggle").addEventListener("click", () => (timer.running ? timer.pause() : timer.start()));
  $("#tm-reset").addEventListener("click", () => timer.reset());
  $("#tm-len").addEventListener("change", (e) => { timer.total = timer.left = +e.target.value * 60; timer.paint(); });
  $("#tm-label").addEventListener("input", (e) => { timer.label = e.target.value.trim().slice(0, 60); });
}
function chime() {
  try {
    const ac = new (window.AudioContext || window.webkitAudioContext)();
    [0, .18, .36].forEach((d, i) => {
      const o = ac.createOscillator(), g = ac.createGain();
      o.frequency.value = [660, 880, 990][i];
      g.gain.setValueAtTime(.0001, ac.currentTime + d);
      g.gain.exponentialRampToValueAtTime(.18, ac.currentTime + d + .02);
      g.gain.exponentialRampToValueAtTime(.0001, ac.currentTime + d + .5);
      o.connect(g).connect(ac.destination);
      o.start(ac.currentTime + d); o.stop(ac.currentTime + d + .55);
    });
  } catch {}
}

boot();
