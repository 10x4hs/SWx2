// Silicon Valley Mafia 내용 — /api/svm/data 를 한 번 받아 두고 화면이 쓰기 좋게 묶어요
//   읽는 시간(요약 글자 수) · 글마다 영상 · 관련 글 · 개념 밑줄(terms) · 지식그래프 점과 선
import { api } from "../api.js";
import { esc } from "../util.js";

let D = null, P = null;
export const data = () => D;
export function load() {
  if (D) return Promise.resolve(D);
  return (P ||= api.svmData().then((d) => (D = derive(d))).finally(() => { P = null; }));
}

const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const textOf = (e) => [e.core, ...(e.claims || []), e.sv?.text, ...(e.critiques || []).map((c) => c.text), ...(e.quotes || []).map((q) => q.ko)].filter(Boolean).join(" ");

function derive(d) {
  for (const k of ["essays", "concepts", "people", "edges", "videos", "more", "sections"]) if (!Array.isArray(d[k])) d[k] = [];
  const E = new Map(d.essays.map((e) => [e.id, e])), C = new Map(d.concepts.map((c) => [c.id, c])), PP = new Map(d.people.map((p) => [p.id, p])), V = new Map(d.videos.map((v) => [v.id, v]));
  for (const e of d.essays) {
    e.mins = Math.max(2, Math.round(textOf(e).length / 400)); // 한국어 1분 ≈ 400자
    e.vids = d.videos.filter((v) => (v.essays || []).includes(e.id));
  }
  // 영상이 직접 묶이지 않은 글: 개념 · 인물을 둘 이상 나누는 영상 (최대 2개)
  for (const e of d.essays) if (!e.vids.length) {
    const score = (v) => (v.concepts || []).filter((c) => e.concepts?.includes(c)).length + (v.people || []).filter((p) => p !== "yarvin" && (e.people?.includes(p) || e.author === p)).length;
    e.vids = d.videos.map((v) => [score(v), v]).filter(([s]) => s >= 2).sort((a, b) => b[0] - a[0]).slice(0, 2).map(([, v]) => v);
  }
  for (const c of d.concepts) c.essays = d.essays.filter((e) => e.concepts?.includes(c.id)).map((e) => e.id);
  // 관련 글: 개념을 많이 나누는 순 (최대 3)
  for (const e of d.essays) e.related = d.essays.filter((x) => x !== e).map((x) => [(x.concepts || []).filter((c) => e.concepts?.includes(c)).length, x]).filter(([n]) => n > 0).sort((a, b) => b[0] - a[0] || a[1].no - b[1].no).slice(0, 3).map(([, x]) => x.id);
  // 개념 밑줄: 긴 말부터 (영어는 낱말 단위, 한국어는 조사가 붙어도)
  const terms = [];
  for (const c of d.concepts) for (const t of new Set([...(c.terms || []), c.name].filter((x) => typeof x === "string" && x.trim().length > 1))) terms.push([t.trim(), c.id]);
  terms.sort((a, b) => b[0].length - a[0].length);
  const termRe = terms.length ? new RegExp(terms.map(([t]) => (/^[\x20-\x7e]+$/.test(t) ? `\\b${reEsc(t)}\\b` : reEsc(t))).join("|"), "gi") : null;
  const termOf = new Map(terms.map(([t, id]) => [t.toLowerCase(), id]));
  return { ...d, E, C, P: PP, V, termRe, termOf };
}

// 이름 · 짧은 이름
export const personName = (id) => { const p = D?.P.get(id); return p ? p.ko || p.name : id; };
export const sectionOf = (id) => D?.sections.find((s) => s.id === id) || null;
export const pad2 = (n) => String(n).padStart(2, "0");
export const ytThumb = (id) => `https://i.ytimg.com/vi/${encodeURIComponent(id)}/hqdefault.jpg`;
export const ytEmbed = (id, start = 0) => `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?autoplay=1&rel=0&playsinline=1${start > 0 ? "&start=" + Math.floor(start) : ""}`;

// 글 안의 개념 말에 점선 밑줄 (used = 이 화면에서 이미 밑줄 그은 개념 — 한 번씩만)
export function linkTerms(text, used = new Set()) {
  const s = String(text ?? "");
  if (!D?.termRe) return esc(s);
  let out = "", i = 0;
  for (const m of s.matchAll(D.termRe)) {
    const id = D.termOf.get(m[0].toLowerCase());
    if (!id || used.has(id)) continue;
    used.add(id);
    out += esc(s.slice(i, m.index)) + `<dfn class="sv-term" tabindex="0" data-c="${esc(id)}">${esc(m[0])}</dfn>`;
    i = m.index + m[0].length;
  }
  return out + esc(s.slice(i));
}

// 서재의 권: 그 권의 글 · 읽은 수 · 남은 분
export function volume(id) {
  const s = D.sections.find((x) => x.id === id);
  if (!s) return null;
  const list = D.essays.filter((e) => e.section === id);
  return { ...s, list, mins: list.reduce((n, e) => n + e.mins, 0) };
}
export const VOL_COLOR = { lime: "var(--sv-v-lime)", blue: "var(--sv-v-blue)", silver: "var(--sv-v-silver)", green: "var(--sv-v-green)" };
export const volColor = (sectionId) => VOL_COLOR[D?.sections.find((x) => x.id === sectionId)?.color] || "var(--sv-ink)";

// 찾아보기(색인) 매트릭스: 개념 × 장 · 인물 × 장 (책 뒤 색인을 한 장으로)
export function matrix() {
  const concepts = D.concepts.map((c) => ({ id: c.id, name: c.name, href: `#/svm/glossary/${c.id}`, cells: D.essays.map((e) => !!e.concepts?.includes(c.id)) }));
  const people = D.people.filter((p) => D.essays.some((e) => e.author === p.id || e.people?.includes(p.id))).filter((p) => p.id !== "yarvin")
    .map((p) => ({ id: p.id, name: p.ko || p.name, href: `#/svm/people/${p.id}`, cells: D.essays.map((e) => e.author === p.id || !!e.people?.includes(p.id)) }))
    .sort((a, b) => b.cells.filter(Boolean).length - a.cells.filter(Boolean).length);
  return { concepts, people };
}

// QUERY: 적은 말로 장 찾기 (제목 · 한국어 제목 · 한 줄 · 논지 · 개념 · 인물)
export function search(q) {
  q = String(q || "").trim().toLowerCase();
  if (!q) return [];
  const hay = (e) => [e.title, e.ko, e.sub, e.core, ...(e.claims || []), ...(e.concepts || []).map((c) => D.C.get(c)?.name), ...(e.people || []).map(personName), personName(e.author)].join(" ").toLowerCase();
  return D.essays.filter((e) => hay(e).includes(q));
}

// 인물 지도: 인물만 (뿌리 · 비판한 사람은 색으로) — 글 · 개념 점은 빼요 (2026-10-30 "그래프가 너무 보기 힘들고")
export const REL = { INFLUENCED: "영향", INVESTED: "투자", BACKED: "후원", CITED: "인용", PEER: "가까움", CRITIC: "비판", DEBATED: "논쟁" };
export function peopleGraph() {
  const critics = new Set(D.edges.filter((x) => x.rel === "CRITIC").map((x) => x.a));
  const nodes = D.people.map((p) => ({ id: p.id, title: p.ko || p.name, type: p.lineage === 1 ? "root" : critics.has(p.id) && p.lineage == null ? "critic" : "person", size: p.id === "yarvin" ? 9 : p.lineage === 1 || critics.has(p.id) ? 4 : 5.5 })); // 점이 15개뿐이라 화면에 맞추면 크게 확대돼요 — 작게
  const links = D.edges.map((x) => ({ s: x.a, t: x.b, kind: x.rel, from: x.a, weak: !!x.weak }));
  return { nodes, links };
}
