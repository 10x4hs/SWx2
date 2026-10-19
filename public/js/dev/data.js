// 개발 흐름 마이크로디그리 — 내용 파일(public/dev/*.json) 읽기 · 하루 시간 · 오늘의 순서 · 진도와 현황 계산
import { api } from "../api.js";
import { esc } from "../util.js";

const cache = new Map();
export function getJSON(path) {
  if (!cache.has(path)) {
    const p = fetch(path).then((r) => { if (!r.ok) throw new Error(`${path} ${r.status}`); return r.json(); });
    p.catch(() => cache.delete(path));
    cache.set(path, p);
  }
  return cache.get(path);
}
// 과정 — SW 공간(#/sw) 안에서 같은 엔진으로 여러 과정을 열어요. 한 번에 하나만 열려 있어서 지금 과정을 여기 둬요.
//   key: 서버 경로(/api/<key>/…) · base: 화면 주소 · dir: 내용 파일 폴더
export const COURSES = {
  dev: { key: "dev", base: "#/sw/dev", dir: "/dev", name: "Dev Flow", brand: "개발 흐름", tutor: "개발 흐름 마이크로디그리", docs: true, role: "대표",
    scene: (no, size) => `두런 · ${no}장면 · 직원 ${size}명 · 가상 회사`, sceneOf: "두런의",
    quickWeek: ["이번 주 질문에 대표 입장에서 답해 줘", "두런 장면에서 내가 대표라면 무엇을 정해야 해?", "이번 주 카드로 퀴즈 3개 내 줘", "개발자가 회의에서 이 말을 하면 뭐라고 되물어야 해?"],
    quickCard: ["쉬운 비유로 다시 설명해 줘", "회사에서는 실제로 어떻게 해?", "대표로서 뭘 결정해야 해?"], ph: "예: PRD랑 요구사항정의서 중 뭘 먼저 써요?" },
  vg: { key: "vg", base: "#/sw/vg", dir: "/vg", name: "Vector & Graph", brand: "Vector & Graph", tutor: "Vector & Graph 과정", docs: false, role: "엔지니어",
    scene: (no) => `기억 검색 팀 · ${no}장면 · 가상 이야기`, sceneOf: "기억 검색 팀의",
    quickWeek: ["이번 주 질문에 엔지니어 입장에서 답해 줘", "이번 장면에서 내가 엔지니어라면 무엇을 고를까?", "이번 주 카드로 퀴즈 3개 내 줘", "이 개념을 파이썬 10줄로 보여 줘"],
    quickCard: ["쉬운 비유로 다시 설명해 줘", "실제 서비스에서는 어떻게 써?", "숫자 예시로 계산해 줘"], ph: "예: HNSW 는 왜 빠른데 정확도가 조금 떨어져요?" },
};
export let C = COURSES.dev;
export function setCourse(k) { C = COURSES[k] || COURSES.dev; }
export const index = () => getJSON(`${C.dir}/index.json`);
export const moduleDoc = (id) => getJSON(`${C.dir}/${id}.json`);
export const docsDoc = () => getJSON(`${C.dir}/docs.json`);
export const cApi = {
  state: () => api.courseState(C.key), read: (...a) => api.courseRead(C.key, ...a), review: (r) => api.courseReview(C.key, r),
  day: (...a) => api.courseDay(C.key, ...a), done: (...a) => api.courseDone(C.key, ...a),
};
export function state() { return cApi.state().catch(() => ({ today: "", items: [], due: [], days: [], done: [] })); }

// 하루 시간 (이 기기에만 기억) — 하루 30 · 45 · 60분, 기본 45분. 경영 과정과 같이 해도 무리가 덜한 양이에요.
const KEY = "dv-minutes";
export const MINUTES = [30, 45, 60];
export function minutes() { try { const v = Number(localStorage.getItem(KEY)); return MINUTES.includes(v) ? v : 45; } catch { return 45; } }
export function setMinutes(v) { try { localStorage.setItem(KEY, String(v)); } catch {} }
export const cardsPerDay = (m) => ({ 30: 3, 45: 4, 60: 5 })[m] || 4;
export const reviewLimit = (m) => ({ 30: 8, 45: 12, 60: 16 })[m] || 12;
const SPLIT = { 30: [3, 5, 14, 6, 2], 45: [5, 8, 20, 10, 2], 60: [6, 10, 26, 15, 3] };
export const split = (m) => SPLIT[m] || SPLIT[45];

// 하루 순서 — 떠올리기 → 간격 복습 → 새 카드 → 사례 · 회의실(적용, 지난 모듈과 섞어서) → 내일 한 줄
export function steps(m) {
  return [
    { key: "recall", name: "떠올리기", why: "어제 배운 것을 빈 화면에 먼저 꺼내 봐요. 틀려도 괜찮아요.", src: "Roediger & Karpicke, 2006" },
    { key: "review", name: "복습", why: "간격이 된 카드가 돌아와요. 1 · 3 · 7 · 21 · 60일.", src: "Cepeda 외, 2006 · 2008" },
    { key: "learn", name: `새 카드 ${cardsPerDay(m)}장`, why: "한 장에 한 가지. 읽고, 회의에서 어떻게 들리는지 보고, 질문 하나에 답해요.", src: "Dunlosky 외, 2013" },
    { key: "apply", name: "사례 · 회의실", why: "실제 장애 보고서나 회의 장면으로 방금 배운 것을 써 봐요. 지난 주 내용도 섞여 나와요.", src: "Rohrer & Taylor, 2007" },
    { key: "plan", name: "내일 한 줄", why: "내일 무엇부터 할지 한 줄로 남겨요.", src: "실행 의도 · Gollwitzer" },
  ];
}

// 화면 곳곳에 붙는 "왜 이렇게 배우나" (홈의 학습 설계 칸)
export const WHY = [
  ["먼저 떠올리기", "읽기 전에 어제 것을 꺼내 보면, 다시 읽기만 할 때보다 일주일 뒤 더 많이 남아요.", "Roediger & Karpicke, 2006 · Dunlosky 외, 2013"],
  ["간격을 두고 복습", "몰아서 보기보다 1 · 3 · 7 · 21 · 60일로 나눠 보면 오래 기억해요. 잊을 즈음 다시 꺼내는 게 핵심이에요.", "Cepeda 외, 2006 · 2008"],
  ["섞어 풀기", "회의실 문제는 지난 주 내용과 섞여 나와요. 무엇을 쓸지 고르는 연습이 실제 회의와 같아요.", "Rohrer & Taylor, 2007"],
  ["예시 먼저, 그다음 내 것", "처음엔 두런의 완성된 문서를 읽고, 익숙해지면 내 서비스로 직접 써요. 초보에게 부담이 적어요.", "Sweller & Cooper, 1985"],
  ["글과 그림을 함께", "흐름은 멈춰 있는 2D 그림 하나와 짧은 글로 같이 보여 줘요. 장식 그림은 넣지 않아요.", "Mayer, 멀티미디어 학습"],
  ["이야기로 엮기", "모든 카드가 가상 회사 두런의 한 장면에 붙어 있어요. 맥락이 있는 기억은 꺼내기 쉬워요.", "정교화 · 맥락 단서 (Dunlosky 외, 2013)"],
];

// ---------- 진도 ----------
export const readSet = (st) => new Set((st.items || []).map((x) => x.module + "/" + x.card));
export const doneSet = (st) => new Set((st.done || []).map((x) => x.module + "/" + x.item));
export function nextCards(idx, st, n) {
  const read = readSet(st), out = [];
  for (const m of idx.modules) for (const c of m.cards) { if (!read.has(m.id + "/" + c.id)) out.push({ module: m, card: c }); if (out.length >= n) return out; }
  return out;
}
export function progressOf(m, st) {
  const read = readSet(st), done = doneSet(st), has = (s, id) => s.has(m.id + "/" + id);
  const cards = m.cards.filter((c) => has(read, c.id)).length, cases = m.cases.filter((k) => has(done, k.id)).length;
  const probs = m.problems.filter((p) => has(done, p.id)).length, lecs = m.lectures.filter((l) => has(done, l.id)).length;
  const total = m.cards.length + m.cases.length + m.problems.length;
  return { cards, cases, probs, lecs, nCards: m.cards.length, nCases: m.cases.length, nProbs: m.problems.length, nLecs: m.lectures.length, ratio: total ? (cards + cases + probs) / total : 0 };
}
// 지금 모듈 · 지금 날(1~5): 아직 안 읽은 첫 카드가 있는 곳
export function position(idx, st) {
  const nx = nextCards(idx, st, 1)[0];
  if (!nx) return { i: idx.modules.length - 1, module: idx.modules[idx.modules.length - 1], day: 5, done: true };
  return { i: idx.modules.indexOf(nx.module), module: nx.module, day: nx.card.day || 1, done: false };
}
// 3D 고리에 칠할 진도: 끝낸 모듈 수 + 지금 모듈의 비율 (6.4 = 6개 끝 + 7번 40%)
export const loopProgress = (idx, st) => idx.modules.reduce((n, m) => n + progressOf(m, st).ratio, 0);

const addDay = (d, n) => new Date(Date.parse(d + "T00:00:00Z") + n * 864e5).toISOString().slice(0, 10);
export { addDay };
export const kst = (ms) => new Date(ms + 9 * 3600e3).toISOString().slice(0, 10);
export const kday = (d) => { const [, m, dd] = d.split("-").map(Number); return `${m}월 ${dd}일`; };

export function metrics(idx, st, mins) {
  const today = st.today || kst(Date.now());
  const per = idx.modules.map((m) => progressOf(m, st));
  const sum = (k) => per.reduce((n, p) => n + p[k], 0);
  const tot = { cards: sum("nCards"), cases: sum("nCases"), probs: sum("nProbs") }, got = { cards: sum("cards"), cases: sum("cases"), probs: sum("probs") };
  const all = tot.cards + tot.cases + tot.probs, have = got.cards + got.cases + got.probs;
  const q = (st.items || []).filter((x) => x.total), pr = (st.done || []).filter((x) => x.kind === "problem" && x.total);
  const right = q.reduce((n, x) => n + x.correct, 0) + pr.reduce((n, x) => n + x.score, 0), asked = q.reduce((n, x) => n + x.total, 0) + pr.reduce((n, x) => n + x.total, 0);
  const fc = []; for (let i = 0; i < 7; i++) { const d = addDay(today, i); fc.push({ day: d, n: (st.items || []).filter((x) => x.stage < 6 && (i === 0 ? x.due_day <= d : x.due_day === d)).length }); }
  const left = tot.cards - got.cards, pace = cardsPerDay(mins) * 5 / 7, daysLeft = Math.ceil(left / pace);
  const byDay = new Map((st.days || []).map((d) => [d.day, d.minutes || 0]));
  let streak = 0; for (let i = byDay.get(today) ? 0 : 1; byDay.get(addDay(today, -i)) > 0; i++) streak++;
  return { today, per, tot, got, ratio: all ? have / all : 0, acc: asked ? right / asked : null, asked, fc, left, finish: left ? addDay(today, daysLeft) : today, streak };
}

// ---------- 작은 부품 ----------
export const md = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
export const srcList = (list) => (list || []).map((s) => s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a>${s.date ? ` · ${esc(s.date)}` : ""}` : `${esc(s.title)}${s.date ? ` · ${esc(s.date)}` : ""}`).join("<br>");
export function meter(cap) {
  let t = Date.now(), rest = 0;
  return () => { const ms = Math.min(cap * 60000, Date.now() - t) + rest; t = Date.now(); const n = Math.floor(ms / 60000); rest = ms - n * 60000; return n; };
}
const NAV = [["", "지도"], ["today", "오늘"], ["docs", "문서"], ["ask", "AI 질문"]];
// 책처럼 — 위 띠: SWX2 / 과정 / 지금 쪽(crumbs) + 오른쪽 메뉴. 아래 띠(nextBar): 지금 할 일 하나만 크게
export function topbar(active, extra = "", crumbs = []) {
  return `<header class="dv-top sw-ui"><nav class="dv-crumbs" aria-label="지금 위치"><a class="dv-brand dv-sw" href="#/sw">SWX2</a><span aria-hidden="true">/</span><a class="dv-brand" href="${C.base}">${esc(C.name)}</a>${crumbs.map((c) => `<span aria-hidden="true">/</span>${c.href ? `<a href="${c.href}">${esc(c.t)}</a>` : `<b aria-current="page">${esc(c.t)}</b>`}`).join("")}</nav>
    <nav class="dv-nav" aria-label="${esc(C.brand)} 메뉴">${NAV.filter(([k]) => k !== "docs" || C.docs).map(([k, l]) => `<a href="${C.base}${k ? "/" + k : ""}"${active === k ? ' aria-current="page"' : ""}>${l}</a>`).join("")}${extra}</nav></header>`;
}
// 아래 고정 띠: 다음 할 일 하나 (href 면 링크, id 면 버튼) · back = 왼쪽 작은 링크(이전 등)
export function nextBar({ href = "", id = "", label, sub = "", back = "" }) {
  const inner = `<span class="bk-go-t">${esc(label)}</span>${sub ? `<small class="bk-go-s">${esc(sub)}</small>` : ""}<i aria-hidden="true">→</i>`;
  return `<div class="bk-next sw-ui" role="region" aria-label="다음 할 일"><div class="bk-next-in">${back || "<span></span>"}${id ? `<button type="button" class="bk-go" id="${id}">${inner}</button>` : `<a class="bk-go" href="${href}">${inner}</a>`}</div></div>`;
}
// 한 모듈 안에서 지금 할 일 하나: 안 읽은 카드 → 그날 회의실 → 사례 → 다음 모듈
export function nextInModule(m, doc, read, done, base, nextM) {
  const has = (s, x) => s.has(m.id + "/" + x);
  const card = doc.cards.find((c) => !has(read, c.id));
  if (card) {
    const day = card.day || 1, prevDay = doc.problems.filter((p) => p.day < day && !has(done, p.id))[0];
    if (prevDay) return { href: `${base}/${m.id}/practice/${prevDay.day}`, label: `회의실 ${prevDay.day}일째 풀기`, sub: prevDay.title, kind: "practice" };
    return { href: `${base}/${m.id}/${card.id}`, label: `카드 읽기 · ${m.no}-${card.id.slice(1)}`, sub: card.title, kind: "card" };
  }
  const prob = doc.problems.find((p) => !has(done, p.id));
  if (prob) return { href: `${base}/${m.id}/practice/${prob.day}`, label: `회의실 ${prob.day}일째 풀기`, sub: prob.title, kind: "practice" };
  const kase = doc.cases.find((k) => !has(done, k.id));
  if (kase) return { href: `${base}/${m.id}/case/${kase.id}`, label: "사례 읽기", sub: kase.title, kind: "case" };
  return nextM ? { href: `${base}/${nextM.id}`, label: `다음 모듈 · ${nextM.no}`, sub: nextM.title, kind: "module" } : { href: base, label: "과정 지도로", sub: "모든 모듈을 끝냈어요", kind: "done" };
}
