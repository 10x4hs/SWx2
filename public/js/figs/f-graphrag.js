// 그림: GraphRAG — 색인 4단계 · Global search(map-reduce) · Local search (Vector & Graph 08 — 카드 3 · 6 · 7 · 8 · 9)
//   opts.mode = "index"(기본, 카드 3 · 6 · 7): ① 나누기(노트 → TextUnit) ② 뽑기(조각마다 LLM → 엔티티 · 관계, 같은 이름은 합침)
//               ③ 군집(Leiden 층 0 큰 주제 → 층 1 작은 주제) ④ 요약(커뮤니티 보고서, 아래 층 → 위 층)
//   opts.mode = "global"(카드 8): 층 고르기 → map(보고서 12개를 4묶음, 묶음마다 부분 답 + 점수) → 거르기(점수 0 버림) → reduce(높은 순으로 창이 찰 때까지 → 최종 답)
//   opts.mode = "local"(카드 9): 질문 → 비슷한 엔티티(벡터, 입구) → 이웃 · 관계(그래프) → 근거 TextUnit · 커뮤니티 요약 → 예산 안에서 섞어 답
//   예문 · 이름(서윤 · 민재 · 봄 프로젝트 · 고객 A · 채용 · 3월 킥오프 · 데이터 이전)은 카드에서 왔어요. 이름 없는 작은 점은 '다른 엔티티', 부분 답 점수는 그림용 값이에요.
import { svg, g, text, line, circle, rect, path, arrowHead, readout, anim, set, C, SERIES, SERIES_SOFT } from "./kit.js";

const sleep = (ms) => anim(ms, () => {});
// ---------- 데이터 (색인 · local 이 같이 써요) ----------
// 노드: 이름(없으면 '다른 엔티티') · 종류 · 커뮤니티(층 0) · 작은 커뮤니티(층 1)
const NODES = {
  p: { name: "봄 프로젝트", type: "PROJECT", c0: 0, c1: 0 }, s: { name: "서윤", type: "PERSON", c0: 0, c1: 0 }, k: { name: "3월 킥오프", type: "MEETING", c0: 0, c1: 0 },
  m: { name: "민재", type: "PERSON", c0: 0, c1: 1 }, b1: { c0: 0, c1: 1 },
  c: { name: "고객 A", type: "CUSTOMER", c0: 1, c1: 2 }, c3: { c0: 1, c1: 2 }, c1: { c0: 1, c1: 3 }, c2: { c0: 1, c1: 3 },
  h1: { c0: 2, c1: 4 }, h2: { c0: 2, c1: 4 }, h3: { c0: 2, c1: 4 }, h4: { c0: 2, c1: 5 },
};
// 관계: [a, b, 설명(있으면), 나온 조각]
const RELS = [["s", "p", "이끔", 0], ["s", "k", "", 0], ["c", "p", "요구로 일정 변경", 1], ["m", "p", "데이터 이전 담당", 2], ["k", "p", "3월 킥오프", 3], ["m", "b1", "", 2], ["p", "b1", "", 3],
  ["c", "c3", "", 5], ["c", "c1", "", 5], ["c1", "c2", "", 5], ["c2", "c3", "", 5], ["h1", "h2", "", 4], ["h2", "h3", "", 4], ["h1", "h3", "", 4], ["h1", "h4", "", 4], ["h4", "k", "", 4]];
// TextUnit (조각) — 앞의 넷은 카드의 문장, 다섯째 · 여섯째는 '채용' · '고객 A 대응' 노트의 조각
const UNITS = ["서윤이 '봄 프로젝트' 킥오프를 이끌었다.", "고객 A 요구로 봄 프로젝트 일정이 바뀌었다.", "민재가 봄 프로젝트의 데이터 이전을 맡았다.", "봄 프로젝트는 3월에 킥오프했다.", "(채용 노트의 한 조각)", "(고객 A 대응 노트의 한 조각)"];
const C0 = ["봄 프로젝트", "고객 A 대응", "채용"]; // 층 0 큰 주제 (카드 6 의 예)
const C1N = 6;
const unitNodes = (u) => [...new Set(RELS.filter((r) => r[3] === u).flatMap((r) => [r[0], r[1]]))];

// 판 배치 — 그래프 노드 자리는 넓은 판 기준, 좁은 판(폰)은 아래에서 옮겨요
const PW = { p: [400, 200], s: [330, 150], k: [322, 238], m: [478, 250], b1: [440, 312], c: [510, 120], c3: [568, 165], c1: [470, 58], c2: [560, 52], h1: [238, 306], h2: [282, 340], h3: [230, 348], h4: [288, 296] };
const PN = Object.fromEntries(Object.entries(PW).map(([k, [x, y]]) => [k, [Math.round((x - 210) * 0.92 + 16), y + 26]]));
const LAY = {
  wide: {
    W: 600, H: 380, P: PW, uw: 74, uh: 34, llm: [112, 170, 64, 40],
    unit: (i, local) => (local ? [16 + (i % 2) * 92, 84 + Math.floor(i / 2) * 46] : [16, 44 + i * 50]),
    lab: { p: [0, 22, "middle"], s: [0, -18, "middle"], k: [-14, 0, "end"], m: [14, 0, "start"], c: [-14, -2, "end"] },
    c0lab: [[300, 104, "start"], [598, 18, "end"], [318, 366, "start"]],
    q: [16, 10, 180, 56], qLines: ["봄 프로젝트에서 민재는", "무슨 일을 했어?"], bud: [16, 250, 180], ans: [16, 282, 180, 84],
    rep: (i) => ({ l1: [[16, 52 + i * 106], [16, 92 + i * 106]], l0: [90, 62 + i * 106, 106, 46] }),
  },
  narrow: {
    W: 380, H: 560, P: PN, uw: 108, uh: 34, llm: [150, 392, 80, 34],
    unit: (i) => [16 + (i % 3) * 120, 462 + Math.floor(i / 3) * 48],
    lab: { p: [0, 22, "middle"], s: [0, -18, "middle"], k: [-14, 0, "end"], m: [14, 0, "start"], c: [-14, -2, "end"] },
    c0lab: [[110, 128, "start"], [366, 58, "end"], [16, 290, "start"]],
    q: [16, 8, 348, 34], qLines: ["봄 프로젝트에서 민재는 무슨 일을 했어?"], bud: [16, 424, 348], ans: null,
    rep: (i) => ({ l1: [[16 + i * 120, 456], [16 + i * 120, 494]], l0: [56 + i * 120, 462, 72, 50] }),
  },
};

const STEPS = {
  index: [
    { cap: "① 나누기: 노트를 TextUnit 이라는 조각으로 나눠요. 나중에 답의 근거로 거슬러 올라갈 때도 이 조각을 써요.", s: 1 },
    { cap: "② 뽑기: 조각마다 LLM 을 불러 엔티티(이름 · 종류)와 관계를 뽑아요. 같은 이름은 한 노드로 합쳐요. 조각 수만큼 LLM 비용이 나요.", s: 2 },
    { cap: "③ 군집: Leiden 으로 안쪽 연결은 많고 바깥 연결은 적은 무리를 찾아요. 층 0 = 큰 주제(채용 · 봄 프로젝트 · 고객 A 대응).", s: 3 },
    { cap: "같은 일을 무리 안에서 되풀이하면 층 1 = 더 작은 주제(점선)가 나와요. 큰 주제 → 작은 주제 계층이에요.", s: 4 },
    { cap: "④ 요약: 커뮤니티마다 LLM 이 보고서를 써요. 아래 층(작은 주제)부터 쓰고, 그 요약을 모아 위 층 보고서를 써요(아래 → 위).", s: 5 },
  ],
  global: [
    { cap: "\"올해 주요 주제는?\" 은 전체를 훑어야 하는 질문이에요. 먼저 커뮤니티 층(C0~C3)을 골라요. 여기선 층 0 보고서 12개예요.", s: 1 },
    { cap: "map: 보고서를 4묶음으로 나눠, 묶음마다 LLM 에게 '부분 답 + 도움 점수(0~100)'를 받아요.", s: 2 },
    { cap: "거르기: 점수 0 인 부분 답은 버려요(빨간 줄).", s: 3 },
    { cap: "reduce: 남은 답을 점수 높은 순으로 컨텍스트 창이 찰 때까지 넣고, LLM 이 한 번 더 최종 답을 써요 → 주제 5개.", s: 4 },
  ],
  local: [
    { cap: "질문 \"봄 프로젝트에서 민재는 무슨 일을 했어?\" — 먼저 질문과 비슷한 엔티티를 벡터로 찾아요. 봄 프로젝트 · 민재가 입구예요(보라).", s: 1 },
    { cap: "넓히기: 입구에서 이어진 이웃 엔티티와 관계를 모아요(주황). 벡터는 입구 찾기, 그래프는 주변 넓히기를 맡아요.", s: 2 },
    { cap: "근거: 그 관계가 나온 원문 조각(TextUnit)과, 속한 커뮤니티 요약을 함께 가져와요(초록).", s: 3 },
    { cap: "답: 컨텍스트 예산 안에서 엔티티 · 관계 · 원문 · 요약을 섞어 넣고 답을 써요. 특정 대상에 대한 질문용이에요.", s: 4 },
  ],
};

export default {
  aspect: 380 / 600,
  aspectNarrow: 560 / 380,
  steps: (o) => (STEPS[o.mode] || STEPS.index).map((s) => s.cap),
  hint: "한 단계씩 넘겨 보세요",
  mount(stage, f) {
    const mode = STEPS[f.opts.mode] ? f.opts.mode : "index";
    return mode === "global" ? mountGlobal(stage, f) : mountGraph(stage, f, mode);
  },
};

// 볼록 껍질 (커뮤니티 덩어리 그리기용)
function hull(pts) {
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (const q of p.slice().reverse()) { while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
const blobD = (pts) => { const h = hull(pts); return h.length === 1 ? `M${h[0][0]},${h[0][1]} l0.1,0` : "M" + h.map((q) => q.join(",")).join(" L") + (h.length > 2 ? " Z" : ""); };

// 작은 문서 아이콘 (조각 · 보고서)
function docIcon(parent, x, y, w, h, label, o = {}) {
  const gg = g(parent);
  const r = rect(gg, x, y, w, h, { r: 5, fill: o.fill || C.bg, stroke: o.stroke || C.line, sw: 1.5 });
  const lines = [];
  const tx = text(gg, x + 9, y + h / 2, label, { size: 14, weight: 700, fill: o.color || C.ink });
  for (let i = 0; i < (o.lines ?? 2); i++) lines.push(line(gg, x + (o.lx ?? 36), y + 11 + i * 8, x + w - 8, y + 11 + i * 8, { color: C.line, width: 2 }));
  return { g: gg, r, t: tx, lines };
}

// ---------- 색인 · local (그래프가 있는 판) ----------
// 둥근 덩어리: 점마다 반지름 pad 의 원을 찍고 그 볼록 껍질 (= 껍질 + 둥근 여백)
function roundHull(pts, pad) {
  const ring = [];
  for (const [x, y] of pts) for (let a = 0; a < 20; a++) ring.push([x + pad * Math.cos((a / 20) * 2 * Math.PI), y + pad * Math.sin((a / 20) * 2 * Math.PI)]);
  const h = hull(ring);
  return "M" + h.map((q) => `${q[0].toFixed(1)},${q[1].toFixed(1)}`).join(" L") + " Z";
}
function mountGraph(stage, f, mode) {
  const L = f.narrow ? LAY.narrow : LAY.wide, P = L.P, local = mode === "local";
  const s = svg(stage, L.W, L.H, local ? "질문에서 엔티티를 찾고 이웃과 근거 조각으로 넓혀 답하는 local search" : "노트를 조각내 엔티티 그래프를 만들고 커뮤니티로 묶어 요약하는 GraphRAG 색인");
  // 층 0 덩어리 (옅은 색) · 층 1 점선 덩어리
  const blobG = g(s), subG = g(s);
  const members0 = (i) => Object.keys(NODES).filter((k) => NODES[k].c0 === i), members1 = (j) => Object.keys(NODES).filter((k) => NODES[k].c1 === j);
  const blobs = C0.map((_, i) => path(blobG, roundHull(members0(i).map((k) => P[k]), 26), { fill: SERIES_SOFT[i], stroke: "none", width: 0 }));
  const subs = Array.from({ length: C1N }, (_, j) => { const ks = members1(j), c0 = NODES[ks[0]].c0; return { e: path(subG, roundHull(ks.map((k) => P[k]), 14), { stroke: SERIES[c0], width: 1.6, dash: "5 4" }), c0 }; });
  const c0Lab = C0.map((t, i) => text(s, L.c0lab[i][0], L.c0lab[i][1], t, { size: 15, weight: 700, fill: SERIES[i], anchor: L.c0lab[i][2], cls: "fg-t halo" }));
  // 관계 · 노드
  const relG = g(s);
  const relE = RELS.map(([a, b]) => line(relG, ...P[a], ...P[b], { color: C.line, width: 1.6 }));
  const nodeG = g(s), nodeE = {};
  for (const [k, n] of Object.entries(NODES)) {
    const [x, y] = P[k], big = !!n.name;
    circle(nodeG, x, y, big ? 9 : 6, { fill: C.bg });
    const c = circle(nodeG, x, y, big ? 9 : 6, { fill: C.sub, stroke: C.bg, sw: 2 });
    let t = null;
    if (big) { const [dx, dy, an] = L.lab[k]; t = text(nodeG, x + dx, y + dy, n.name, { size: 15, weight: 700, anchor: an, cls: "fg-t halo" }); }
    nodeE[k] = { c, t, big };
  }
  // 조각(TextUnit)
  const unitG = g(s);
  const units = UNITS.map((_, i) => { const [x, y] = L.unit(i, local); return { ...docIcon(unitG, x, y, local && !f.narrow ? 84 : L.uw, L.uh, `T${i + 1}`, { lx: 38 }), x, y }; });
  // ① 전: 노트 한 장
  const note = g(s), [nx, ny] = L.unit(0), noteW = f.narrow ? 348 : L.uw, noteH = f.narrow ? 82 : 284;
  rect(note, nx, ny, noteW, noteH, { r: 6, fill: C.bg, stroke: C.ink, sw: 1.6 });
  text(note, nx + 10, ny + 18, "노트", { size: 15, weight: 700 });
  for (let i = 0; i < (f.narrow ? 3 : 12); i++) line(note, nx + 10, ny + 38 + i * 20, nx + noteW - 10, ny + 38 + i * 20, { color: C.line, width: 2 });
  // ① 의 큰 판: 노트 원문을 조각마다 점선으로 잘라요 (조각 이름 T1~T6 이 왼쪽 칸과 같아요)
  const page = g(s), [gx, gy, gw, gh] = f.narrow ? [16, 30, 348, 330] : [222, 30, 356, 320];
  rect(page, gx, gy, gw, gh, { r: 8, fill: C.bg, stroke: C.ink, sw: 1.6 });
  text(page, gx + 12, gy + 20, "노트 원문", { size: 15, weight: 700, fill: C.sub });
  const cuts = [];
  UNITS.forEach((u, i) => {
    const y = gy + 56 + i * 47;
    text(page, gx + 12, y, `T${i + 1}`, { size: 14, weight: 700, fill: C.d });
    text(page, gx + 44, y, u, { size: 14, weight: i < 4 ? 600 : 500, fill: i < 4 ? C.ink : C.mute });
    if (i < UNITS.length - 1) cuts.push(line(page, gx + 8, y + 23, gx + gw - 8, y + 23, { color: C.d, width: 1.4, dash: "5 4" }));
  });
  // LLM
  const [lx, ly, lw, lh] = L.llm, llm = g(s);
  rect(llm, lx, ly, lw, lh, { r: 8, fill: C.bg, stroke: C.ink, sw: 1.8 });
  text(llm, lx + lw / 2, ly + lh / 2, "LLM", { size: 15, weight: 700, anchor: "middle" });
  const callT = text(s, lx + lw / 2, ly + lh + 18, "", { size: 14, weight: 700, anchor: "middle", fill: C.d, cls: "fg-t halo" });
  // ④ 보고서 나무: 층 1 작은 보고서 둘 → 층 0 보고서 하나 (아래 → 위)
  const repG = g(s), rep1 = [], rep0 = [], repA = [];
  C0.forEach((t, i) => {
    const q = L.rep(i);
    q.l1.forEach(([x, y]) => rep1.push(docIcon(repG, x, y, 30, 26, "", { lines: 2, lx: 6, stroke: SERIES[i] })));
    const [x0, y0, w0, h0] = q.l0;
    q.l1.forEach(([x, y]) => { const a = line(repG, x + 32, y + 13, x0 - 3, y0 + h0 / 2, { color: SERIES[i], width: 1.6 }); a.setAttribute("marker-end", arrowHead(s, SERIES[i])); repA.push(a); });
    const d = g(repG); rect(d, x0, y0, w0, h0, { r: 6, fill: SERIES_SOFT[i], stroke: SERIES[i], sw: 1.6 });
    text(d, x0 + 8, y0 + 15, f.narrow ? (i === 1 ? "고객 A" : t) : t, { size: 14, weight: 700, fill: SERIES[i] });
    text(d, x0 + 8, y0 + 33, "보고서", { size: 14, weight: 600, fill: C.sub });
    rep0.push({ g: d });
  });
  // local: 질문 상자 · 예산 막대 · 답
  const qG = g(s), [qx, qy, qw, qh] = L.q;
  rect(qG, qx, qy, qw, qh, { r: 8, fill: C.dSoft, stroke: C.d, sw: 1.6 });
  L.qLines.forEach((t, i) => text(qG, qx + 10, qy + qh / 2 + (i - (L.qLines.length - 1) / 2) * 20, t, { size: 15, weight: 700 }));
  const budG = g(s), [bx, by, bw] = L.bud;
  text(budG, bx, by - 12, "컨텍스트 예산", { size: 14, weight: 700, fill: C.sub });
  rect(budG, bx, by, bw, 16, { r: 4, fill: C.soft, stroke: C.line, sw: 1 });
  const PARTS = [0.16, 0.22, 0.34, 0.18]; // 엔티티 · 관계 · 원문 · 요약 (그림용 몫)
  const budSeg = [C.d, C.b, C.c, SERIES[0]].map((col) => rect(budG, bx, by, 0, 16, { r: 2, fill: col }));
  const ansG = g(s);
  if (L.ans) { const [ax, ay, aw, ah] = L.ans; rect(ansG, ax, ay, aw, ah, { r: 8, fill: C.bg, stroke: C.ink, sw: 1.6 }); text(ansG, ax + 10, ay + 18, "답", { size: 14, weight: 700, fill: C.sub }); ["민재는 봄 프로젝트의", "데이터 이전을 맡았어요.", "근거: T3"].forEach((t, i) => text(ansG, ax + 10, ay + 40 + i * 19, t, { size: 14, weight: i < 2 ? 700 : 600, fill: i < 2 ? C.ink : C.c })); }
  const entryG = g(s), flyG = g(s);
  const ro = readout(f.controls());

  const ENTRY = ["p", "m"];
  const NB = (() => { const nb = new Set(), rels = []; RELS.forEach((r, i) => { if (ENTRY.includes(r[0]) || ENTRY.includes(r[1])) { rels.push(i); nb.add(r[0]); nb.add(r[1]); } }); return { nodes: [...nb].filter((k) => !ENTRY.includes(k)), rels }; })();
  const USED = [...new Set(NB.rels.map((i) => RELS[i][3]))];
  const relOf = (u) => RELS.map((r, i) => (r[3] === u ? i : -1)).filter((i) => i >= 0);
  function nodeStyle(k, how) {
    const e = nodeE[k], n = NODES[k];
    set(e.c, { fill: how === "dim" ? C.line : how === "c0" ? SERIES[n.c0] : how === "in" ? C.d : how === "nb" ? C.b : C.sub, r: (e.big ? 9 : 6) + (how === "in" ? 2 : 0) });
    if (e.t) set(e.t, { fill: how === "dim" ? C.mute : C.ink });
  }
  function paint(si) {
    flyG.replaceChildren(); entryG.replaceChildren();
    const ix = !local;
    note.style.display = "none";
    page.style.display = ix && si === 0 ? "" : "none"; cuts.forEach((c) => (c.style.opacity = ""));
    unitG.style.display = ix && si >= 4 ? "none" : "";
    units.forEach((u) => { set(u.r, { stroke: C.line, fill: C.bg }); set(u.t, { fill: C.ink }); });
    llm.style.display = ix && si === 1 ? "" : "none";
    callT.textContent = ix && si === 1 ? `호출 ${UNITS.length}번` : "";
    relG.style.display = nodeG.style.display = local || si >= 1 ? "" : "none";
    const blobOn = local || si >= 2;
    blobs.forEach((b) => (b.style.display = blobOn ? "" : "none"));
    c0Lab.forEach((t) => (t.style.display = blobOn ? "" : "none"));
    subs.forEach((q) => (q.e.style.display = ix && si >= 3 ? "" : "none"));
    repG.style.display = ix && si >= 4 ? "" : "none";
    qG.style.display = local ? "" : "none"; budG.style.display = local && si >= 3 ? "" : "none"; ansG.style.display = local && si >= 3 ? "" : "none";
    for (const k of Object.keys(NODES)) nodeStyle(k, ix ? (si >= 2 ? "c0" : "plain") : "dim");
    relE.forEach((e) => set(e, { stroke: C.line, "stroke-width": 1.6 }));
    if (local) {
      blobs.forEach((b, i) => set(b, { fill: si >= 2 && i === 0 ? C.cSoft : SERIES_SOFT[i] }));
      ENTRY.forEach((k) => nodeStyle(k, "in"));
      if (si >= 1) { NB.nodes.forEach((k) => nodeStyle(k, "nb")); NB.rels.forEach((i) => set(relE[i], { stroke: C.b, "stroke-width": 2.6 })); }
      // 입구: 보라 고리 (질문과 벡터로 가장 비슷한 엔티티)
      for (const k of ENTRY) { const [x, y] = P[k]; circle(entryG, x, y, 16, { fill: "none", stroke: C.d, sw: 2.4 }); }
      units.forEach((u, i) => { const on = si >= 2 && USED.includes(i), hot = on && i === 2; set(u.r, { stroke: on ? C.c : C.line, fill: hot ? C.cSoft : C.bg, "stroke-width": hot ? 2.4 : 1.5 }); set(u.t, { fill: on ? C.c : si >= 2 ? C.mute : C.ink }); });
      let acc = 0; budSeg.forEach((r, i) => { set(r, { x: bx + acc * bw, width: si >= 3 ? PARTS[i] * bw : 0 }); acc += PARTS[i]; });
    }
    ro.set(readHtml(si));
  }
  function readHtml(si) {
    if (local) {
      if (si === 0) return `<div>질문을 벡터로 바꿔 엔티티 설명과 비교 → <span class="d">봄 프로젝트</span> · <span class="d">민재</span> (입구)</div>`;
      if (si === 1) return `<div>입구의 이웃 ${NB.nodes.length}개와 관계 ${NB.rels.length}개 — 예: (민재)-[데이터 이전 담당]->(봄 프로젝트), (고객 A)-[요구로 일정 변경]->(봄 프로젝트)</div>`;
      if (si === 2) return `<div>근거 조각: <b class="c">T3</b> "${UNITS[2]}" · ${USED.filter((u) => u !== 2).map((u) => `T${u + 1}`).join(" · ")}</div><div>커뮤니티 요약 '봄 프로젝트': "서윤 리드, 3월 킥오프, 고객 A 요구로 일정 변경, 민재가 데이터 이전 담당."</div>`;
      return `<div>예산 안에 섞어 넣기: <span class="d">엔티티</span> · <span class="b">관계</span> · <span class="c">원문 조각</span> · <span class="a">커뮤니티 요약</span> <span class="dim">(몫은 그림용)</span></div><div>답: <b>민재는 봄 프로젝트의 데이터 이전을 맡았어요.</b> <span class="dim">(근거 T3)</span></div>`;
    }
    const pIn = UNITS.filter((_, u) => unitNodes(u).includes("p")).length;
    if (si === 0) return `<div>노트 1개 → TextUnit ${UNITS.length}개 (T1~T${UNITS.length}) · 예: T1 "${UNITS[0]}"</div>`;
    if (si === 1) return `<div>T1 "${UNITS[0]}" → (서윤, PERSON) -[이끔]-> (봄 프로젝트, PROJECT)</div><div>엔티티 ${Object.keys(NODES).length}개 · 관계 ${RELS.length}개 · '봄 프로젝트'는 조각 ${pIn}개에 나와 한 노드로 합쳐요 · <span class="d">LLM 호출 ${UNITS.length}번</span></div>`;
    if (si === 2) return `<div>층 0 커뮤니티 ${C0.length}개: ${C0.map((t, i) => `<span style="color:${SERIES[i]};font-weight:700">${t}</span>`).join(" · ")}</div><div class="dim">무리 안 선 ${RELS.filter((r) => NODES[r[0]].c0 === NODES[r[1]].c0).length}개 · 무리 사이 선 ${RELS.filter((r) => NODES[r[0]].c0 !== NODES[r[1]].c0).length}개 — 안쪽은 촘촘, 바깥은 드문드문</div>`;
    if (si === 3) return `<div>층 0 큰 주제 ${C0.length}개 → 층 1 작은 주제 ${C1N}개 → 잎은 엔티티 <span class="dim">(카드 6 의 예: 노드 100개 → 층 0 4개 → 층 1 15개 → 층 2 40개)</span></div>`;
    return `<div>층 1 보고서 ${C1N}개를 먼저 쓰고 → 모아서 층 0 보고서 ${C0.length}개 · 보고서 = 제목 · 요약 · 주요 엔티티 · 관계 · 핵심 주장</div><div>예: '봄 프로젝트' 보고서 — "서윤 리드, 3월 킥오프, 고객 A 요구로 일정 변경, 민재가 데이터 이전 담당."</div>`;
  }
  const fade = (els, ms = 600) => { els.forEach((e) => (e.style.opacity = "0")); return anim(ms, (t) => els.forEach((e) => (e.style.opacity = String(t)))).then(() => els.forEach((e) => (e.style.opacity = ""))); };
  async function play(si) {
    if (local) {
      if (si === 1) { paint(0); ro.set(readHtml(1)); const dots = NB.rels.map((i) => { const r = RELS[i], from = ENTRY.includes(r[0]) ? r[0] : r[1], to = from === r[0] ? r[1] : r[0]; return { a: P[from], b: P[to], d: circle(flyG, ...P[from], 5, { fill: C.b }) }; }); await anim(650, (t) => dots.forEach((o) => set(o.d, { cx: o.a[0] + (o.b[0] - o.a[0]) * t, cy: o.a[1] + (o.b[1] - o.a[1]) * t }))); }
      if (si === 2) { paint(1); ro.set(readHtml(2)); const dots = NB.rels.map((i) => { const u = units[RELS[i][3]], a = RELS[i], mx = (P[a[0]][0] + P[a[1]][0]) / 2, my = (P[a[0]][1] + P[a[1]][1]) / 2; return { a: [mx, my], b: [u.x + 20, u.y + L.uh / 2], d: circle(flyG, mx, my, 5, { fill: C.c }) }; }); await anim(700, (t) => dots.forEach((o) => set(o.d, { cx: o.a[0] + (o.b[0] - o.a[0]) * t, cy: o.a[1] + (o.b[1] - o.a[1]) * t }))); }
      if (si === 3) { paint(2); ro.set(readHtml(3)); budG.style.display = ""; await anim(900, (t) => { let acc = 0; budSeg.forEach((r, i) => { const w = Math.max(0, Math.min(PARTS[i], t * 0.9 - acc)); set(r, { x: bx + acc * bw, width: w * bw }); acc += PARTS[i]; }); }, (t) => t); ansG.style.display = ""; await fade([ansG], 400); }
      return;
    }
    if (si === 0) { // 노트 원문에 자르는 선이 생기고, 조각이 왼쪽 칸으로 나뉘어요
      paint(0); note.style.display = ""; unitG.style.display = "none";
      cuts.forEach((c) => (c.style.opacity = "0"));
      await sleep(300);
      for (const c of cuts) { await anim(140, (t) => (c.style.opacity = String(t))); }
      note.style.display = "none"; unitG.style.display = "";
      const [x0, y0] = L.unit(0);
      await anim(650, (t) => units.forEach((u) => u.g.setAttribute("transform", `translate(${(x0 - u.x) * (1 - t)},${(y0 - u.y) * (1 - t)})`)));
      units.forEach((u) => u.g.removeAttribute("transform"));
    }
    if (si === 1) { // 조각마다 LLM → 엔티티 · 관계가 그래프로 (같은 이름은 같은 자리 = 합쳐짐)
      paint(0); ro.set(readHtml(1)); page.style.display = "none"; llm.style.display = ""; relG.style.display = nodeG.style.display = "";
      Object.values(nodeE).forEach((e) => { e.c.style.opacity = "0"; if (e.t) e.t.style.opacity = "0"; });
      relE.forEach((e) => (e.style.opacity = "0"));
      const cx = lx + lw / 2, cy = ly + lh / 2;
      for (let u = 0; u < UNITS.length; u++) {
        const U = units[u], ux = U.x + L.uw / 2, uy = U.y + L.uh / 2; set(U.r, { stroke: C.d, fill: C.dSoft });
        callT.textContent = `호출 ${u + 1}번`;
        const chip = circle(flyG, ux, uy, 6, { fill: C.d });
        await anim(240, (t) => set(chip, { cx: ux + (cx - ux) * t, cy: uy + (cy - uy) * t }));
        chip.remove();
        const ns = unitNodes(u), dots = ns.map((k) => ({ k, d: circle(flyG, cx, cy, 5, { fill: C.sub }) }));
        await anim(300, (t) => dots.forEach((o) => set(o.d, { cx: cx + (P[o.k][0] - cx) * t, cy: cy + (P[o.k][1] - cy) * t })));
        dots.forEach((o) => o.d.remove());
        ns.forEach((k) => { nodeE[k].c.style.opacity = "1"; if (nodeE[k].t) nodeE[k].t.style.opacity = "1"; });
        relOf(u).forEach((i) => (relE[i].style.opacity = "1"));
        set(U.r, { stroke: C.line, fill: C.bg });
      }
      Object.values(nodeE).forEach((e) => { e.c.style.opacity = ""; if (e.t) e.t.style.opacity = ""; });
      relE.forEach((e) => (e.style.opacity = ""));
    }
    if (si === 2) { paint(1); ro.set(readHtml(2)); llm.style.display = "none"; callT.textContent = ""; blobs.forEach((b) => (b.style.display = "")); c0Lab.forEach((t) => (t.style.display = "")); for (const k of Object.keys(NODES)) nodeStyle(k, "c0"); await fade([...blobs, ...c0Lab], 700); }
    if (si === 3) { paint(2); ro.set(readHtml(3)); subs.forEach((q) => (q.e.style.display = "")); await fade(subs.map((q) => q.e)); }
    if (si === 4) { // 아래 층 보고서 먼저, 그다음 위 층
      paint(3); ro.set(readHtml(4)); unitG.style.display = "none"; repG.style.display = "";
      rep0.forEach((d) => (d.g.style.opacity = "0")); repA.forEach((a) => (a.style.opacity = "0"));
      await fade(rep1.map((d) => d.g), 450);
      await fade(repA, 350);
      await fade(rep0.map((d) => d.g), 450);
    }
  }
  return {
    async go(i, animate) {
      if (animate) await play(i);
      paint(i);
    },
  };
}

// ---------- Global search: map-reduce ----------
function mountGlobal(stage, f) {
  const nar = !!f.narrow, W = nar ? 380 : 600, H = nar ? 560 : 380;
  const s = svg(stage, W, H, "커뮤니티 보고서 12개를 4묶음으로 map 하고 점수로 걸러 reduce 하는 global search");
  const SC = [80, 55, 0, 30]; // 묶음별 도움 점수 (그림용 값)
  // 배치: 넓으면 왼쪽(map) → 오른쪽(reduce), 좁으면 위 → 아래
  const Lg = nar
    ? { q: [16, 8, 348, 34], pills: [56, 52], rep: (b, j) => [16 + j * 36, 98 + b * 60], rw: 30, rh: 40, gap: 6, llm: [146, 40], part: [210, 154, 40], win: [16, 348, 348, 108], slot: 26, slotH: 22, fin: [16, 468, 348, 80] }
    : { q: [16, 10, 340, 34], pills: [404, 27], rep: (b, j) => [16 + j * 44, 62 + b * 74], rw: 36, rh: 48, gap: 8, llm: [172, 40], part: [236, 116, 44], win: [372, 62, 212, 136], slot: 34, slotH: 28, fin: [372, 214, 212, 104] };
  const qg = g(s);
  rect(qg, ...Lg.q, { r: 8, fill: C.dSoft, stroke: C.d, sw: 1.6 });
  text(qg, Lg.q[0] + 10, Lg.q[1] + Lg.q[3] / 2, "\"올해 주요 주제는?\" — 전체를 훑는 질문", { size: 15, weight: 700 });
  // 층 고르기 (C0 ~ C3)
  const pillG = g(s), [plx, ply] = Lg.pills;
  text(pillG, plx - 8, ply, "층", { size: 14, weight: 700, fill: C.sub, anchor: "end" });
  const pills = ["C0", "C1", "C2", "C3"].map((t, i) => { const x = plx + i * 46; const r = rect(pillG, x, ply - 13, 40, 26, { r: 13, fill: C.bg, stroke: C.line, sw: 1.4 }); const tt = text(pillG, x + 20, ply, t, { size: 14, weight: 700, anchor: "middle", fill: C.sub }); return { r, tt }; });
  // 보고서 12개 (4묶음 × 3)
  const reps = [], bundles = [], rowY = (b) => Lg.rep(b, 0)[1] + Lg.rh / 2;
  for (let b = 0; b < 4; b++) {
    const [x0, y0] = Lg.rep(b, 0);
    const bg = rect(s, x0 - 6, y0 - 6, 3 * (Lg.rw + Lg.gap) + 4 - Lg.gap + 8, Lg.rh + 12, { r: 8, fill: "none", stroke: C.line, sw: 1.4 });
    bg.setAttribute("stroke-dasharray", "4 4");
    bundles.push(bg);
    for (let j = 0; j < 3; j++) { const [x, y] = Lg.rep(b, j); const d = docIcon(s, x, y, Lg.rw, Lg.rh, "", { lines: 3, lx: 7 }); d.lines.forEach((l, i) => set(l, { y1: y + 13 + i * 9, y2: y + 13 + i * 9 })); reps.push({ ...d, b }); }
  }
  // map: 묶음 → LLM → 부분 답 + 점수
  const mapG = g(s), arrows = [], llms = [], parts = [];
  const bundleEnd = Lg.rep(0, 2)[0] + Lg.rw + 8;
  for (let b = 0; b < 4; b++) {
    const y = rowY(b), [lx, lw] = Lg.llm, [px, pw, ph] = Lg.part;
    const a = line(mapG, bundleEnd + 2, y, lx - 4, y, { color: C.sub, width: 1.6 }); a.setAttribute("marker-end", arrowHead(s, C.sub)); arrows.push(a);
    const lg = g(mapG); rect(lg, lx, y - 14, lw, 28, { r: 6, fill: C.bg, stroke: C.ink, sw: 1.5 }); text(lg, lx + lw / 2, y, "LLM", { size: 14, weight: 700, anchor: "middle" }); llms.push(lg);
    const a2 = line(mapG, lx + lw + 2, y, px - 4, y, { color: C.sub, width: 1.6 }); a2.setAttribute("marker-end", arrowHead(s, C.sub)); arrows.push(a2);
    const pg = g(mapG);
    const pr = rect(pg, px, y - ph / 2, pw, ph, { r: 6, fill: C.bg, stroke: C.ink, sw: 1.5 });
    const pt = nar ? text(pg, px + 8, y, `부분 답 ${b + 1}`, { size: 14, weight: 700 }) : text(pg, px + 8, y - 8, `부분 답 ${b + 1}`, { size: 14, weight: 700 });
    const ps = nar ? text(pg, px + pw - 8, y, `점수 ${SC[b]}`, { size: 14, weight: 700, anchor: "end", fill: SC[b] ? C.a : C.no, cls: "fg-t tab" }) : text(pg, px + 8, y + 11, `점수 ${SC[b]}`, { size: 14, weight: 700, fill: SC[b] ? C.a : C.no, cls: "fg-t tab" });
    const strike = line(pg, px - 4, y, px + pw + 4, y, { color: C.no, width: 2.6 });
    parts.push({ g: pg, r: pr, t: pt, ps, strike, y, b });
  }
  // reduce: 컨텍스트 창 (높은 점수부터) → 최종 답
  const [wx, wy, ww, wh] = Lg.win, [fx, fy, fw, fh] = Lg.fin;
  const winG = g(s);
  rect(winG, wx, wy, ww, wh, { r: 8, fill: C.soft, stroke: C.line, sw: 1.4 });
  text(winG, wx + 10, wy + 16, "컨텍스트 창 (reduce)", { size: 14, weight: 700, fill: C.sub });
  const order = SC.map((v, b) => [v, b]).filter(([v]) => v > 0).sort((a, b) => b[0] - a[0]);
  const slotXY = (i) => [wx + 10, wy + 30 + i * Lg.slot];
  const slots = order.map(([v, b], i) => { const [x, y] = slotXY(i), sg = g(winG); rect(sg, x, y, ww - 20, Lg.slotH, { r: 5, fill: C.bg, stroke: C.a, sw: 1.4 }); text(sg, x + 8, y + Lg.slotH / 2, `부분 답 ${b + 1} · 점수 ${v}`, { size: 14, weight: 700 }); return sg; });
  const finG = g(s);
  rect(finG, fx, fy, fw, fh, { r: 8, fill: C.cSoft, stroke: C.c, sw: 1.8 });
  text(finG, fx + 10, fy + 18, "최종 답 · 주제 5개", { size: 15, weight: 700, fill: C.c });
  for (let i = 0; i < 5; i++) { const cw = (fw - 20 - 16) / 5, x = fx + 10 + i * (cw + 4), y = fy + 34, ch = fh - 44; rect(finG, x, y, cw, ch, { r: 4, fill: C.bg, stroke: C.c, sw: 1.2 }); text(finG, x + cw / 2, y + ch / 2, nar ? `주제 ${i + 1}` : String(i + 1), { size: nar ? 14 : 16, weight: 700, anchor: "middle", fill: C.c }); }
  const flyG = g(s);
  const ro = readout(f.controls());

  function paint(si) {
    flyG.replaceChildren();
    pills.forEach((p, i) => { set(p.r, { fill: i === 0 ? C.ink : C.bg, stroke: i === 0 ? C.ink : C.line }); set(p.tt, { fill: i === 0 ? C.bg : C.sub }); });
    mapG.style.display = si >= 1 ? "" : "none";
    bundles.forEach((b) => (b.style.display = si >= 1 ? "" : "none"));
    parts.forEach((p) => { const drop = si >= 2 && SC[p.b] === 0; p.strike.style.display = drop ? "" : "none"; set(p.r, { stroke: drop ? C.no : C.ink }); p.g.style.opacity = drop && si >= 3 ? "0.45" : ""; });
    winG.style.display = finG.style.display = si >= 3 ? "" : "none";
    slots.forEach((q) => (q.style.opacity = ""));
    reps.forEach((r) => set(r.r, { stroke: si === 0 ? C.ink : C.line }));
    llms.forEach((l) => (l.style.opacity = "")); arrows.forEach((a) => (a.style.opacity = ""));
    ro.set(readHtml(si));
  }
  function readHtml(si) {
    if (si === 0) return `<div>층 고르기: C0(큰 주제) ~ C3(작은 주제) 중 <b>층 0</b> → 보고서 12개 <span class="dim">(카드 8 의 예)</span></div><div class="dim">보고서는 색인할 때 미리 만들어 둔 재료예요.</div>`;
    if (si === 1) return `<div>map: 보고서 12개 → 4묶음 × 3개 → LLM 4번 → 부분 답 4개 + 도움 점수 (${SC.join(" · ")}) <span class="dim">(점수는 그림용)</span></div>`;
    if (si === 2) return `<div>거르기: 점수 0 인 부분 답 ${SC.filter((v) => !v).length}개를 버려요 → 남은 답 ${SC.filter((v) => v).length}개</div>`;
    return `<div>reduce: 점수 높은 순 ${order.map(([v, b]) => `부분 답 ${b + 1}(${v})`).join(" → ")} 을 창이 찰 때까지 넣고 → LLM 이 최종 답(주제 5개)</div><div class="dim">논문 평가에서 전역 방식은 naive RAG 보다 포괄성 72~83%, 다양성 62~82% 승률을 보였어요(LLM 심사자 기준).</div>`;
  }
  async function play(si) {
    if (si === 1) { // 묶음마다 점이 LLM 을 지나 부분 답으로
      paint(0); ro.set(readHtml(1)); bundles.forEach((b) => (b.style.display = "")); mapG.style.display = "";
      parts.forEach((p) => (p.g.style.opacity = "0"));
      const dots = [0, 1, 2, 3].map((b) => circle(flyG, bundleEnd, rowY(b), 6, { fill: C.d }));
      const [lx, lw] = Lg.llm, px = Lg.part[0];
      await anim(800, (t) => dots.forEach((d) => set(d, { cx: t < 0.5 ? bundleEnd + (lx + lw / 2 - bundleEnd) * t * 2 : lx + lw / 2 + (px + 10 - lx - lw / 2) * (t - 0.5) * 2 })));
      flyG.replaceChildren();
      await anim(400, (t) => parts.forEach((p) => (p.g.style.opacity = String(t))));
    }
    if (si === 3) { // 점수 높은 순으로 창에 들어가요
      paint(2); ro.set(readHtml(3)); winG.style.display = ""; slots.forEach((q) => (q.style.opacity = "0"));
      for (let i = 0; i < order.length; i++) {
        const p = parts[order[i][1]], [x1, y1] = slotXY(i), x0 = Lg.part[0], y0 = p.y - Lg.part[2] / 2;
        const ghost = rect(flyG, x0, y0, Lg.part[1], Lg.part[2], { r: 6, fill: C.aSoft, stroke: C.a, sw: 1.4 });
        await anim(380, (t) => set(ghost, { x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t, width: Lg.part[1] + (ww - 20 - Lg.part[1]) * t, height: Lg.part[2] + (Lg.slotH - Lg.part[2]) * t }));
        ghost.remove(); slots[i].style.opacity = "";
      }
      finG.style.display = ""; finG.style.opacity = "0"; await anim(450, (t) => (finG.style.opacity = String(t))); finG.style.opacity = "";
    }
  }
  return {
    async go(i, animate) {
      if (animate) await play(i);
      paint(i);
    },
  };
}
