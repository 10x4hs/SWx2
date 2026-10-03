// 영어 자료 — 옵시디언 ENGLISH-OS 에서 뽑은 public/english/data.json 을 읽고, 날짜로 "지금 어디쯤" 을 계산해요.
// 계산은 모두 브라우저 로컬 날짜 기준 (YYYY-MM-DD 문자열).
import { ymd, parseYmd, addDays, today } from "../util.js";

let cache = null;
export function loadData(force = false) {
  if (force) cache = null;
  if (!cache) {
    cache = fetch("/english/data.json", { cache: "no-cache" }).then(async (r) => {
      if (!r.ok) throw Object.assign(new Error("영어 자료 파일이 아직 없어요."), { status: r.status });
      return normalize(await r.json());
    });
    cache.catch(() => { cache = null; }); // 실패하면 다음에 다시 시도
  }
  return cache;
}

const arr = (x) => (Array.isArray(x) ? x : []);
function normalize(d) {
  const p = d.program || {};
  return {
    ...d,
    program: { start: p.start, end: p.end, goal_hours: +p.goal_hours || 650, days: +p.days || 182 },
    sprints: arr(d.sprints), stage1_days: arr(d.stage1_days), stage2_weeks: arr(d.stage2_weeks),
    sentences: arr(d.sentences), patterns: arr(d.patterns), fillers: arr(d.fillers), pressure: arr(d.pressure),
    smalltalk: arr(d.smalltalk), false_friends: arr(d.false_friends), prompts: arr(d.prompts),
    checkpoints: arr(d.checkpoints), daily_checks: arr(d.daily_checks),
    weekend_blocks: d.weekend_blocks || null, stage_notes: d.stage_notes || {},
  };
}

// 블록 — 이름·번호·차트 색. 색은 차트 안에서만 써요.
export const BLOCKS = {
  words: { n: "①", name: "단어·Anki", short: "단어", color: "var(--c-amber)" },
  sound: { n: "②", name: "소리·섀도잉", short: "소리", color: "var(--c-teal)" },
  speak: { n: "③", name: "말하기·AI 대화", short: "말하기", color: "var(--c-rose)" },
  recall: { n: "④", name: "인출·패턴", short: "인출", color: "var(--c-violet)" },
  pattern: { n: "④", name: "패턴 정리", short: "패턴", color: "var(--c-blue)" },
  review: { n: "⑤", name: "한 주 복습", short: "복습", color: "var(--c-green)" },
};
export const SPOKEN = ["sound", "speak"]; // 입을 연 시간

export const todayKey = () => ymd(today());
export const diffDays = (a, b) => Math.round((parseYmd(b) - parseYmd(a)) / 864e5);
export const isWeekend = (day) => { const g = parseYmd(day).getDay(); return g === 0 || g === 6; };

// 날짜 → 프로그램 위치 { n(1~days, 시작 전 0), week, sprint, before, after }
export function position(data, day) {
  const { start, end, days } = data.program;
  const n = start ? diffDays(start, day) + 1 : 0;
  const before = n < 1, after = end ? day > end : n > days;
  const week = before ? 0 : Math.min(Math.ceil(n / 7), Math.ceil(days / 7));
  const sprint = data.sprints.find((s) => s.from <= day && day <= s.to)
    || (before ? data.sprints[0] : after ? data.sprints[data.sprints.length - 1] : data.sprints.find((s) => s.weeks && week >= s.weeks[0] && week <= s.weeks[1]))
    || null;
  return { n: before ? 0 : Math.min(n, days), week, sprint, before, after, days };
}

// 그날의 블록 목표(분) — 주말은 weekend_blocks
export function targetsFor(data, day) {
  const pos = position(data, day);
  const src = isWeekend(day) && data.weekend_blocks ? data.weekend_blocks : pos.sprint?.blocks || {};
  const keys = Object.keys(src).filter((k) => BLOCKS[k] && +src[k] > 0);
  return keys.map((k) => ({ key: k, target: +src[k], ...BLOCKS[k] }));
}

// 그날 할 일 — 1단계는 날짜별 과제, 그다음은 주차별 과제
export function taskFor(data, day) {
  const pos = position(data, day);
  const d1 = data.stage1_days.find((x) => x.date === day) || (pos.n ? data.stage1_days.find((x) => +x.day === pos.n && !x.date) : null);
  if (d1) return { kind: "day", ...d1 };
  const w = data.stage2_weeks.find((x) => x.from <= day && day <= x.to) || data.stage2_weeks.find((x) => +x.week === pos.week);
  if (w) return { kind: "week", ...w };
  return null;
}

// 오늘 과제의 생존 문장 번호들
export function sentenceRange(task) {
  const s = task?.sentences;
  if (!Array.isArray(s) || s.length < 1) return [];
  const a = +s[0], b = +(s[1] ?? s[0]);
  if (!a || !b) return [];
  const out = [];
  for (let i = Math.min(a, b); i <= Math.max(a, b); i++) out.push(i);
  return out;
}

// 이번 주 패턴 — 프로그램 주차와 같은 주의 패턴. 없으면 다음으로 패턴이 있는 주를 알려줘요.
export function weekPatterns(data, week) {
  const list = data.patterns.filter((p) => +p.week === week);
  const next = list.length ? null : data.patterns.map((p) => +p.week).filter((w) => w > week).sort((a, b) => a - b)[0] ?? null;
  return { list, next };
}

export function sprintLabel(s) { return s ? `${s.id} ${s.name || ""}`.trim() : ""; }
export function dayRange(data) {
  const out = [];
  const { start, end } = data.program;
  if (!start) return out;
  const last = end || ymd(addDays(parseYmd(start), data.program.days - 1));
  for (let d = parseYmd(start); ymd(d) <= last; d = addDays(d, 1)) out.push(ymd(d));
  return out;
}

// 시간 표기
export function mins(m) {
  m = Math.max(0, Math.round(m || 0));
  const h = Math.floor(m / 60), r = m % 60;
  return h ? (r ? `${h}시간 ${r}분` : `${h}시간`) : `${r}분`;
}
export const hours1 = (m) => { const h = (m || 0) / 60; return h >= 100 ? String(Math.round(h)) : String(Math.round(h * 10) / 10); };

// 로컬 저장 (막혀도 조용히)
export const store = {
  get(k, d = null) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
