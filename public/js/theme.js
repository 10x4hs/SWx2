// 화면 꾸미기 — 테마(밝게 · 어둡게 · 자동) · 배경화면 · 강조 색 · 유리(맑게 · 색 입힘) · 투명도 줄이기
// 고른 값은 <html> 의 data-* 하나씩으로 바뀌고 (css/theme.css 가 그것만 읽어요), 기본값이면 속성을 지워서 예전 화면 그대로예요.
//   data-theme="light|dark"  자동이면 기기 설정을 따라 둘 중 하나로 바꿔 넣어요 (기존 :root[data-theme] 규칙을 그대로 쓰려고)
//   data-wall="sage" …        배경화면 (기본이면 없음 = 구름 사진)
//   data-accent="blue" …      강조 색 (기본이면 없음 = 무채색 글자색)
//   data-glass="clear"        맑은 유리 (색 입힘이 기본)
//   data-solid="1"            투명도 줄이기 — 내가 켰거나, 기기 설정(prefers-reduced-transparency)이 켜져 있으면
//   data-fx="soft|medium|strong"  리퀴드 글래스 세기 (v2 · 2026-10-25). 없으면 예전 유리 그대로
//   data-font="pretendard|system|round|serif|hand|mono"  글씨체. 웹 글꼴은 고를 때만 받아요 (loadFont)
//   data-size="s|l|xl"        글자 크기 (본문 판 .main 을 zoom 으로 키워요 · 없으면 보통)
//   data-radius="round|square"  모서리
//   data-still="1"            움직이는 배경화면을 멈춰요 (절전 · 데이터 절약 — 움직임 줄이기는 CSS 가 따로)
// 저장: 이 기기(localStorage "trio-ui" = 마지막에 쓴 값, 로그인 전 첫 화면용 · "trio-ui:<id>" = 사람별 사본)
//      + 계정(/api/apps/ui/state, user_app_state) — 다른 기기에서도 같아요. 409 면 서버 값을 그대로 받아요.
// index.html <head> 의 짧은 스크립트가 같은 규칙으로 첫 화면이 그려지기 전에 맞춰요 (깜빡임 없이) — 이름을 바꾸면 거기도 같이.
import { api } from "./api.js";

// 배경화면: 단색 결(옛 10개) + 사진 같은 장면(메시 그라디언트) + 천천히 움직이는 것(move)
export const WALLS = [
  ["default", "기본"], ["ash", "잿빛"], ["sand", "모래"], ["sage", "세이지"], ["aurora", "오로라"], ["smoke", "안개"],
  ["tide", "물결"], ["bloom", "꽃잎"], ["ember", "불씨"], ["grove", "숲"], ["dusk", "노을"],
  ["hills", "언덕"], ["bay", "바닷가"], ["dune", "사막"], ["peach", "복숭아"], ["lagoon", "석호"], ["nebula", "성운"],
  ["prism", "프리즘"], ["flow", "흐르는 빛"], ["lava", "용암"], ["drift", "물빛"],
];
export const MOVING = new Set(["flow", "lava", "drift"]);
export const ACCENTS = [["default", "기본"], ["multi", "여러 색"], ["blue", "파랑"], ["indigo", "남색"], ["purple", "보라"], ["pink", "분홍"], ["red", "빨강"],
  ["orange", "주황"], ["yellow", "노랑"], ["green", "초록"], ["teal", "청록"], ["graphite", "흑연"]];
export const THEMES = [["light", "밝게"], ["dark", "어둡게"], ["auto", "자동"]];
export const FX = [["default", "기본"], ["soft", "약하게"], ["medium", "보통"], ["strong", "강하게"]];
// 글씨체: [값, 이름, Google Fonts family (없으면 이미 있는 글꼴)] — 글꼴 목록(--font)은 css/theme.css
export const FONTS = [
  ["default", "기본"], ["pretendard", "프리텐다드"], ["system", "시스템 (SF)"],
  ["round", "둥근 고딕", "Gowun+Dodum"], ["serif", "명조", "Noto+Serif+KR:wght@400;600;700"], ["hand", "손글씨", "Gaegu:wght@400;700"],
  ["mono", "고정폭", "JetBrains+Mono:wght@400;600"],
];
export const SIZES = [["s", "작게"], ["default", "보통"], ["l", "크게"], ["xl", "아주 크게"]];
export const RADII = [["round", "둥글게"], ["default", "보통"], ["square", "각지게"]];
export const DEFAULTS = Object.freeze({ theme: "dark", wall: "default", accent: "default", glass: "tinted", solid: false, fx: "default", font: "default", size: "default", radius: "default" });

const KEY = "trio-ui", ukey = (id) => "trio-ui:" + id;
const has = (list, v) => list.some(([k]) => k === v);
const mq = (q) => { try { return matchMedia(q); } catch { return null; } };
const sysLight = mq("(prefers-color-scheme: light)"), sysSolid = mq("(prefers-reduced-transparency: reduce)");

export function norm(p) {
  const o = p && typeof p === "object" ? p : {};
  return {
    theme: has(THEMES, o.theme) ? o.theme : DEFAULTS.theme,
    wall: has(WALLS, o.wall) ? o.wall : DEFAULTS.wall,
    accent: has(ACCENTS, o.accent) ? o.accent : DEFAULTS.accent,
    glass: o.glass === "clear" ? "clear" : "tinted",
    solid: o.solid === true,
    fx: has(FX, o.fx) ? o.fx : DEFAULTS.fx,
    font: has(FONTS, o.font) ? o.font : DEFAULTS.font,
    size: has(SIZES, o.size) ? o.size : DEFAULTS.size,
    radius: has(RADII, o.radius) ? o.radius : DEFAULTS.radius,
  };
}
const same = (a, b) => JSON.stringify(norm(a)) === JSON.stringify(norm(b));
const read = (k) => { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch { return null; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

// 처음: 예전 '밝은/어두운 화면' 값(trio-theme)을 이어받아요
let prefs = norm(read(KEY) || (() => { try { return { theme: localStorage.getItem("trio-theme") || undefined }; } catch { return {}; } })());
let uid = null, at = 0, dirty = false, saveT = 0, inflight = null, again = false, lastPull = 0;

// 웹 글꼴: 고른 글꼴만 받아요 (index.html 머리 스크립트도 같은 주소로 먼저 걸어 둬요 — id 가 같아서 두 번 안 받아요)
export const fontHref = (k, text) => { const f = FONTS.find(([v]) => v === k)?.[2]; return f ? `https://fonts.googleapis.com/css2?family=${f}&display=swap${text ? "&text=" + encodeURIComponent(text) : ""}` : ""; };
export function loadFont(k, text) {
  const href = fontHref(k, text), id = "thm-font-" + k + (text ? "-pv" : "");
  if (!href || document.getElementById(id)) return;
  const l = document.createElement("link"); l.rel = "stylesheet"; l.id = id; l.href = href; document.head.append(l);
}
// 절전: 배터리가 20% 아래로 충전 없이 · 데이터 절약 켬 → 움직이는 배경을 멈춰요 (움직임 줄이기는 CSS 미디어 쿼리가 따로 멈춰요)
let lowPower = !!navigator.connection?.saveData;
try {
  navigator.getBattery?.().then((b) => {
    const upd = () => { const v = !!navigator.connection?.saveData || (!b.charging && b.level < 0.2); if (v !== lowPower) { lowPower = v; apply(); } };
    b.addEventListener("chargingchange", upd); b.addEventListener("levelchange", upd); upd();
  }).catch(() => {});
} catch {}

export const getPrefs = () => ({ ...prefs });
export const systemSolid = () => !!sysSolid?.matches;
export const resolvedTheme = (p = prefs) => (p.theme === "auto" ? (sysLight?.matches ? "light" : "dark") : p.theme);

export function apply(p = prefs) {
  const d = document.documentElement.dataset;
  const set = (k, v) => { if (v) { if (d[k] !== v) d[k] = v; } else if (k in d) delete d[k]; };
  set("theme", resolvedTheme(p));
  set("wall", p.wall !== "default" && p.wall);
  set("accent", p.accent !== "default" && p.accent);
  set("glass", p.glass === "clear" && "clear");
  set("solid", (p.solid || systemSolid()) && "1");
  set("fx", p.fx !== "default" && p.fx);
  set("font", p.font !== "default" && p.font);
  set("size", p.size !== "default" && p.size);
  set("radius", p.radius !== "default" && p.radius);
  set("still", lowPower && "1");
  loadFont(p.font);
  try { localStorage.setItem("trio-theme", resolvedTheme(p)); } catch {} // 예전 index.html(서비스 워커에 남은 판)도 같은 밝기로
  window.dispatchEvent(new CustomEvent("trio:ui", { detail: { ...p } }));
}

const status = (s) => window.dispatchEvent(new CustomEvent("trio:ui-sync", { detail: { s } }));
const cache = () => { write(KEY, prefs); if (uid) write(ukey(uid), { p: prefs, at, dirty }); };

// 화면에서 하나 바꿀 때: 바로 칠하고 · 이 기기에 적고 · 잠깐 뒤 계정에 보내요
export function setPrefs(patch) {
  const next = norm({ ...prefs, ...patch });
  if (same(next, prefs)) return;
  prefs = next; apply();
  dirty = !!uid; cache();
  if (uid) { status("saving"); clearTimeout(saveT); saveT = setTimeout(flush, 600); }
}
// '기본으로' — 밝기만 빼고 모두 처음대로 (밝기는 따로 고른 값이라 그대로 둬요)
export const reset = () => { const { theme, ...rest } = DEFAULTS; setPrefs(rest); };

async function pull() {
  const r = await fetch("/api/apps/ui/state", { credentials: "same-origin", headers: { "x-trio": "1" }, cache: "no-store" });
  if (!r.ok) throw new Error(String(r.status));
  return r.json();
}
function take(data, updatedAt) {
  at = updatedAt || 0; dirty = false;
  const next = norm(data);
  if (!same(next, prefs)) { prefs = next; apply(); }
  cache();
}

export async function flush() {
  clearTimeout(saveT); saveT = 0;
  if (!uid || !dirty) return;
  if (inflight) { again = true; return inflight; }
  const mine = uid;
  inflight = (async () => {
    try {
      const r = await api.saveAppState("ui", prefs, at);
      if (mine !== uid) return;
      at = r.updated_at; dirty = false; cache(); status("saved");
    } catch (e) {
      if (mine !== uid) return;
      if (e.status === 409 && e.data) { take(e.data.data, e.data.updated_at); status("saved"); } // 다른 기기가 먼저 바꿨어요 → 그 값으로
      else { cache(); status("offline"); saveT = setTimeout(flush, 15000); }
    } finally {
      inflight = null;
      if (again) { again = false; if (dirty) flush(); }
    }
  })();
  return inflight;
}

// 로그인한 뒤: 사람별 사본 → 계정 값과 맞춰요
export async function syncUi(me) {
  if (!me?.id) return;
  if (uid !== me.id) {
    uid = me.id;
    const c = read(ukey(uid));
    if (c?.p) { at = c.at || 0; dirty = !!c.dirty; const p = norm(c.p); if (!same(p, prefs)) { prefs = p; apply(); } write(KEY, prefs); }
    else { at = 0; dirty = false; }
  }
  lastPull = Date.now();
  try {
    const srv = await pull();
    if (uid !== me.id) return;
    if (dirty) { flush(); return; } // 이 기기에서 바꾼 게 아직 안 갔으면 보내요 (그 사이 다른 기기가 썼으면 409 → 서버 값)
    if (srv.data && srv.updated_at > at) take(srv.data, srv.updated_at);
    else if (!srv.data && !same(prefs, DEFAULTS)) { dirty = true; flush(); } // 계정엔 아직 없고 이 기기에 고른 값이 있으면 올려요
    else cache();
  } catch { /* 연결이 없으면 이 기기 값으로 */ }
}
export function signedOut() { clearTimeout(saveT); uid = null; at = 0; dirty = false; }

// 기기 설정이 바뀌면 (자동 테마 · 투명도 줄이기) 바로 다시 칠해요
sysLight?.addEventListener?.("change", () => { if (prefs.theme === "auto") apply(); });
sysSolid?.addEventListener?.("change", () => apply());
// 다른 탭에서 바꾸면 이 탭도
addEventListener("storage", (e) => { if (e.key === KEY && e.newValue) { const p = norm(read(KEY)); if (!same(p, prefs)) { prefs = p; apply(); } } });
// 다른 기기에서 바꿨을 수 있으니, 앱으로 돌아올 때 (1분에 한 번까지) 계정 값을 다시 봐요
document.addEventListener("visibilitychange", () => {
  if (document.hidden) { if (dirty) flush(); return; }
  if (uid && Date.now() - lastPull > 60_000) syncUi({ id: uid });
});
apply();
