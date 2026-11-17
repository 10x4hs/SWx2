// 화면 모듈 나눠 받기 — 첫 화면(홈 · 캘린더)만 처음에 받고, 나머지 화면은 처음 열 때 받아요.
// 화면마다 따로 쓰는 CSS · 글꼴도 그 화면을 열 때 같이 받아요 (처음 화면을 막지 않게).
// 배포 뒤 옛 탭: 새 SW 가 켜지면("updated") 아직 안 받은 화면을 열 때 새로 고침해요 — 옛 모듈과 새 모듈이 섞이지 않게.
import * as homeView from "./views/home.js";
import * as calendarView from "./views/calendar.js";
import * as updatesView from "./views/updates.js";

const LAZY = {
  notes: () => import("./views/notes.js"),
  graph: () => import("./views/graph.js"),
  brain: () => import("./views/brain.js"),
  ai: () => import("./views/ai.js"),
  planner: () => import("./views/planner.js"),
  diaryRoom: () => import("./views/diary-room.js"),
  goals: () => import("./views/goals.js"),
  checklist: () => import("./views/checklist.js"),
  study: () => import("./views/study.js"), // 영어 · 논문 · AI · 과목 탭 (english · papers · books · page 를 같이 불러요)
  page: () => import("./views/page.js"),
  settings: () => import("./views/settings.js"),
  admin: () => import("./views/admin.js"),
  teams: () => import("./views/teams.js"),
  room: () => import("./views/room.js"),
  news: () => import("./views/news.js"),
  cim: () => import("./views/cim.js"),
  psy: () => import("./views/psy.js"),
  svm: () => import("./views/svm.js"),
  mba: () => import("./views/mba.js"),
  dev: () => import("./views/dev.js"),
};
// 화면 하나만 쓰는 CSS · 글꼴 (index.html 에서 뺐어요)
const SERIF = "https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@600;700&display=swap"; // SW 과정 · SVM 제목 (종이 교과서)
const CSS = {
  study: ["/css/easy.css"],
  news: ["/css/news.css"],
  mba: ["/css/mba.css"],
  dev: ["/css/dev.css", SERIF],
  cim: ["/css/cim.css"],
  psy: ["https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=Noto+Sans+KR:wght@400;500;700&display=swap", "/css/psy.css"], // Psychology 이름표 · 본문
  svm: ["/css/svm.css", SERIF],
};
// 예전 index.html 의 순서 그대로 끼워요 — 같은 세기의 규칙이 예전과 같은 쪽으로 이기게 (easy 는 books 앞 · news 는 blocks 앞 · 나머지는 theme 앞)
// 처음부터 붙어 있는 CSS(books · blocks · theme …)도 자리 표시로 같이 적어 둬요
const ORDER = ["/css/easy.css", "/css/books.css", "/css/customize.css", "/css/news.css", "/css/blocks.css", "/css/db.css", "/css/video-note.css", "/css/mba.css", "/css/dev.css", "/css/cim.css", "/css/psy.css", "/css/svm.css", "/css/theme.css"];

const mods = { home: homeView, calendar: calendarView, updates: updatesView };
const pending = {};
const sheets = {};

/** 이미 받은 화면 모듈 (없으면 undefined) */
export const viewMod = (key) => mods[key];

function linkFor(href) { return [...document.querySelectorAll('link[rel="stylesheet"]')].find((l) => l.getAttribute("href") === href); }
function loadCss(href) {
  if (sheets[href]) return sheets[href];
  return (sheets[href] = new Promise((done) => {
    if (linkFor(href)) return done();
    const l = document.createElement("link");
    l.rel = "stylesheet"; l.href = href;
    if (/^https?:/.test(href)) { document.head.append(l); return done(); } // 글꼴은 기다리지 않아요 (font-display: swap)
    l.onload = l.onerror = () => done();
    const i = ORDER.indexOf(href);
    const next = ORDER.slice(i + 1).map(linkFor).find(Boolean) || linkFor("/css/theme.css");
    if (next) next.before(l); else document.head.append(l);
  }));
}

/** 화면 모듈 + 그 화면의 CSS 를 받아요 (CSS 가 붙은 뒤에 그려야 깜빡이지 않아요) */
export function loadView(key) {
  if (mods[key]) return Promise.resolve(mods[key]);
  if (!LAZY[key]) return Promise.reject(new Error("unknown view " + key));
  if (!pending[key]) {
    pending[key] = Promise.all([LAZY[key](), ...(CSS[key] || []).map(loadCss)])
      .then(([m]) => (mods[key] = m))
      .finally(() => { delete pending[key]; });
  }
  return pending[key];
}

// 새 SW 가 켜졌어요 → 이 탭의 모듈은 옛 배포본. 아직 안 받은 화면은 새로 고침해서 열어요.
let stale = false;
navigator.serviceWorker?.addEventListener("message", (e) => { if (e.data?.type === "updated") stale = true; });
// clients.claim() 은 "updated" 알림보다 먼저 와요 — 원래 SW 가 있던 탭에서 SW 가 바뀌면 그때부터 옛 탭이에요 (처음 설치는 아님)
const hadSW = !!navigator.serviceWorker?.controller;
navigator.serviceWorker?.addEventListener("controllerchange", () => { if (hadSW) stale = true; });
export const isStale = () => stale;

// 모듈을 못 받았을 때 (배포로 파일이 바뀌었거나 연결이 끊김): 30초에 한 번까지만 새로 고침해요 (무한 새로고침 방지)
export function reloadOnce() {
  const K = "swx2-lazy-reload";
  try {
    if (Date.now() - Number(sessionStorage.getItem(K) || 0) < 30e3) return false;
    sessionStorage.setItem(K, String(Date.now()));
  } catch { return false; }
  location.reload();
  return true;
}
