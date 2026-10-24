// 할 일 보드의 계산만 모은 곳 (화면 없이 — scripts/smoke.mjs 가 그대로 불러 검사해요).
//   colOf(p, ids)        이 할 일이 들어갈 칸: done 이면 '완료', 아니면 status(있는 칸일 때), 아니면 '할 일'
//   whenOf(p)            그 할 일의 날짜 = 마감일(due) 이 있으면 마감일, 없으면 하는 날(period)
//   weekRange(t)         이번 주 월~일 'YYYY-MM-DD'
//   kpis(list, t)        열린 일 · 이번 주 마감 · 늦은 일 · 이번 주 완료 · 프로젝트 수
//   filterList(list, f, t)  기간(오늘 · 이번 주 · 전체) · 프로젝트 · 우선순위 · 글 찾기 · 숫자 칩
//   sortBetween(a, b)    끌어 놓은 자리의 순서 값 (앞 · 뒤 사이)
//   subProgress(p)       작은 할 일 [끝낸 수, 전체]
//   tagColor(name, tags) 프로젝트 색 (정해 둔 색, 없으면 이름으로 늘 같은 색)

export const COLORS = ["blue", "green", "amber", "rose", "violet", "teal", "orange", "gray"];
const pad = (n) => String(n).padStart(2, "0");
export const ymdOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const plus = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

export function colOf(p, ids) {
  if (p.done) return "done";
  const s = p.status;
  return s && s !== "done" && ids.includes(s) ? s : "todo";
}
export const dayOf = (p) => (typeof p.period === "string" && p.period.startsWith("D:") ? p.period.slice(2) : null);
export const whenOf = (p) => p.due || dayOf(p);

export function weekRange(t = new Date()) {
  const d = new Date(t.getFullYear(), t.getMonth(), t.getDate());
  const mon = plus(d, -((d.getDay() + 6) % 7));
  return { from: ymdOf(mon), to: ymdOf(plus(mon, 6)), start: mon.getTime() };
}
export const isLate = (p, today) => !p.done && !!p.due && p.due < today;

export function kpis(list, t = new Date()) {
  const today = ymdOf(t), w = weekRange(t);
  const open = list.filter((p) => !p.done);
  return {
    open: open.length,
    dueWeek: open.filter((p) => p.due && p.due >= w.from && p.due <= w.to).length,
    late: open.filter((p) => isLate(p, today)).length,
    doneWeek: list.filter((p) => p.done && (p.done_at || 0) >= w.start).length,
    projects: new Set(open.map((p) => p.project).filter(Boolean)).size,
  };
}

// f = { range: "today" | "week" | "all", project: "" | 이름 | "-" (프로젝트 없음), prio: "" | "urgent" | max · xhigh · high · medium · low | "-", q, kpi: "" | "dueWeek" | "late" | "doneWeek" | "open" }
export function filterList(list, f = {}, t = new Date()) {
  const today = ymdOf(t), w = weekRange(t), q = (f.q || "").trim().toLowerCase();
  return list.filter((p) => {
    const when = whenOf(p), late = isLate(p, today);
    if (f.range === "today" && !(when === today || late)) return false; // 늦은 일은 오늘 할 일로 같이 보여요
    if (f.range === "week" && !((when && when >= w.from && when <= w.to) || late)) return false;
    if (f.project === "-" ? p.project : f.project && p.project !== f.project) return false;
    if (f.prio === "urgent" ? !(p.priority === "max" || p.priority === "xhigh") : f.prio === "-" ? p.priority : f.prio && p.priority !== f.prio) return false;
    if (f.kpi === "open" && p.done) return false;
    if (f.kpi === "dueWeek" && !(!p.done && p.due && p.due >= w.from && p.due <= w.to)) return false;
    if (f.kpi === "late" && !late) return false;
    if (f.kpi === "doneWeek" && !(p.done && (p.done_at || 0) >= w.start)) return false;
    if (q) {
      const hay = [p.text, p.project, p.note, ...(p.subtasks || []).map((s) => s.t)].filter(Boolean).join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

// 끌어 놓은 자리: 앞(a) · 뒤(b) 할 일의 sort 사이. 맨 앞 · 맨 뒤 · 빈 칸도
export function sortBetween(a, b, base = Date.now()) {
  if (a == null && b == null) return base;
  if (a == null) return b - 1024;
  if (b == null) return a + 1024;
  return a === b ? a + 0.5 : (a + b) / 2;
}

export function subProgress(p) {
  const s = Array.isArray(p.subtasks) ? p.subtasks : [];
  return [s.filter((x) => x.d).length, s.length];
}

export function tagColor(name, tags = {}) {
  if (!name) return "gray";
  if (tags[name] && COLORS.includes(tags[name])) return tags[name];
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return COLORS[h % (COLORS.length - 1)]; // 회색은 고를 때만
}

// 칸 안 순서: sort 작은 것부터 (같으면 만든 순)
export const byOrder = (a, b) => (a.sort || 0) - (b.sort || 0) || (a.created_at || 0) - (b.created_at || 0);

// 날짜 글: 오늘 · 내일 · 어제 · 10월 22일
export function dayLabel(s, t = new Date()) {
  if (!s) return "";
  const today = ymdOf(t);
  if (s === today) return "오늘";
  if (s === ymdOf(plus(t, 1))) return "내일";
  if (s === ymdOf(plus(t, -1))) return "어제";
  const [y, m, d] = s.split("-").map(Number);
  return (y !== t.getFullYear() ? `${y}년 ` : "") + `${m}월 ${d}일`;
}
