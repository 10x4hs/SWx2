// CIM 계획 — 교재 순서 그대로 (1과목 1장 → … → 3과목 10장, 장 안은 쪽 순서 = 핵심 번호 순서)
//   · 오늘 공부(#/cim/go)는 교재에서 아직 안 읽은 다음 카드부터 이어 읽어요
//   · 하루 분량은 시험일에 맞춰요: 남은 카드 ÷ (시험 3일 전까지 남은 날) — 마지막 3일은 약한 장 다시 보기 + 모의고사
//   · 시험일이 없으면 하루 READ_CAP 장
import { st, today, diff, subjStat } from "./store.js";
import { CH, CHS, ORDER } from "./meta.js";

export const STEPS = ["읽기", "문제", "오답", "떠올리기"];
export const READ_CAP = 10; // 시험일이 없을 때 하루에 읽을 카드
export const READ_MIN = 6, READ_MAX = 60; // 시험일에 맞춘 하루 분량의 아래 · 위 끝
export const Q_CAP = 20; // 하루에 풀 문제
export const W_CAP = 15; // 하루에 다시 볼 오답 (나머지는 시험 탭에서)
export const REVIEW_DAYS = 3; // 시험 전 마지막 며칠은 복습 + 모의고사

// 교재 순서 카드 key 목록 (s1c1-1 … s3c10-20) — 장 내용을 받지 않아도 알 수 있어요 (핵심 번호 = 쪽 순서, scripts 검사로 확인)
export const BOOK = CHS.flatMap((c) => Array.from({ length: c.np }, (_, i) => `${c.id}-${i + 1}`));
export const bookIndex = (key) => BOOK.indexOf(key);
export const unreadKeys = (S = st()) => BOOK.filter((k) => !S.read[k]);
export const nextKey = (S = st()) => BOOK.find((k) => !S.read[k]) || null;

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
export const weakChs = (S = st(), n = 3) => { const score = (id) => { const a = chAcc(id, S); return (a == null ? 0.5 : a) + readIn(id, S) / CH[id].np / 10; }; return ORDER.slice().sort((x, y) => score(x) - score(y)).slice(0, n); };

// 오늘 계획: { mode: "read" | "review" | "done", n: 오늘 읽을 카드 수, keys, chs, left: 시험까지 남은 날, readDays }
//   review = 시험 3일 전부터, 또는 교재를 다 읽었을 때 — 약한 장 3개의 ★★★ 카드 다시 + 모의고사
export function todayPlan(S = st()) {
  const left = S.exam ? diff(today(), S.exam) : null, un = unreadKeys(S);
  const readDays = left == null ? null : Math.max(1, left - REVIEW_DAYS + 1); // 오늘 포함 · 시험 3일 전 날까지
  if (!un.length || (left != null && left < REVIEW_DAYS)) { const chs = weakChs(S); return { mode: "review", n: READ_CAP, keys: null, chs, left, readDays: 0, unread: un.length }; }
  const n = left == null ? READ_CAP : Math.max(READ_MIN, Math.min(READ_MAX, Math.ceil(un.length / readDays)));
  const keys = un.slice(0, n);
  return { mode: "read", n: keys.length, keys, chs: [...new Set(keys.map((k) => k.slice(0, k.indexOf("-"))))], left, readDays, unread: un.length };
}
export const todayChs = (S = st()) => todayPlan(S).chs;
// 교재 진도 (읽은 카드 / 전체) 와 다음에 읽을 카드의 쪽 — 쪽은 장 JSON 을 받아야 알아서 화면이 채워요
export const bookDone = (S = st()) => BOOK.length - unreadKeys(S).length;

// 오늘 공부 진행: null = 아직 · { step, i, done }
//   옛 계획(14일 · 계산 먼저)으로 짠 오늘 공부는 아직 손대지 않았으면(읽기 첫 장) 버리고 교재 순서로 다시 짜요 — 진행 중이면 그대로 끝내요
export function todayRun(S = st()) {
  const t = S.today;
  if (!t || t.d !== today()) return null;
  if (!t.bk && t.step === 0 && !t.i) return null;
  return t;
}
// 과목별 정답률 (0~100 또는 null)
export const subjPct = (s) => { const x = subjStat(s); return x.acc == null ? null : Math.round(x.acc * 100); };
// "2과목 6장 · 4장 · 3과목 6장" — 같은 과목은 한 번만
export const chLine = (chs) => chs.map((id, i) => (i && CH[chs[i - 1]].s === CH[id].s ? "" : `${CH[id].s}과목 `) + `${CH[id].c}장`).join(" · ");
