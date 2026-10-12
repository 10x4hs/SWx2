// 논문 스프린트 공통: 자료 불러오기(정적 JSON) · 진도 계산 · 색 · 작은 글자 서식
import { api } from "../api.js";
import { esc, kstDay } from "../util.js";

let indexP = null;
const contentP = new Map();

export function loadIndex(force = false) {
  if (!indexP || force) indexP = fetch("/papers/index.json", { cache: "no-cache" }).then((r) => { if (!r.ok) throw new Error("목록을 못 불러왔어요."); return r.json(); }).catch((e) => { indexP = null; throw e; });
  return indexP;
}
// 자료가 아직 없으면 null (에이전트가 만드는 중일 수 있어요)
export function loadContent(id) {
  if (!contentP.has(id)) contentP.set(id, fetch(`/papers/content/${id}.json`, { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).catch(() => { contentP.delete(id); return null; }));
  return contentP.get(id);
}

const deepP = new Map();
export function loadDeep(id) {
  if (!deepP.has(id)) deepP.set(id, fetch(`/papers/content/${id}.deep.json`, { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).catch(() => { deepP.delete(id); return null; }));
  return deepP.get(id);
}

// 진도는 여러 화면이 같이 써요 — 하나 바꾸면 다 다시 그려요
let progress = null;
const subs = new Set();
export const onProgress = (fn) => { subs.add(fn); if (progress) fn(progress); return () => subs.delete(fn); };
const publish = (p) => { progress = p; subs.forEach((fn) => fn(p)); return p; };
export const getProgress = () => progress;
export const refreshProgress = () => api.papersProgress().then(publish);
export const setCheck = (paper, step, done) => api.paperCheck(paper, step, done).then(publish);
export const sendQuiz = (paper, correct) => api.paperQuiz(paper, correct).then((r) => { publish(r); return r; });

export const STEP_KEYS = ["read", "quiz", "explain"];
export const kstToday = kstDay;
export const dayDiff = (a, b) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 864e5);

export const stageOf = (idx, n) => idx.stages.find((s) => s.n === n) || idx.stages[0];
export const stageVar = (color) => (color === "sand" ? "var(--t-sand)" : `var(--c-${color})`);
export const paperMeta = (idx, id) => idx.papers.find((p) => p.id === id);
export const dayOfPaper = (idx, id) => idx.days.find((d) => d.papers.includes(id));

export const stepsDone = (m, id) => STEP_KEYS.filter((k) => m?.checks?.[id]?.[k]).length;
export const paperDone = (m, id) => stepsDone(m, id) === 3;
export function memberStats(idx, m, today) {
  const total = idx.papers.length * 3, done = idx.papers.reduce((n, p) => n + stepsDone(m, p.id), 0);
  const dueDays = idx.days.filter((d) => d.day < today); // 오늘 것은 아직 밀린 게 아니에요
  const dueIds = dueDays.flatMap((d) => d.papers);
  const due = dueIds.length * 3, dueDone = dueIds.reduce((n, id) => n + stepsDone(m, id), 0);
  const todayRow = idx.days.find((d) => d.day === today);
  const todayDone = todayRow ? todayRow.papers.filter((id) => paperDone(m, id)).length : 0;
  return { total, done, pct: total ? done / total : 0, due, dueDone, behind: Math.max(0, due - dueDone), papersDone: idx.papers.filter((p) => paperDone(m, p.id)).length, todayDone, todayTotal: todayRow?.papers.length || 0 };
}

// 본문 글자: **굵게** 만 살려요 (자료 JSON 규칙)
export const rich = (s) => esc(s || "").replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
export const paras = (s) => String(s || "").split(/\n{2,}/).map((p) => `<p>${rich(p).replace(/\n/g, "<br>")}</p>`).join("");

// 직접 그린 설명 그림(SVG)을 안전하게 끼워 넣어요 — 스크립트·이벤트·외부 참조는 떼요
export async function loadDiagram(id, src) {
  try {
    const r = await fetch(`/papers/fig/${id}/${src}`, { cache: "no-cache" });
    if (!r.ok) return null;
    const doc = new DOMParser().parseFromString(await r.text(), "image/svg+xml");
    const svg = doc.documentElement;
    if (!svg || svg.nodeName.toLowerCase() !== "svg" || doc.querySelector("parsererror")) return null;
    svg.querySelectorAll("script, foreignObject, image, use[href^='http'], a").forEach((n) => n.remove());
    svg.querySelectorAll("*").forEach((n) => [...n.attributes].forEach((a) => { if (/^on/i.test(a.name) || (/href$/i.test(a.name) && !a.value.startsWith("#"))) n.removeAttribute(a.name); }));
    svg.removeAttribute("width"); svg.removeAttribute("height");
    svg.setAttribute("class", "pp-dg"); svg.setAttribute("role", "img");
    return svg.outerHTML;
  } catch { return null; }
}
