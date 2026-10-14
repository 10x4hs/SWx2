// 경영 마이크로디그리 — 내용 파일(public/mba/*.json) 읽기 · 하루 시간 설정 · 오늘의 순서 · 학습 현황 계산
import { api } from "../api.js";

const cache = new Map();
export function getJSON(path) {
  if (!cache.has(path)) {
    const p = fetch(path).then((r) => { if (!r.ok) throw new Error(`${path} ${r.status}`); return r.json(); });
    p.catch(() => cache.delete(path));
    cache.set(path, p);
  }
  return cache.get(path);
}
export const index = () => getJSON("/mba/index.json");
export const moduleDoc = (id) => getJSON(`/mba/${id}.json`);
export const company = () => getJSON("/mba/company.json");
export const words = () => getJSON("/mba/words.json");
export const kit = () => getJSON("/mba/kit.json");
export function state() { return api.mbaState().catch(() => ({ today: "", items: [], due: [], days: [], done: [] })); }

// 하루 시간 (이 기기에만 기억) — 하루 1~2시간: 60 · 90 · 120분, 기본 90분
const KEY = "mb-minutes2";
export const MINUTES = [60, 90, 120];
export function minutes() { try { const v = Number(localStorage.getItem(KEY)); return MINUTES.includes(v) ? v : 90; } catch { return 90; } }
export function setMinutes(v) { try { localStorage.setItem(KEY, String(v)); } catch {} }
export const cardsPerDay = (m) => ({ 60: 2, 90: 3, 120: 4 })[m] || 3;
export const reviewLimit = (m) => ({ 60: 12, 90: 18, 120: 25 })[m] || 18;

// 오늘의 순서 — 인출 → 복습 → 새 카드 → 케이스 · 연습문제(적용) → 내일 한 줄
// (research: Dunlosky 2013 · Roediger & Karpicke 2006 · Cepeda 2008 · 자기 설명 · 실행 의도). 분 배분 비율은 제안이에요.
const SPLIT = { 60: [7, 10, 25, 15, 3], 90: [10, 15, 35, 25, 5], 120: [12, 20, 45, 38, 5] };
export const split = (m) => SPLIT[m] || SPLIT[90];
export function steps(m) {
  return [
    { key: "recall", name: "먼저 떠올리기", why: "읽기 전에 어제 배운 것을 빈 화면에 꺼내 봐요. 틀려도 괜찮아요.", src: "1주 뒤 기억 42% → 56% · Roediger & Karpicke 2006" },
    { key: "review", name: "지난 카드 다시 꺼내기", why: "1 · 3 · 7 · 21 · 60일 된 카드를 다시 풀어요. 맞히면 간격이 늘어나요.", src: "인출 · 간격 반복만 근거 '높음' · Dunlosky 2013" },
    { key: "learn", name: `새 카드 ${cardsPerDay(m)}장`, why: "한 장에 한 생각. 읽고 '더 자세히'까지, 처음 보는 말은 낱말에서 확인해요.", src: "작업기억 부담 줄이기 · 인지 부하 이론" },
    { key: "apply", name: "케이스 · 연습문제", why: "배운 도구로 실제 상황을 풀어요. 답을 보기 전에 내 답을 먼저 적어요.", src: "자기 설명 g=0.55 · 생성 효과 0.40 (메타분석)" },
    { key: "plan", name: "내일 한 줄", why: "내일 언제, 어디서 할지 한 줄로 정해요.", src: "실행 의도(if-then) · Gollwitzer" },
  ];
}

// ---------- 진도 ----------
export function readSet(st) { return new Set((st.items || []).map((x) => x.module + "/" + x.card)); }
export function doneSet(st) { return new Set((st.done || []).map((x) => x.module + "/" + x.item)); }
export function nextCard(idx, st) {
  const read = readSet(st);
  for (const m of idx.modules) for (const c of m.cards) if (!read.has(m.id + "/" + c.id)) return { module: m, card: c };
  return null;
}
export function nextCards(idx, st, n) {
  const read = readSet(st), out = [];
  for (const m of idx.modules) for (const c of m.cards) { if (!read.has(m.id + "/" + c.id)) out.push({ module: m, card: c }); if (out.length >= n) return out; }
  return out;
}
export function progressOf(m, st) {
  const read = readSet(st), done = doneSet(st), has = (s, id) => s.has(m.id + "/" + id);
  const cards = m.cards.filter((c) => has(read, c.id)).length, cases = (m.cases || []).filter((k) => has(done, k.id)).length;
  const probs = (m.problems || []).filter((p) => has(done, p.id)).length, lecs = (m.lectures || []).filter((l) => has(done, l.id)).length;
  const total = m.cards.length + (m.cases || []).length + (m.problems || []).length;
  return { read: cards, total: m.cards.length, cards, cases, probs, lecs, nCases: (m.cases || []).length, nProbs: (m.problems || []).length, nLecs: (m.lectures || []).length, ratio: total ? (cards + cases + probs) / total : 0 };
}
// 지금 모듈 · 지금 날(1~10): 아직 안 읽은 첫 카드가 있는 곳
export function position(idx, st) {
  const nx = nextCard(idx, st);
  if (!nx) return { module: idx.modules[idx.modules.length - 1], day: 10, done: true };
  return { module: nx.module, day: nx.card.day || 1, done: false };
}

// ---------- 학습 현황 ----------
const addDay = (d, n) => new Date(Date.parse(d + "T00:00:00Z") + n * 864e5).toISOString().slice(0, 10);
export { addDay };
export function metrics(idx, st, mins) {
  const today = st.today || new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  const per = idx.modules.map((m) => ({ m, p: progressOf(m, st) }));
  const sum = (f) => per.reduce((n, x) => n + f(x), 0);
  const tot = { cards: sum((x) => x.p.total), cases: sum((x) => x.p.nCases), probs: sum((x) => x.p.nProbs), lecs: sum((x) => x.p.nLecs) };
  const got = { cards: sum((x) => x.p.cards), cases: sum((x) => x.p.cases), probs: sum((x) => x.p.probs), lecs: sum((x) => x.p.lecs) };
  const all = tot.cards + tot.cases + tot.probs, have = got.cards + got.cases + got.probs;
  // 퀴즈 · 문제 정답률 (마지막 시도 기준)
  const q = (st.items || []).filter((x) => x.total), pr = (st.done || []).filter((x) => x.kind === "problem" && x.total);
  const right = q.reduce((n, x) => n + x.correct, 0) + pr.reduce((n, x) => n + x.score, 0), asked = q.reduce((n, x) => n + x.total, 0) + pr.reduce((n, x) => n + x.total, 0);
  // 하루 분 (최근 168일)
  const byDay = new Map((st.days || []).map((d) => [d.day, d.minutes || 0]));
  const week = []; for (let i = 6; i >= 0; i--) { const d = addDay(today, -i); week.push({ day: d, min: byDay.get(d) || 0 }); }
  const weekMin = week.reduce((n, d) => n + d.min, 0), goal = mins * 5; // 계획: 주 5일 (모듈 하나 = 2주 · 10일)
  // 복습 예보: 오늘(밀린 것 포함)부터 7일
  const fc = []; for (let i = 0; i < 7; i++) { const d = addDay(today, i); fc.push({ day: d, n: (st.items || []).filter((x) => x.stage < 6 && (i === 0 ? x.due_day <= d : x.due_day === d)).length }); }
  // 끝나는 날 예상: 최근 14일 동안 하루 평균 읽은 카드 수 (없으면 계획대로)
  const since = Date.parse(addDay(today, -13) + "T00:00:00+09:00");
  const recent = (st.items || []).filter((x) => x.read_at >= since).length;
  const activeDays = new Set((st.items || []).filter((x) => x.read_at >= since).map((x) => new Date(x.read_at + 9 * 3600e3).toISOString().slice(0, 10))).size;
  const paceFrom = activeDays >= 3 ? "recent" : "plan", pace = paceFrom === "recent" ? recent / 14 : cardsPerDay(mins) * 5 / 7;
  const left = tot.cards - got.cards, daysLeft = pace > 0 ? Math.ceil(left / pace) : null;
  // 24주 잔디 (월요일 시작 · 7행)
  const start = (() => { const t = new Date(Date.parse(today + "T00:00:00Z")); const dow = (t.getUTCDay() + 6) % 7; return addDay(today, -dow - 7 * 23); })();
  const heat = []; for (let i = 0; i < 24 * 7; i++) { const d = addDay(start, i); heat.push({ day: d, min: d > today ? -1 : byDay.get(d) || 0 }); }
  const studiedDays = (st.days || []).filter((d) => d.minutes > 0).length;
  // 연속: 오늘(아직 안 했으면 어제)부터 거꾸로 하루도 안 빠진 날
  let streak = 0; for (let i = byDay.get(today) ? 0 : 1; byDay.get(addDay(today, -i)) > 0; i++) streak++;
  const weeks = []; for (let w = 0; w < 24; w++) weeks.push(heat.slice(w * 7, w * 7 + 7).reduce((n, h) => n + Math.max(0, h.min), 0));
  return { weeks, per, tot, got, ratio: all ? have / all : 0, acc: asked ? right / asked : null, asked, week, weekMin, goal, fc, pace, paceFrom, left, finish: daysLeft != null ? addDay(today, daysLeft) : null, daysLeft, heat, studiedDays, streak, today };
}
