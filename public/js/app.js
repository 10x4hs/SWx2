// SWx2 — app shell: auth, routing, sidebar, command palette, focus timer.
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
import * as diaryRoomView from "./views/diary-room.js";
import * as goalsView from "./views/goals.js";
import * as checklistView from "./views/checklist.js";
import * as homeView from "./views/home.js";
import * as englishView from "./views/english.js";
import * as papersView from "./views/papers.js";
import * as booksView from "./views/books.js";
import * as updatesView from "./views/updates.js";
import * as adminView from "./views/admin.js";
import * as teamsView from "./views/teams.js";
import { featureOfRoute, isOpen, loadFeatures, mountLocked } from "./features.js";
import { openMcpPanel } from "./mcp-panel.js";
import { openApiPanel } from "./api-panel.js";
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
import * as mbaView from "./views/mba.js"; // 경영 마이크로디그리 (#/mba · #/mba/today · #/mba/company · #/mba/words · #/mba/<모듈>/<카드>)
import * as devView from "./views/dev.js"; // SW 공간 (#/sw 과정 목록 · #/sw/<과정>/… 개발 흐름 · Vector & Graph — today · docs · <모듈>/<카드> · case · practice)
import { mountAuth } from "./views/auth.js";
import { scrambleIn } from "./fx.js";
import { startLive, stopLive } from "./live.js";
import { openPassword, initPassword } from "./password.js";
import { initDock, refreshUnread, loadDockPages, drawDock, dropDock } from "./dock.js";
import { enter as enterRoute, navHref, watchScroll, restoreTop } from "./dock-memory.js"; // Dock 앱마다 보던 곳 그대로
import { openPalette, initPalette } from "./palette.js";
import { timer, renderTimer, initTimer } from "./focus-timer.js";

const app = $("#app");
const ctx = {
  me: null,
  users: [],
  user: (id) => ctx.users.find((u) => u.id === id),
  go: (hash) => { if (location.hash !== hash) location.hash = hash; else route(); },
  changed: (kind, more) => window.dispatchEvent(new CustomEvent("trio:changed", { detail: { kind, ...more } })), // more: 무엇이 바뀌었는지 (예: 노트 메뉴 { note: { op, id } })
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
// 관리자 공지: 맨 위 띠 (닫으면 이 브라우저에서 그 공지만 숨겨요)
// 24시간 무료체험: 남은 시간 띠 + 끝나는 순간 잠긴 기능을 다시 잠가요 (새로 고침 없이)
let trialTimer = 0;
function trialBar() {
  clearInterval(trialTimer); document.querySelector(".trial-bar")?.remove();
  const until = ctx.features?.trial_until; if (!until || until <= Date.now()) return;
  const bar = document.createElement("div");
  bar.className = "trial-bar"; bar.setAttribute("role", "status");
  const paint = () => {
    const ms = until - Date.now();
    if (ms <= 0) { clearInterval(trialTimer); bar.remove(); loadFeatures(ctx).then(() => { drawDock(); route(true); toast("무료 체험이 끝났어요 · 더 쓰려면 '사용 신청'을 하거나 Message 의 SWx2 관리자에게 물어봐요"); }); return; }
    const h = Math.floor(ms / 3600e3), m = Math.floor((ms % 3600e3) / 60e3);
    bar.innerHTML = `<b>무료 체험 중</b><span>${h}시간 ${m}분 남음 · 모든 기능을 써 볼 수 있어요</span>`;
  };
  paint(); trialTimer = setInterval(paint, 30e3);
  document.body.append(bar);
}
// 관리자가 시간을 늘려 주거나 기능을 열어 주면: 화면으로 돌아올 때 다시 읽어서 Dock 자물쇠 · 체험 띠를 새로 고침 없이 바꿔요
async function refreshFeatures() {
  const before = JSON.stringify(ctx.features);
  await loadFeatures(ctx);
  if (JSON.stringify(ctx.features) === before) return;
  drawDock(); trialBar(); route(true);
}
function annBar() {
  api.announcement().then(({ announcement: a }) => {
    document.querySelector(".ann-bar")?.remove();
    let hid = ""; try { hid = localStorage.getItem("trio-ann-hidden") || ""; } catch {}
    if (!a || a.id === hid) return;
    const bar = document.createElement("div");
    bar.className = "ann-bar"; bar.setAttribute("role", "alert");
    bar.innerHTML = `<span>📢 ${esc(a.body)}</span><button type="button" class="ann-x" aria-label="공지 닫기" title="닫기">✕</button>`;
    bar.querySelector("button").addEventListener("click", () => { try { localStorage.setItem("trio-ann-hidden", a.id); } catch {} bar.remove(); });
    document.body.append(bar);
  }).catch(() => {});
}
// 관리자가 이 회원으로 들어간 동안: 맨 위 띠 + 관리자로 돌아가기
function impBar() {
  document.querySelector(".imp-bar")?.remove();
  if (!ctx.me?.impersonated_by) return;
  const bar = document.createElement("div");
  bar.className = "imp-bar";
  bar.innerHTML = `<span>관리자 @${esc(ctx.me.impersonated_by)} 가 @${esc(ctx.me.username)} 로 보고 있어요</span><button type="button" class="btn sm">관리자로 돌아가기</button>`;
  bar.querySelector("button").addEventListener("click", async () => {
    try { await api.unimpersonate(); } catch {}
    location.hash = "#/admin"; location.reload();
  });
  document.body.append(bar);
}
async function enter(user) {
  [ctx.users, ctx.teams] = await Promise.all([api.users().then((r) => toned(r.users)), api.teams().then((r) => r.teams).catch(() => []), loadFeatures(ctx)]);
  ctx.me = { ...user, color: ctx.users.find((u) => u.id === user.id)?.color || MEMBER_TONES[0] };
  syncAiPrefs(ctx.me); // 계정에 저장된 AI 모델로 맞춰요
  setHiddenMe(ctx.me); // 내 화면에서 숨긴 친구 페이지
  document.documentElement.style.setProperty("--me", ctx.me.color);
  renderShell();
  loadCustom();
  impBar();
  annBar();
  trialBar();
  // 스터디장이 정해 준 비밀번호 그대로면: 화면을 열기 전에 먼저 바꾸게 해요
  if (ctx.me.must_change_pw) { openPassword({ force: true }); return; }
  route();
  refreshSide();
  refreshUnread();
  loadDockPages();
  startLive(); // 실시간 대화 신호
  if (!enter.statusTimer) { // 친구들 상태: 1분마다 · 앱으로 돌아올 때 새로 받아요
    enter.statusTimer = setInterval(syncStatuses, 60_000);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) { syncStatuses(); refreshFeatures(); } });
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
// Dock 기본 이름 · 아이콘 · 순서 — HSK 가 쓰던 이름 · 순서(2026-10-19)를 모두의 기본으로, 아이콘은 실제 앱 그림 (/assets/dock, 우리끼리 쓰는 화면)
// 마우스를 올리면 뜨는 이름표도 이름 한 단어만 (설명 없이, 2026-10-20)
const NAV = [
  { key: "home", hash: "#/", label: "Home", img: "/assets/dock/home.png" }, // 차트 · 우리 셋
  { key: "calendar", icon: "today", hash: "#/calendar", label: "Plan" }, // 캘린더 · 그날 할 일 · 시간표 · 일기 — 오늘 날짜가 나오는 달력 그대로
  { key: "brain", hash: "#/brain", label: "Obsidian", img: "/assets/dock/obsidian.png" }, // Second Brain · 내 노트를 한 나무로
  { key: "study", hash: "#/english", label: "Study", img: "/assets/dock/books.png" }, // 영어 · 논문 · AI
  { key: "news", hash: "#/news", label: "Newsletter", img: "/assets/dock/substack.png" }, // 오늘의 뉴스 · AI · HW 트렌드
  { key: "room", hash: "#/room", label: "Message", badge: "room-badge", img: "/assets/dock/messages.png" }, // 대화 · 창고 · 관리자 문의방
  { key: "diary", hash: "#/diary", label: "Diary", img: "/assets/dock/journal.png" }, // 누구나 · 일기 친구(초대 · 수락)끼리 공개한 날을 서로 봐요
  { key: "biz", hash: "#/mba", label: "MBA", img: "/assets/dock/stocks.png" }, // 경영 마이크로디그리 (24주 · 하루 1~2시간)
  { key: "dev", hash: "#/sw", label: "Code Flow", img: "/assets/dock/vscode.png" }, // SW 과정 (Vector & Graph · Dev Flow) — 첫 화면은 과정 두 권
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
  watchScroll($("#main")); // 스크롤을 기록에 적어 둬요 (뒤로 가기 · Dock 으로 돌아올 때)
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
    onDrop: dropDock, // 순서 + 폴더 (dock.js · dock-folders.js)
    // 길게 누르고 떼면 오른쪽 클릭과 같은 메뉴 (페이지 · 메뉴 아이콘 · 폴더 타일 모두) — 폰에서 '폴더에 넣기' 하는 길
    onHoldMenu: (el) => { const t = el.matches("[data-folder]") ? el.querySelector(".dock-fold-btn") : el, r = t.getBoundingClientRect(); t.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: r.right, clientY: r.top + r.height / 2 })); },
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
      ${avatar(ctx.me, "")}<span class="me-dot" aria-hidden="true"></span></button>
    <div class="me-menu glass" id="me-menu" role="menu" hidden>
      <button type="button" role="menuitem" class="me-upd" id="me-upd"><span class="me-upd-dot" aria-hidden="true"></span>새 버전이 있어요 · 새로 고침</button>
      <button type="button" role="menuitem" class="me-head" id="me-head" title="프로필 바꾸기">${avatar(ctx.me, "")}<span><b>${esc(ctx.me.display_name)}</b><small>@${esc(ctx.me.username)}</small>${ctx.me.bio ? `<small class="me-bio">${esc(ctx.me.bio)}</small>` : ""}</span><span class="me-edit" aria-hidden="true">${icon.edit(14)}</span></button>
      <div class="me-open"><span class="me-st-h">day plans</span><span class="st-row"><button type="button" class="st-chip" data-open="1" aria-pressed="${ctx.me.plans_open !== false}" title="친구들이 내 하루 계획표를 볼 수 있어요">open</button><button type="button" class="st-chip" data-open="0" aria-pressed="${ctx.me.plans_open === false}" title="내 계획표는 나만 봐요">not open</button></span></div>
      <div class="me-st"><span class="me-st-h">status${ctx.me.status ? ` <b>${esc(statusText(ctx.me.status))}</b>` : ""}</span>${statusPicker(ctx.me.status)}</div>
      <button type="button" role="menuitem" id="prof-btn">${icon.edit(16)}프로필 바꾸기</button>
      <button type="button" role="menuitem" id="theme-btn">${dark ? icon.sun(16) + "밝은 화면으로" : icon.moon(16) + "어두운 화면으로"}</button>
      <button type="button" role="menuitem" id="pw-btn">${icon.lock(16)}비밀번호 바꾸기</button>
      ${ctx.me.role === "admin" && !ctx.me.impersonated_by ? `<a role="menuitem" class="me-link" id="adm-btn" href="#/admin">${icon.lock(16)}관리자</a>` : ""}
      <a role="menuitem" class="me-link" id="teams-btn" href="#/teams">${icon.share(16)}팀</a>
      <a role="menuitem" class="me-link" id="upd-btn" href="#/updates">${icon.spark(16)}업데이트 기록<span class="me-badge" id="upd-badge" hidden></span></a>
      <button type="button" role="menuitem" id="mcp-btn">${icon.share(16)}MCP 연결 (AI 에이전트)</button>
      <button type="button" role="menuitem" id="apikey-btn">${icon.share(16)}페이지 API · 개인 키</button>
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
  $("#adm-btn")?.addEventListener("click", () => { menu.hidden = true; btn.setAttribute("aria-expanded", "false"); });
  $("#teams-btn").addEventListener("click", () => { menu.hidden = true; btn.setAttribute("aria-expanded", "false"); });
  $("#upd-btn").addEventListener("click", () => { menu.hidden = true; btn.setAttribute("aria-expanded", "false"); });
  // 마지막으로 본 뒤 생긴 업데이트 수 → 메뉴에 숫자 · 프로필 버튼에 점
  const updBadge = () => updatesView.unseenCount().then((n) => { const b = $("#upd-badge"); if (b) { b.hidden = !n; b.textContent = n; } btn.classList.toggle("has-new", n > 0); });
  updBadge(); window.addEventListener("trio:updates-seen", updBadge);
  $("#me-upd").addEventListener("click", () => location.reload());
  $("#mcp-btn").addEventListener("click", () => { menu.hidden = true; btn.setAttribute("aria-expanded", "false"); openMcpPanel(ctx); });
  $("#apikey-btn").addEventListener("click", () => { menu.hidden = true; btn.setAttribute("aria-expanded", "false"); openApiPanel(ctx); });
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
  if (m && /^#\/diary/.test(location.hash)) return; // #/diary 는 일기 페이지
  if (m) history.replaceState(history.state, "", "#/calendar/" + (m[1] || ymd(today())));
  { const m = location.hash.match(/^#\/plans(?:\/(year|month|week))?/); if (m) history.replaceState(history.state, "", m[1] ? "#/goals/" + m[1] : "#/goals/week"); } // 옛 계획 주소 → 목표 페이지
}
function parseRoute() {
  redirectOld();
  const parts = location.hash.replace(/^#\/?/, "").split("/").map(decodeURIComponent);
  const [a, b, c, d, e] = parts;
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
  if (a === "diary") return { view: "diaryRoom", nav: "diary", who: b === "u" ? c || null : null, day: b === "u" ? d || null : b || null }; // 둘이 같이 보는 일기 (#/diary/<날짜> · #/diary/u/<id>/<날짜>)
  if (a === "calendar" && b === "diary") return { view: "diaryRoom", nav: "diary", who: null, day: c || null }; // 일기 페이지 (일기 모임은 새 페이지로)
  if (a === "calendar" && b === "year") return { view: "calendar", nav: "calendar", mode: "year", tab: c === "rec" ? "rec" : "diary", year: /^\d{4}$/.test(d || "") ? +d : null };
  if (a === "calendar" && b === "m") return { view: "calendar", nav: "calendar", mode: "month", day: c ? `m/${c}` : null }; // #/calendar/m/2026-10 = 그 달 달력만
  if (a === "calendar") return { view: "calendar", nav: "calendar", mode: "month", day: b || null, who: c === "u" && d ? d : null }; // #/calendar/2026-10-04 = 그날 전체 화면 · /u/<id> = 친구의 그날
  if (a === "english") return { view: "english", nav: "study", tab: b || null, day: c || null }; // 공부 탭 안
  if (a === "updates") return { view: "updates", nav: "home" }; // 업데이트 기록
  if (a === "admin") return { view: "admin", nav: "home" }; // 관리자 (HSK · GYK)
  if (a === "teams") return { view: "teams", nav: "home", code: b === "join" ? c || null : null }; // 팀 · 초대 링크 #/teams/join/<코드>
  if (a === "p") return { view: "page", nav: b && b !== "new" ? "p:" + b : "page-new", id: b || "new" }; // Dock 사용자 페이지
  if (a === "study") return { view: "page", nav: "study", id: b || "new", place: "study", sub: c || null }; // 공부 탭 안의 과목 페이지 (#/study/<id> · #/study/new · #/study/<id>/graph)
  if (a === "papers") return { view: "papers", nav: "study", id: b || null, sub: c || null }; // #/papers/<id>/easy · #/papers/easy[/review]
  if (a === "books") return { view: "books", nav: "study", id: b || null, sub: c || null }; // AI 공부책 — #/books · #/books/<book>/<chapter> · #/books/review · #/books/words
  if (a === "sw") return { view: "dev", nav: "dev", course: b || null, id: c || null, sub: d || null, item: e || null }; // SW 공간 — 과정 목록 · 과정 안
  if (a === "dev") return { view: "dev", nav: "dev", course: "dev", id: b || null, sub: c || null, item: d || null }; // 옛 주소 (#/dev/…) = #/sw/dev/…
  if (a === "mba") return { view: "mba", nav: "biz", id: b || null, sub: c || null, item: d || null }; // 경영 마이크로디그리
  if (a === "news") return { view: "news", nav: "news", sub: ["item", "world", "co", "talk", "board", "library", "history", "ai-trend", "hw-trend"].includes(b) ? b : null, id: c || null, day: /^\d{4}-\d{2}-\d{2}$/.test(b || "") ? b : null }; // #/news · #/news/<day> · #/news/item/<id>
  if (a === "room" && b === "help") return { view: "room", nav: "room", tab: "chat", help: c || "me" }; // 관리자 문의방 (관리자는 #/room/help/<회원 id>)
  if (a === "room" && b === "team") return { view: "room", nav: "room", tab: "chat", team: c || null }; // 팀 방
  if (a === "room" && b === "dm") return { view: "room", nav: "room", tab: "chat", dm: c || null }; // 1:1 — 상대 user id
  if (a === "room") return { view: "room", nav: "room", tab: b || null, id: c || null };
  return { view: "home", nav: "home" };
}
const VIEWS = { home: homeView, brain: brainView, notes: notesView, graph: graphView, ai: aiView, planner: plannerView, diary: diaryView, diaryRoom: diaryRoomView, goals: goalsView, checklist: checklistView, english: englishView, papers: papersView, books: booksView, mba: mbaView, dev: devView, calendar: calendarView, room: roomView, news: newsView, updates: updatesView, admin: adminView, teams: teamsView, page: pageView };
let lastView = null;

function route(redraw = false) {
  if (!ctx.me || ctx.me.must_change_pw) return; // 비밀번호를 바꾸기 전엔 화면을 열지 않아요
  navStart(); routedAt = performance.now();
  if (!redraw) redrawn = false;
  const r = parseRoute();
  // 떠나는 화면은 기억, 돌아온 화면이면 그 스크롤로 (내용이 그려진 뒤에) · Dock 아이콘 주소도 지금 화면에 맞게
  const top = enterRoute(r.nav, location.hash, $("#main"));
  if (top) requestAnimationFrame(() => restoreTop($("#main"), top));
  $$("a.rail-btn[data-nav]").forEach((a) => { const n = NAV.find((x) => x.key === a.dataset.nav); if (n) a.setAttribute("href", navHref(n, ymd(today()))); });
  // 잠긴 기능: 화면 대신 '사용 신청'
  const lockF = featureOfRoute(r);
  if (!isOpen(ctx, lockF)) {
    if (cleanup) { cleanup(); cleanup = null; }
    const host = document.createElement("div"); host.className = "host host-locked";
    $("#main").replaceChildren(host);
    cleanup = mountLocked(host, ctx, lockF); lastView = "locked:" + lockF;
    $$("[data-nav]").forEach((a) => { if (a.dataset.nav === r.nav) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
    return;
  }
  $$("[data-nav]").forEach((a) => { if (a.dataset.nav === r.nav) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
  const main = $("#main");
  // notes view keeps its list mounted while switching notes
  if (lastView === "notes" && r.view === "notes" && notesView.update) { notesView.update(r); return; }
  if (lastView === "brain" && r.view === "brain") { brainView.update(r); return; } // 층만 바뀌면 껍데기는 그대로
  if (lastView === "ai" && r.view === "ai") return; // the chat view follows its own hash changes
  if (lastView === "diary" && r.view === "diary") { diaryView.update(r); return; }
  if (lastView === "diaryRoom" && r.view === "diaryRoom") { diaryRoomView.update(r); return; }
  if (lastView === "goals" && r.view === "goals") { goalsView.update(r); return; }
  if (lastView === "checklist" && r.view === "checklist") { checklistView.update(r); return; } // 주·월·년 탭은 판을 그대로 // 날짜만 바뀌면 편집기만 바꿔요
  if (lastView === "calendar" && r.view === "calendar" && calendarView.update) { calendarView.update(r); return; } // 날짜만 바뀌면 달력은 그대로
  const inStudy = r.view === "english" || r.view === "papers" || r.view === "books" || (r.view === "page" && r.place === "study");
  if (lastView === "study" && inStudy) { studyView.update(r); return; } // 영어 ↔ 논문 ↔ 과목 탭, 전환은 껍데기를 그대로
  if (lastView === "page" && r.view === "page" && !inStudy) { pageView.update(r); return; } // 페이지 사이 이동은 껍데기를 그대로
  if (lastView === "news" && r.view === "news") { newsView.update(r); return; } // 지구본은 그대로, 패널만
  if (lastView === "mba" && r.view === "mba") { mbaView.update(r); return; } // 모듈 · 카드 사이 이동은 껍데기를 그대로
  if (lastView === "dev" && r.view === "dev") { devView.update(r); return; } // 주 · 카드 사이 이동도 껍데기를 그대로
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
