// Concepts — 노트를 내용으로 묶어서 중간 크기의 개념(8~20개)으로 만들어요. 항상 같은 입력이면 같은 결과 (무작위 없음).
//   clusterNotes(notes, edges, { min, max }) → { concepts: [{ id, title, members: [noteId], color }], of: Map(noteId → conceptId), links: [{ s, t, w }] }
//   notes: GET /graph 의 nodes (id, title, topic, tags, parent_id) · edges: { src_id, dst_title }
// 1) 씨앗: AI 정리가 붙인 topic → 없으면 부모의 topic → 태그 → 링크 이웃의 다수결
// 2) 남은 노트: 제목+태그 TF-IDF 벡터로 가장 가까운 개념에 · 그래도 없으면 링크 묶음(연결 요소)끼리 새 개념
// 3) 너무 작은 개념은 가장 비슷한 개념에 합치고, max 를 넘으면 가장 작은 것부터 합쳐요
// 4) 개념 사이 선 = 멤버 노트 사이 링크 수 + 비슷함(코사인)이 높으면 약한 선

export const CONCEPT_PALETTE = ["#a78bfa", "#60a5fa", "#34d399", "#f472b6", "#fbbf24", "#22d3ee", "#fb923c", "#a3e635", "#e879f9", "#f87171", "#2dd4bf", "#93c5fd", "#fcd34d", "#c4b5fd", "#86efac", "#fda4af", "#67e8f9", "#fdba74", "#bef264", "#d8b4fe"];
const STOP = new Set(["the", "and", "for", "with", "from", "into", "about", "note", "notes", "moc", "page", "ai", "정리", "노트", "그리고", "에서", "으로", "하는", "있는"]);
const low = (s) => String(s || "").trim().toLowerCase();
const tagsOf = (n) => String(n.tags || "").split(",").map(low).filter((t) => t && t !== "moc");
const isMoc = (n) => String(n.title || "").startsWith("MOC · ");

export function tokens(n) {
  const out = [];
  const text = low(String(n.title || "").replace(/^MOC · /, "")) + " " + tagsOf(n).join(" ");
  for (const w of text.split(/[^\p{L}\p{N}]+/u)) {
    if (w.length < 2 || STOP.has(w) || /^\d+$/.test(w)) continue;
    out.push(w);
    if (/[가-힣]/.test(w) && w.length > 2) for (let i = 0; i < w.length - 1; i++) out.push("·" + w.slice(i, i + 2)); // 한글은 두 글자씩도 (조사 붙은 말끼리 맞게)
  }
  for (const t of tagsOf(n)) out.push("#" + t, "#" + t); // 태그는 두 배로
  return out;
}

function vectors(notes) {
  const df = new Map(), tf = notes.map((n) => { const m = new Map(); for (const t of tokens(n)) m.set(t, (m.get(t) || 0) + 1); for (const t of m.keys()) df.set(t, (df.get(t) || 0) + 1); return m; });
  const N = notes.length || 1;
  return tf.map((m) => { const v = new Map(); let s = 0; for (const [t, c] of m) { if (df.get(t) < 2 && !t.startsWith("#")) continue; const w = c * Math.log(1 + N / df.get(t)); v.set(t, w); s += w * w; } s = Math.sqrt(s) || 1; for (const [t, w] of v) v.set(t, w / s); return v; });
}
const cos = (a, b) => { if (a.size > b.size) [a, b] = [b, a]; let s = 0; for (const [t, w] of a) { const x = b.get(t); if (x) s += w * x; } return s; };
const add = (acc, v, k = 1) => { for (const [t, w] of v) acc.set(t, (acc.get(t) || 0) + w * k); return acc; };
const norm = (v) => { let s = 0; for (const w of v.values()) s += w * w; s = Math.sqrt(s) || 1; const o = new Map(); for (const [t, w] of v) o.set(t, w / s); return o; };

export function clusterNotes(notes = [], edges = [], { min = 3, max = 18 } = {}) {
  notes = [...notes].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const idx = new Map(notes.map((n, i) => [n.id, i]));
  const byTitle = new Map(); notes.forEach((n) => { const k = low(n.title); if (!byTitle.has(k)) byTitle.set(k, n.id); });
  const nb = notes.map(() => []), pairs = [];
  for (const e of edges) { const a = idx.get(e.src_id), b = idx.get(byTitle.get(low(e.dst_title))); if (a == null || b == null || a === b) continue; nb[a].push(b); nb[b].push(a); pairs.push([a, b]); }
  notes.forEach((n, i) => { const p = idx.get(n.parent_id); if (p != null) { nb[i].push(p); nb[p].push(i); } });
  const vec = vectors(notes);

  // 1) 씨앗 라벨
  const label = notes.map((n) => (n.topic ? String(n.topic).trim() : isMoc(n) ? n.title.slice(6).trim() : null));
  for (let i = 0; i < notes.length; i++) if (!label[i]) { const p = idx.get(notes[i].parent_id); if (p != null && label[p]) label[i] = label[p]; }
  const tagCount = new Map(); notes.forEach((n) => tagsOf(n).forEach((t) => tagCount.set(t, (tagCount.get(t) || 0) + 1)));
  for (let i = 0; i < notes.length; i++) if (!label[i]) { const t = tagsOf(notes[i]).filter((t) => tagCount.get(t) >= 2).sort((a, b) => tagCount.get(b) - tagCount.get(a) || a.localeCompare(b))[0]; if (t) label[i] = "#" + t; }
  for (let pass = 0; pass < 4; pass++) for (let i = 0; i < notes.length; i++) if (!label[i]) { // 링크 이웃 다수결
    const c = new Map(); for (const j of nb[i]) if (label[j]) c.set(label[j], (c.get(label[j]) || 0) + 1);
    const best = [...c].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]; if (best) label[i] = best[0];
  }
  // 2) 남은 노트: 가장 비슷한 개념 (centroid 코사인 ≥ .12) · 아니면 연결 요소로 새 개념
  const centroid = (lab) => { const acc = new Map(); label.forEach((l, i) => l === lab && add(acc, vec[i])); return norm(acc); };
  let labs = [...new Set(label.filter(Boolean))], cents = new Map(labs.map((l) => [l, centroid(l)]));
  for (let i = 0; i < notes.length; i++) if (!label[i]) {
    let best = null, bs = 0.12; for (const l of labs) { const s = cos(vec[i], cents.get(l)); if (s > bs) { bs = s; best = l; } }
    if (best) label[i] = best;
  }
  { // 그래도 남으면: 그 노트에서 가장 특별한 단어(TF-IDF 최고, 둘 이상 노트에 나오는 것)를 개념으로 — 3) 에서 비슷한 것끼리 합쳐져요
    const pick = notes.map((_, i) => (label[i] ? null : topWord([vec[i]], true)));
    pick.forEach((w, i) => { if (w) label[i] = w; });
  }
  for (let i = 0; i < notes.length; i++) if (!label[i]) { // 연결 요소 → 대표 단어로 이름
    const comp = [], stack = [i]; label[i] = "\u0000"; while (stack.length) { const x = stack.pop(); comp.push(x); for (const y of nb[x]) if (!label[y]) { label[y] = "\u0000"; stack.push(y); } }
    const name = topWord(comp.map((x) => vec[x])) || "Misc";
    comp.forEach((x) => (label[x] = name));
  }
  // 3) 작은 개념 합치기 · 너무 많으면 합치기
  const groups = () => { const m = new Map(); label.forEach((l, i) => { if (!m.has(l)) m.set(l, []); m.get(l).push(i); }); return m; };
  const linkW = (A, B) => { const a = new Set(A); let w = 0; for (const j of B) for (const k of nb[j]) if (a.has(k)) w++; return w; };
  const mergeInto = (from, G) => {
    const cf = centroid(from); let best = null, bs = -1;
    for (const [l, m] of G) { if (l === from) continue; const s = cos(cf, centroid(l)) + 0.15 * linkW(G.get(from), m); if (s > bs || (s === bs && l < best)) { bs = s; best = l; } }
    if (best != null) label.forEach((l, i) => l === from && (label[i] = best));
  };
  for (let guard = 0; guard < 2000; guard++) {
    const G = groups(); if (G.size <= 1) break;
    const sorted = [...G].sort((a, b) => a[1].length - b[1].length || a[0].localeCompare(b[0]));
    const [small, mem] = sorted[0];
    if (mem.length >= min && G.size <= max) break;
    mergeInto(small, G);
  }

  // 결과
  const G = [...groups()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  const concepts = G.map(([l, mem], i) => ({ id: "concept:" + l, title: l.replace(/^#/, "").replace(/^./, (c) => c.toUpperCase()), members: mem.map((x) => notes[x].id), color: CONCEPT_PALETTE[i % CONCEPT_PALETTE.length], key: l }));
  const of = new Map(); concepts.forEach((c) => c.members.forEach((id) => of.set(id, c.id)));
  const W = new Map(), key = (a, b) => (a < b ? a + "|" + b : b + "|" + a);
  for (const [a, b] of pairs) { const x = of.get(notes[a].id), y = of.get(notes[b].id); if (x !== y) W.set(key(x, y), (W.get(key(x, y)) || 0) + 1); }
  const cv = concepts.map((c) => norm(c.members.reduce((acc, id) => add(acc, vec[idx.get(id)]), new Map())));
  for (let i = 0; i < concepts.length; i++) for (let j = i + 1; j < concepts.length; j++) {
    const s = cos(cv[i], cv[j]), k = key(concepts[i].id, concepts[j].id);
    if (s >= 0.18 && !W.has(k)) W.set(k, 0.5); // 내용이 비슷하면 약한 선
  }
  const links = [...W].map(([k, w]) => { const [s, t] = k.split("|"); return { s, t, w }; });
  return { concepts, of, links };
}

// 형제 점끼리 내용(제목 · 태그)이 비슷한 쌍: 각 점마다 가장 비슷한 이웃 하나(코사인 > 0) + 아주 비슷한 쌍(≥ thr) 모두
export function similarPairs(items, thr = 0.3) {
  const v = vectors(items), out = new Map();
  for (let i = 0; i < items.length; i++) {
    let best = -1, bs = 0;
    for (let j = 0; j < items.length; j++) {
      if (i === j) continue; const s = cos(v[i], v[j]);
      if (s > bs) { bs = s; best = j; }
      if (s >= thr && i < j) out.set(i + "|" + j, s);
    }
    if (best >= 0) out.set(Math.min(i, best) + "|" + Math.max(i, best), bs);
  }
  return [...out].map(([k, s]) => { const [a, b] = k.split("|").map(Number); return { a: items[a].id, b: items[b].id, s }; });
}

function topWord(vs, words = false) {
  const acc = new Map(); vs.forEach((v) => add(acc, v));
  const best = [...acc].filter(([t]) => !t.startsWith("·") && (!words || !t.startsWith("#"))).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  return best ? best[0] : null;
}
