// Brain 그래프 데이터 — 노트(부모-자식) + 공부 화면을 큰 개념 5개 아래 한 나무로 묶고, 지금 들어와 있는 층만 그려요.
//   buildBrain({ notes, edges, subjects }) → tree     levelOf(tree, focus) → { data, crumbs, items }
//   notes: GET /graph 의 nodes (id, title, parent_id) · edges: { src_id, dst_title } · subjects: place=study 페이지
//   rels: GET /graph 의 rels (note_rel 의 auto · confirmed — src/onto.js). 링크가 없는 쌍도 관계가 있으면 선이 돼요.
//         두 점이 바로 그 노트일 때만 선에 관계를 달아요 (link.rel · status · origin · from = 화살표가 시작하는 점)
// 한 층의 선 = 그 층 두 점의 '하위 전체' 사이에 있는 링크 수 (w). 그래서 맨 위에선 개념끼리의 연결만 굵게 보여요.

import { similarPairs } from "./concepts.js";

export const CONCEPTS = [
  { title: "Business & Finance", color: "#f2b84b" },
  { title: "AI & Dev", color: "#60a5fa" },
  { title: "Records", color: "#f472b6" },
  { title: "Language", color: "#34d399" },
  { title: "Life", color: "#a78bfa" },
];
const UNSORTED = "Unsorted";
// 공부 화면은 노트가 아니라 원래 화면으로 열리는 점이에요
const STUDY = [
  { id: "s:books", title: "AI Books", concept: "AI & Dev", href: "#/books" },
  { id: "s:papers", title: "Paper Sprint", concept: "AI & Dev", href: "#/papers" },
  { id: "s:english", title: "English", concept: "Language", href: "#/english" },
];

const low = (s) => String(s || "").trim().toLowerCase();
export const pairKey = (a, b) => (a < b ? a + "|" + b : b + "|" + a);

export function buildBrain({ notes = [], edges = [], subjects = [], study = true, rels = [] }) {
  const N = new Map(); // id → { id, title, parent, kind, href? }
  const conceptId = new Map(); // 개념 제목(소문자) → id
  for (const c of CONCEPTS) {
    const real = notes.find((n) => !n.parent_id && low(n.title) === low(c.title));
    const id = real ? real.id : "c:" + c.title;
    conceptId.set(low(c.title), id);
    N.set(id, { id, title: c.title, parent: null, kind: "concept", concept: c.title, note: !!real });
  }
  let unsorted = false;
  for (const n of notes) {
    if (N.has(n.id)) continue;
    const parent = n.parent_id && notes.some((m) => m.id === n.parent_id) ? n.parent_id : "c:" + UNSORTED;
    if (parent === "c:" + UNSORTED) unsorted = true;
    N.set(n.id, { id: n.id, title: n.title, parent, kind: "note", note: true });
  }
  if (unsorted) N.set("c:" + UNSORTED, { id: "c:" + UNSORTED, title: UNSORTED, parent: null, kind: "concept", concept: UNSORTED });
  for (const s of study ? STUDY : []) N.set(s.id, { id: s.id, title: s.title, parent: conceptId.get(low(s.concept)), kind: "study", href: s.href });
  for (const p of subjects) N.set("s:p:" + p.id, { id: "s:p:" + p.id, title: p.title, parent: conceptId.get(low("Records")), kind: "study", href: "#/study/" + p.id });

  const kids = new Map();
  for (const n of N.values()) { const k = n.parent || "root"; if (!kids.has(k)) kids.set(k, []); kids.get(k).push(n.id); }
  // 개념 색은 나무를 타고 내려가요
  const conceptOf = (id) => { let n = N.get(id), hop = 0; while (n?.parent && hop++ < 40) n = N.get(n.parent); return n?.concept || UNSORTED; };
  for (const n of N.values()) n.concept = conceptOf(n.id);
  const size = new Map();
  const count = (id) => { if (size.has(id)) return size.get(id); size.set(id, 0); const c = (kids.get(id) || []).reduce((a, k) => a + 1 + count(k), 0); size.set(id, c); return c; };
  for (const id of N.keys()) count(id);

  const byTitle = new Map(); for (const n of notes) if (!byTitle.has(low(n.title))) byTitle.set(low(n.title), n.id);
  const links = [];
  for (const e of edges) { const t = byTitle.get(low(e.dst_title)); if (t && t !== e.src_id && N.has(e.src_id)) links.push([e.src_id, t]); }
  const relOf = new Map(), seen = new Set(links.map(([a, b]) => pairKey(a, b)));
  for (const r of rels) {
    if (!N.has(r.src_id) || !N.has(r.dst_id) || r.src_id === r.dst_id) continue;
    const k = pairKey(r.src_id, r.dst_id);
    relOf.set(k, r);
    if (!seen.has(k)) { seen.add(k); links.push([r.src_id, r.dst_id]); }
  }
  return { N, kids, size, links, relOf };
}

export function levelOf(tree, focus) {
  const { N, kids, size, links } = tree;
  const at = focus && N.has(focus) ? focus : null;
  const ids = kids.get(at || "root") || [];
  const here = new Set(ids);
  // 점 하나를 이 층의 조상으로 올려요
  const up = (id) => { let cur = id, hop = 0; while (cur && !here.has(cur) && hop++ < 40) cur = N.get(cur)?.parent; return here.has(cur) ? cur : null; };
  const w = new Map();
  for (const [a, b] of links) {
    const x = up(a), y = up(b);
    if (!x || !y || x === y) continue;
    const k = x < y ? x + "|" + y : y + "|" + x;
    w.set(k, (w.get(k) || 0) + 1);
  }
  const color = new Map([...CONCEPTS.map((c) => [c.title, c.color]), [UNSORTED, "#9aa0a6"]]);
  const types = {}, nodes = [];
  for (const id of ids) {
    const n = N.get(id), sub = size.get(id) || 0;
    const type = at ? (n.kind === "study" ? "study" : sub ? "section" : "page") : n.concept;
    if (!types[type]) types[type] = at
      ? { label: { study: "Study", section: "Section", page: "Page" }[type], color: type === "page" ? "#9aa0a6" : type === "study" ? "#e5e7eb" : color.get(n.concept), tier: 1 }
      : { label: n.title, color: color.get(n.concept), tier: 0 };
    nodes.push({ id, title: n.title, type, size: Math.min(26, 5 + 3.2 * Math.sqrt(sub)), sub: sub ? `${sub} inside` : n.kind === "study" ? "opens study" : "", href: n.href, kids: sub, note: n.note });
  }
  nodes.sort((a, b) => b.kids - a.kids || a.title.localeCompare(b.title));
  const crumbs = []; { let cur = at, hop = 0; while (cur && hop++ < 40) { const n = N.get(cur); crumbs.unshift({ id: cur, title: n.title, note: n.note }); cur = n.parent; } }
  // 하위 층: 링크가 없는 형제끼리도 제목이 비슷하면 약한 선으로 (따로 노는 점이 되지 않게)
  if (at && nodes.length > 1) for (const { a, b } of similarPairs(nodes)) { const k = a < b ? a + "|" + b : b + "|" + a; if (!w.has(k)) w.set(k, 0.5); }
  const data = { nodes, links: [...w].map(([k, c]) => {
    const [s, t] = k.split("|"), r = tree.relOf?.get(k);
    return r ? { s, t, w: c, rel: r.rel, status: r.status, origin: r.origin, from: r.src_id, relId: r.id || null } : { s, t, w: c };
  }) };
  return { data, types, crumbs, items: nodes, here: at ? N.get(at) : null };
}
