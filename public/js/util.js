// Shared helpers: escaping, dates, periods.

export const $ = (s, root = document) => root.querySelector(s);
export const $$ = (s, root = document) => [...root.querySelectorAll(s)];
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const pad = (n) => String(n).padStart(2, "0");
export const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
export const pct = (x) => Math.round(clamp(x) * 100);
export const initial = (name) => (String(name || "").trim()[0] || "?").toUpperCase();

export function debounce(fn, ms) {
  let t;
  const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  d.flush = (...a) => { clearTimeout(t); fn(...a); };
  d.cancel = () => clearTimeout(t);
  return d;
}

export function hm(mins) {
  mins = Math.max(0, Math.round(mins || 0));
  const h = Math.floor(mins / 60), m = mins % 60;
  return h ? (m ? `${h}시간 ${m}분` : `${h}시간`) : `${m}분`;
}
export const toMin = (t) => { const [h, m] = String(t || "0:0").split(":").map(Number); return h * 60 + m; };
export const toTime = (m) => `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`;
export const nowTime = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };

// ---------- dates (always local time) ----------
export const DOW = ["일", "월", "화", "수", "목", "금", "토"];
export const DOW_EN = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const MON_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseYmd = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
export const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
export const today = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); };
export const sameDay = (a, b) => ymd(a) === ymd(b);

export function isoWeek(d) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y = t.getUTCFullYear();
  return { y, w: Math.ceil(((t - Date.UTC(y, 0, 1)) / 864e5 + 1) / 7) };
}
export function mondayOf(y, w) {
  const jan4 = new Date(y, 0, 4);
  const mon1 = addDays(jan4, -((jan4.getDay() + 6) % 7));
  return addDays(mon1, (w - 1) * 7);
}

// period keys match the API: Y:2026 · M:2026-09 · W:2026-W40 · D:2026-09-28
export function periodKey(scope, d) {
  if (scope === "year") return `Y:${d.getFullYear()}`;
  if (scope === "month") return `M:${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  if (scope === "week") { const { y, w } = isoWeek(d); return `W:${y}-W${pad(w)}`; }
  return `D:${ymd(d)}`;
}
export function periodStart(key) {
  const [p, v] = key.split(":");
  if (p === "Y") return new Date(+v, 0, 1);
  if (p === "M") { const [y, m] = v.split("-").map(Number); return new Date(y, m - 1, 1); }
  if (p === "W") { const [y, w] = v.split("-W").map(Number); return mondayOf(y, w); }
  return parseYmd(v);
}
export function periodEnd(key) {
  const s = periodStart(key), p = key[0];
  if (p === "Y") return new Date(s.getFullYear() + 1, 0, 1);
  if (p === "M") return new Date(s.getFullYear(), s.getMonth() + 1, 1);
  if (p === "W") return addDays(s, 7);
  return addDays(s, 1);
}
export const scopeOf = (key) => ({ Y: "year", M: "month", W: "week", D: "day" }[key[0]]);
export function shiftPeriod(key, n) {
  const s = periodStart(key), scope = scopeOf(key);
  if (scope === "year") return periodKey(scope, new Date(s.getFullYear() + n, 0, 1));
  if (scope === "month") return periodKey(scope, new Date(s.getFullYear(), s.getMonth() + n, 1));
  if (scope === "week") return periodKey(scope, addDays(s, 7 * n));
  return periodKey(scope, addDays(s, n));
}
export function elapsed(key, at = new Date()) {
  const s = periodStart(key), e = periodEnd(key);
  return clamp((at - s) / (e - s));
}
export function periodLabel(key) {
  const s = periodStart(key), scope = scopeOf(key);
  if (scope === "year") return `${s.getFullYear()}년`;
  if (scope === "month") return `${s.getFullYear()}년 ${s.getMonth() + 1}월`;
  if (scope === "week") {
    const e = addDays(s, 6), { w } = isoWeek(s);
    return `${w}주차 · ${s.getMonth() + 1}.${s.getDate()} – ${e.getMonth() + 1}.${e.getDate()}`;
  }
  return `${s.getMonth() + 1}월 ${s.getDate()}일 ${DOW[s.getDay()]}요일`;
}
export function relativeDay(d) {
  const diff = Math.round((d - today()) / 864e5);
  return { "-1": "어제", 0: "오늘", 1: "내일" }[diff] ?? null;
}
export function dayOfYear(d) { return Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - new Date(d.getFullYear(), 0, 1)) / 864e5) + 1; }
export function daysInYear(y) { return Math.round((new Date(y + 1, 0, 1) - new Date(y, 0, 1)) / 864e5); }

export function pace(done, time, total) {
  if (!total) return { cls: "idle", text: "아직 계획이 없어요" };
  if (done >= 1) return { cls: "good", text: "모두 완료" };
  const diff = Math.round((done - time) * 100);
  if (diff >= 0) return { cls: "good", text: `시간보다 앞섬 +${diff}%p` };
  if (diff > -15) return { cls: "warn", text: `조금 뒤처짐 ${diff}%p` };
  return { cls: "bad", text: `많이 뒤처짐 ${diff}%p` };
}

// 하루 점수 = 계획 35 + 실행 65 (서버 scoreOf 와 같은 식).
// 실행 = 끝낸 일의 무게 / 전체 무게 · 무게 = 우선순위(low 1 … max 5, 없으면 2) × 걸리는 시간(없으면 30분)
export const PRIO_W = { low: 1, medium: 2, high: 3, xhigh: 4, max: 5 };
export function dayScore(plans, goal) {
  const planned = plans.reduce((s, p) => s + (p.mins || 0), 0);
  const doneMins = plans.filter((p) => p.done).reduce((s, p) => s + (p.mins || 0), 0);
  const count = plans.length, doneCount = plans.filter((p) => p.done).length;
  const plan = clamp((planned || count * 30) / Math.max(30, goal || 240));
  const w = (p) => (PRIO_W[p.priority] || 2) * (p.mins || 30);
  const all = plans.reduce((s, p) => s + w(p), 0), got = plans.filter((p) => p.done).reduce((s, p) => s + w(p), 0);
  const exec = all ? got / all : 0;
  return { planned, doneMins, count, doneCount, plan, exec, score: count ? Math.round(35 * plan + 65 * exec) : null };
}

// 원형 진행 링 (SVG)
export function ring(value, { size = 120, stroke = 10, time = null, label = "", big = null, sub = "" } = {}) {
  const c = size / 2, r = c - stroke / 2 - 4, C = 2 * Math.PI * r, v = clamp(value);
  const arc = v > 0 ? `<circle class="ring-val" cx="${c}" cy="${c}" r="${r}" stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="${(C * v).toFixed(2)} ${C.toFixed(2)}" transform="rotate(-90 ${c} ${c})"/>` : "";
  let tick = "";
  if (time != null) {
    const a = (clamp(time) * 360 - 90) * Math.PI / 180, r0 = r - stroke / 2 - 4, r1 = r + stroke / 2 + 4;
    tick = `<line class="ring-tick" x1="${(c + r0 * Math.cos(a)).toFixed(2)}" y1="${(c + r0 * Math.sin(a)).toFixed(2)}" x2="${(c + r1 * Math.cos(a)).toFixed(2)}" y2="${(c + r1 * Math.sin(a)).toFixed(2)}"/>`;
  }
  return `<svg class="ring" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="${esc(label)}">
    <circle class="ring-trk" cx="${c}" cy="${c}" r="${r}" stroke-width="${stroke}"/>${arc}${tick}
    <text class="ring-big" x="${c}" y="${c + (sub ? 4 : 7)}" text-anchor="middle">${big ?? pct(v)}<tspan class="ring-pc">${big == null ? "%" : ""}</tspan></text>
    ${sub ? `<text class="ring-sub" x="${c}" y="${c + 22}" text-anchor="middle">${esc(sub)}</text>` : ""}
  </svg>`;
}

export function toast(msg, kind = "") {
  if (!msg) return; // 조용한 오류(예: 비밀번호를 먼저 바꿔야 할 때)는 띄우지 않아요
  let host = document.getElementById("toasts");
  const el = document.createElement("div");
  el.className = "toast " + kind;
  el.setAttribute("role", "status");
  el.textContent = msg;
  host.appendChild(el);
  setTimeout(() => el.classList.add("out"), 2600);
  setTimeout(() => el.remove(), 3000);
}

export function planHash(p) {
  const v = p.period.slice(2);
  return p.scope === "day" ? "#/calendar/" + v : "#/calendar"; // 연·월·주 목표는 캘린더 그날 판의 '목표' 칸에서
}

// ---------- 공부 시간 = 집중 기록 + 영어 블록 분 (캘린더 · 회고 · 홈이 같은 뜻) ----------
export const focusOf = (logs = []) => logs.reduce((n, l) => n + (l.kind === "focus" ? l.mins || 0 : 0), 0);
export const englishOf = (en) => (en ? en.minutes ?? Object.values(en.blocks || {}).reduce((n, m) => n + (+m || 0), 0) : 0);
export const studyMins = ({ focus = 0, english = 0 } = {}) => Math.max(0, Math.round((+focus || 0) + (+english || 0)));
