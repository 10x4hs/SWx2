// 화면 꾸미기 — 테마(밝게 · 어둡게 · 자동) · 배경화면 · 강조 색 · 유리(맑게 · 색 입힘) · 투명도 줄이기
// 고른 값은 <html> 의 data-* 하나씩으로 바뀌고 (css/theme.css 가 그것만 읽어요), 기본값이면 속성을 지워서 예전 화면 그대로예요.
//   data-theme="light|dark"  자동이면 기기 설정을 따라 둘 중 하나로 바꿔 넣어요 (기존 :root[data-theme] 규칙을 그대로 쓰려고)
//   data-wall="sage" …        배경화면 (기본이면 없음 = 구름 사진)
//   data-accent="blue" …      강조 색 (기본이면 없음 = 무채색 글자색)
//   data-glass="clear"        맑은 유리 (색 입힘이 기본)
//   data-solid="1"            투명도 줄이기 — 내가 켰거나, 기기 설정(prefers-reduced-transparency)이 켜져 있으면
// 저장: 이 기기(localStorage "trio-ui" = 마지막에 쓴 값, 로그인 전 첫 화면용 · "trio-ui:<id>" = 사람별 사본)
//      + 계정(/api/apps/ui/state, user_app_state) — 다른 기기에서도 같아요. 409 면 서버 값을 그대로 받아요.
// index.html <head> 의 짧은 스크립트가 같은 규칙으로 첫 화면이 그려지기 전에 맞춰요 (깜빡임 없이) — 이름을 바꾸면 거기도 같이.
import { api } from "./api.js";

export const WALLS = [
  ["default", "기본"], ["ash", "잿빛"], ["sand", "모래"], ["sage", "세이지"], ["aurora", "오로라"], ["smoke", "안개"],
  ["tide", "물결"], ["bloom", "꽃잎"], ["ember", "불씨"], ["grove", "숲"], ["dusk", "노을"],
];
export const ACCENTS = [["default", "기본"], ["blue", "파랑"], ["purple", "보라"], ["pink", "분홍"], ["orange", "주황"], ["green", "초록"], ["graphite", "흑연"]];
export const THEMES = [["light", "밝게"], ["dark", "어둡게"], ["auto", "자동"]];
export const DEFAULTS = Object.freeze({ theme: "dark", wall: "default", accent: "default", glass: "tinted", solid: false });

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
  };
}
const same = (a, b) => JSON.stringify(norm(a)) === JSON.stringify(norm(b));
const read = (k) => { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch { return null; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

// 처음: 예전 '밝은/어두운 화면' 값(trio-theme)을 이어받아요
let prefs = norm(read(KEY) || (() => { try { return { theme: localStorage.getItem("trio-theme") || undefined }; } catch { return {}; } })());
let uid = null, at = 0, dirty = false, saveT = 0, inflight = null, again = false, lastPull = 0;

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
// '기본으로' — 배경 · 강조 색 · 유리 · 투명도만 처음대로 (밝기는 따로 고른 값이라 그대로 둬요)
export const reset = () => setPrefs({ wall: DEFAULTS.wall, accent: DEFAULTS.accent, glass: DEFAULTS.glass, solid: DEFAULTS.solid });

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
