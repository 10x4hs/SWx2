// CIM 기록 — 사람별 서버 저장(/api/apps/cim/state, user_app_state) + 이 기기 사본(localStorage, 사람마다 따로).
//   · 열 때: 서버 값을 받아요. 이 기기에 아직 못 보낸 기록(dirty)이 있으면 둘을 합쳐서 다시 보내요.
//   · 쓸 때: 0.7초 모았다가 통째로 PUT. 다른 기기가 먼저 썼으면 409 → 서버 값과 합쳐서 다시 (기록은 늘기만 해서 합치기가 안전해요).
//   · 서버가 안 되면 이 기기에만 두었다가 다음에 보내요.
import { api } from "../api.js";
import { kstDay, toast } from "../util.js";
import { ORDER, SUBJ_Q, chOf, subjOf } from "./meta.js";

export const today = () => kstDay();
export const addDays = (d, n) => { const t = new Date(d + "T00:00:00Z"); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
export const diff = (a, b) => Math.round((new Date(b + "T00:00:00Z") - new Date(a + "T00:00:00Z")) / 864e5);

// ans[id] = [맞힌 수, 틀린 수, 마지막 맞음 1/0] · wrong[id] = { st: 단계, due: 다시 볼 날 } · days[날] = 푼 수
// hist[날] = { 1: [맞음, 틀림], 2: …, 3: … } (과목별 정답률 흐름) · done[계획 일차][할 일] = true · read[핵심 key] = 1
// mocks = [{ date, by, total, pass, rid }] · run = 진행 중인 모의고사 { rid, ids, picks, end, cur }
const blank = () => ({ v: 2, exam: "", start: today(), done: {}, ans: {}, wrong: {}, days: {}, hist: {}, read: {}, mocks: [], run: null });
const obj = (x) => (x && typeof x === "object" && !Array.isArray(x) ? x : {});
function norm(x) {
  const s = Object.assign(blank(), obj(x));
  for (const k of ["done", "ans", "wrong", "days", "hist", "read"]) s[k] = obj(s[k]);
  if (!Array.isArray(s.mocks)) s.mocks = [];
  if (s.run && (!Array.isArray(s.run.ids) || !s.run.ids.length)) s.run = null;
  return s;
}

let S = null, at = 0, key = "", dirty = false, saveT = null, inflight = null, again = false, conflicts = 0, warned = false;
export const st = () => S;

function writeCache() { try { localStorage.setItem(key, JSON.stringify({ S, at, dirty })); } catch {} }
function readCache() { try { return JSON.parse(localStorage.getItem(key) || "null"); } catch { return null; } }

// 둘을 합쳐요 — L(이 기기)이 R(서버)보다 우선, 기록은 더 많이 푼 쪽 (문제마다)
const tot = (a) => (a ? (a[0] || 0) + (a[1] || 0) : -1);
export function merge(L, R) {
  if (!R) return L;
  R = norm(R);
  const out = { ...R, ...L };
  out.exam = L.exam || R.exam;
  out.start = [L.start, R.start].filter(Boolean).sort()[0] || today();
  out.ans = { ...R.ans };
  for (const [id, a] of Object.entries(L.ans)) if (tot(a) >= tot(R.ans[id])) out.ans[id] = a;
  out.wrong = {};
  for (const id of new Set([...Object.keys(L.wrong), ...Object.keys(R.wrong)])) {
    const useL = tot(L.ans[id]) >= tot(R.ans[id]);
    const w = useL ? L.wrong[id] || (L.ans[id] ? null : R.wrong[id]) : R.wrong[id];
    if (w) out.wrong[id] = w;
  }
  out.days = { ...R.days };
  for (const [d, n] of Object.entries(L.days)) out.days[d] = Math.max(n, R.days[d] || 0);
  out.hist = { ...R.hist };
  for (const [d, h] of Object.entries(L.hist)) {
    const r = R.hist[d] || {}, m = {};
    for (const s of ["1", "2", "3"]) { const a = h[s], b = r[s]; const pick = tot(a) >= tot(b) ? a : b; if (pick) m[s] = pick; }
    out.hist[d] = m;
  }
  out.read = { ...R.read, ...L.read };
  out.done = { ...R.done };
  for (const [d, x] of Object.entries(L.done)) out.done[d] = { ...(R.done[d] || {}), ...x };
  const mk = (m) => `${m.rid || ""}|${m.date}|${m.total}|${JSON.stringify(m.by)}`, seen = new Set();
  out.mocks = [...R.mocks, ...L.mocks].filter((m) => { const k = mk(m); if (seen.has(k)) return false; seen.add(k); return true; }).slice(-20);
  const finished = (run) => run && out.mocks.some((m) => m.rid && m.rid === run.rid);
  out.run = L.run && !finished(L.run) ? L.run : R.run && !finished(R.run) ? R.run : null;
  return out;
}
// 같은 객체 안에서 바꿔요 — 화면이 쥐고 있는 S 를 그대로 쓰게
function replaceInto(next) { for (const k of Object.keys(S)) if (!(k in next)) delete S[k]; Object.assign(S, next); }

let loadP = null;
export function ready(ctx) {
  const k = "cim-state:" + (ctx.me?.id || "anon");
  if (S && key === k) { refresh(); return Promise.resolve(S); }
  if (loadP && key === k) return loadP;
  key = k; S = null; at = 0; dirty = false;
  loadP = (async () => {
    const c = readCache();
    let srv = null;
    try { srv = await api.appState("cim"); } catch { srv = null; }
    if (srv) {
      if (c?.S && (c.dirty || (c.at || 0) > srv.updated_at)) { S = merge(norm(c.S), srv.data); dirty = true; }
      else { S = norm(srv.data || c?.S); dirty = !srv.data && !!c?.S; }
      at = srv.updated_at || 0;
    } else { S = norm(c?.S); at = c?.at || 0; dirty = !!c?.dirty; }
    writeCache();
    if (dirty) schedule(300);
    return S;
  })();
  loadP.finally(() => { loadP = null; });
  return loadP;
}

// 다시 들어올 때: 뒤에서 서버 값을 받아 합쳐요 → 바뀌었으면 "cim:state"
async function refresh() {
  try {
    const srv = await api.appState("cim");
    if (!srv || srv.updated_at <= at || !S) return;
    replaceInto(dirty ? merge({ ...S }, srv.data) : norm(srv.data));
    at = srv.updated_at; writeCache();
    if (dirty) schedule(300);
    window.dispatchEvent(new CustomEvent("cim:state"));
  } catch {}
}

const sync = (s) => window.dispatchEvent(new CustomEvent("cim:sync", { detail: { s } }));
export function save() { if (!S) return; dirty = true; writeCache(); sync("saving"); schedule(700); }
function schedule(ms) { clearTimeout(saveT); saveT = setTimeout(flush, ms); }
export async function flush() {
  clearTimeout(saveT); saveT = null;
  if (!dirty || !S) return;
  if (inflight) { again = true; return inflight; }
  dirty = false;
  inflight = (async () => {
    try {
      const r = await api.saveAppState("cim", S, at);
      at = r.updated_at; conflicts = 0; if (!dirty) sync("saved");
    } catch (e) {
      dirty = true;
      if (e.status === 409 && e.data && conflicts++ < 4) { replaceInto(merge({ ...S }, e.data.data)); at = e.data.updated_at || 0; again = true; }
      else { if (!warned && e.status) { warned = true; toast("기록을 서버에 못 보냈어요. 이 기기에 두었다가 다시 보낼게요.", "err"); } schedule(15000); sync("offline"); }
    } finally {
      inflight = null; writeCache();
      if (again) { again = false; if (dirty) schedule(50); }
    }
  })();
  return inflight;
}
// 창을 닫을 때: 남은 기록을 keepalive 로 (작을 때만 — 크면 이 기기 사본이 다음에 보내요)
addEventListener("pagehide", () => {
  if (!dirty || !S) return;
  const body = JSON.stringify({ data: S, at });
  if (body.length < 60000) try { fetch("/api/apps/cim/state", { method: "PUT", keepalive: true, credentials: "same-origin", headers: { "content-type": "application/json", "x-trio": "1" }, body }); } catch {}
});
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flush(); });

// ---------- 기록 · 오답노트 (1 · 3 · 7일) ----------
export const GAP = [1, 3, 7];
export function record(q, ok) {
  const d = today(), a = S.ans[q.id] || [0, 0, 0];
  a[ok ? 0 : 1]++; a[2] = ok ? 1 : 0; S.ans[q.id] = a;
  S.days[d] = (S.days[d] || 0) + 1;
  const h = (S.hist[d] ||= {}), hs = (h[q.s] ||= [0, 0]); hs[ok ? 0 : 1]++;
  const w = S.wrong[q.id];
  if (!ok) S.wrong[q.id] = { st: 0, due: addDays(d, 1) };
  else if (w && w.due <= d) { w.st++; if (w.st >= GAP.length) delete S.wrong[q.id]; else w.due = addDays(d, GAP[w.st]); }
  save();
}
const validId = (id) => ORDER.includes(chOf(id));
export const dueIds = () => Object.keys(S.wrong).filter((id) => validId(id) && S.wrong[id].due <= today());
export const wrongIds = () => Object.keys(S.wrong).filter(validId);
export function subjStat(s) {
  let r = 0, w = 0, n = 0;
  for (const [id, a] of Object.entries(S.ans)) if (subjOf(id) === s) { n++; r += a[0]; w += a[1]; }
  return { n, tot: SUBJ_Q[s], acc: r + w ? r / (r + w) : null };
}
export const seenIn = (ch) => { const p = ch + "-"; let n = 0; for (const id in S.ans) if (id.startsWith(p)) n++; return n; };
// 최근 n 일 과목별 정답률 (그날 푼 게 없으면 null)
export function trend(s, n = 14) {
  const d0 = today();
  return Array.from({ length: n }, (_, i) => { const d = addDays(d0, i - n + 1), h = S.hist[d]?.[s]; return h && h[0] + h[1] ? h[0] / (h[0] + h[1]) : null; });
}
