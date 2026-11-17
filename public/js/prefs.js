// 설정 한 곳 — 예전엔 이 기기에만 있던 값들을 계정에 둬요 (/api/apps/prefs/state, user_app_state app="prefs").
//   mba_min    MBA 하루 시간 (분)            — 예전 localStorage "mb-minutes2"
//   dev_min    SW 하루 시간 (분)             — 예전 "dv-minutes"
//   en_rate    영어 읽기 속도 (1 · 0.8)      — 예전 "trio-en-rate"
//   focus_min  집중 타이머 '직접' 분          — 예전 "focus-custom-min"
//   ai_web     AI 웹 먼저 찾기 (true/false)   — 예전 "trio-ai-pick".web
// 화면(#/settings)과 각 앱의 고르기 칸이 같은 값(getPref · setPref)을 써요 → 어디서 바꿔도 같아요.
// 첫 로그인 때 이 기기에 남은 옛 값을 한 번 올려요 (계정에 그 값이 아직 없을 때만) — 올린 뒤 옛 칸은 지워요.
// 이 기기 사본 "trio-prefs:<id>" = 빠르게 그리려는 것 (+ 연결이 없을 때). 다른 기기와 겹치면(409) 서버 값 + 내가 바꾼 칸만 다시 보내요.
// Dock 크기 · 자동 숨김은 기기마다 달라서 여기 없어요 (dock-hide.js).
import { api } from "./api.js";

const LEGACY = {
  mba_min: () => num(raw("mb-minutes2")),
  dev_min: () => num(raw("dv-minutes")),
  en_rate: () => { const v = raw("trio-en-rate"); return v == null ? undefined : (+v === 0.8 ? 0.8 : 1); },
  focus_min: () => num(raw("focus-custom-min")),
  ai_web: () => { try { const v = JSON.parse(raw("trio-ai-pick") || "null"); return typeof v?.web === "boolean" ? v.web : undefined; } catch { return undefined; } },
};
const LEGACY_KEY = { mba_min: "mb-minutes2", dev_min: "dv-minutes", en_rate: "trio-en-rate", focus_min: "focus-custom-min" };

function raw(k) { try { return localStorage.getItem(k); } catch { return null; } }
function num(v) { const n = Number(v); return v == null || v === "" || !Number.isFinite(n) || n <= 0 ? undefined : n; }
const readJSON = (k) => { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch { return null; } };
const writeJSON = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

let uid = null, at = 0, P = {}, pending = new Set(), saveT = 0, inflight = null, again = false;
const ckey = () => "trio-prefs:" + uid;
const cache = () => { if (uid) writeJSON(ckey(), { p: P, at, pending: [...pending] }); };
const emit = (keys) => window.dispatchEvent(new CustomEvent("trio:prefs", { detail: { keys } }));

// 값 읽기 — 로그인 전이거나 아직 못 받았으면 옛 기기 값 → 기본값
export function getPref(k, d) {
  if (P[k] !== undefined) return P[k];
  const l = LEGACY[k]?.(); return l !== undefined ? l : d;
}
export function setPref(k, v) {
  if (P[k] === v) return;
  P = { ...P, [k]: v }; pending.add(k); cache(); emit([k]);
  clearTimeout(saveT); saveT = setTimeout(flush, 400);
}
export const allPrefs = () => ({ ...P });

// 서버 먼저 (x-swr 없이) — 화면을 열 때 서비스 워커가 받아 둔 옛 답을 주면 다른 기기에서 바꾼 값을 못 봐요 (theme.js 와 같은 길)
async function pull() {
  const r = await fetch("/api/apps/prefs/state", { credentials: "same-origin", headers: { "x-trio": "1" }, cache: "no-store" });
  if (!r.ok) throw new Error(String(r.status));
  return r.json();
}

export async function flush() {
  clearTimeout(saveT); saveT = 0;
  if (!uid || !pending.size) return;
  if (inflight) { again = true; return inflight; }
  const mine = uid;
  inflight = (async () => {
    for (let tries = 0; tries < 3 && pending.size; tries++) {
      const sent = new Set(pending);
      try {
        const r = await api.saveAppState("prefs", P, at);
        if (mine !== uid) return;
        at = r.updated_at; for (const k of sent) pending.delete(k); cache(); return;
      } catch (e) {
        if (mine !== uid) return;
        if (e.status === 409 && e.data) { // 다른 기기가 먼저 썼어요 → 그 값 위에 내가 바꾼 칸만 얹어서 다시
          const srv = e.data.data && typeof e.data.data === "object" ? e.data.data : {}, mineVals = Object.fromEntries([...pending].map((k) => [k, P[k]]));
          const changed = Object.keys(srv).filter((k) => !pending.has(k) && srv[k] !== P[k]);
          P = { ...srv, ...mineVals }; at = e.data.updated_at || 0; cache(); if (changed.length) emit(changed);
          continue;
        }
        cache(); saveT = setTimeout(flush, 15000); return; // 연결이 없으면 나중에 다시
      }
    }
  })();
  try { await inflight; } finally { inflight = null; if (again) { again = false; if (pending.size) flush(); } }
}

// 로그인한 뒤 (app.js enter): 이 기기 사본 → 계정 값 받기 → 옛 기기 값 한 번 올리기. 실패해도 던지지 않아요.
export async function syncPrefs(me) {
  if (!me?.id) return;
  if (uid !== me.id) {
    uid = me.id; at = 0; P = {}; pending = new Set();
    const c = readJSON(ckey());
    if (c?.p && typeof c.p === "object") { P = c.p; at = c.at || 0; pending = new Set(c.pending || []); }
  }
  let srv;
  try { srv = await pull(); } catch { return; }
  if (uid !== me.id) return;
  const before = P, data = srv.data && typeof srv.data === "object" ? srv.data : {};
  P = { ...data, ...Object.fromEntries([...pending].map((k) => [k, before[k]])) };
  at = srv.updated_at || 0;
  // 옛 기기 값: 계정에 아직 없는 칸만 올리고, 옛 칸은 지워요 (한 번만)
  const moved = [];
  for (const k of Object.keys(LEGACY)) {
    const v = LEGACY[k]();
    if (v === undefined) continue;
    if (P[k] === undefined) { P[k] = v; pending.add(k); }
    moved.push(k);
  }
  cache();
  const changed = Object.keys({ ...before, ...P }).filter((k) => before[k] !== P[k]);
  if (changed.length) emit(changed);
  if (pending.size) await flush();
  if (!pending.size) for (const k of moved) clearLegacy(k); // 계정에 들어간 뒤에만 지워요
}
function clearLegacy(k) {
  try {
    if (LEGACY_KEY[k]) localStorage.removeItem(LEGACY_KEY[k]);
    else if (k === "ai_web") { const v = readJSON("trio-ai-pick"); if (v && "web" in v) { delete v.web; writeJSON("trio-ai-pick", v); } }
  } catch {}
}
export function prefsSignedOut() { clearTimeout(saveT); uid = null; at = 0; P = {}; pending = new Set(); }
