// Silicon Valley Mafia 기록 — 사람별 서버 저장(/api/apps/svm/state) + 이 기기 사본(localStorage)
//   read[글] = 다 읽은 시각 · pos[글] = 읽은 곳(0~100) · last = 마지막으로 연 글 · mode = 읽는 방식(sum · orig · brief) · crit = 주요 비판 펼침(1/0)
//   CIM(cim/store.js)과 같은 방식: 0.7초 모았다가 통째로 PUT, 409 면 서버 값과 합쳐서 다시 (읽은 기록은 늘기만 해서 합치기가 안전해요)
import { api } from "../api.js";

const blank = () => ({ v: 1, read: {}, pos: {}, last: null, mode: "sum", crit: 1 });
const obj = (x) => (x && typeof x === "object" && !Array.isArray(x) ? x : {});
const norm = (x) => { const s = Object.assign(blank(), obj(x)); s.read = obj(s.read); s.pos = obj(s.pos); return s; };
export function merge(L, R) {
  if (!R) return L;
  R = norm(R);
  const out = { ...R, ...L, read: { ...R.read }, pos: { ...R.pos } };
  for (const [k, t] of Object.entries(L.read)) out.read[k] = Math.max(t || 0, R.read[k] || 0);
  for (const [k, p] of Object.entries(L.pos)) out.pos[k] = Math.max(p || 0, R.pos[k] || 0);
  return out;
}

let S = null, at = 0, key = "", dirty = false, saveT = null, inflight = null, conflicts = 0;
export const st = () => S;
const writeCache = () => { try { localStorage.setItem(key, JSON.stringify({ S, at, dirty })); } catch {} };
const readCache = () => { try { return JSON.parse(localStorage.getItem(key) || "null"); } catch { return null; } };
const replaceInto = (next) => { for (const k of Object.keys(S)) if (!(k in next)) delete S[k]; Object.assign(S, next); };

let loadP = null;
export function ready(me) {
  const k = "svm-state:" + (me?.id || "anon");
  if (S && key === k) return Promise.resolve(S);
  if (loadP && key === k) return loadP;
  key = k; S = null; at = 0; dirty = false;
  loadP = (async () => {
    const c = readCache();
    let srv = null;
    try { srv = await api.appState("svm"); } catch { srv = null; }
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
    try { at = (await api.saveAppState("svm", S, at)).updated_at; conflicts = 0; }
    catch (e) {
      dirty = true;
      if (e.status === 409 && e.data && conflicts++ < 4) { replaceInto(merge({ ...S }, e.data.data)); at = e.data.updated_at || 0; schedule(50); }
      else schedule(15000);
    } finally { inflight = null; writeCache(); }
  })();
  return inflight;
}
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flush(); });

// 읽기 표시
export const isRead = (id) => !!S?.read?.[id];
export function setRead(id, on) { if (!S) return; if (on) { S.read[id] = Date.now(); S.pos[id] = 100; } else { delete S.read[id]; delete S.pos[id]; } save(); }
export function setPos(id, p) { if (!S) return; p = Math.max(0, Math.min(100, Math.round(p))); if (p > (S.pos[id] || 0) + 4 || p === 100) { S.pos[id] = p; S.last = id; save(); } }
export function setPref(k, v) { if (!S || S[k] === v) return; S[k] = v; save(); }
