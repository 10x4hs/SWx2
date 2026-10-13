// Dsm-mafia — app shell: auth, routing, sidebar, command palette, focus timer.
import { api, navStart } from "./api.js";
import { syncAiPrefs } from "./ai-pick.js";
import { $, $$, esc, initial, ymd, today, toast, avatar } from "./util.js";
import { icon, appIcon } from "./icons.js";
import * as notesView from "./views/notes.js";
import * as graphView from "./views/graph.js";
import * as brainView from "./views/brain.js"; // Brain = 노트 + 공부를 한 나무로 (#/brain/<id>)
import * as aiView from "./views/ai.js";
import * as plannerView from "./views/planner.js";
import * as diaryView from "./views/diary.js";
import * as goalsView from "./views/goals.js";
import * as checklistView from "./views/checklist.js";
import * as homeView from "./views/home.js";
import * as englishView from "./views/english.js";
import * as papersView from "./views/papers.js";
import * as booksView from "./views/books.js";
import * as updatesView from "./views/updates.js";
import { openMcpPanel } from "./mcp-panel.js";
import { openProfile } from "./profile-edit.js";
import { statusPicker, statusText } from "./status.js";
import * as calendarView from "./views/calendar.js";
import * as studyView from "./views/study.js"; // 공부 = 영어 | 논문 (Dock 아이콘 하나)
import * as pageView from "./views/page.js"; // Dock 사용자 페이지 (#/p/new · #/p/<id>)
import { wireDockDrag } from "./dock-drag.js";
import { setHiddenMe } from "./hidden-pages.js";
import { initCustomize, loadCustom, applyUi, afterMount } from "./customize.js"; // Dock 우클릭 → 내 CSS · HTML · JS
import * as roomView from "./views/room.js";
import * as newsView from "./views/news.js"; // 뉴스 Signal Map (#/news · #/news/item/<id> · #/news/thread/<id>)
import { mountAuth } from "./views/auth.js";
import { scrambleIn } from "./fx.js";
import { startLive, stopLive } from "./live.js";
import { openPassword, initPassword } from "./password.js";
import { initDock, refreshUnread, loadDockPages, drawDock, pageMenu } from "./dock.js";
import { openPalette, initPalette } from "./palette.js";
import { timer, renderTimer, initTimer } from "./focus-timer.js";

const app = $("#app");
const ctx = {
  me: null,
  users: [],
  user: (id) => ctx.users.find((u) => u.id === id),
  go: (hash) => { if (location.hash !== hash) location.hash = hash; else route(); },
  changed: (kind) => window.dispatchEvent(new CustomEvent("trio:changed", { detail: { kind } })),
  refreshSide: () => refreshSide(),
  redraw: () => { lastView = null; route(true); }, // Customize 저장 뒤 지금 화면을 새로 그려요
  timer: null, // 아래 집중 타이머 (할 일 ▶ 에서 써요)
};
let cleanup = null;

// ---------- boot ----------
async function boot() {
  navStart(); // 다시 열 때는 받아 둔 내 정보 · 친구 목록으로 바로 들어가요 (sw.js)
  try {
    const { user } = await api.me();
    await enter(user);
  } catch {
    showAuth();
  }
}
function showAuth() {
  if (cleanup) { cleanup(); cleanup = null; }
  if (ctx.me && timer.running) timer.stop(); // 로그아웃하면 타이머도 멈춰요
  ctx.me = null;
  stopLive();
  lastView = null;
  document.querySelector(".pw-back")?.remove();
  window.dispatchEvent(new CustomEvent("trio:signed-out")); // pwa.js 가 듣고 API 캐시를 지워요
  mountAuth(app, { onDone: enter });
}
// 무채색 테마: 멤버 색은 가입 순서대로 먹 · 슬레이트 · 실버 톤
const MEMBER_TONES = ["var(--m0)", "var(--m1)", "var(--m2)"];
const toned = (users) => users.map((u, i) => ({ ...u, color: MEMBER_TONES[i % MEMBER_TONES.length] }));
async function enter(user) {
  ctx.users = toned((await api.users()).users);
  ctx.me = { ...user, color: ctx.users.find((u) => u.id === user.id)?.color || MEMBER_TONES[0] };
  syncAiPrefs(ctx.me); // 계정에 저장된 AI 모델로 맞춰요
  setHiddenMe(ctx.me); // 내 화면에서 숨긴 친구 페이지
  document.documentElement.style.setProperty("--me", ctx.me.color);
  renderShell();
  loadCustom();
  // 스터디장이 정해 준 비밀번호 그대로면: 화면을 열기 전에 먼저 바꾸게 해요
  if (ctx.me.must_change_pw) { openPassword({ force: true }); return; }
  route();
  refreshSide();
  refreshUnread();
  loadDockPages();
  startLive(); // 실시간 대화 신호
  if (!enter.statusTimer) { // 친구들 상태: 1분마다 · 앱으로 돌아올 때 새로 받아요
    enter.statusTimer = setInterval(syncStatuses, 60_000);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) syncStatuses(); });
  }
}
async function syncStatuses() {
  if (!ctx.me || document.hidden) return;
  try {
    const fresh = (await api.users()).users, key = (us) => JSON.stringify(us.map((u) => [u.id, u.status?.s, u.status?.tools]));
    if (key(fresh) === key(ctx.users)) return;
    const by = new Map(fresh.map((u) => [u.id, u.status]));
    ctx.users = ctx.users.map((u) => ({ ...u, status: by.get(u.id) ?? null }));
    window.dispatchEvent(new CustomEvent("trio:changed", { detail: { kind: "status" } }));
  } catch {}
}
// 어떤 API든 "비밀번호부터 바꿔 주세요"(403)를 받으면 같은 창
window.addEventListener("trio:must-change", () => { if (ctx.me) { ctx.me.must_change_pw = true; openPassword({ force: true }); } });
window.addEventListener("trio:logout", () => { if (ctx.me) { toast("로그인이 만료됐어요. 다시 로그인해 주세요.", "err"); showAuth(); } });
window.addEventListener("trio:me", (e) => {
  ctx.me = { ...e.detail, color: ctx.me?.color || MEMBER_TONES[0] };
  setHiddenMe(ctx.me);
  ctx.users = ctx.users.map((u) => (u.id === ctx.me.id ? { ...u, ...ctx.me } : u));
  document.documentElement.style.setProperty("--me", ctx.me.color);
  renderMeRow();
});

// ---------- shell ----------
// 검색 | 홈 · 캘린더 | 노트 · 영어 · AI · 대화 | 타이머 · 프로필 (연·월·주 목표는 캘린더 그날 판의 "목표" 칸)
// 오늘 · 일기 · 기록은 캘린더 안으로(그날 페이지 · 연 잔디), 그래프는 노트 안의 탭으로 들어갔어요.
const NAV = [
  { key: "home", hash: "#/", label: "홈", tip: "홈 · 차트 · 우리 셋" },
  { key: "calendar", icon: "today", hash: "#/calendar", label: "캘린더", tip: "캘린더 · 그날 할 일·시간표·일기" },
  { key: "brain", hash: "#/brain", label: "Brain", tip: "Brain · notes + study in one tree" }, // 노트 · 공부 아이콘을 하나로
  { key: "study", hash: "#/english", label: "Study", tip: "Study · 영어 · 논문 · AI" }, // Brain 안에 묻히면 AI 공부책을 못 찾아서 바로 가는 아이콘은 남겨요
  { key: "news", hash: "#/news", label: "News", tip: "News · daily edition" },
  { key: "room", hash: "#/room", label: "대화", tip: "대화 · 셋이 같이 · 창고", badge: "room-badge" },
];
const isMac = /Mac|iPhone|iPad/.test(navigator.platform);

function renderShell() {
  app.innerHTML = `
    <div class="shell">
      <aside class="rail dock glass" aria-label="메뉴">
        <button class="rail-btn" type="button" id="open-palette" aria-label="검색 · 명령 (${isMac ? "⌘" : "Ctrl"} K)" data-tip="검색 · ${isMac ? "⌘" : "Ctrl"}K">${appIcon("search")}</button>
        <i class="dock-sep" aria-hidden="true"></i>
        <nav class="rail-nav">
          <div class="dock-list" id="dock-list" aria-label="Dock 아이콘 · 끌어서 순서를 바꿔요"></div>
          <a class="rail-btn rail-add" href="#/p/new" data-nav="page-new" aria-label="페이지 추가" data-tip="페이지 추가 · AI 가 화면을 짜요">${icon.plus(18)}</a>
        </nav>
        <div class="rail-foot">
          <button class="rail-btn" type="button" id="timer-btn" aria-label="집중 타이머" data-tip="집중 타이머 · 25분" aria-expanded="false">${appIcon("timer")}<span id="timer-mini"></span></button>
          <div id="me-row"></div>
        </div>
      </aside>
      <section class="timer-pop glass" id="timer" aria-label="집중 타이머" hidden></section>
      <main class="main glass" id="main" tabindex="-1"></main>
    </div>`;
  $("#open-palette").addEventListener("click", openPalette);
  $("#timer-btn").addEventListener("click", () => {
    const pop = $("#timer"), open = pop.hidden;
    pop.hidden = !open; $("#timer-btn").setAttribute("aria-expanded", String(open));
  });
  document.addEventListener("click", (e) => {
    const pop = $("#timer");
    if (pop && !pop.hidden && e.target.isConnected && !e.target.closest("#timer, #timer-btn, [data-play]")) { pop.hidden = true; $("#timer-btn")?.setAttribute("aria-expanded", "false"); }
  });
  renderMeRow();
  renderTimer();
  drawDock();
  wireDockDrag($("#dock-list"), {
    onDrop: async (keys) => {
      const prev = ctx.me.dock_order;
      ctx.me.dock_order = keys;
      try { const r = await api.updateMe({ dock_order: keys }); ctx.me.dock_order = r.user.dock_order; }
      catch (err) { ctx.me.dock_order = prev; drawDock(); toast(err.message || "순서를 저장하지 못했어요.", "err"); }
    },
    onHoldMenu: (el) => { if (!el.dataset.page) return; const r = el.getBoundingClientRect(); pageMenu({ clientX: r.right, clientY: r.top + r.height / 2, preventDefault() {} }, el.dataset.page); },
  });
}

function renderMeRow() {
  const el = $("#me-row");
  if (!el || !ctx.me) return;
  const dark = document.documentElement.dataset.theme === "dark" || (!document.documentElement.dataset.theme && matchMedia("(prefers-color-scheme: dark)").matches);
  el.className = "rail-me";
  // 내 프로필 → 작은 메뉴 (테마 · 로그아웃)
  el.innerHTML = `
    <button class="rail-btn me-btn" type="button" id="me-btn" aria-haspopup="menu" aria-expanded="false" aria-label="내 메뉴 · ${esc(ctx.me.display_name)}" data-tip="${esc(ctx.me.display_name)} · 설정">
      ${avatar(ctx.me, "")}</button>
    <div class="me-menu glass" id="me-menu" role="menu" hidden>
      <button type="button" role="menuitem" class="me-head" id="me-head" title="프로필 바꾸기">${avatar(ctx.me, "")}<span><b>${esc(ctx.me.display_name)}</b><small>@${esc(ctx.me.username)}</small>${ctx.me.bio ? `<small class="me-bio">${esc(ctx.me.bio)}</small>` : ""}</span><span class="me-edit" aria-hidden="true">${icon.edit(14)}</span></button>
      <div class="me-open"><span class="me-st-h">day plans</span><span class="st-row"><button type="button" class="st-chip" data-open="1" aria-pressed="${ctx.me.plans_open !== false}" title="친구들이 내 하루 계획표를 볼 수 있어요">open</button><button type="button" class="st-chip" data-open="0" aria-pressed="${ctx.me.plans_open === false}" title="내 계획표는 나만 봐요">not open</button></span></div>
      <div class="me-st"><span class="me-st-h">status${ctx.me.status ? ` <b>${esc(statusText(ctx.me.status))}</b>` : ""}</span>${statusPicker(ctx.me.status)}</div>
      <button type="button" role="menuitem" id="prof-btn">${icon.edit(16)}프로필 바꾸기</button>
      <button type="button" role="menuitem" id="theme-btn">${dark ? icon.sun(16) + "밝은 화면으로" : icon.moon(16) + "어두운 화면으로"}</button>
      <button type="button" role="menuitem" id="pw-btn">${icon.lock(16)}비밀번호 바꾸기</button>
      <a role="menuitem" class="me-link" id="upd-btn" href="#/updates">${icon.spark(16)}업데이트 기록<span class="me-badge" id="upd-badge" hidden></span></a>
      <button type="button" role="menuitem" id="mcp-btn">${icon.share(16)}MCP 연결 (AI 에이전트)</button>
      <button type="button" role="menuitem" id="logout-btn">${icon.logout(16)}로그아웃</button>
    </div>`;
  const menu = $("#me-menu"), btn = $("#me-btn");
  applyUi("ui:me");
  // 메뉴는 화면 맨 위층(body)에 붙여요 — Dock 안에 두면 좁은 화면에서 본문 아래로 깔려 눌리지 않았어요
  document.querySelectorAll("body > #me-menu").forEach((m) => m !== menu && m.remove());
  document.body.append(menu);
  btn.addEventListener("click", (e) => { e.stopPropagation(); menu.hidden = !menu.hidden; btn.setAttribute("aria-expanded", String(!menu.hidden)); });
  if (!renderMeRow.bound) { // 바깥을 누르면 닫기 (한 번만 걸어요)
    renderMeRow.bound = true;
    document.addEventListener("click", (e) => { const m = $("#me-menu"); if (m && !m.hidden && !e.target.closest("#me-menu")) { m.hidden = true; $("#me-btn")?.setAttribute("aria-expanded", "false"); } });
  }
  $("#theme-btn").addEventListener("click", () => {
    const next = dark ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("trio-theme", next); } catch {}
    renderMeRow();
  });
  $("#pw-btn").addEventListener("click", () => { menu.hidden = true; btn.setAttribute("aria-expanded", "false"); openPassword(); });
  $("#upd-btn").addEventListener("click", () => { menu.hidden = true; btn.setAttribute("aria-expanded", "false"); });
  // 마지막으로 본 뒤 생긴 업데이트 수 → 메뉴에 숫자 · 프로필 버튼에 점
  const updBadge = () => updatesView.unseenCount().then((n) => { const b = $("#upd-badge"); if (b) { b.hidden = !n; b.textContent = n; } btn.classList.toggle("has-new", n > 0); });
  updBadge(); window.addEventListener("trio:updates-seen", updBadge);
  $("#mcp-btn").addEventListener("click", () => { menu.hidden = true; btn.setAttribute("aria-expanded", "false"); openMcpPanel(ctx); });
  const prof = () => { menu.hidden = true; btn.setAttribute("aria-expanded", "false"); openProfile(ctx); };
  $("#me-head").addEventListener("click", prof); $("#prof-btn").addEventListener("click", prof);
  $("#logout-btn").addEventListener("click", async () => { await api.logout().catch(() => {}); showAuth(); });
  // 하루 계획 공개: open / not open
  menu.querySelector(".me-open").addEventListener("click", async (e) => {
    e.stopPropagation();
    const b = e.target.closest("[data-open]"); if (!b) return;
    const open = b.dataset.open === "1"; if (open === (ctx.me.plans_open !== false)) return;
    try {
      const r = await api.updateMe({ plans_open: open });
      window.dispatchEvent(new CustomEvent("trio:me", { detail: { ...ctx.me, ...r.user } }));
      window.dispatchEvent(new CustomEvent("trio:changed", { detail: { kind: "status" } }));
      $("#me-menu").hidden = false; $("#me-btn")?.setAttribute("aria-expanded", "true");
      toast(open ? "이제 친구들이 내 하루 계획표를 볼 수 있어요." : "내 하루 계획표는 나만 봐요.");
    } catch (x) { toast(x.message, "err"); }
  });
  // 상태 고르기: 누르면 바로 저장. coding 이면 도구(여럿)도 골라요. 메뉴는 열린 채로 다시 그려요
  menu.querySelector(".me-st").addEventListener("click", async (e) => {
    e.stopPropagation();
    const b = e.target.closest("[data-st],[data-tool]"); if (!b) return;
    const cur = ctx.me.status;
    let next;
    if (b.dataset.tool) { const t = new Set(cur?.tools || []); t.has(b.dataset.tool) ? t.delete(b.dataset.tool) : t.add(b.dataset.tool); next = { s: "coding", tools: [...t] }; }
    else next = b.dataset.st && b.dataset.st !== cur?.s ? { s: b.dataset.st, tools: b.dataset.st === "coding" ? ["claude"] : [] } : null;
    try {
      const r = await api.updateMe({ status: next });
      window.dispatchEvent(new CustomEvent("trio:me", { detail: { ...ctx.me, ...r.user } }));
      window.dispatchEvent(new CustomEvent("trio:changed", { detail: { kind: "status" } }));
      $("#me-menu").hidden = false; $("#me-btn")?.setAttribute("aria-expanded", "true");
    } catch (x) { toast(x.message, "err"); }
  });
}

// 비밀번호 대화상자 (password.js) — 바꾼 뒤 막혀 있던 화면을 이어서 열어요
initPassword({ ctx, showAuth, resume: () => { lastView = null; route(); refreshSide(); } });

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

// Dock 배지 · 사용자 페이지 (dock.js) — 60초 폴링 · 'trio:changed' · 'room-live' · contextmenu 리스너를 여기서 한 번 걸어요
initDock({ ctx, NAV, parseRoute, getLastView: () => lastView });
initCustomize(ctx);

// ---------- routing ----------
// 예전 주소는 캘린더의 그날로 옮겨요 (뒤로 가기에 남지 않게 replaceState)
const OLD_DAY = /^#\/(?:today|diary|records)(?:\/(\d{4}-\d{2}-\d{2}))?\/?$/;
function redirectOld() {
  const m = location.hash.match(OLD_DAY);
  if (m) history.replaceState(history.state, "", "#/calendar/" + (m[1] || ymd(today())));
  { const m = location.hash.match(/^#\/plans(?:\/(year|month|week))?/); if (m) history.replaceState(history.state, "", m[1] ? "#/goals/" + m[1] : "#/goals/week"); } // 옛 계획 주소 → 목표 페이지
}
function parseRoute() {
  redirectOld();
  const parts = location.hash.replace(/^#\/?/, "").split("/").map(decodeURIComponent);
  const [a, b, c, d] = parts;
  if (a === "u") return { view: "home", nav: "home" }; // 서로는 차트만: 다른 사람의 하루 페이지는 없어요
  if (a === "brain" && b === "graph") return { view: "graph", nav: "brain" }; // 개념 그래프 (노트를 내용으로 묶은 8~20개 무리)
  if (a === "brain") return { view: "brain", nav: "brain", id: b || null };
  if (a === "notes" && b === "tag") return { view: "notes", nav: "brain", tag: c };
  if (a === "notes") return { view: "notes", nav: "brain", id: b || null };
  if (a === "graph") return { view: "brain", nav: "brain", id: null }; // 예전 노트 그래프 → Brain
  if (a === "team" || !a || a === "home") return { view: "home", nav: "home" };
  if (a === "ai") return { view: "ai", nav: "ai", id: b || null };
  if (a === "planner") return { view: "planner", nav: "ai", scope: b || null };
  if (a === "checklist") return { view: "checklist", nav: "calendar", day: b || null }; // 하루 체크리스트 (홈의 오늘 링에서)
  if (a === "goals") return { view: "goals", nav: "home", scope: b || "week", key: c || null }; // 이번 주 · 이번 달 · 올해 목표 (홈 링에서)
  if (a === "calendar" && b === "diary") return { view: "diary", nav: "calendar", day: c || null }; // 일기 페이지
  if (a === "calendar" && b === "year") return { view: "calendar", nav: "calendar", mode: "year", tab: c === "rec" ? "rec" : "diary", year: /^\d{4}$/.test(d || "") ? +d : null };
  if (a === "calendar" && b === "m") return { view: "calendar", nav: "calendar", mode: "month", day: c ? `m/${c}` : null }; // #/calendar/m/2026-10 = 그 달 달력만
  if (a === "calendar") return { view: "calendar", nav: "calendar", mode: "month", day: b || null, who: c === "u" && d ? d : null }; // #/calendar/2026-10-04 = 그날 전체 화면 · /u/<id> = 친구의 그날
  if (a === "english") return { view: "english", nav: "study", tab: b || null, day: c || null }; // 공부 탭 안
  if (a === "updates") return { view: "updates", nav: "home" }; // 업데이트 기록
  if (a === "p") return { view: "page", nav: b && b !== "new" ? "p:" + b : "page-new", id: b || "new" }; // Dock 사용자 페이지
  if (a === "study") return { view: "page", nav: "study", id: b || "new", place: "study", sub: c || null }; // 공부 탭 안의 과목 페이지 (#/study/<id> · #/study/new · #/study/<id>/graph)
  if (a === "papers") return { view: "papers", nav: "study", id: b || null, sub: c || null }; // #/papers/<id>/easy · #/papers/easy[/review]
  if (a === "books") return { view: "books", nav: "study", id: b || null, sub: c || null }; // AI 공부책 — #/books · #/books/<book>/<chapter> · #/books/review · #/books/words
  if (a === "news") return { view: "news", nav: "news", sub: ["item", "world", "co", "talk", "board"].includes(b) ? b : null, id: c || null, day: /^\d{4}-\d{2}-\d{2}$/.test(b || "") ? b : null }; // #/news · #/news/<day> · #/news/item/<id>
  if (a === "room" && b === "dm") return { view: "room", nav: "room", tab: "chat", dm: c || null }; // 1:1 — 상대 user id
  if (a === "room") return { view: "room", nav: "room", tab: b || null, id: c || null };
  return { view: "home", nav: "home" };
}
const VIEWS = { home: homeView, brain: brainView, notes: notesView, graph: graphView, ai: aiView, planner: plannerView, diary: diaryView, goals: goalsView, checklist: checklistView, english: englishView, papers: papersView, books: booksView, calendar: calendarView, room: roomView, news: newsView, updates: updatesView, page: pageView };
let lastView = null;

function route(redraw = false) {
  if (!ctx.me || ctx.me.must_change_pw) return; // 비밀번호를 바꾸기 전엔 화면을 열지 않아요
  navStart(); routedAt = performance.now();
  if (!redraw) redrawn = false;
  const r = parseRoute();
  $$("[data-nav]").forEach((a) => { if (a.dataset.nav === r.nav) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
  const main = $("#main");
  // notes view keeps its list mounted while switching notes
  if (lastView === "notes" && r.view === "notes" && notesView.update) { notesView.update(r); return; }
  if (lastView === "brain" && r.view === "brain") { brainView.update(r); return; } // 층만 바뀌면 껍데기는 그대로
  if (lastView === "ai" && r.view === "ai") return; // the chat view follows its own hash changes
  if (lastView === "diary" && r.view === "diary") { diaryView.update(r); return; }
  if (lastView === "goals" && r.view === "goals") { goalsView.update(r); return; }
  if (lastView === "checklist" && r.view === "checklist") { checklistView.update(r); return; } // 주·월·년 탭은 판을 그대로 // 날짜만 바뀌면 편집기만 바꿔요
  if (lastView === "calendar" && r.view === "calendar" && calendarView.update) { calendarView.update(r); return; } // 날짜만 바뀌면 달력은 그대로
  const inStudy = r.view === "english" || r.view === "papers" || r.view === "books" || (r.view === "page" && r.place === "study");
  if (lastView === "study" && inStudy) { studyView.update(r); return; } // 영어 ↔ 논문 ↔ 과목 탭, 전환은 껍데기를 그대로
  if (lastView === "page" && r.view === "page" && !inStudy) { pageView.update(r); return; } // 페이지 사이 이동은 껍데기를 그대로
  if (lastView === "news" && r.view === "news") { newsView.update(r); return; } // 지구본은 그대로, 패널만
  if (lastView === "room" && r.view === "room" && roomView.update) { roomView.update(r); return; } // 대화 | 창고 탭 전환도 판을 그대로 둬요
  if (cleanup) { cleanup(); cleanup = null; }
  // fresh host per view so listeners never pile up on <main>
  const host = document.createElement("div");
  host.className = "host host-" + (inStudy ? "study" : r.view); // 공부 탭은 어느 탭으로 들어와도 같은 껍데기 (높이는 study.js 의 .study-fill 이 정해요)
  main.replaceChildren(host);
  main.scrollTop = 0;
  lastView = inStudy ? "study" : r.view;
  cleanup = (lastView === "study" ? studyView : VIEWS[r.view]).mount(host, ctx, r) || null;
  const undo = afterMount(lastView, host), base = cleanup;
  if (undo) cleanup = () => { try { undo(); } catch {} base?.(); };
  if (!redraw) requestAnimationFrame(() => scrambleIn(host));
}

// 서비스 워커가 '바로 준 답'(받아 둔 것)과 다른 새 답을 받았을 때 (sw.js · api.js navStart)
// 아직 손대지 않은 화면이면 조용히 한 번 다시 그려요. 쓰거나 누르는 중이면 그대로 두고, 다음에 들어올 때 새 내용이 보여요.
let routedAt = 0, touchedAt = 0, redrawn = false, freshT = null;
const freshPaths = new Set();
for (const t of ["pointerdown", "keydown"]) addEventListener(t, () => { touchedAt = performance.now(); }, { capture: true, passive: true });
navigator.serviceWorker?.addEventListener("message", (e) => {
  const d = e.data;
  if (d?.type !== "api-fresh" || !ctx.me) return;
  if (d.status === 401) { api.me().catch(() => { if (ctx.me) { toast("로그인이 만료됐어요. 다시 로그인해 주세요.", "err"); showAuth(); } }); return; }
  freshPaths.add(new URL(d.url).pathname);
  clearTimeout(freshT);
  freshT = setTimeout(() => {
    const ps = [...freshPaths]; freshPaths.clear();
    if (ps.includes("/api/users")) syncStatuses();
    if (ps.includes("/api/me")) api.me().then(({ user }) => window.dispatchEvent(new CustomEvent("trio:me", { detail: { ...ctx.me, ...user } }))).catch(() => {});
    if (ps.includes("/api/pages")) loadDockPages();
    if (!ps.some((p) => p !== "/api/users" && p !== "/api/me")) return;
    const main = $("#main"), el = document.activeElement;
    if (!main || redrawn || touchedAt > routedAt || (el && main.contains(el) && el.matches("input, textarea, select, [contenteditable]"))) return;
    redrawn = true;
    const top = main.scrollTop;
    if (cleanup) { cleanup(); cleanup = null; }
    lastView = null; route(true); main.scrollTop = top;
  }, 250);
});
window.addEventListener("hashchange", () => { navDepth++; route(); });
// 뒤로 가기 (페이지 왼쪽 위 ‹): 앱 안에서 왔으면 이전 화면, 바로 들어왔으면 홈
let navDepth = 0;
window.trioBack = () => { if (navDepth > 0 && history.length > 1) history.back(); else ctx.go("#/"); };

initPalette({ ctx }); // 명령 팔레트 (palette.js) · Cmd/Ctrl+K
initTimer({ ctx }); // 집중 타이머 (focus-timer.js) · ctx.timer

boot();
