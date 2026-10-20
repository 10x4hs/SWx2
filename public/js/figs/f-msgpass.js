// 그림: 메시지 패싱 — 이웃 이야기를 모아 나를 갱신 (Vector & Graph 07 — 카드 15 · 16)
//   기본: 노드 5개(C — A — 나 — B — D). 나=[1,0], A=[0,1], B=[1,1] 은 카드의 예, C · D 는 2칸 떨어진 이웃(그림용 값).
//     이웃이 벡터를 보내고(점) → 자기 포함 평균으로 모으고 → 갱신. 노드 둘레 고리의 색 = 그 벡터에 섞인 노드들의 몫(평균 가중치를 그대로 계산).
//     1층이면 1칸 이웃, 2층이면 C · D(2칸)까지 섞여요. 갱신의 W 는 흐름만 보려고 W = I(그대로)로 둬요.
//   opts.mode = "gcn"(카드 16): 노드 2개, h1=[2], h2=[4] — Â = A + I → D̂^−½ Â D̂^−½ → ×W(0.5) → ReLU = 1.5. 마지막 단계에서 W 다이얼.
//   넓은 판 600×300 · 좁은 판(폰) 380×300 — 폰에서는 노드를 ∧ 모양으로 놓아 글자가 작아지지 않게 해요.
import { svg, g, text, line, circle, rect, path, readout, slider, anim, set, C, SERIES, fmt } from "./kit.js";

const H = 300;
const n2 = (v) => fmt(v, 2);
const vec = (v) => `[${v.map(n2).join(", ")}]`;

// ---------- 기본: 메시지 패싱 ----------
const IDS = ["C", "A", "나", "B", "D"];
const X0 = { 나: [1, 0], A: [0, 1], B: [1, 1], C: [0, 1], D: [1, 0] };
const NB = { 나: ["A", "B"], A: ["나", "C"], B: ["나", "D"], C: ["A"], D: ["B"] };
const EDGES = [["C", "A"], ["A", "나"], ["나", "B"], ["B", "D"]];
const COL = { 나: C.a, A: C.b, B: C.c, C: C.d, D: SERIES[4] };
const LAY = {
  wide: { W: 600, P: { C: [74, 98], A: [187, 98], 나: [300, 98], B: [413, 98], D: [526, 98] }, r: 26, rr: 33, sw: 8, vy: 56, sy: -50, vs: 16 },
  narrow: { W: 380, P: { 나: [190, 60], A: [92, 146], B: [288, 146], C: [48, 236], D: [332, 236] }, r: 22, rr: 28, sw: 7, vy: 46, sy: -42, vs: 15 },
};
// 한 층: 자기 포함 평균 (Â = A + I 를 행마다 나눈 것) — 모두 같은 순간의 옛 값으로 계산해요. 값과 '섞인 몫'을 같이
function layer(x, mix) {
  const nx = {}, nm = {};
  for (const k of IDS) {
    const grp = [k, ...NB[k]], w = 1 / grp.length;
    nx[k] = [0, 1].map((d) => grp.reduce((a, j) => a + x[j][d] * w, 0));
    nm[k] = {}; for (const j of grp) for (const [o, v] of Object.entries(mix[j])) nm[k][o] = (nm[k][o] || 0) + v * w;
  }
  return { x: nx, mix: nm };
}
const MIX0 = Object.fromEntries(IDS.map((k) => [k, { [k]: 1 }]));
const L1 = layer(X0, MIX0), L2 = layer(L1.x, L1.mix);

const STEPS_MP = [
  "노드마다 작은 벡터(특징)가 있어요. 나=[1,0], A=[0,1], B=[1,1]. C · D 는 나와 두 칸 떨어져 있어요. 둘레 고리의 색은 '누구 정보로 만들어졌나'예요.",
  "① 메시지: 이웃 A(주황) · B(초록)가 자기 벡터를 나에게 보내요. 나도 자기 것을 하나 남겨 둬요.",
  "② 모으기: 받은 것과 자기 것을 평균 내요. ([1,0] + [0,1] + [1,1]) ÷ 3 = [0.67, 0.67].",
  "③ 갱신: 평균에 가중치 W 를 곱하고 활성화 함수를 거치면 새 나예요. 고리에 주황 · 초록이 섞였죠 — 이웃 정보가 들어온 거예요.",
  "1층 = 모든 노드가 같은 일을 동시에 해요. 이제 A 에는 C(보라)가, B 에는 D(청록)가 섞였어요.",
  "2층: 한 번 더 하면 나는 A · B 를 거쳐 C · D 의 정보까지 받아요. 2층 = 2칸 이웃이에요.",
];
// ---------- gcn: 손으로 계산 (카드 16) ----------
const STEPS_GCN = [
  "노드 2개가 연결돼 있어요. h1 = [2], h2 = [4]. GCN 한 층은 H' = σ(D̂^−½ Â D̂^−½ H W) 예요. 한 조각씩 계산해 봐요.",
  "① Â = A + I: 자기 고리(주황)를 더해 자기 자신도 이웃처럼 셈해요. 이제 degree(자기 포함)는 둘 다 2예요.",
  "② 정규화: 선마다 1/√(양 끝 degree 의 곱) = 1/√(2×2) = ½ 을 곱해서 모아요. 노드 1 = ½×2 + ½×4 = 3 — 둘의 평균과 같아요.",
  "③ ×W: 학습되는 가중치 W = 0.5 를 곱해요. 3 × 0.5 = 1.5.",
  "④ ReLU: 음수면 0, 양수면 그대로예요. 1.5 는 그대로 1.5 — 이웃 평균 → 선형변환 → 비선형이 한 층이에요.",
  "이제 직접 W 를 바꿔 보세요. W 가 음수가 되면 ReLU 가 0 으로 잘라요.",
];

export default {
  aspect: H / 600,
  aspectNarrow: H / 380,
  steps: (o) => (o.mode === "gcn" ? STEPS_GCN : STEPS_MP),
  hint: "한 단계씩 넘겨 보세요",
  mount(stage, f) {
    return f.opts.mode === "gcn" ? mountGcn(stage, f) : mountMp(stage, f);
  },
};

function mountMp(stage, f) {
  const Lw = f.narrow ? LAY.narrow : LAY.wide, P = Lw.P;
  const s = svg(stage, Lw.W, H, "노드 5개가 이웃의 벡터를 모아 자기 벡터를 새로 만드는 메시지 패싱");
  // 거리 표시 (나에서 1칸 · 2칸)
  const dist = g(s);
  if (f.narrow) {
    [[1, 146], [2, 236]].forEach(([k, y]) => text(dist, 190, y + 2, `${k}칸 이웃`, { size: 14, anchor: "middle", weight: 600, fill: C.sub }));
  } else {
    [[187, 413, 1], [74, 526, 2]].forEach(([a, b, k]) => {
      const y = 194 + k * 34;
      path(dist, `M${a},${y - 8} V${y} H${b} V${y - 8}`, { stroke: C.line, width: 1.4 });
      text(dist, 300, y, `${k}칸 이웃`, { size: 14, anchor: "middle", weight: 600, fill: C.sub, cls: "fg-t halo" });
    });
  }
  // 선 (원 바깥에서 바깥까지)
  const gap = Lw.rr + 5;
  const seg = (a, b, pad = gap) => { const [x1, y1] = P[a], [x2, y2] = P[b], L = Math.hypot(x2 - x1, y2 - y1), ux = (x2 - x1) / L, uy = (y2 - y1) / L; return [x1 + ux * pad, y1 + uy * pad, x2 - ux * pad, y2 - uy * pad]; };
  EDGES.forEach(([a, b]) => line(s, ...seg(a, b), { color: C.line, width: 2 }));
  // 노드: 고리(섞인 몫) + 원 + 이름 + 벡터
  const RR = Lw.rr, CIRC = 2 * Math.PI * RR;
  const nodes = {};
  for (const k of IDS) {
    const [x, y] = P[k], gg = g(s);
    circle(gg, x, y, RR, { fill: "none", stroke: C.grid, sw: Lw.sw });
    const arcs = IDS.map((o) => { const c = circle(gg, x, y, RR, { fill: "none", stroke: COL[o], sw: Lw.sw }); c.setAttribute("transform", `rotate(-90 ${x} ${y})`); c.style.strokeDasharray = `0 ${CIRC}`; return c; });
    circle(gg, x, y, Lw.r, { fill: C.bg, stroke: COL[k], sw: 2.2 });
    text(gg, x, y + 1, k, { size: f.narrow ? 18 : 20, anchor: "middle", weight: 700, fill: COL[k] });
    const v = text(gg, x, y + Lw.vy, "", { size: Lw.vs, anchor: "middle", weight: 700, cls: "fg-t tab halo" });
    const sub = text(gg, x, y + Lw.sy, "", { size: 14, anchor: "middle", weight: 600, fill: C.sub, cls: "fg-t halo" });
    nodes[k] = { arcs, v, sub, mix: { [k]: 1 }, x: X0[k].slice() };
  }
  // 모으기 상자 (넓은 판만): 나 아래에 받은 세 벡터를 쌓고 → 평균
  const agg = g(s);
  if (!f.narrow) {
    const x0 = 300, y0 = 186, rowsA = [["나", X0.나], ["A", X0.A], ["B", X0.B]];
    rowsA.forEach(([k, v], i) => { const y = y0 + i * 22; circle(agg, x0 - 62, y, 6, { fill: COL[k] }); text(agg, x0 - 48, y, k, { size: 15, weight: 700, fill: COL[k] }); text(agg, x0 + 52, y, vec(v), { size: 15, weight: 600, anchor: "end", cls: "fg-t tab" }); });
    line(agg, x0 - 72, y0 + 56, x0 + 60, y0 + 56, { color: C.ink, width: 1.4 });
    text(agg, x0 - 72, y0 + 74, "÷ 3", { size: 15, weight: 700, fill: C.sub });
    text(agg, x0 + 52, y0 + 74, vec(L1.x.나), { size: 16, weight: 700, anchor: "end", cls: "fg-t tab" });
  }
  const flyG = g(s);
  const ro = readout(f.controls());

  function drawNode(k) {
    const n = nodes[k]; let acc = 0;
    IDS.forEach((o, i) => { const w = n.mix[o] || 0; const c = n.arcs[i]; c.style.strokeDasharray = `${Math.max(0, w * CIRC - (w > 0 && w < 1 ? 1.5 : 0))} ${CIRC}`; c.style.strokeDashoffset = `${-acc * CIRC}`; acc += w; });
    n.v.textContent = vec(n.x);
  }
  const lerpMix = (a, b, t) => Object.fromEntries(IDS.map((o) => [o, (a[o] || 0) * (1 - t) + (b[o] || 0) * t]));
  // 단계 → 각 노드의 (값, 몫)
  function stateOf(si) {
    const st = {};
    for (const k of IDS) {
      if (si >= 5) st[k] = { x: L2.x[k], mix: L2.mix[k] };
      else if (si >= 4 || (si >= 3 && k === "나")) st[k] = { x: L1.x[k], mix: L1.mix[k] };
      else st[k] = { x: X0[k], mix: MIX0[k] };
    }
    return st;
  }
  const span = (k, t) => `<span style="color:${COL[k]};font-weight:700">${t ?? k}</span>`;
  const pct = (m) => IDS.filter((o) => m[o] > 1e-9).map((o) => `${span(o)} ${Math.round(m[o] * 100)}%`).join(" · ");
  function readHtml(si) {
    const a = X0.나, b = X0.A, c = X0.B, m = L1.x.나;
    if (si === 0) return `<div>${IDS.map((k) => `${span(k)} = ${vec(X0[k])}`).join(" · ")}</div><div class="dim">선 = 이웃 관계 · 고리 색 = 그 벡터에 섞인 노드</div>`;
    if (si === 1) return `<div>메시지: ${span("A")} → 나 ${vec(b)} · ${span("B")} → 나 ${vec(c)} · ${span("나")} 자기 것 ${vec(a)}</div>`;
    if (si === 2) return `<div>모으기(평균) = (${vec(a)} + ${vec(b)} + ${vec(c)}) ÷ 3</div><div>= [(${a[0]}+${b[0]}+${c[0]})/3, (${a[1]}+${b[1]}+${c[1]})/3] = <b>${vec(m)}</b></div>`;
    if (si === 3) return `<div>새 ${span("나")} = 활성화(W · ${vec(m)})</div><div class="dim">W 는 학습되는 가중치예요. 여기선 흐름만 보려고 W = I(그대로)로 두어 새 나 = ${vec(m)}.</div><div>섞인 몫: ${pct(L1.mix.나)}</div>`;
    if (si === 4) return `<div>1층 뒤 · ${IDS.map((k) => `${span(k)} ${vec(L1.x[k])}`).join(" · ")}</div><div>예: ${span("A")} = (A ${vec(X0.A)} + 나 ${vec(X0.나)} + C ${vec(X0.C)}) ÷ 3 <span class="dim">— 모두 같은 순간의 옛 값으로 계산해요</span></div><div>${span("A")} 의 몫: ${pct(L1.mix.A)}</div>`;
    return `<div>2층 ${span("나")} = (나¹ ${vec(L1.x.나)} + A¹ ${vec(L1.x.A)} + B¹ ${vec(L1.x.B)}) ÷ 3 = <b>${vec(L2.x.나)}</b></div><div>나의 몫: ${pct(L2.mix.나)} <span class="dim">— C · D 가 들어왔어요</span></div>`;
  }
  function paint(si) {
    flyG.replaceChildren();
    const st = stateOf(si);
    for (const k of IDS) { nodes[k].x = st[k].x.slice(); nodes[k].mix = { ...st[k].mix }; drawNode(k); nodes[k].sub.textContent = ""; }
    if (si === 2) nodes.나.sub.textContent = f.narrow ? "평균 → " + vec(L1.x.나) : "모으기";
    if (si === 3) nodes.나.sub.textContent = "1층";
    // 층 표시: 넓으면 노드마다, 좁으면 나 위에 한 번 (글자가 겹치지 않게)
    if (si === 4 || si === 5) { const t = si === 4 ? "1층" : "2층"; if (f.narrow) nodes.나.sub.textContent = `${t} (모두)`; else for (const k of IDS) nodes[k].sub.textContent = t; }
    dist.style.display = si === 0 || si === 5 ? "" : "none";
    agg.style.display = si === 2 || si === 3 ? "" : "none";
    ro.set(readHtml(si));
  }
  // 점이 선을 따라 흘러가요 (보내는 노드의 색)
  async function send(pairs, ms = 650) {
    const dots = pairs.map(([from, to]) => { const [x1, y1, x2, y2] = seg(from, to); return { a: [x1, y1], b: [x2, y2], d: circle(flyG, x1, y1, 7, { fill: COL[from], stroke: C.bg, sw: 2 }) }; });
    await anim(ms, (t) => dots.forEach((o) => set(o.d, { cx: o.a[0] + (o.b[0] - o.a[0]) * t, cy: o.a[1] + (o.b[1] - o.a[1]) * t })));
  }
  async function blend(keys, from, to, ms = 700) {
    await anim(ms, (t) => { for (const k of keys) { nodes[k].x = from[k].x.map((v, d) => v + (to[k].x[d] - v) * t); nodes[k].mix = lerpMix(from[k].mix, to[k].mix, t); drawNode(k); } });
  }
  const allPairs = () => IDS.flatMap((k) => NB[k].map((j) => [j, k]));
  // 나 곁에 도착한 메시지 두 개 (① 단계의 끝 모습)
  const arrivals = () => [["A", "나"], ["B", "나"]].map(([from]) => { const [, , x2, y2] = seg(from, "나", gap + 6); return circle(flyG, x2, y2, 7, { fill: COL[from], stroke: C.bg, sw: 2 }); });
  return {
    async go(i, animate) {
      if (animate) {
        if (i === 1) { paint(0); ro.set(readHtml(1)); await send([["A", "나"], ["B", "나"]]); }
        if (i === 2) { // 도착한 메시지가 나에게 녹아들어요
          paint(1); ro.set(readHtml(2));
          const ds = arrivals(), p0 = ds.map((d) => [Number(d.getAttribute("cx")), Number(d.getAttribute("cy"))]);
          await anim(450, (t) => ds.forEach((d, k) => { set(d, { cx: p0[k][0] + (P.나[0] - p0[k][0]) * t, cy: p0[k][1] + (P.나[1] - p0[k][1]) * t }); d.style.opacity = String(1 - t); }));
        }
        if (i === 3) { paint(2); ro.set(readHtml(3)); await blend(["나"], stateOf(2), stateOf(3)); }
        if (i === 4) { // 나머지 노드도 같은 순간의 옛 값으로
          paint(3); nodes.나.sub.textContent = ""; ro.set(readHtml(4));
          const from = { ...stateOf(0), 나: stateOf(3).나 };
          await send(allPairs().filter(([, to]) => to !== "나"), 600); flyG.replaceChildren();
          await blend(IDS.filter((k) => k !== "나"), from, stateOf(4));
        }
        if (i === 5) { paint(4); for (const k of IDS) nodes[k].sub.textContent = ""; ro.set(readHtml(5)); await send(allPairs(), 650); flyG.replaceChildren(); await blend(IDS, stateOf(4), stateOf(5)); }
      }
      paint(i);
      if (i === 1) arrivals();
    },
  };
}

function mountGcn(stage, f) {
  const nar = !!f.narrow, Wd = nar ? 380 : 600;
  const s = svg(stage, Wd, H, "노드 2개짜리 그래프에서 GCN 한 층을 손으로 계산하는 그림");
  const P1 = nar ? [200, 100] : [190, 100], P2 = nar ? [322, 100] : [410, 100], mid = (P1[0] + P2[0]) / 2;
  let w = 0.5, stepNow = 0;
  // 선 · 자기 고리
  line(s, P1[0] + 30, P1[1], P2[0] - 30, P2[1], { color: C.ink, width: 2.2 });
  const loops = [P1, P2].map(([x, y]) => path(s, `M${x - 14},${y - 26} C${x - 40},${y - 82} ${x + 40},${y - 82} ${x + 14},${y - 26}`, { stroke: C.b, width: 2.2 }));
  const wE = text(s, mid, P1[1] - 16, "½", { size: 18, anchor: "middle", weight: 700, fill: C.a, cls: "fg-t halo" });
  const wL = [P1, P2].map(([x, y]) => text(s, x, y - 76, "½", { size: 18, anchor: "middle", weight: 700, fill: C.b, cls: "fg-t halo" }));
  const degT = [P1, P2].map(([x, y]) => text(s, x, y + 44, "", { size: 14, anchor: "middle", weight: 600, fill: C.sub }));
  [P1, P2].forEach(([x, y], i) => { circle(s, x, y, 28, { fill: C.bg, stroke: C.ink, sw: 2.2 }); text(s, x, y + 1, `${i + 1}`, { size: 20, anchor: "middle", weight: 700 }); });
  // 계산 표: 줄 = 단계, 칸 = 노드
  const rowsY = [184, 216, 248, 280], labels = ["h (입력)", "정규화 평균", "× W", "ReLU"];
  const band = rect(s, 8, 0, Wd - 16, 28, { r: 6, fill: C.hi });
  labels.forEach((l, i) => text(s, nar ? 12 : 24, rowsY[i], l, { size: 15, weight: 700, fill: C.sub }));
  line(s, 8, 164, Wd - 8, 164, { color: C.line });
  const cell = [0, 1].map((n) => rowsY.map((y) => text(s, [P1, P2][n][0], y, "", { size: 17, anchor: "middle", weight: 700, cls: "fg-t tab" })));
  const flyG = g(s);
  const ro = readout(f.controls());
  const dial = slider(f.controls(), { label: "W", min: -1, max: 1, step: 0.1, value: 0.5, fmt: (v) => fmt(v, 1).replace(/^-/, "−") }, (v) => { w = Math.round(v * 10) / 10; if (stepNow !== STEPS_GCN.length - 1) f.goto(STEPS_GCN.length - 1); else paint(stepNow); });

  const h = [2, 4];
  // 계산 (카드 식 그대로): Â = A + I, d = 행 합, Ŝ = D̂^−½ Â D̂^−½, 출력 = ReLU(Ŝ h W)
  const Ah = [[1, 1], [1, 1]], d = Ah.map((r) => r.reduce((a, b) => a + b, 0));
  const S_ = Ah.map((r, i) => r.map((v, j) => v / Math.sqrt(d[i] * d[j])));
  const agg = S_.map((r) => r.reduce((a, v, j) => a + v * h[j], 0));
  const sg = (v) => fmt(v, 2).replace(/^-/, "−");
  function readHtml(si) {
    const ww = sg(w), z = agg[0] * w, lines = [];
    if (si === 0) lines.push(`<div>h1 = [<b>2</b>], h2 = [<b>4</b>] · A = [[0, 1], [1, 0]] <span class="dim">(1 과 2 가 연결)</span></div>`, `<div>H' = σ(D̂<sup>−½</sup> Â D̂<sup>−½</sup> H W)</div>`);
    if (si >= 1) lines.push(`<div>Â = A + I = [[1, 1], [1, 1]] · degree(자기 포함) d1 = ${d[0]}, d2 = ${d[1]}</div>`);
    if (si >= 2) lines.push(`<div>D̂<sup>−½</sup> Â D̂<sup>−½</sup> = [[${n2(S_[0][0])}, ${n2(S_[0][1])}], [${n2(S_[1][0])}, ${n2(S_[1][1])}]] → 노드 1 = ½×2 + ½×4 = <b>${sg(agg[0])}</b>, 노드 2 = <b>${sg(agg[1])}</b></div>`);
    if (si >= 3) lines.push(`<div>× W (= ${ww}) → ${sg(agg[0])} × ${ww} = <b>${sg(z)}</b></div>`);
    if (si >= 4) lines.push(`<div>ReLU(${sg(z)}) = max(0, ${sg(z)}) = <b class="${z > 0 ? "c" : "b"}">${sg(Math.max(0, z))}</b>${w === 0.5 ? ` <span class="dim">— 카드 코드의 출력 [[1.5], [1.5]] 와 같아요</span>` : z < 0 ? ` <span class="dim">— 음수라서 0 으로 잘렸어요</span>` : ""}</div>`);
    return lines.join("");
  }
  function paint(si) {
    stepNow = si; flyG.replaceChildren();
    loops.forEach((l) => (l.style.display = si >= 1 ? "" : "none"));
    wL.forEach((t) => (t.style.display = si >= 2 ? "" : "none")); wE.style.display = si >= 2 ? "" : "none";
    degT.forEach((t, i) => (t.textContent = si >= 1 ? `degree ${d[i]}` : ""));
    const vals = [h, agg, agg.map((v) => v * w), agg.map((v) => Math.max(0, v * w))];
    for (let n = 0; n < 2; n++) for (let r = 0; r < 4; r++) {
      const on = r === 0 || si >= r + 1;
      cell[n][r].textContent = on ? sg(vals[r][n]) : "";
      set(cell[n][r], { fill: r === 3 && on ? (vals[3][n] > 0 ? C.c : C.b) : C.ink });
    }
    const row = si <= 1 ? 0 : si >= 5 ? 3 : si - 1;
    set(band, { y: rowsY[row] - 14 }); band.style.display = si === 1 ? "none" : "";
    ro.set(readHtml(si));
  }
  // 정규화 단계: 선과 자기 고리를 따라 값이 ½ 씩 흘러가요
  async function flow() {
    const dots = [
      { from: P2, to: P1, col: C.a }, { from: P1, to: P2, col: C.a },
      { from: P1, col: C.b, loop: loops[0] }, { from: P2, col: C.b, loop: loops[1] },
    ].map((o) => ({ ...o, d: circle(flyG, o.from[0], o.from[1], 7, { fill: o.col, stroke: C.bg, sw: 2 }) }));
    await anim(800, (t) => dots.forEach((o) => {
      if (o.loop) { const L = o.loop.getTotalLength(), p = o.loop.getPointAtLength(L * t); set(o.d, { cx: p.x, cy: p.y }); } // 자기 고리를 따라 한 바퀴
      else set(o.d, { cx: o.from[0] + (o.to[0] - o.from[0]) * t, cy: o.from[1] });
    }));
  }
  return {
    async go(i, animate) {
      if (animate && i === 2) { paint(1); ro.set(readHtml(2)); await flow(); }
      paint(i);
      if (i === 5) dial.set(w);
    },
  };
}
