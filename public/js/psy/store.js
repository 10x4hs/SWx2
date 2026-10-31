// Psychology 기록 — 사람별 서버 저장(/api/apps/psy/state) + 이 기기 사본(localStorage)
//   srs[카드] = {b: 상자 0~5, d: 다음 복습 시각(ms), n: 본 횟수, l: 마지막 본 시각} · quiz = {right,total} · spar = [{at,scenario,score}] · last = 마지막 카드
//   svm/store.js 와 같은 방식: 0.7초 모았다가 통째로 PUT, 409 면 서버 값과 합쳐서 다시 (카드마다 마지막에 본 쪽이 이겨요)
import { api } from "../api.js";

const blank = () => ({ v: 1, srs: {}, quiz: { right: 0, total: 0 }, spar: [], last: null });
const obj = (x) => (x && typeof x === "object" && !Array.isArray(x) ? x : {});
const norm = (x) => { const s = Object.assign(blank(), obj(x)); s.srs = obj(s.srs); s.quiz = { right: +s.quiz?.right || 0, total: +s.quiz?.total || 0 }; s.spar = Array.isArray(s.spar) ? s.spar : []; return s; };
export function merge(L, R) {
  if (!R) return L;
  R = norm(R);
  const out = { ...R, ...L, srs: { ...R.srs } };
  for (const [k, v] of Object.entries(L.srs)) if (!R.srs[k] || (v?.l || 0) >= (R.srs[k].l || 0)) out.srs[k] = v;
  out.quiz = L.quiz.total >= R.quiz.total ? L.quiz : R.quiz;
  const seen = new Set(), sp = [];
  for (const x of [...R.spar, ...L.spar]) if (x && !seen.has(x.at)) { seen.add(x.at); sp.push(x); }
  out.spar = sp.sort((a, b) => a.at - b.at).slice(-50);
  return out;
}

let S = null, at = 0, key = "", dirty = false, saveT = null, inflight = null, conflicts = 0, loadP = null;
export const st = () => S;
const writeCache = () => { try { localStorage.setItem(key, JSON.stringify({ S, at, dirty })); } catch {} };
const readCache = () => { try { return JSON.parse(localStorage.getItem(key) || "null"); } catch { return null; } };
const replaceInto = (next) => { for (const k of Object.keys(S)) if (!(k in next)) delete S[k]; Object.assign(S, next); };

export function ready(me) {
  const k = "psy-state:" + (me?.id || "anon");
  if (S && key === k) return Promise.resolve(S);
  if (loadP && key === k) return loadP;
  key = k; S = null; at = 0; dirty = false;
  loadP = (async () => {
    const c = readCache();
    let srv = null;
    try { srv = await api.appState("psy"); } catch { srv = null; }
    if (srv) {
      if (c?.S && (c.dirty || (c.at || 0) > srv.updated_at)) { S = merge(norm(c.S), srv.data); dirty = true; }
      else S = norm(srv.data || c?.S);
      at = srv.updated_at || 0;
    } else { S = norm(c?.S); at = c?.at || 0; dirty = !!c?.dirty; }
    writeCache();
    if (dirty) schedule(300);
    return S;
  })();
  loadP.finally(() => { loadP = null; });
  return loadP;
}
export function save() { if (!S) return; dirty = true; writeCache(); schedule(700); }
function schedule(ms) { clearTimeout(saveT); saveT = setTimeout(flush, ms); }
export async function flush() {
  clearTimeout(saveT); saveT = null;
  if (!dirty || !S || inflight) return inflight;
  dirty = false;
  inflight = (async () => {
    try { at = (await api.saveAppState("psy", S, at)).updated_at; conflicts = 0; }
    catch (e) {
      dirty = true;
      if (e.status === 409 && e.data && conflicts++ < 4) { replaceInto(merge({ ...S }, e.data.data)); at = e.data.updated_at || 0; schedule(50); }
      else schedule(15000);
    } finally { inflight = null; writeCache(); }
  })();
  return inflight;
}
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flush(); });

// ── 간격 반복(라이트너 상자) ── 상자 0~5, 상자가 오를수록 다음 복습이 멀어져요. 3상자부터 '익힘'
const MIN = 60e3, DAY = 864e5;
const GAP = [10 * MIN, DAY, 3 * DAY, 7 * DAY, 16 * DAY, 35 * DAY];
export const box = (id) => S?.srs?.[id]?.b ?? -1; // -1 = 아직 안 봄
export const known = (id) => box(id) >= 3;
export const seen = (id) => !!S?.srs?.[id];
export const isDue = (id, now = Date.now()) => { const x = S?.srs?.[id]; return !!x && x.d <= now; };
// 1 몰랐어 · 2 헷갈려 · 3 알아
export function rate(id, g) {
  if (!S) return;
  const now = Date.now(), x = S.srs[id] || { b: 0, n: 0 };
  const b = g === 1 ? 0 : g === 2 ? Math.max(1, Math.min(x.b, 2)) : Math.min(5, (S.srs[id] ? x.b : 1) + 1);
  S.srs[id] = { b, d: now + (g === 2 ? DAY : GAP[b]), n: (x.n || 0) + 1, l: now };
  S.last = id;
  save();
  window.dispatchEvent(new CustomEvent("psy:state"));
}
export function quizDone(ok) { if (!S) return; S.quiz.total++; if (ok) S.quiz.right++; save(); }
export function sparDone(scenario, score) { if (!S) return; S.spar.push({ at: Date.now(), scenario, score }); S.spar = S.spar.slice(-50); save(); }
