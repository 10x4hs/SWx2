// Dsm-mafia — app shell: auth, routing, sidebar, command palette, focus timer.
import { api } from "./api.js";
import { $, $$, esc, initial, debounce, ymd, today, nowTime, toast, pad, planHash } from "./util.js";
import { icon, appIcon } from "./icons.js";
import * as plansView from "./views/plans.js";
import * as notesView from "./views/notes.js";
import * as graphView from "./views/graph.js";
import * as aiView from "./views/ai.js";
import * as homeView from "./views/home.js";
import * as englishView from "./views/english.js";
import * as calendarView from "./views/calendar.js";
import * as roomView from "./views/room.js";
import { mountAuth } from "./views/auth.js";
import { scrambleIn } from "./fx.js";

const app = $("#app");
const ctx = {
  me: null,
  users: [],
  user: (id) => ctx.users.find((u) => u.id === id),
  go: (hash) => { if (location.hash !== hash) location.hash = hash; else route(); },
  changed: (kind) => window.dispatchEvent(new CustomEvent("trio:changed", { detail: { kind } })),
  refreshSide: () => refreshSide(),
  timer: null, // 아래 집중 타이머 (할 일 ▶ 에서 써요)
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
  if (ctx.me && timer.running) timer.stop(); // 로그아웃하면 타이머도 멈춰요
  ctx.me = null;
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
  document.documentElement.style.setProperty("--me", ctx.me.color);
  renderShell();
  // 스터디장이 정해 준 비밀번호 그대로면: 화면을 열기 전에 먼저 바꾸게 해요
  if (ctx.me.must_change_pw) { openPassword({ force: true }); return; }
  route();
  refreshSide();
  refreshUnread();
}
// 어떤 API든 "비밀번호부터 바꿔 주세요"(403)를 받으면 같은 창
window.addEventListener("trio:must-change", () => { if (ctx.me) { ctx.me.must_change_pw = true; openPassword({ force: true }); } });
window.addEventListener("trio:logout", () => { if (ctx.me) { toast("로그인이 만료됐어요. 다시 로그인해 주세요.", "err"); showAuth(); } });
window.addEventListener("trio:me", (e) => {
  ctx.me = { ...e.detail, color: ctx.me?.color || MEMBER_TONES[0] };
  ctx.users = ctx.users.map((u) => (u.id === ctx.me.id ? { ...u, ...ctx.me } : u));
  document.documentElement.style.setProperty("--me", ctx.me.color);
  renderMeRow();
});

// ---------- shell ----------
// 검색 | 홈 · 캘린더 · 계획 | 노트 · 영어 · AI · 대화 | 타이머 · 프로필
// 오늘 · 일기 · 기록은 캘린더 안으로(그날 페이지 · 연 잔디), 그래프는 노트 안의 탭으로 들어갔어요.
const NAV = [
  { key: "home", hash: "#/", label: "홈", tip: "홈 · 차트 · 우리 셋" },
  { key: "calendar", icon: "today", hash: "#/calendar", label: "캘린더", tip: "캘린더 · 그날 할 일·시간표·일기" },
  { key: "plans", hash: "#/plans/month", label: "계획", tip: "계획 · 연·월·주 목표" },
  { key: "notes", hash: "#/notes", label: "노트", tip: "노트 · 공부 정리 · 그래프" },
  { key: "english", hash: "#/english", label: "영어", tip: "영어 · 6개월 프리토킹" },
  { key: "ai", hash: "#/ai", label: "AI 튜터", tip: "AI 튜터 · 묻고 노트로 정리" },
  { key: "room", hash: "#/room", label: "대화", tip: "대화 · 셋이 같이 · 창고", badge: "room-badge" },
];
const NAV_SPLIT = 3;
const isMac = /Mac|iPhone|iPad/.test(navigator.platform);

function renderShell() {
  // 아이폰 Dock처럼 앱 아이콘만. 이름은 마우스를 올리면, 지금 화면은 옆에 점.
  const item = (n) => `<a class="rail-btn" href="${n.hash}" data-nav="${n.key}" aria-label="${n.label}" data-tip="${n.tip}">${appIcon(n.icon || n.key)}${n.badge ? `<span class="dock-badge" id="${n.badge}" hidden></span>` : ""}</a>`;
  app.innerHTML = `
    <div class="shell">
      <aside class="rail dock glass" aria-label="메뉴">
        <button class="rail-btn" type="button" id="open-palette" aria-label="검색 · 명령 (${isMac ? "⌘" : "Ctrl"} K)" data-tip="검색 · ${isMac ? "⌘" : "Ctrl"}K">${appIcon("search")}</button>
        <i class="dock-sep" aria-hidden="true"></i>
        <nav class="rail-nav">
          ${NAV.slice(0, NAV_SPLIT).map(item).join("")}
          <i class="dock-sep" aria-hidden="true"></i>
          ${NAV.slice(NAV_SPLIT).map(item).join("")}
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
}

function renderMeRow() {
  const el = $("#me-row");
  if (!el || !ctx.me) return;
  const dark = document.documentElement.dataset.theme === "dark" || (!document.documentElement.dataset.theme && matchMedia("(prefers-color-scheme: dark)").matches);
  el.className = "rail-me";
  // 내 프로필 → 작은 메뉴 (테마 · 로그아웃)
  el.innerHTML = `
    <button class="rail-btn me-btn" type="button" id="me-btn" aria-haspopup="menu" aria-expanded="false" aria-label="내 메뉴 · ${esc(ctx.me.display_name)}" data-tip="${esc(ctx.me.display_name)} · 설정">
      <span class="av" style="--c:${esc(ctx.me.color)}">${esc(initial(ctx.me.display_name))}</span></button>
    <div class="me-menu glass" id="me-menu" role="menu" hidden>
      <div class="me-head"><span class="av" style="--c:${esc(ctx.me.color)}">${esc(initial(ctx.me.display_name))}</span><span><b>${esc(ctx.me.display_name)}</b><small>@${esc(ctx.me.username)}</small></span></div>
      <button type="button" role="menuitem" id="theme-btn">${dark ? icon.sun(16) + "밝은 화면으로" : icon.moon(16) + "어두운 화면으로"}</button>
      <button type="button" role="menuitem" id="pw-btn">${icon.lock(16)}비밀번호 바꾸기</button>
      <button type="button" role="menuitem" id="logout-btn">${icon.logout(16)}로그아웃</button>
    </div>`;
  const menu = $("#me-menu"), btn = $("#me-btn");
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
  $("#logout-btn").addEventListener("click", async () => { await api.logout().catch(() => {}); showAuth(); });
}

// ---------- 비밀번호 바꾸기 (내 것만, 지금 비밀번호 확인) ----------
// force = 스터디장이 정해 준 비밀번호 그대로일 때: 닫기 · Esc · 바깥 누르기 없이, 취소 대신 로그아웃만.
function openPassword({ force = false } = {}) {
  const open = document.querySelector(".pw-back");
  if (open) { if (force && !open.dataset.force) { open.remove(); } else return; }
  const prevFocus = document.activeElement;
  const back = document.createElement("div");
  back.className = "palette-back pw-back" + (force ? " force" : "");
  if (force) back.dataset.force = "1";
  back.innerHTML = `
    <form class="pw-dialog glass" role="dialog" aria-modal="true" aria-labelledby="pw-title" aria-describedby="pw-help" autocomplete="on" novalidate>
      <input type="text" name="username" value="${esc(ctx.me.username)}" autocomplete="username" hidden>
      <div class="pw-head"><h2 id="pw-title">${force ? "먼저 비밀번호를 바꿔 주세요" : "비밀번호 바꾸기"}</h2>${force ? "" : `<button class="icon-btn sm" type="button" data-close aria-label="닫기">${icon.x(16)}</button>`}</div>
      <p class="pw-help" id="pw-help">${force
        ? `지금 비밀번호는 스터디장이 정해 준 거예요. <b>@${esc(ctx.me.username)}</b> 계정을 쓰려면 나만 아는 새 비밀번호로 먼저 바꿔야 해요.`
        : `@${esc(ctx.me.username)} 계정의 비밀번호예요. 바꾸면 다른 기기에서는 다시 로그인해야 해요.`}</p>
      <label class="pw-field"><span>${force ? "스터디장이 알려 준 비밀번호" : "지금 비밀번호"}</span><input class="input" type="password" name="current" autocomplete="current-password" required></label>
      <label class="pw-field"><span>새 비밀번호 <small>8자 이상</small></span><input class="input" type="password" name="next" autocomplete="new-password" minlength="8" required></label>
      <label class="pw-field"><span>새 비밀번호 한 번 더</span><input class="input" type="password" name="again" autocomplete="new-password" minlength="8" required></label>
      <label class="pw-show"><input type="checkbox" data-show> 입력한 글자 보기</label>
      <p class="pw-err" role="alert" aria-live="assertive"></p>
      <div class="pw-foot">${force
        ? `<button class="btn ghost" type="button" data-logout>${icon.logout(15)}로그아웃</button>`
        : `<button class="btn ghost" type="button" data-close>취소</button>`}<button class="btn accent" type="submit">바꾸기</button></div>
    </form>`;
  document.body.appendChild(back);
  const f = $(".pw-dialog", back), err = $(".pw-err", back), submit = f.querySelector('[type="submit"]');
  const close = () => { back.remove(); document.removeEventListener("keydown", onKey, true); if (!force) prevFocus?.focus?.(); };
  const onKey = (e) => {
    if (!back.isConnected) { document.removeEventListener("keydown", onKey, true); return; }
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); if (!force) close(); }
    if (e.key === "Tab") { // 대화상자 안에서만 돌기
      const els = [...f.querySelectorAll("input:not([hidden]), button")];
      const i = els.indexOf(document.activeElement);
      if (e.shiftKey && i <= 0) { e.preventDefault(); els.at(-1).focus(); }
      else if (!e.shiftKey && i === els.length - 1) { e.preventDefault(); els[0].focus(); }
    }
  };
  document.addEventListener("keydown", onKey, true);
  back.addEventListener("mousedown", (e) => { if (e.target === back && !force) close(); });
  f.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", close));
  f.querySelector("[data-logout]")?.addEventListener("click", async () => { close(); await api.logout().catch(() => {}); showAuth(); });
  f.querySelector("[data-show]").addEventListener("change", (e) => f.querySelectorAll('input[type="password"], input[data-pw]').forEach((i) => { i.dataset.pw = "1"; i.type = e.target.checked ? "text" : "password"; }));
  f.addEventListener("input", () => { err.textContent = ""; });
  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    const cur = f.current.value, next = f.next.value, again = f.again.value;
    const bad = !cur ? ["지금 비밀번호를 입력해 주세요.", f.current]
      : next.length < 8 ? ["새 비밀번호는 8자 이상이어야 해요.", f.next]
      : next !== again ? ["새 비밀번호 두 칸이 서로 달라요.", f.again]
      : next === cur ? ["지금과 다른 비밀번호로 정해 주세요.", f.next] : null;
    if (bad) { err.textContent = bad[0]; bad[1].focus(); return; }
    submit.disabled = true; submit.textContent = "바꾸는 중…";
    try {
      const r = await api.changePassword(cur, next);
      close();
      toast(r.signed_out ? `비밀번호를 바꿨어요. 다른 기기 ${r.signed_out}곳은 로그아웃됐어요.` : "비밀번호를 바꿨어요.");
      if (ctx.me?.must_change_pw) { ctx.me.must_change_pw = false; lastView = null; route(); refreshSide(); } // 막혀 있던 화면을 이어서 열어요
    } catch (x) {
      err.textContent = x.message || "비밀번호를 바꾸지 못했어요.";
      (x.status === 403 ? f.current : f.next).focus();
      if (x.status === 403) f.current.select();
    } finally { if (submit.isConnected) { submit.disabled = false; submit.textContent = "바꾸기"; } }
  });
  f.current.focus();
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

// ---------- Dock 배지: 대화방 안 읽은 개수 ----------
// 로그인해 있으면 60초마다. 대화방이 열려 있을 땐 그 화면이 스스로 폴링하니 여기선 쉬어요.
async function refreshUnread() {
  const el = $("#room-badge");
  if (!ctx.me || !el) return;
  if (lastView === "room") { el.hidden = true; return; }
  try {
    const r = await api.roomUnread();
    const n = Number(r.total ?? r.unread) || 0; // 우리 셋 + 1:1 전부 합친 수
    el.textContent = n > 9 ? "9+" : String(n);
    el.hidden = n === 0;
  } catch {}
}
setInterval(() => { if (ctx.me && document.visibilityState === "visible") refreshUnread(); }, 60_000);
window.addEventListener("trio:changed", (e) => { if (e.detail?.kind === "room") refreshUnread(); });

// ---------- routing ----------
// 예전 주소는 캘린더의 그날로 옮겨요 (뒤로 가기에 남지 않게 replaceState)
const OLD_DAY = /^#\/(?:today|diary|records)(?:\/(\d{4}-\d{2}-\d{2}))?\/?$/;
function redirectOld() {
  const m = location.hash.match(OLD_DAY);
  if (m) history.replaceState(history.state, "", "#/calendar/" + (m[1] || ymd(today())));
}
function parseRoute() {
  redirectOld();
  const parts = location.hash.replace(/^#\/?/, "").split("/").map(decodeURIComponent);
  const [a, b, c, d] = parts;
  if (a === "u") return { view: "home", nav: "home" }; // 서로는 차트만: 다른 사람의 하루 페이지는 없어요
  if (a === "plans") return { view: "plans", nav: "plans", scope: b || "month", key: c || null };
  if (a === "notes" && b === "tag") return { view: "notes", nav: "notes", tag: c };
  if (a === "notes") return { view: "notes", nav: "notes", id: b || null };
  if (a === "graph") return { view: "graph", nav: "notes" }; // 그래프는 노트 안의 탭
  if (a === "team" || !a || a === "home") return { view: "home", nav: "home" };
  if (a === "ai") return { view: "ai", nav: "ai", id: b || null };
  if (a === "calendar" && b === "year") return { view: "calendar", nav: "calendar", mode: "year", tab: c === "rec" ? "rec" : "diary", year: /^\d{4}$/.test(d || "") ? +d : null };
  if (a === "calendar") return { view: "calendar", nav: "calendar", mode: "month", day: b || null };
  if (a === "english") return { view: "english", nav: "english", tab: b || null, day: c || null };
  if (a === "room" && b === "dm") return { view: "room", nav: "room", tab: "chat", dm: c || null }; // 1:1 — 상대 user id
  if (a === "room") return { view: "room", nav: "room", tab: b || null, id: c || null };
  return { view: "home", nav: "home" };
}
const VIEWS = { home: homeView, plans: plansView, notes: notesView, graph: graphView, ai: aiView, english: englishView, calendar: calendarView, room: roomView };
let lastView = null;

function route() {
  if (!ctx.me || ctx.me.must_change_pw) return; // 비밀번호를 바꾸기 전엔 화면을 열지 않아요
  const r = parseRoute();
  $$("[data-nav]").forEach((a) => { if (a.dataset.nav === r.nav) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
  const main = $("#main");
  // notes view keeps its list mounted while switching notes
  if (lastView === "notes" && r.view === "notes" && notesView.update) { notesView.update(r); return; }
  if (lastView === "ai" && r.view === "ai") return; // the chat view follows its own hash changes
  if (lastView === "calendar" && r.view === "calendar" && calendarView.update) { calendarView.update(r); return; } // 날짜만 바뀌면 달력은 그대로
  if (lastView === "english" && r.view === "english" && englishView.update) { englishView.update(r); return; } // 영어 탭 전환은 판을 다시 만들지 않아요
  if (lastView === "room" && r.view === "room" && roomView.update) { roomView.update(r); return; } // 대화 | 창고 탭 전환도 판을 그대로 둬요
  if (cleanup) { cleanup(); cleanup = null; }
  // fresh host per view so listeners never pile up on <main>
  const host = document.createElement("div");
  host.className = "host host-" + r.view;
  main.replaceChildren(host);
  main.scrollTop = 0;
  lastView = r.view;
  cleanup = VIEWS[r.view].mount(host, ctx, r) || null;
  requestAnimationFrame(() => scrambleIn(host));
}
window.addEventListener("hashchange", route);

// ---------- command palette ----------
let paletteOpen = false;
function openPalette() {
  if (paletteOpen || !ctx.me || document.querySelector(".pw-back.force")) return;
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
    { grp: "이동", t: "오늘 페이지", s: "캘린더 · 할 일 · 시간표 · 일기", run: () => ctx.go("#/calendar/" + ymd(today())) },
    { grp: "이동", t: "일기 쓰기", s: "캘린더 · 오늘의 일기", run: () => { ctx.go("#/calendar/" + ymd(today())); setTimeout(() => $("#dp-diary textarea")?.focus(), 400); } },
    { grp: "이동", t: "내일 계획 세우기", s: ymd(new Date(Date.now() + 864e5)), run: () => ctx.go("#/calendar/" + ymd(new Date(Date.now() + 864e5))) },
    { grp: "이동", t: "한 해 잔디", s: "캘린더 · 연 · 일기 | 기록", run: () => ctx.go("#/calendar/year") },
    { grp: "이동", t: "올해 계획", s: "연간 목표 · 히트맵", run: () => ctx.go("#/plans/year") },
    { grp: "이동", t: "이번 달 계획", s: "월간 체크리스트", run: () => ctx.go("#/plans/month") },
    { grp: "이동", t: "이번 주 계획", s: "주간 체크리스트", run: () => ctx.go("#/plans/week") },
    { grp: "이동", t: "그래프 보기", s: "노트 · 그래프 탭", run: () => ctx.go("#/graph") },
    { grp: "이동", t: "우리 셋 주간 회고", s: "홈 · 5쪽", run: () => { try { localStorage.setItem("trio-home-page", "4"); } catch {} ctx.go("#/"); } },
    { grp: "명령", t: "오늘 데일리 노트 열기", s: ymd(today()), run: () => notesView.openDaily(ctx, ymd(today())) },
    { grp: "명령", t: "새 노트", s: "빈 노트", run: () => notesView.createNote(ctx, "") },
    { grp: "명령", t: "AI에게 묻기", s: "Gemini · MiMo", run: () => ctx.go("#/ai") },
    { grp: "이동", t: "대화방", s: "셋이 같이 · @마피아", run: () => ctx.go("#/room/chat") },
    { grp: "이동", t: "창고", s: "책 · 링크 · 영상", run: () => ctx.go("#/room/library") },
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
// 시작 · 일시정지 · 처음으로 · 끝 에서 "지금 공부 중" 상태를 서버에 알려요 (무엇을 하는지는 안 보내요).
const presence = (state, ends_at) => api.setPresence(state === "focus" ? { state, ends_at } : { state }).catch(() => {});
const timer = {
  total: 25 * 60, left: 25 * 60, running: false, t: null, label: "", plan_id: null,
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
    presence("focus", end);
    renderTimer();
  },
  // 할 일 ▶: 그 할 일 이름 · id 로 시작 (끝나면 그 할 일에 집중 시간이 쌓여요)
  startFor(plan) {
    if (this.running) {
      toast(this.plan_id === plan.id ? "이미 이 할 일로 집중하고 있어요." : "집중 타이머가 이미 돌고 있어요. 멈추거나 끝난 뒤에 시작해요.");
      openTimer(); return;
    }
    this.label = String(plan.text || "").slice(0, 60);
    this.plan_id = plan.id;
    this.left = this.total;
    this.start();
    openTimer();
    toast(`‘${this.label}’ 집중 ${Math.round(this.total / 60)}분을 시작했어요.`);
  },
  pause() { this.running = false; clearInterval(this.t); presence("idle"); renderTimer(); },
  reset() { this.pause(); this.left = this.total; renderTimer(); },
  stop() { this.running = false; clearInterval(this.t); presence("idle"); this.left = this.total; this.plan_id = null; this.label = ""; document.title = "Dsm-mafia"; },
  async finish() {
    clearInterval(this.t);
    this.running = false;
    const mins = Math.round(this.total / 60);
    chime();
    document.title = "Dsm-mafia";
    presence("idle");
    try {
      const b = { day: ymd(today()), at: nowTime(), text: `집중 ${mins}분${this.label ? " · " + this.label : ""}`, kind: "focus", mins };
      if (this.plan_id) b.plan_id = this.plan_id;
      await api.addLog(b);
      toast(this.plan_id ? `집중 ${mins}분 완료. ‘${this.label}’에 쌓였어요.` : `집중 ${mins}분 완료. 오늘 기록에 남겼어요.`);
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
    document.title = this.running ? `${t} · 집중 중` : "Dsm-mafia";
    const mini = $("#timer-mini");
    if (mini) { mini.classList.toggle("on", this.running); mini.textContent = this.running ? t : ""; }
  },
};
ctx.timer = timer;
function openTimer() { const pop = $("#timer"); if (pop) { pop.hidden = false; $("#timer-btn")?.setAttribute("aria-expanded", "true"); } }
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
    <input class="input" id="tm-label" placeholder="무엇에 집중할까요?" value="${esc(timer.label)}" style="padding:6px 10px;font-size:12.5px">
    ${timer.plan_id ? `<p class="tm-plan">할 일에 쌓여요 · <button type="button" class="linkbtn" id="tm-unlink">떼기</button></p>` : ""}`;
  timer.paint();
  $("#tm-toggle").addEventListener("click", () => (timer.running ? timer.pause() : timer.start()));
  $("#tm-reset").addEventListener("click", () => timer.reset());
  $("#tm-len").addEventListener("change", (e) => { timer.total = timer.left = +e.target.value * 60; timer.paint(); });
  $("#tm-label").addEventListener("input", (e) => { // 이름을 직접 바꾸면 할 일과의 연결은 풀어요
    timer.label = e.target.value.trim().slice(0, 60);
    if (timer.plan_id) { timer.plan_id = null; $("#timer .tm-plan")?.remove(); }
  });
  $("#tm-unlink")?.addEventListener("click", (e) => { e.stopPropagation(); timer.plan_id = null; renderTimer(); });
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
