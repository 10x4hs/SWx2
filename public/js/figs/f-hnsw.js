// 그림: HNSW — 고속도로 층에서 골목 층으로 (Vector & Graph 02 — 카드 9 ~ 12) · 3D (끌어서 돌려 봐요)
//   점 64개(벡터)를 3층으로 쌓은 그래프. 질문(주황)이 맨 위 입구에서 출발해 더 가까운 이웃으로 뛰고, 막히면 한 층 내려가요.
//   0층에서는 후보를 efSearch 개까지 넓게 봐요. 아래 다이얼로 efSearch 를 바꾸면 '본 점' · recall@3 이 바로 바뀌어요.
//   opts.mode = "nsw" 면 0층(작은 세상 그래프)만 — 카드 9.
import { scene3d } from "./three-kit.js";
import { rng, readout, slider, reduced } from "./kit.js";

const N = 64, GAP = 1.7, SPAN = 3.1, K = 3;
const LAYER_N = [N, 13, 4], M = [4, 3, 2];
const d2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
const sleep = (ms) => new Promise((r) => setTimeout(r, reduced() ? 0 : ms));

function build() {
  const r = rng(11), pts = [];
  while (pts.length < N) { const p = [(r() * 2 - 1) * SPAN, (r() * 2 - 1) * SPAN]; if (pts.every((q) => d2(p, q) > 0.45 ** 2)) pts.push(p); }
  const order = pts.map((_, i) => i).sort(() => r() - 0.5); // 층은 무작위로 (대부분 0층에만)
  const level = new Array(N).fill(0);
  order.slice(0, LAYER_N[1]).forEach((i) => (level[i] = 1));
  order.slice(0, LAYER_N[2]).forEach((i) => (level[i] = 2));
  const inL = (l) => pts.map((_, i) => i).filter((i) => level[i] >= l);
  const adj = [0, 1, 2].map((l) => {
    const ids = inL(l), a = new Map(ids.map((i) => [i, new Set()]));
    for (const i of ids) ids.filter((j) => j !== i).sort((x, y) => d2(pts[i], pts[x]) - d2(pts[i], pts[y])).slice(0, M[l]).forEach((j) => { a.get(i).add(j); a.get(j).add(i); });
    return a;
  });
  return { pts, level, inL, adj, entry: inL(2).sort((x, y) => Math.hypot(...pts[y]) - Math.hypot(...pts[x]))[0] };
}
function greedy(G, l, from, q) {
  const path = [from]; let cur = from;
  for (;;) {
    let best = cur, bd = d2(G.pts[cur], q);
    for (const nb of G.adj[l].get(cur)) { const dd = d2(G.pts[nb], q); if (dd < bd) { bd = dd; best = nb; } }
    if (best === cur) return path;
    path.push(best); cur = best;
  }
}
// HNSW 의 search_layer (0층): 후보 C · 결과 W(최대 ef개)
function beam(G, from, q, ef) {
  const dist = (i) => d2(G.pts[i], q), seen = new Set([from]), order = [from];
  let C = [from], W = [from];
  while (C.length) {
    C.sort((a, b) => dist(a) - dist(b)); const c = C.shift();
    W.sort((a, b) => dist(a) - dist(b));
    if (dist(c) > dist(W[W.length - 1]) && W.length >= ef) break;
    for (const e of G.adj[0].get(c)) {
      if (seen.has(e)) continue;
      seen.add(e); order.push(e);
      W.sort((a, b) => dist(a) - dist(b));
      if (W.length < ef || dist(e) < dist(W[W.length - 1])) { C.push(e); W.push(e); W.sort((a, b) => dist(a) - dist(b)); if (W.length > ef) W.pop(); }
    }
  }
  W.sort((a, b) => dist(a) - dist(b));
  return { res: W.slice(0, K), order };
}
function run(G, q, ef) {
  const p2 = greedy(G, 2, G.entry, q), p1 = greedy(G, 1, p2[p2.length - 1], q);
  const b = beam(G, p1[p1.length - 1], q, ef);
  const truth = G.pts.map((_, i) => i).sort((x, y) => d2(G.pts[x], q) - d2(G.pts[y], q)).slice(0, K);
  const hit = b.res.filter((i) => truth.includes(i)).length;
  return { p2, p1, ...b, truth, hit };
}
// 보여 주기 좋은 질문 자리: ef 가 작으면 놓치고, 크면 다 찾고, 위층에서 두 번 이상 뛰는 곳
function pickQuery(G) {
  let best = null;
  for (let x = -2.4; x <= 2.4; x += 0.2) for (let y = -2.4; y <= 2.4; y += 0.2) {
    const q = [x, y], lo = run(G, q, 3), hi = run(G, q, 8);
    if (lo.hit < K && hi.hit === K && lo.p2.length >= 2 && lo.p1.length >= 2) {
      const score = lo.p2.length + lo.p1.length + (K - lo.hit) * 2 - Math.hypot(x, y) * 0.3;
      if (!best || score > best.score) best = { q, score };
    }
  }
  return best?.q || [1.2, -0.8];
}

const STEPS_FULL = [
  "0층(맨 아래)에는 모든 점(벡터)이 있고, 가까운 점끼리 선으로 이어져 있어요. 이것만으로도 '작은 세상 그래프'예요.",
  "점을 조금만 골라 1층 · 2층을 쌓아요. 위층일수록 점이 적고 멀리 이어진 '고속도로'예요. 같은 점은 세로 점선으로 이어져요.",
  "질문(주황 점)이 오면 맨 위층 입구에서 출발해요. 이웃 중 질문에 더 가까운 점으로 뛰고, 더 가까워지지 않으면 멈춰요.",
  "멈춘 점에서 한 층 내려가 같은 방식으로 계속해요. 아래층일수록 촘촘해서 더 세밀하게 다가가요.",
  "0층에서는 후보를 efSearch 개(여기선 8개)까지 넓게 보면서 마무리해요. 후보 중 가장 가까운 3개(k = 3)가 답이에요.",
  "efSearch 를 3 으로 줄이면 빠르지만 진짜 가까운 점(빨간 고리)을 놓칠 수 있어요 — 그래서 '근사'예요. 아래 다이얼로 바꿔 보세요.",
];
const STEPS_NSW = [
  "점(벡터)마다 가까운 점 몇 개와 선으로 이어 둬요. 이게 작은 세상 그래프(NSW)예요.",
  "질문(주황 점)이 오면 입구 점 하나에서 시작해, 연결된 이웃들과 질문까지의 거리를 비교해요.",
  "질문에 더 가까운 이웃으로 옮겨 가요. 이걸 계속 반복해요.",
  "더 가까운 이웃이 없으면 멈춰요(탐욕 탐색). 선이 촘촘한 골목만 있으면 먼 곳까지 여러 번 걸어야 해요 — 그래서 HNSW 는 위에 고속도로 층을 얹어요.",
];

export default {
  aspect: 0.66,
  aspectNarrow: 0.95,
  steps: (o) => (o.mode === "nsw" ? STEPS_NSW : STEPS_FULL),
  hint: "끌어서 돌려 보세요",
  async mount(stage, f) {
    const nsw = f.opts.mode === "nsw";
    const G = build(), q = pickQuery(G);
    const S = await scene3d(stage, { yaw: -0.55, pitch: nsw ? 0.95 : 0.42, dist: nsw ? 10.5 : 11.5, ty: nsw ? 0 : GAP, label: "HNSW 3층 그래프 — 끌거나 화살표 키로 돌려요" });
    const T = S.THREE, root = S.root;
    const col = {};
    const paint = () => { for (const [k, v] of Object.entries({ ink: "--fg-ink", line: "--fg-line", grid: "--fg-grid", soft: "--fg-soft", a: "--fg-a", b: "--fg-b", c: "--fg-c", no: "--fg-no", sub: "--fg-sub" })) col[k] = S.color(v); };
    paint();
    const Y = (l) => (nsw ? 0 : l * GAP);
    const P = (i, l) => new T.Vector3(G.pts[i][0], Y(l), G.pts[i][1]);
    const layers = [0, 1, 2].map((l) => {
      const grp = new T.Group(); root.add(grp);
      const size = SPAN * 2 + 1.2;
      const plane = new T.Mesh(new T.PlaneGeometry(size, size), new T.MeshBasicMaterial({ transparent: true, opacity: 0.5, depthWrite: false, side: T.DoubleSide }));
      plane.rotation.x = -Math.PI / 2; plane.position.y = Y(l) - 0.01; grp.add(plane);
      const edge = new T.LineSegments(new T.EdgesGeometry(plane.geometry), new T.LineBasicMaterial({})); edge.rotation.x = -Math.PI / 2; edge.position.y = Y(l) - 0.01; grp.add(edge);
      const ids = G.inL(l), pos = [];
      for (const i of ids) for (const j of G.adj[l].get(i)) if (i < j) { const a = P(i, l), b = P(j, l); pos.push(a.x, a.y, a.z, b.x, b.y, b.z); }
      const eg = new T.BufferGeometry(); eg.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
      const lines = new T.LineSegments(eg, new T.LineBasicMaterial({ transparent: true, opacity: l ? 0.95 : 0.55 })); grp.add(lines);
      const nodes = new Map(), r = [0.075, 0.1, 0.12][l];
      for (const i of ids) { const m = new T.Mesh(new T.SphereGeometry(r, 14, 10), new T.MeshBasicMaterial({})); m.position.copy(P(i, l)); grp.add(m); nodes.set(i, m); }
      const tag = S.label(["0층 · 모든 점 (골목)", "1층", "2층 · 입구 (고속도로)"][l], "sub");
      tag.set(-size / 2, Y(l) + 0.05, -size / 2); // 화면 왼쪽 뒤 모서리 (처음 시점에서 가장 왼쪽)
      return { grp, plane, edge, lines, nodes, tag };
    });
    // 같은 점을 잇는 세로 점선
    const vpos = [];
    for (let i = 0; i < N; i++) for (let l = 1; l <= G.level[i]; l++) { const a = P(i, l - 1), b = P(i, l); vpos.push(a.x, a.y, a.z, b.x, b.y, b.z); }
    const vg = new T.BufferGeometry(); vg.setAttribute("position", new T.Float32BufferAttribute(vpos, 3));
    const vlines = new T.LineSegments(vg, new T.LineDashedMaterial({ dashSize: 0.07, gapSize: 0.07, transparent: true, opacity: 0.7 })); vlines.computeLineDistances(); root.add(vlines);
    // 질문 점(층마다) + 세로선
    const qMeshes = [0, 1, 2].map((l) => { const m = new T.Mesh(new T.SphereGeometry(0.13, 16, 12), new T.MeshBasicMaterial({})); m.position.set(q[0], Y(l) + 0.02, q[1]); root.add(m); return m; });
    const qg = new T.BufferGeometry(); qg.setAttribute("position", new T.Float32BufferAttribute([q[0], Y(0), q[1], q[0], Y(2), q[1]], 3));
    const qline = new T.Line(qg, new T.LineDashedMaterial({ dashSize: 0.1, gapSize: 0.08, transparent: true, opacity: 0.6 })); qline.computeLineDistances(); root.add(qline);
    const qTag = S.label("질문", "b"); qTag.set(q[0], Y(nsw ? 0 : 2) + 0.35, q[1]);
    // 지나간 길 (굵은 선 = 가는 원기둥) · 고리(답 · 놓친 점)
    const pathG = new T.Group(); root.add(pathG);
    const ringG = new T.Group(); root.add(ringG);
    const cyl = (a, b, rad = 0.035) => { const len = a.distanceTo(b), m = new T.Mesh(new T.CylinderGeometry(rad, rad, len, 8), new T.MeshBasicMaterial({ color: col.a })); m.position.copy(a).add(b).multiplyScalar(0.5); m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), b.clone().sub(a).normalize()); return m; };
    const ring = (i, color) => { const m = new T.Mesh(new T.TorusGeometry(0.2, 0.025, 8, 28), new T.MeshBasicMaterial({ color })); m.rotation.x = -Math.PI / 2; m.position.copy(P(i, 0)); m.position.y += 0.01; return m; };
    const entryTag = S.label("입구", "a"); entryTag.set(G.pts[G.entry][0], Y(nsw ? 0 : 2) + 0.32, G.pts[G.entry][1]);
    const resTag = S.label("답", "c"); resTag.show(false);
    const nswEntry = nsw ? G.pts.map((_, i) => i).sort((x, y) => d2(G.pts[y], q) - d2(G.pts[x], q))[0] : null; // nsw: 질문에서 가장 먼 점에서 출발
    if (nsw) entryTag.set(G.pts[nswEntry][0], 0.32, G.pts[nswEntry][1]);

    let ef = 8, userEf = null, stepNow = 0;
    const ro = nsw ? null : readout(f.controls());
    const dial = nsw ? null : slider(f.controls(), { label: "efSearch", min: 1, max: 16, value: 8 }, (v) => { userEf = v; if (stepNow !== STEPS_FULL.length - 1) f.goto(STEPS_FULL.length - 1); else apply(stepNow, false); });

    function colors() {
      layers.forEach((L, l) => { L.plane.material.color = col.soft; L.edge.material.color = col.line; L.lines.material.color = col.line; for (const m of L.nodes.values()) m.material.color = l ? col.ink : col.sub; });
      vlines.material.color = col.sub; qline.material.color = col.b; qMeshes.forEach((m) => (m.material.color = col.b));
    }
    const clear = (g) => { while (g.children.length) { const c = g.children.pop(); c.geometry.dispose(); c.material.dispose(); } };
    function vis(i) {
      const full = !nsw && i >= 1;
      layers.forEach((L, l) => { L.grp.visible = l === 0 || full; L.tag.show(l === 0 ? !nsw : full); });
      vlines.visible = full; qline.visible = full && i >= 2;
      qMeshes.forEach((m, l) => (m.visible = nsw ? l === 0 && i >= 1 : i >= 2 && (l === 0 || full)));
      qTag.show(nsw ? i >= 1 : i >= 2); qTag.set(q[0], Y(nsw ? 0 : i >= 2 ? 2 : 0) + 0.35, q[1]);
      entryTag.show(nsw ? i >= 1 : i >= 2);
    }
    // 한 단계의 모습 (animate 면 길을 한 칸씩 그려요)
    async function apply(i, animate) {
      stepNow = i; vis(i); colors(); clear(pathG); clear(ringG); resTag.show(false);
      if (nsw) {
        if (i < 1) { S.render(); return; }
        const path = greedy(G, 0, nswEntry, q), upto = i === 1 ? 1 : i === 2 ? Math.min(3, path.length) : path.length;
        layers[0].nodes.get(nswEntry).material.color = col.a;
        if (i === 1) for (const nb of G.adj[0].get(nswEntry)) layers[0].nodes.get(nb).material.color = col.b;
        for (let k = 1; k < upto; k++) { if (animate) await sleep(380); pathG.add(cyl(P(path[k - 1], 0), P(path[k], 0))); layers[0].nodes.get(path[k]).material.color = col.a; S.render(); }
        if (i === 3) ringG.add(ring(path[path.length - 1], col.c));
        S.render(); return;
      }
      if (i < 2) { S.render(); return; }
      const e = i === 4 ? 8 : i === 5 ? userEf ?? 3 : ef, R = run(G, q, e);
      if (dial && i === 5) dial.set(e);
      const hop = async (path, l) => {
        layers[l].nodes.get(path[0]).material.color = col.a;
        for (let k = 1; k < path.length; k++) { if (animate) await sleep(420); pathG.add(cyl(P(path[k - 1], l), P(path[k], l), 0.04)); layers[l].nodes.get(path[k]).material.color = col.a; S.render(); }
      };
      const down = async (from, l) => { if (animate) await sleep(300); pathG.add(cyl(P(from, l), P(from, l - 1), 0.03)); S.render(); };
      await hop(R.p2, 2);
      if (i >= 3) { await down(R.p2[R.p2.length - 1], 2); await hop(R.p1, 1); }
      if (i >= 4) {
        await down(R.p1[R.p1.length - 1], 1);
        const seen = R.order; layers[0].nodes.get(seen[0]).material.color = col.a;
        for (let k = 1; k < seen.length; k++) { if (animate && k % 2 === 0) await sleep(110); const m = layers[0].nodes.get(seen[k]); if (m) m.material.color = col.a; S.render(); }
        R.res.forEach((id) => ringG.add(ring(id, col.c)));
        R.truth.filter((id) => !R.res.includes(id)).forEach((id) => ringG.add(ring(id, col.no)));
        const best = R.res[0]; resTag.set(G.pts[best][0], 0.35, G.pts[best][1]); resTag.show(true);
        ro?.set(`<div>2층 <b>${R.p2.length - 1}</b>번 이동 → 1층 <b>${R.p1.length - 1}</b>번 이동 → 0층에서 후보 <b>${e}</b>개 유지</div><div>거리를 잰 점 <b>${R.order.length + R.p2.length + R.p1.length}</b>개 <span class="dim">/ 전부 재면 ${N}개</span> · recall@3 = <b class="${R.hit === K ? "c" : "b"}">${R.hit}/${K}</b>${R.hit < K ? ` <span class="dim">(빨간 고리 = 놓친 진짜 이웃)</span>` : ""}</div>`);
      } else ro?.set(`<div>${i === 2 ? "2층(고속도로)에서" : "1층에서"} 질문에 더 가까운 이웃으로 이동 중…</div>`);
      S.render();
    }
    S.onTheme(() => { paint(); apply(stepNow, false); });
    colors();
    if (!nsw) ro.set(`<div>점 ${N}개 · 0층 이웃 ${M[0]}개씩 · 1층 ${LAYER_N[1]}개 · 2층 ${LAYER_N[2]}개</div>`);
    return {
      async go(i, animate) {
        // 단계마다 정해 둔 시점 (돌려 봤어도 다음 단계에서 다시 잘 보이는 자리로)
        const v = nsw ? { pitch: 0.95, yaw: -0.55, ty: 0, dist: 10.5 } : i === 0 ? { pitch: 0.85, yaw: -0.55, ty: 0, dist: 10.5 } : { pitch: 0.42, yaw: -0.55, ty: GAP, dist: 11.5 };
        await S.tweenView(v, animate ? 700 : 0);
        await apply(i, animate);
      },
      destroy() { S.destroy(); },
    };
  },
};
