// Study 탭마다 그래프 데이터 만들기 → { nodes, links, types, open(node) }
//   논문: 단계 → 논문 → 두 편 이상에 나오는 용어 (+ 관련 논문 선)
//   AI 공부책: 책 → 장 → 용어 (여러 장에 나오는 용어는 장들을 이어요)
//   영어: 묶음(문장 · 패턴 같은 이름이면 한 점) → 문장 · 패턴 · 거짓 친구 · 스몰토크 · 필러 + 내가 모은 표현
//   과목 페이지(place=study): graph.json 이 있으면 그대로, 없으면 index.html 의 제목 → h1·h2 → h3·h4 를 자동으로
import { api } from "../api.js";

const J = async (u) => { const r = await fetch(u, { cache: "no-cache" }); if (!r.ok) throw new Error(u + " " + r.status); return r.json(); };
const C = { violet: "#a78bfa", blue: "#60a5fa", teal: "#2dd4bf", green: "#4ade80", amber: "#fbbf24", rose: "#fb7185", sand: "#d6b48a", gray: "#94a3b8", sky: "#7dd3fc", lime: "#a3e635", orange: "#fb923c" };
const BOOK_C = { rose: C.rose, violet: C.violet, blue: C.blue, teal: C.teal, green: C.green, amber: C.amber, sand: C.sand };

function graph() {
  const nodes = new Map(), links = [], seen = new Set();
  const node = (id, o) => { if (!nodes.has(id)) nodes.set(id, { id, ...o }); return nodes.get(id); };
  const link = (s, t, kind) => { const k = s < t ? s + "|" + t : t + "|" + s; if (s === t || seen.has(k)) return; seen.add(k); links.push({ s, t, kind }); };
  return { node, link, done: () => ({ nodes: [...nodes.values()], links }) };
}

export async function papersGraph() {
  const idx = await J("/papers/index.json");
  const G = graph();
  const stage = new Map(idx.stages.map((s) => [s.n, s]));
  for (const s of idx.stages) G.node("st:" + s.n, { title: `${s.n}단계 · ${s.label}`, type: "stage", href: "#/papers/easy" });
  const details = await Promise.all(idx.papers.map(async (p) => {
    const [c, t] = await Promise.all([J(`/papers/content/${p.id}.json`).catch(() => ({})), J(`/papers/content/${p.id}.terms.json`).catch(() => ({ terms: [] }))]);
    return { p, related: c.related || [], terms: (t.terms || []).map((x) => x.term).filter(Boolean) };
  }));
  for (const { p } of details) { G.node("pp:" + p.id, { title: p.title, type: "paper", sub: `${p.year} · ${p.field}`, href: `#/papers/${p.id}/easy` }); if (stage.has(p.stage)) G.link("st:" + p.stage, "pp:" + p.id, "stage"); }
  for (const { p, related } of details) for (const r of related) if (idx.papers.some((x) => x.id === r)) G.link("pp:" + p.id, "pp:" + r, "related");
  const where = new Map();
  for (const { p, terms } of details) for (const t of new Set(terms.map((x) => x.trim()))) { const k = t.toLowerCase(); if (!where.has(k)) where.set(k, { t, ps: [] }); where.get(k).ps.push(p); }
  for (const [k, { t, ps }] of where) if (ps.length >= 2) { G.node("tm:" + k, { title: t, type: "term", sub: `논문 ${ps.length}편`, href: `#/papers/${ps[0].id}` }); ps.forEach((p) => G.link("pp:" + p.id, "tm:" + k, "term")); }
  return { ...G.done(), types: { stage: { label: "단계", color: C.amber, tier: 0 }, paper: { label: "논문", color: C.blue, tier: 1 }, term: { label: "겹치는 용어", color: C.gray, tier: 2 } } };
}

export async function booksGraph() {
  const idx = await J("/books/index.json");
  const books = await Promise.all(idx.books.map((b) => J(`/books/${b.id}.json`).catch(() => null)));
  const G = graph(), types = { word: { label: "용어", color: C.gray, tier: 3 }, chapter: { label: "장", color: C.sky, tier: 1 } };
  books.filter(Boolean).forEach((d) => {
    const bt = "book-" + d.id; types[bt] = { label: `${d.n}권 ${d.short || d.title}`, color: BOOK_C[d.color] || C.violet, tier: 0 };
    G.node("bk:" + d.id, { title: `${d.n}권 · ${d.title}`, type: bt, href: "#/books" });
    d.chapters.forEach((c, i) => {
      const cid = `ch:${d.id}/${c.id}`;
      G.node(cid, { title: `${i + 1}. ${c.title}`, type: "chapter", sub: d.title, href: `#/books/${d.id}/${c.id}` });
      G.link("bk:" + d.id, cid, "book");
      for (const w of c.words || []) { const k = "w:" + String(w.term).toLowerCase(); G.node(k, { title: w.term + (w.en && w.en !== w.term ? ` (${w.en})` : ""), type: "word", sub: w.easy, href: `#/books/${d.id}/${c.id}` }); G.link(cid, k, "word"); }
    });
  });
  return { ...G.done(), types: { ...Object.fromEntries(Object.entries(types).filter(([k]) => k.startsWith("book-"))), chapter: types.chapter, word: types.word } };
}

export async function englishGraph() {
  const [d, mine] = await Promise.all([J("/english/data.json"), api.phrases().catch(() => ({ phrases: [] }))]);
  const G = graph();
  const hub = (id, title, href) => G.node("hub:" + id, { title, type: "hub", href });
  const group = (name) => G.node("gr:" + name, { title: name, type: "group", href: "#/english/practice" });
  hub("sent", "문장 60", "#/english/practice"); hub("pat", "패턴", "#/english/practice"); hub("ff", "거짓 친구", "#/english/practice"); hub("talk", "스몰토크", "#/english/practice"); hub("fill", "버티는 말", "#/english/practice");
  for (const s of d.sentences || []) { group(s.group); G.link("hub:sent", "gr:" + s.group); G.node("s:" + s.n, { title: s.en, type: "sentence", sub: s.ko, href: "#/english/practice" }); G.link("gr:" + s.group, "s:" + s.n); }
  for (const p of d.patterns || []) { group(p.group); G.link("hub:pat", "gr:" + p.group); G.node("p:" + p.id, { title: p.pattern, type: "pattern", sub: `${p.meaning} · ${p.week}주차`, href: "#/english/practice" }); G.link("gr:" + p.group, "p:" + p.id); }
  for (const f of d.false_friends || []) { const gid = "ffg:" + f.group; G.node(gid, { title: f.group, type: "group", href: "#/english/practice" }); G.link("hub:ff", gid); G.node("ff:" + f.id, { title: f.expr, type: "falsefriend", sub: f.means, href: "#/english/practice" }); G.link(gid, "ff:" + f.id); }
  for (const t of d.smalltalk || []) { G.node("t:" + t.id, { title: t.title, type: "talk", href: "#/english/practice" }); G.link("hub:talk", "t:" + t.id); }
  for (const f of [...(d.fillers || []), ...(d.pressure || [])]) { G.node("f:" + f.id, { title: f.en, type: "filler", sub: f.when, href: "#/english/practice" }); G.link("hub:fill", "f:" + f.id); }
  const ph = mine.phrases || [];
  if (ph.length) { hub("mine", "내가 모은 표현", "#/english/phrases"); ph.forEach((x) => { G.node("m:" + x.id, { title: x.en || x.ko, type: "mine", sub: x.ko, href: "#/english/phrases" }); G.link("hub:mine", "m:" + x.id); }); }
  return { ...G.done(), types: { hub: { label: "큰 묶음", color: C.amber, tier: 0 }, group: { label: "주제", color: C.violet, tier: 1 }, sentence: { label: "문장", color: C.sky, tier: 2 }, pattern: { label: "패턴", color: C.green, tier: 2 }, falsefriend: { label: "거짓 친구", color: C.rose, tier: 2 }, talk: { label: "스몰토크", color: C.teal, tier: 2 }, filler: { label: "버티는 말", color: C.orange, tier: 2 }, mine: { label: "내 표현", color: C.lime, tier: 2 } } };
}

// 과목 페이지: graph.json (직접 짠 그래프) → 없으면 HTML 제목 구조
export async function pageGraph(id) {
  const { page } = await api.page(id);
  const G = graph(), href = `#/study/${id}`, files = page.files || {};
  G.node("root", { title: page.title, type: "root", href });
  if (files["graph.json"]) {
    try {
      const gj = JSON.parse(files["graph.json"]);
      for (const n of gj.nodes || []) if (n && n.id != null) G.node("n:" + n.id, { title: String(n.title || n.id), type: ["root", "section", "topic", "item"].includes(n.type) ? n.type : "topic", sub: n.sub, href });
      for (const l of gj.links || []) if (l && l.s != null && l.t != null) G.link(l.s === "root" ? "root" : "n:" + l.s, l.t === "root" ? "root" : "n:" + l.t);
    } catch {}
  } else {
    const doc = new DOMParser().parseFromString(files["index.html"] || "", "text/html");
    const stack = [{ lv: 0, id: "root" }];
    let i = 0;
    for (const el of doc.body?.querySelectorAll("h1, h2, h3, h4, [data-node]") || []) {
      const t = (el.getAttribute("data-node") || el.textContent || "").replace(/\s+/g, " ").trim(); if (!t || t.length > 80) continue;
      const lv = el.hasAttribute("data-node") ? 4 : +el.tagName[1];
      while (stack.length > 1 && stack[stack.length - 1].lv >= lv) stack.pop();
      const nid = "h" + i++;
      G.node(nid, { title: t, type: lv <= 2 ? "section" : lv === 3 ? "topic" : "item", href });
      G.link(stack[stack.length - 1].id, nid);
      stack.push({ lv, id: nid });
    }
  }
  return { ...G.done(), types: { root: { label: "과목", color: C.amber, tier: 0 }, section: { label: "큰 제목", color: C.violet, tier: 1 }, topic: { label: "소제목", color: C.sky, tier: 2 }, item: { label: "항목", color: C.gray, tier: 3 } },
    empty: "이 과목 페이지에서 제목(h1~h4)을 찾지 못했어요. 페이지에 제목을 넣거나 graph.json 을 넣으면 그래프가 생겨요." };
}
