// CIM 14일 계획 — 오늘이 며칠째인지 · D-day · 오늘 공부할 장 · 오늘 공부(#/cim/go) 진행 상태
import { st, today, diff, subjStat } from "./store.js";
import { CH, ORDER } from "./meta.js";
import { NOTES } from "./notes.js";

export const PLAN = NOTES.PLAN;
export const STEPS = ["읽기", "문제", "오답", "떠올리기"];
export const READ_CAP = 10; // 하루에 읽을 카드
export const Q_CAP = 20; // 하루에 풀 문제
export const W_CAP = 15; // 하루에 다시 볼 오답 (나머지는 시험 탭에서)

export function planDay(S = st()) {
  if (S.exam) return Math.max(1, Math.min(14, 15 - diff(today(), S.exam)));
  return Math.max(1, Math.min(14, diff(S.start, today()) + 1));
}
export function ddayText(S = st()) {
  if (!S?.exam) return "D-?";
  const left = diff(today(), S.exam);
  return left > 0 ? "D-" + left : left === 0 ? "D-DAY" : "끝";
}
const WD = ["일", "월", "화", "수", "목", "금", "토"];
export const dateKo = (d) => { const t = new Date(d + "T00:00:00Z"); return `${t.getUTCMonth() + 1}월 ${t.getUTCDate()}일 ${WD[t.getUTCDay()]}요일`; };

// 장 정답률 (푼 게 없으면 null)
export function chAcc(id, S = st()) {
  let a = 0, b = 0; const p = id + "-";
  for (const [k, v] of Object.entries(S.ans)) if (k.startsWith(p)) { a += v[0]; b += v[1]; }
  return a + b ? a / (a + b) : null;
}
export const readIn = (id, S = st()) => { const p = id + "-"; let n = 0; for (const k in S.read) if (k.startsWith(p)) n++; return n; };

// 오늘 공부할 장: 계획에 장이 있으면 그 장, 실전 날(12–14일)은 약한 장 3개 (정답률 낮은 순 → 덜 읽은 순)
export function todayChs(S = st()) {
  const p = PLAN[planDay(S) - 1];
  if (p.ch?.length) return p.ch;
  const score = (id) => { const a = chAcc(id, S); return (a == null ? 0.5 : a) + readIn(id, S) / CH[id].np / 10; };
  return ORDER.slice().sort((x, y) => score(x) - score(y)).slice(0, 3);
}
// 오늘 공부 진행: null = 아직 · { step, i, done }
export function todayRun(S = st()) {
  const t = S.today;
  return t && t.d === today() ? t : null;
}
// 과목별 정답률 (0~100 또는 null)
export const subjPct = (s) => { const x = subjStat(s); return x.acc == null ? null : Math.round(x.acc * 100); };
