// 그림: 커뮤니티 탐지 — 모듈러리티 Q · Louvain(옮기기 → 접기 → 다시) · Leiden(다듬기) (Vector & Graph 07 — 카드 9 ~ 11)
//   opts.mode = "q"(카드 9: 삼각형 두 개 + 다리) | "louvain"(기본, 카드 10: 노드 15개 · 묶음 3개) | "leiden"(카드 11: 끊어진 커뮤니티를 고쳐요)
//   Q 는 늘 그래프 전체로 정확히 다시 계산해요: Q = Σ(안쪽 엣지 / m) − Σ(묶음 차수 합 / 2m)². 옮기기 · 접기 · 다듬기도 코드가 실제로 돌려요.
import { svg, g, text, line, circle, rect, el, anim, readout, C, SERIES, SERIES_SOFT, fix, lerp } from "./kit.js";

// ---------- 계산 ----------
const mat = (n, E) => { const A = Array.from({ length: n }, () => new Array(n).fill(0)); for (const [a, b, w = 1] of E) { A[a][b] += w; A[b][a] += w; } return A; };
const degs = (A) => A.map((r) => r.reduce((s, x) => s + x, 0));
function modularity(A, comm) {
  const k = degs(A), m2 = k.reduce((s, x) => s + x, 0), ins = new Map(), tot = new Map();
  A.forEach((row, i) => { tot.set(comm[i], (tot.get(comm[i]) || 0) + k[i]); row.forEach((w, j) => { if (w && comm[i] === comm[j]) ins.set(comm[i], (ins.get(comm[i]) || 0) + w); }); });
  let q = 0; for (const c of tot.keys()) q += (ins.get(c) || 0) / m2 - (tot.get(c) / m2) ** 2;
  return q;
}
// 노드 i 를 빼고 각 커뮤니티에 넣었을 때의 이득 (Blondel 식) — empty: 혼자 서는 것(빈 커뮤니티)도 후보 (Leiden)
function bestMove(A, comm, i, empty = false) {
  const k = degs(A), m = k.reduce((s, x) => s + x, 0) / 2, tot = new Map(), kin = new Map();
  comm.forEach((c, j) => { if (j === i) return; tot.set(c, (tot.get(c) || 0) + k[j]); if (A[i][j]) kin.set(c, (kin.get(c) || 0) + A[i][j]); });
  const gain = (c) => (kin.get(c) || 0) / m - (tot.get(c) || 0) * k[i] / (2 * m * m);
  let best = comm[i], bg = gain(comm[i]);
  for (const c of kin.keys()) { const v = gain(c); if (v > bg + 1e-12) { bg = v; best = c; } }
  if (empty && 0 > bg + 1e-12) { best = "new"; bg = 0; }
  return { to: best, gain: bg - gain(comm[i]) };
}
// 지역 이동: Q 가 오르는 동안 노드를 차례로 옮겨요 → 옮긴 기록
function localMoves(A, comm, order, empty = false) {
  const log = []; let moved = true, guard = 0, fresh = 1000;
  while (moved && guard++ < 50) {
    moved = false;
    for (const i of order) { const b = bestMove(A, comm, i, empty); if (b.to !== comm[i] && b.gain > 1e-12) { const to = b.to === "new" ? fresh++ : b.to; log.push({ i, from: comm[i], to }); comm[i] = to; moved = true; } }
  }
  return log;
}
// 접기: 커뮤니티 하나 = 새 노드 하나 (안쪽 엣지는 자기 고리, 사이 엣지는 무게를 더해서)
function aggregate(A, comm) {
  const ids = [...new Set(comm)], at = new Map(ids.map((c, t) => [c, t]));
  const B = Array.from({ length: ids.length }, () => new Array(ids.length).fill(0));
  A.forEach((row, i) => row.forEach((w, j) => { B[at.get(comm[i])][at.get(comm[j])] += w; }));
  return { B, ids, of: comm.map((c) => at.get(c)) };
}
function isConnected(A, members) {
  if (members.length < 2) return true;
  const set = new Set(members), seen = new Set([members[0]]), st = [members[0]];
  while (st.length) { const u = st.pop(); A[u].forEach((w, v) => { if (w && set.has(v) && !seen.has(v)) { seen.add(v); st.push(v); } }); }
  return seen.size === set.size;
}
const groupsOf = (comm) => { const m = new Map(); comm.forEach((c, i) => { if (!m.has(c)) m.set(c, []); m.get(c).push(i); }); return m; };
// Leiden 다듬기 (θ → 0 인 탐욕 버전): 커뮤니티마다 노드를 혼자부터 시작해, 이어진 조각에만 붙여요 → 조각은 늘 이어져 있어요
function refine(A, comm) {
  const k = degs(A), m2 = k.reduce((s, x) => s + x, 0), ref = comm.map((_, i) => i);
  for (const [, S] of groupsOf(comm)) {
    const KS = S.reduce((s, v) => s + k[v], 0), inS = new Set(S);
    const eTo = (v, set) => [...set].reduce((s, u) => s + (u !== v ? A[v][u] : 0), 0);
    const well = (setNodes, kSet) => { const e = setNodes.reduce((s, v) => s + [...inS].filter((u) => !setNodes.includes(u)).reduce((t, u) => t + A[v][u], 0), 0); return e >= kSet * (KS - kSet) / m2; };
    for (const v of S) {
      if (S.some((u) => u !== v && ref[u] === ref[v])) continue; // 이미 다른 조각에 붙었어요
      if (!(eTo(v, inS) >= k[v] * (KS - k[v]) / m2)) continue;
      let best = ref[v], bg = 0;
      for (const [c, mem] of groupsOf(S.map((u) => ref[u]))) {
        const nodes = mem.map((t) => S[t]); if (nodes.includes(v)) continue;
        const kc = nodes.reduce((s, u) => s + k[u], 0); if (!well(nodes, kc)) continue;
        const e = nodes.reduce((s, u) => s + A[v][u], 0), dq = 2 * e / m2 - 2 * k[v] * kc / (m2 * m2);
        if (dq > bg + 1e-12) { bg = dq; best = c; }
      }
      ref[v] = best;
    }
  }
  return ref;
}

// ---------- 그래프 세 개 ----------
// 카드 9 의 예: 삼각형 두 개(엣지 3+3) + 다리 1개
const TRI = { n: 6, E: [[0, 1], [0, 2], [1, 2], [3, 4], [3, 5], [4, 5], [2, 3]], pos: [[56, 116], [56, 274], [146, 195], [232, 195], [322, 116], [322, 274]] };
// 카드 10: 집 모양 묶음 3개(지붕 삼각형 + 바닥 두 점) + 다리 3개
function houses() {
  const E = [], pos = [];
  const grp = (o) => [[o, o + 1], [o, o + 2], [o + 1, o + 2], [o + 3, o + 4], [o + 2, o + 3], [o + 1, o + 4]];
  E.push(...grp(0), ...grp(5), ...grp(10), [4, 8], [9, 13], [3, 14]);
  const centers = [[150, 122], [450, 122], [300, 286]], mid = [300, 186];
  const shape = (cx, cy, mirror) => { // 바닥(3, 4)이 가운데를 보게 돌려요
    const base = [[0, -74], [-46, -24], [46, -24], [46, 44], [-46, 44]].map(([x, y]) => [mirror ? -x : x, y]);
    const dx = mid[0] - cx, dy = mid[1] - cy, L = Math.hypot(dx, dy), s = -dx / L, c = dy / L; // (0,1) → 가운데 방향
    return base.map(([x, y]) => [cx + x * c - y * s, cy + x * s + y * c]);
  };
  let best = null;
  for (let mk = 0; mk < 8; mk++) {
    const P = centers.flatMap(([cx, cy], t) => shape(cx, cy, (mk >> t) & 1));
    const L = [[4, 8], [9, 13], [3, 14]].reduce((s, [a, b]) => s + Math.hypot(P[a][0] - P[b][0], P[a][1] - P[b][1]), 0);
    if (!best || L < best.L) best = { L, P };
  }
  pos.push(...best.P.map(([x, y]) => [Math.round(x), Math.round(y)]));
  return { n: 15, E, pos };
}
const HOUSE = houses();
// 카드 11: 다리 노드 0 이 왼쪽 삼각형(1-3) · 오른쪽 사각형(4-7)을 잇고, 위의 파란 사각형(8-11)과도 이어져요
const clique = (ids) => ids.flatMap((a, t) => ids.slice(t + 1).map((b) => [a, b]));
const LEI = {
  n: 12,
  E: [...clique([1, 2, 3]), ...clique([4, 5, 6, 7]), ...clique([8, 9, 10, 11]), [0, 1], [0, 2], [0, 4], [0, 5], [0, 6], [0, 8], [0, 9], [0, 10], [0, 11]],
  pos: [[300, 214], [204, 256], [196, 340], [104, 300], [392, 260], [414, 346], [480, 208], [506, 306], [222, 114], [262, 50], [338, 50], [378, 114]],
  L: [1, 2, 3], R: [4, 5, 6, 7], B: [8, 9, 10, 11],
};

// ---------- 단계 계산 ----------
function louvainPlan() {
  const A = mat(HOUSE.n, HOUSE.E), comm = [...Array(HOUSE.n).keys()];
  const q0 = modularity(A, comm), log1 = localMoves(A, comm, [...Array(HOUSE.n).keys()]);
  const p1 = comm.slice(), q1 = modularity(A, p1);
  const qs = []; { const c = [...Array(HOUSE.n).keys()]; for (const mv of log1) { c[mv.i] = mv.to; qs.push(modularity(A, c)); } }
  const ag = aggregate(A, p1), sc = ag.ids.map((_, t) => t), log2 = localMoves(ag.B, sc, ag.ids.map((_, t) => t));
  const p2 = p1.map((c) => ag.ids[sc[ag.ids.indexOf(c)]]), q2 = modularity(A, p2);
  // 2층에서 더 옮길 게 있나? (없으면 끝)
  const ag2 = aggregate(A, p2), log3 = localMoves(ag2.B, ag2.ids.map((_, t) => t), ag2.ids.map((_, t) => t));
  return { A, q0, log1, qs, p1, q1, ag, log2, sc, p2, q2, more: log3.length };
}
function leidenPlan() {
  const A = mat(LEI.n, LEI.E), RED = 0;
  const a0 = [...Array(LEI.n).keys()].map((i) => (LEI.B.includes(i) ? i : RED)); // 파랑은 아직 혼자씩
  const keep0 = bestMove(A, a0, 0); // 지금은 0 이 주황에 남는 게 가장 좋아요
  const a1 = a0.slice(), logB = localMoves(A, a1, LEI.B); // 파란 노드가 모여요
  const mv0 = bestMove(A, a1, 0), a2 = a1.slice(); a2[0] = mv0.to;
  const stuck = [...Array(LEI.n).keys()].every((i) => { const b = bestMove(A, a2, i); return b.to === a2[i] || b.gain <= 1e-12; });
  const redNodes = a2.map((c, i) => (c === RED ? i : -1)).filter((i) => i >= 0);
  const ag = aggregate(A, a2), merged = localMoves(ag.B, ag.ids.map((_, t) => t), ag.ids.map((_, t) => t)); // Louvain 2층: 더 옮길 게 없어요
  const ref = refine(A, a2);
  // 다듬은 조각으로 접고(시작 커뮤니티 = 다듬기 전), 다시 옮겨요 (빈 커뮤니티도 후보)
  const rids = [...new Set(ref)], at = new Map(rids.map((c, t) => [c, t]));
  const RB = Array.from({ length: rids.length }, () => new Array(rids.length).fill(0));
  A.forEach((row, i) => row.forEach((w, j) => { RB[at.get(ref[i])][at.get(ref[j])] += w; }));
  const start = rids.map((c) => a2[ref.indexOf(c)]), sc = start.slice(), logR = localMoves(RB, sc, rids.map((_, t) => t), true);
  const fin = ref.map((c) => sc[at.get(c)]);
  return { A, a0, keep0, a1, logB, mv0, a2, stuck, redNodes, louvainMore: merged.length, ref, fin, logR, q: { a0: modularity(A, a0), a1: modularity(A, a1), a2: modularity(A, a2), fin: modularity(A, fin) }, red: RED };
}
const LV = louvainPlan(), LD = leidenPlan();
const f4 = (v) => fix(v, 4).replace(/^-/, "−");
const TQ = (() => { const A = mat(TRI.n, TRI.E); return { two: modularity(A, [0, 0, 0, 1, 1, 1]), one: modularity(A, [0, 0, 0, 0, 0, 0]) }; })();

const CAPS = {
  q: [
    "삼각형 두 개(엣지 3 + 3)를 다리 1개로 이은 그래프예요. 두 삼각형으로 나누는 후보를 주황 · 파랑으로 칠해 봐요.",
    "안쪽 엣지 비율: 같은 색끼리 이은 엣지(굵은 선)는 7개 중 6개예요. 6 ÷ 7 = 0.857.",
    `무작위 기대: 노드마다 엣지 끝 수(차수)는 그대로 두고 아무렇게나 다시 이으면, 엣지가 한 색 안에 떨어질 비율은 (7/14)² + (7/14)² = 0.5 예요. Q = 0.857 − 0.5 ≈ ${fix(TQ.two, 2)}.`,
    `모든 노드를 한 색으로 두면 안쪽 비율 1 − 기대 1 = ${fix(Math.abs(TQ.one), 0)} 이에요. 그래서 'Q 를 크게 하는 나누기'를 찾는 게 커뮤니티 탐지예요.`,
    "이제 직접 노드를 눌러 색을 바꿔 보세요. Q 가 바로 다시 계산돼요. 더 큰 Q 를 찾을 수 있나요?",
  ],
  louvain: [
    `처음엔 노드 15개가 모두 혼자예요(커뮤니티 15개). 이때 Q = ${f4(LV.q0)} 예요.`,
    `1단계 · 지역 이동: 노드를 하나씩 보며, 이웃 커뮤니티로 옮겼을 때 Q 가 가장 많이 오르는 곳으로 옮겨요. 옮길 때마다 Q 가 올라요.`,
    `한 바퀴 더 돌아도 Q 가 오르는 이동이 없으면 1단계가 끝나요. 작은 묶음 ${new Set(LV.p1).size}개, Q = ${f4(LV.q1)}.`,
    "2단계 · 접기: 묶음 하나를 점 하나로 접어요. 점 안 숫자는 안쪽 엣지 수, 점 사이 숫자는 합친 엣지 수예요.",
    `접은 그래프에서 1단계를 다시 해요. 작은 묶음끼리 합쳐 Q = ${f4(LV.q2)} 까지 올라요. 더 오르지 않으면 끝 — 큰 묶음 ${new Set(LV.p2).size}개예요.`,
    "이제 직접 노드를 눌러 이웃 묶음으로 옮겨 보세요. Q 가 바로 다시 계산돼요. 어떤 이동도 Q 를 못 올리면 그게 Louvain 이 멈춘 자리예요.",
  ],
  leiden: [
    "예를 들어 지역 이동 중에 이런 상태가 됐다고 해요. 다리 노드 0 이 왼쪽 삼각형과 오른쪽 사각형을 이어 주황 커뮤니티 하나를 이뤄요. 위의 노드들은 아직 혼자씩이에요.",
    `위의 노드들이 파란 커뮤니티로 모이면(Q ↑), 이제 0 은 파랑으로 옮기는 게 Q 를 더 올려요(+${fix(LD.mv0.gain, 3)}). 그래서 옮겨 가요.`,
    `주황 커뮤니티가 두 조각으로 끊어졌어요. 그래도 남은 노드는 하나씩 옮겨서는 Q 가 안 올라서 그대로예요. Louvain 은 이대로 접어서 끊어진 채로 굳어요.`,
    "Leiden 은 접기 전에 '다듬기'를 해요. 커뮤니티 안에서 실제로 이어진 노드끼리만 다시 묶어, 주황을 두 조각으로 나눠요.",
    `다듬은 조각을 기준으로 접고 다시 옮기면 두 조각이 다른 커뮤니티가 돼요. 이제 모든 커뮤니티가 안에서 이어져 있고, Q 도 ${f4(LD.q.a2)} → ${f4(LD.q.fin)} 으로 올라요.`,
  ],
};
const modeOf = (o) => (CAPS[o.mode] ? o.mode : "louvain");
const W = 600, H = 384;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default {
  aspect: H / W,
  steps: (o) => CAPS[modeOf(o)],
  hint: "",
  mount(stage, f) {
    const mode = modeOf(f.opts), caps = CAPS[mode];
    const DATA = mode === "q" ? TRI : mode === "leiden" ? LEI : HOUSE, A = mat(DATA.n, DATA.E), K = degs(A);
    const s = svg(stage, W, H, mode === "q" ? "삼각형 두 개를 다리로 이은 그래프와 모듈러리티 계산" : mode === "leiden" ? "다리 노드 하나가 떠나 끊어진 커뮤니티를 Leiden 이 다듬는 그림" : "노드 15개 그래프에서 Louvain 이 커뮤니티를 찾는 그림");
    let alive = true;
    const live = (i) => alive && f.step() === i;
    const R = mode === "q" ? 19 : mode === "leiden" ? 16 : 14;

    const edgeG = g(s), superG = g(s), nodeG = g(s), labG = g(s), panelG = g(s);
    const edges = DATA.E.map(([a, b]) => ({ a, b, l: line(edgeG, ...DATA.pos[a], ...DATA.pos[b], { color: C.line, width: 1.6 }) }));
    const nodes = DATA.pos.map(([x, y], i) => {
      const under = circle(nodeG, x, y, R, { fill: C.bg });
      const c = circle(nodeG, x, y, R, { fill: C.bg, stroke: C.line, sw: 2 });
      const ring = el(nodeG, "circle", { cx: x, cy: y, r: R + 6, fill: "none", stroke: C.ink, "stroke-width": 2, opacity: 0 });
      return { under, c, ring, x, y, cur: [x, y] };
    });
    const tags = []; // 노드 옆 작은 글자
    if (mode === "leiden") tags.push(text(labG, DATA.pos[0][0], DATA.pos[0][1] + 1, "0", { size: 15, anchor: "middle", weight: 700, fill: C.ink }));
    const ro = readout(f.controls());

    // 색: 커뮤니티 id → 색 번호 (혼자인 노드는 색 없음)
    let colorOf = new Map();
    function paint(comm, o = {}) {
      const sizes = new Map(); comm.forEach((c) => sizes.set(c, (sizes.get(c) || 0) + 1));
      nodes.forEach((n, i) => {
        const c = comm[i], col = (sizes.get(c) > 1 || o.solo) && colorOf.has(c) ? colorOf.get(c) : -1;
        n.c.style.fill = col >= 0 ? SERIES_SOFT[col] : "var(--fg-bg)";
        n.c.style.stroke = col >= 0 ? SERIES[col] : "var(--fg-line)";
        n.c.setAttribute("stroke-width", col >= 0 ? 2.4 : 2);
        n.ring.style.opacity = o.ring === i ? "1" : "0";
      });
      edges.forEach(({ a, b, l }) => {
        const same = comm[a] === comm[b] && (sizes.get(comm[a]) > 1) && colorOf.has(comm[a]);
        l.style.stroke = same ? SERIES[colorOf.get(comm[a])] : "var(--fg-line)";
        l.setAttribute("stroke-width", same ? (o.thick ? 3.6 : 2.6) : 1.6);
        l.setAttribute("stroke-dasharray", !same && o.dashCross ? "5 5" : "");
      });
    }
    const placeNodes = (P) => nodes.forEach((n, i) => { n.cur = P[i]; for (const e of [n.under, n.c, n.ring]) { e.setAttribute("cx", P[i][0]); e.setAttribute("cy", P[i][1]); } });
    const placeEdges = (P) => edges.forEach(({ a, b, l }) => { l.setAttribute("x1", P[a][0]); l.setAttribute("y1", P[a][1]); l.setAttribute("x2", P[b][0]); l.setAttribute("y2", P[b][1]); });
    const homeAll = () => { placeNodes(DATA.pos); placeEdges(DATA.pos); nodes.forEach((n) => { n.under.style.opacity = n.c.style.opacity = "1"; }); edgeG.style.opacity = "1"; superG.replaceChildren(); };

    // ---------- 모드: Q (카드 9) ----------
    if (mode === "q") {
      const PX = 372, BW = 210, rowY = [108, 194, 280], VX = 588; // 값은 제목 줄 오른쪽 끝에
      const lab = rowY.map((y, t) => text(panelG, PX, y - 22, ["안쪽 엣지 비율", "무작위 기대", "Q = 안쪽 − 기대"][t], { size: 15, weight: 600, fill: C.sub }));
      el(panelG, "line", { x1: PX, y1: rowY[0] - 8, x2: PX, y2: rowY[2] + 26, stroke: C.line, "stroke-width": 1.2 });
      const barG = g(panelG);
      const degT = nodes.map((n, i) => text(labG, n.x + (n.x < 190 ? -R - 12 : R + 12), n.y - R + 2, String(K[i]), { size: 15, anchor: "middle", weight: 700, fill: C.sub, cls: "halo" }));
      let comm = [0, 0, 0, 1, 1, 1], step = 0;
      colorOf = new Map([[0, 1], [1, 0], [2, 2]]); // 0 = 주황, 1 = 파랑, 2 = 초록
      const NAMES = ["파랑", "주황", "초록"], CLS = ["a", "b", "c"]; // SERIES 번호 순서
      function bars(on) {
        barG.replaceChildren();
        const m = DATA.E.length, inner = DATA.E.filter(([a, b]) => comm[a] === comm[b]).length, ratio = inner / m;
        const gs = groupsOf(comm), parts = [...gs].map(([c, mem]) => ({ c, d: mem.reduce((s, v) => s + K[v], 0) })), exp = parts.reduce((s, p) => s + (p.d / (2 * m)) ** 2, 0), q = ratio - exp;
        const val = (t, str, col = C.ink) => text(barG, VX, rowY[t] - 22, str, { size: 15, anchor: "end", weight: 700, fill: col, cls: "fg-t tab" });
        const row = (t, w, col, v) => { if (w > 0) rect(barG, PX, rowY[t] - 9, Math.max(2, w), 18, { r: 3, fill: col }); val(t, v); };
        if (on >= 1) row(0, ratio * BW, C.ink, `${inner}/${m} = ${fix(ratio, 3)}`);
        if (on >= 2) {
          let x = PX; for (const p of parts) { const w = (p.d / (2 * m)) ** 2 * BW; rect(barG, x, rowY[1] - 9, Math.max(1, w), 18, { r: 2, fill: SERIES[colorOf.get(p.c)] }); x += w; }
          val(1, fix(exp, 3));
          const qv = fix(q, 3).replace(/^-/, "−");
          if (q >= 0) row(2, q * BW, C.ok, qv); else { rect(barG, PX, rowY[2] - 9, Math.max(2, -q * BW), 18, { r: 3, fill: C.no }); val(2, qv, C.no); }
        }
        lab.forEach((t, k) => (t.style.opacity = on >= [1, 2, 2][k] ? "1" : "0.35"));
        degT.forEach((t) => (t.style.opacity = on === 2 || on >= 4 ? "1" : "0"));
        paint(comm, { thick: on >= 1, dashCross: on >= 1, solo: true });
        const ex = parts.map((p) => `<span class="${CLS[colorOf.get(p.c)]}">${NAMES[colorOf.get(p.c)]}</span> (${p.d}/${2 * m})²`).join(" + ");
        ro.set(on === 0 ? `<div>노드 6개 · 엣지 m = ${m}개 · 나누기 후보: ${parts.map((p) => `<span class="${CLS[colorOf.get(p.c)]}">${NAMES[colorOf.get(p.c)]}</span> ${gs.get(p.c).length}개`).join(" · ")}</div>`
          : `<div>안쪽 엣지 비율 = ${inner} ÷ ${m} = <b>${fix(ratio, 3)}</b></div>${on >= 2 ? `<div>무작위 기대 = ${ex} = <b>${fix(exp, 3)}</b> <span class="dim">(차수 합 ÷ 2m)²</span></div><div>Q = ${fix(ratio, 3)} − ${fix(exp, 3)} = <b>${fix(q, 3).replace(/^-/, "−")}</b></div>` : ""}`);
      }
      // 눌러서 색 바꾸기 (마지막 단계)
      nodes.forEach((n, i) => {
        n.c.setAttribute("tabindex", "0"); n.c.setAttribute("role", "button"); n.c.setAttribute("aria-label", `노드 ${i + 1} 색 바꾸기`);
        const flip = () => { if (step !== caps.length - 1) { f.goto(caps.length - 1); return; } comm[i] = (comm[i] + 1) % 3; bars(4); };
        n.c.addEventListener("click", flip);
        n.c.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); flip(); } });
        n.c.style.cursor = "pointer";
      });
      return {
        async go(i, animate) {
          step = i;
          if (i < 3) comm = [0, 0, 0, 1, 1, 1];
          if (i === 3) {
            if (animate) { comm = [0, 0, 0, 1, 1, 1]; bars(2); await sleep(350); for (const v of [3, 4, 5]) { if (!live(i)) break; comm[v] = 0; bars(2); await sleep(260); } }
            comm = [0, 0, 0, 0, 0, 0];
          }
          if (i === 4 && animate) comm = [0, 0, 0, 1, 1, 1];
          bars(i === 3 ? 2 : Math.min(i, 4));
        },
        destroy() { alive = false; },
      };
    }

    // ---------- 모드: Louvain (카드 10) ----------
    if (mode === "louvain") {
      // 색: 1단계 끝 묶음마다 하나 (삼각형 먼저), 2층에선 큰 쪽 색을 물려받아요
      const p1groups = [...groupsOf(LV.p1)].sort((x, y) => y[1].length - x[1].length || x[1][0] - y[1][0]);
      const baseColor = new Map(p1groups.map(([c], t) => [c, t]));
      const colorFor2 = (c2) => { const mem = LV.p2.map((c, i) => (c === c2 ? i : -1)).filter((i) => i >= 0); const sub = [...groupsOf(mem.map((i) => LV.p1[i]))].sort((x, y) => y[1].length - x[1].length)[0][0]; return baseColor.get(sub); };
      let comm = [...Array(DATA.n).keys()], step = 0, userComm = null;
      const qNow = () => modularity(A, comm);
      function setColors(level) { colorOf = new Map(); if (level === 2) for (const c of new Set(LV.p2)) colorOf.set(c, colorFor2(c)); else for (const [c, t] of baseColor) colorOf.set(c, t); if (level === 3) for (const c of new Set(comm)) if (!colorOf.has(c)) colorOf.set(c, colorFor2(LV.p2[comm.indexOf(c)])); }
      function readNow(extra = "") { const n = new Set(comm).size; ro.set(`<div>커뮤니티 <b>${n}</b>개 · Q = <b>${f4(qNow())}</b></div>${extra ? `<div class="dim">${extra}</div>` : ""}`); }
      // 접은 그래프 (점 = 1단계 묶음)
      const sup = (() => { // 점 자리: 묶음의 가운데를 집(큰 묶음) 가운데에서 바깥으로 조금 밀어 서로 겹치지 않게
        const avg = (mem) => [mem.reduce((s, i) => s + DATA.pos[i][0], 0) / mem.length, mem.reduce((s, i) => s + DATA.pos[i][1], 0) / mem.length];
        const ids = LV.ag.ids, cen = ids.map((c) => {
          const mem = LV.p1.map((x, i) => (x === c ? i : -1)).filter((i) => i >= 0), [cx, cy] = avg(mem);
          const house = LV.p2.map((x, i) => (x === LV.p2[mem[0]] ? i : -1)).filter((i) => i >= 0), [hx, hy] = avg(house);
          const dx = cx - hx, dy = cy - hy, L = Math.hypot(dx, dy) || 1; // 집 가운데에서 그 묶음 쪽으로 56 만큼
          return [hx + (dx / L) * 56, hy + (dy / L) * 56, mem.length];
        });
        return { ids, cen };
      })();
      function drawSuper(scomm, o = {}) {
        superG.replaceChildren();
        const { ids, cen } = sup, B = LV.ag.B;
        for (let a = 0; a < ids.length; a++) for (let b = a + 1; b < ids.length; b++) if (B[a][b]) {
          const same = scomm[a] === scomm[b];
          el(superG, "line", { x1: cen[a][0], y1: cen[a][1], x2: cen[b][0], y2: cen[b][1], stroke: same ? SERIES[colorOf.get(scomm[a]) ?? 0] : "var(--fg-sub)", "stroke-width": 1.5 + B[a][b] * 1.6 });
          text(superG, (cen[a][0] + cen[b][0]) / 2, (cen[a][1] + cen[b][1]) / 2, String(B[a][b]), { size: 15, anchor: "middle", weight: 700, fill: C.ink, cls: "halo tab" });
        }
        ids.forEach((c, a) => {
          const r = 16 + cen[a][2] * 4, col = colorOf.get(scomm[a]) ?? baseColor.get(c);
          el(superG, "circle", { cx: cen[a][0], cy: cen[a][1], r: r + 2, fill: "var(--fg-bg)" });
          el(superG, "circle", { cx: cen[a][0], cy: cen[a][1], r, fill: SERIES_SOFT[col], stroke: SERIES[col], "stroke-width": o.ring === a ? 4 : 2.4 });
          text(superG, cen[a][0], cen[a][1] + 1, String(B[a][a] / 2), { size: 16, anchor: "middle", weight: 700, fill: C.ink, cls: "tab" });
        });
      }
      const superComm2 = LV.ag.ids.map((_, t) => LV.sc[t]); // 2층 이동이 끝난 뒤
      function fold(t) { // 0 = 펼침, 1 = 접힘
        const P = DATA.pos.map(([x, y], i) => { const a = LV.ag.of[i], [cx, cy] = sup.cen[a]; return [lerp(x, cx, t), lerp(y, cy, t)]; });
        placeNodes(P); placeEdges(P);
        nodes.forEach((n) => { n.under.style.opacity = n.c.style.opacity = String(1 - t); });
        edgeG.style.opacity = String(1 - t); superG.style.opacity = String(t);
      }
      function render(i) {
        step = i; homeAll(); superG.style.opacity = "0";
        if (i === 0) { comm = [...Array(DATA.n).keys()]; setColors(1); paint(comm); readNow("혼자인 노드는 색이 없어요"); return; }
        if (i === 1 || i === 2) { comm = LV.p1.slice(); setColors(1); paint(comm); readNow(i === 1 ? `옮긴 횟수 ${LV.log1.length}번 · 매번 Q 가 올랐어요` : "한 바퀴 더 봐도 Q 를 올리는 이동이 없어요"); return; }
        if (i === 3) { comm = LV.p1.slice(); setColors(1); paint(comm); fold(1); colorOf = new Map(LV.ag.ids.map((c, t) => [t, baseColor.get(c)])); drawSuper(LV.ag.ids.map((_, t) => t)); readNow(`점 ${LV.ag.ids.length}개 · Q 는 접어도 그대로예요`); return; }
        comm = (i === caps.length - 1 && userComm) ? userComm.slice() : LV.p2.slice();
        setColors(i === caps.length - 1 && userComm ? 3 : 2); paint(comm);
        readNow(i === 4 ? `2층에서 ${LV.log2.length}번 합쳤어요 · 그 위에선 더 오르지 않아요` : "노드를 눌러 보세요 — 이웃 묶음으로 옮겨져요");
      }
      // 눌러서 옮기기 (마지막 단계)
      nodes.forEach((n, i) => {
        n.c.setAttribute("tabindex", "0"); n.c.setAttribute("role", "button"); n.c.setAttribute("aria-label", `노드 ${i + 1} 을 이웃 묶음으로 옮기기`); n.c.style.cursor = "pointer";
        const move = () => {
          if (step !== caps.length - 1) { f.goto(caps.length - 1); return; }
          const cur = (userComm || LV.p2).slice(), opts = [...new Set([cur[i], ...A[i].map((w, j) => (w ? cur[j] : null)).filter((x) => x != null)])];
          if (opts.length < 2) { readNow("이 노드는 이웃이 모두 같은 묶음이라 옮길 곳이 없어요 — 다른 묶음과 맞닿은 노드를 눌러 보세요"); return; }
          const before = modularity(A, cur); cur[i] = opts[(opts.indexOf(cur[i]) + 1) % opts.length]; userComm = cur;
          render(caps.length - 1); readNow(`방금 이동: Q ${f4(before)} → ${f4(modularity(A, cur))}`);
        };
        n.c.addEventListener("click", move);
        n.c.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); move(); } });
      });
      let shown = -1;
      return {
        async go(i, animate) {
          const from = shown; shown = i;
          if (!animate || from !== i - 1) { render(i); return; }
          if (i === 1) { // 한 번에 하나씩 옮겨요
            render(0); setColors(1);
            const c = [...Array(DATA.n).keys()];
            for (let t = 0; t < LV.log1.length; t++) {
              if (!live(i)) break;
              const mv = LV.log1[t]; comm = c.slice(); paint(comm, { ring: mv.i }); await sleep(320);
              c[mv.i] = mv.to; comm = c.slice(); paint(comm, { ring: mv.i });
              readNow(`노드를 옮겨 Q ${f4(t ? LV.qs[t - 1] : LV.q0)} → ${f4(LV.qs[t])}`); await sleep(380);
            }
          } else if (i === 3) { // 접기
            render(2); colorOf = new Map(LV.ag.ids.map((c, t) => [t, baseColor.get(c)])); drawSuper(LV.ag.ids.map((_, t) => t));
            await anim(1100, (t) => fold(t));
          } else if (i === 4) { // 접은 그래프에서 다시 옮기기 → 펼치기
            colorOf = new Map(LV.ag.ids.map((c, t) => [t, baseColor.get(c)]));
            const sc = LV.ag.ids.map((_, t) => t); fold(1); drawSuper(sc);
            for (const mv of LV.log2) {
              if (!live(i)) break;
              drawSuper(sc, { ring: mv.i }); await sleep(450);
              sc[mv.i] = mv.to;
              const big = (c) => { const mem = sc.map((x, t) => (x === c ? t : -1)).filter((t) => t >= 0); return mem.sort((x, y) => sup.cen[y][2] - sup.cen[x][2])[0]; };
              for (const c of new Set(sc)) colorOf.set(c, baseColor.get(LV.ag.ids[big(c)]));
              drawSuper(sc, { ring: mv.i });
              const full = DATA.pos.map((_, k) => sc[LV.ag.of[k]]); comm = full; readNow(`묶음끼리 합쳐 Q → ${f4(modularity(A, full))}`); await sleep(450);
            }
            if (live(i)) { comm = LV.p2.slice(); setColors(2); paint(comm); await anim(900, (t) => fold(1 - t)); }
          }
          if (alive) render(i);
        },
        destroy() { alive = false; },
      };
    }

    // ---------- 모드: Leiden (카드 11) ----------
    const P = { ...LD, L: LEI.L, R: LEI.R, B: LEI.B }, ORANGE = 1, BLUE = 0, GREEN = 2;
    let comm = P.a0.slice();
    const gapMark = g(labG);
    const gapLine = el(gapMark, "line", { x1: 300, y1: 262, x2: 300, y2: 352, stroke: C.no, "stroke-width": 2.2, "stroke-dasharray": "6 5" });
    const gapT = text(gapMark, 300, 368, "안 이어짐", { size: 15, anchor: "middle", weight: 700, fill: C.no, cls: "halo" });
    const outline = g(labG); // 다듬은 조각 테두리
    const hull = (ids, col) => { // 조각 둘레의 점선 상자
      const xs = ids.map((i) => DATA.pos[i][0]), ys = ids.map((i) => DATA.pos[i][1]), pad = R + 10;
      const r = rect(outline, Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) - Math.min(...xs) + 2 * pad, Math.max(...ys) - Math.min(...ys) + 2 * pad, { r: 16, fill: "none", stroke: col, sw: 2 });
      r.setAttribute("stroke-dasharray", "6 4");
    };
    // 색: 파랑 = 위 사각형 쪽 · 초록 = 계산에서 따로 떨어져 나가는 조각(왼쪽 삼각형) · 주황 = 나머지
    const moved = P.logR.length ? P.ref.map((c, k) => k).filter((k) => P.fin[k] === P.logR[0].to) : P.L;
    const movedSet = new Set(moved), stays = P.redNodes.filter((k) => !movedSet.has(k));
    function colorsFor(c) { colorOf = new Map(); for (const id of new Set(c)) { const mem = c.map((x, i) => (x === id ? i : -1)).filter((i) => i >= 0); colorOf.set(id, mem.some((i) => P.B.includes(i)) ? BLUE : mem.some((i) => movedSet.has(i)) && !mem.some((i) => stays.includes(i)) ? GREEN : ORANGE); } }
    const qOf = (c) => f4(modularity(A, c));
    function render(i) {
      outline.replaceChildren(); gapMark.style.opacity = "0";
      if (i === 0) { comm = P.a0.slice(); colorsFor(comm); paint(comm); ro.set(`<div>Q = <b>${qOf(comm)}</b> · <span class="b">주황</span> = 0 + 왼쪽 삼각형 + 오른쪽 사각형</div><div class="dim">지금은 0 이 주황에 남는 게 가장 좋아요 (다른 곳으로 옮기면 Q 가 내려가요)</div>`); return; }
      if (i === 1) { comm = P.a2.slice(); colorsFor(comm); paint(comm); ro.set(`<div>Q = ${qOf(P.a0)} → ${qOf(P.a1)} <span class="dim">(파랑이 모임)</span> → <b>${qOf(P.a2)}</b> <span class="dim">(0 이 파랑으로)</span></div>`); return; }
      if (i === 2) { comm = P.a2.slice(); colorsFor(comm); paint(comm); gapMark.style.opacity = "1"; ro.set(`<div><span class="b">주황</span> 안이 이어져 있나요? <b>${isConnected(A, P.redNodes) ? "예" : "아니요 ✕"}</b> · 남은 노드는 다 그대로가 최선${P.stuck ? "" : "(?)"}</div><div>Louvain 결과 Q = <b>${qOf(P.a2)}</b> <span class="dim">(접은 뒤에도 더 옮길 게 없어요)</span></div>`); return; }
      if (i === 3) { // 다듬기: 커뮤니티는 아직 주황 하나, 그 안의 조각이 둘 (점선 상자)
        comm = P.a2.slice(); colorsFor(comm); paint(comm); hull(stays, SERIES[ORANGE]); hull(moved, SERIES[GREEN]);
        const pieces = [...groupsOf(P.ref.filter((_, k) => P.redNodes.includes(k))).keys()].length;
        ro.set(`<div>다듬기: <span class="b">주황</span> 안을 이어진 조각 <b>${pieces}</b>개로 — 왼쪽 삼각형 · 오른쪽 사각형 <span class="dim">(점선 상자)</span></div><div class="dim">조각은 이어진 노드끼리만 묶어서, 늘 안에서 이어져 있어요</div>`); return;
      }
      comm = P.fin.slice(); colorsFor(comm); paint(comm);
      const all = [...groupsOf(comm).values()].every((mem) => isConnected(A, mem));
      ro.set(`<div>커뮤니티 ${new Set(comm).size}개 · 모두 안에서 이어져 있나요? <b>${all ? "예 ✓" : "아니요"}</b></div><div>Q: Louvain ${qOf(P.a2)} → Leiden <b>${qOf(comm)}</b></div>`);
    }
    let shown = -1;
    return {
      async go(i, animate) {
        const from = shown; shown = i;
        if (!animate || from !== i - 1) { render(i); return; }
        if (i === 1) {
          render(0); const c = P.a0.slice();
          for (const mv of P.logB) { if (!live(i)) break; c[mv.i] = mv.to; comm = c.slice(); colorsFor(comm); paint(comm, { ring: mv.i }); await sleep(420); }
          if (live(i)) { paint(comm, { ring: 0 }); await sleep(500); comm = P.a2.slice(); colorsFor(comm); paint(comm, { ring: 0 }); await sleep(600); }
        } else if (i === 2) {
          render(1); await sleep(200); gapMark.style.opacity = "1";
          await anim(600, (t) => { gapLine.style.opacity = String(t); gapT.style.opacity = String(t); });
        } else if (i === 3) {
          render(2); await sleep(300);
          comm = P.a2.slice(); colorsFor(comm); paint(comm);
          outline.replaceChildren(); hull(moved, SERIES[GREEN]); await sleep(400); hull(stays, SERIES[ORANGE]); await sleep(300);
        } else if (i === 4) { // 다듬은 조각으로 접고 옮기기: 계산에서 옮겨 가는 조각(초록 점선)이 따로 서요
          render(3); await sleep(450);
          const c = P.a2.slice(); paint(comm, { ring: moved[0] }); await sleep(350);
          moved.forEach((k) => (c[k] = "moved")); comm = c; colorsFor(comm); paint(comm); await sleep(500);
        }
        if (alive) render(i);
      },
      destroy() { alive = false; },
    };
  },
};
