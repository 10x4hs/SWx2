// 그림: IVF — k-means 로 칸을 나누고 몇 칸만 열어 봐요 (Vector & Graph 02 — 카드 5 · 6, recall 은 카드 3)
//   점 320개. Flat(전부 재기) → k-means 로 16칸 → 질문과 가까운 칸 nprobe 개만 열기 → 그 칸 안의 점만 재기 → 경계 너머 이웃을 놓침 → nprobe 를 올리면 되찾아요.
//   opts.mode = "recall" — 같은 그림으로 recall@10(Flat 정답 10개 중 ANN 이 찾은 수)만 설명해요 (카드 3).
//   점 · k-means · 질문 자리는 씨앗으로 정해져서 늘 같아요. 숫자(잰 점 수 · recall)는 전부 코드로 계산해요.
import { svg, el, g, text, line, circle, slider, choice, readout, anim, rng, gauss, C } from "./kit.js";

const W = 600, H = 400, PAD = 14, N = 320, NLIST = 16, K = 10;
const d2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
const nearest = (cs, p) => { let b = 0, bd = Infinity; cs.forEach((c, j) => { const d = d2(p, c); if (d < bd) { bd = d; b = j; } }); return b; };
const BOX = [[PAD, PAD], [W - PAD, PAD], [W - PAD, H - PAD], [PAD, H - PAD]];

// 반평면 자르기 — 다각형에서 nx·x + ny·y ≤ c 쪽만 남겨요
function clip(poly, nx, ny, c) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const P = poly[i], Q = poly[(i + 1) % poly.length];
    const dp = nx * P[0] + ny * P[1] - c, dq = nx * Q[0] + ny * Q[1] - c;
    if (dp <= 0) out.push(P);
    if ((dp < 0 && dq > 0) || (dp > 0 && dq < 0)) { const t = dp / (dp - dq); out.push([P[0] + (Q[0] - P[0]) * t, P[1] + (Q[1] - P[1]) * t]); }
  }
  return out;
}
// 보로노이 칸: 상자를 '다른 중심보다 이 중심에 더 가까운 쪽' 반평면으로 차례로 잘라요
function cellOf(i, cs) {
  let poly = BOX;
  const [ax, ay] = cs[i];
  for (let j = 0; j < cs.length && poly.length; j++) {
    if (j === i) continue;
    const [bx, by] = cs[j];
    poly = clip(poly, bx - ax, by - ay, (bx * bx + by * by - ax * ax - ay * ay) / 2);
  }
  return poly;
}
const polyD = (poly) => (poly.length ? "M" + poly.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join("L") + "Z" : "");

// 점 320개: 덩어리 몇 개 + 고르게 흩어진 점 (실제 임베딩도 주제별로 뭉쳐 있어요)
function makePoints() {
  const r = rng(23), pts = [];
  const blobs = Array.from({ length: 7 }, () => ({ x: 70 + r() * (W - 140), y: 60 + r() * (H - 120), s: 26 + r() * 30 }));
  for (let guard = 0; pts.length < N && guard < 40000; guard++) {
    const p = r() < 0.24 ? [PAD + 8 + r() * (W - 2 * PAD - 16), PAD + 8 + r() * (H - 2 * PAD - 16)]
      : (() => { const b = blobs[Math.floor(r() * blobs.length)]; return [b.x + gauss(r) * b.s, b.y + gauss(r) * b.s * 0.8]; })();
    if (p[0] < PAD + 8 || p[0] > W - PAD - 8 || p[1] < PAD + 8 || p[1] > H - PAD - 8) continue;
    if (pts.some((o) => d2(o, p) < 42)) continue; // 겹치지 않게
    pts.push(p);
  }
  return pts;
}
// k-means (k-means++ 로 시작) — 움직임 기록(hist)도 남겨서 2단계에서 중심이 자리를 찾아가는 걸 보여 줘요
function kmeans(pts, k, seed) {
  const r = rng(seed), cs = [pts[Math.floor(r() * pts.length)].slice()];
  while (cs.length < k) {
    const d = pts.map((p) => Math.min(...cs.map((c) => d2(p, c))));
    let t = r() * d.reduce((a, b) => a + b, 0), i = 0;
    while (i < d.length - 1 && t > d[i]) { t -= d[i]; i++; }
    cs.push(pts[i].slice());
  }
  const hist = [cs.map((c) => c.slice())];
  for (let it = 0; it < 40; it++) {
    const as = pts.map((p) => nearest(cs, p)), sum = cs.map(() => [0, 0, 0]);
    pts.forEach((p, i) => { const s = sum[as[i]]; s[0] += p[0]; s[1] += p[1]; s[2]++; });
    let moved = 0;
    cs.forEach((c, j) => { if (!sum[j][2]) return; const nx = sum[j][0] / sum[j][2], ny = sum[j][1] / sum[j][2]; moved = Math.max(moved, Math.hypot(nx - c[0], ny - c[1])); c[0] = nx; c[1] = ny; });
    hist.push(cs.map((c) => c.slice()));
    if (moved < 0.05) break;
  }
  return { cs, as: pts.map((p) => nearest(cs, p)), hist };
}
// 질문 하나로 nprobe 마다: 연 칸 · 잰 점(후보) · ANN 답 10개 · 맞힌 수
function search(q, pts, cs, as, pMax = cs.length) {
  const order = cs.map((c, j) => [j, d2(q, c)]).sort((a, b) => a[1] - b[1]).map((x) => x[0]);
  const byDist = pts.map((p, i) => [i, d2(q, p)]).sort((a, b) => a[1] - b[1]);
  const truth = byDist.slice(0, K).map((x) => x[0]);
  const at = [];
  for (let p = 1; p <= pMax; p++) {
    const open = new Set(order.slice(0, p));
    const cand = byDist.filter(([i]) => open.has(as[i])).map((x) => x[0]);
    const ann = cand.slice(0, K), hit = ann.filter((i) => truth.includes(i)).length;
    at.push({ p, open, cand, ann, hit });
  }
  return { order, truth, at };
}
// 보여 주기 좋은 질문 자리: nprobe 1 이면 진짜 이웃을 2~4개 놓치고, 2 면 다 찾고, 칸 경계와 가깝지만 경계 위는 아닌 곳
function pickQuery(pts, km) {
  let best = null;
  for (let x = 90; x <= W - 90; x += 9) for (let y = 70; y <= H - 70; y += 9) {
    const q = [x, y];
    if (pts.some((p) => d2(p, q) < 81)) continue;
    const R = search(q, pts, km.cs, km.as, 2), h1 = R.at[0].hit, h2 = R.at[1].hit;
    if (h1 < 6 || h1 > 8 || h2 < K) continue;
    const a = km.cs[R.order[0]];
    const edge = Math.min(...km.cs.filter((_, j) => j !== R.order[0]).map((b) => (d2(q, b) - d2(q, a)) / (2 * Math.sqrt(d2(a, b)))));
    if (edge < 14 || edge > 34) continue;
    const score = -Math.abs(h1 - 8) * 3 - Math.hypot(x - W / 2, y - H / 2) / 60 - Math.abs(edge - 22) / 8;
    if (!best || score > best.score) best = { q, score };
  }
  return best ? best.q : [W / 2, H / 2];
}

let DATA = null;
function data() {
  if (DATA) return DATA;
  const pts = makePoints(), km = kmeans(pts, NLIST, 5), q = pickQuery(pts, km);
  return (DATA = { pts, q, km16: km });
}
// nlist 마다 k-means 한 번 (질문은 그대로) — 마지막 단계에서 nlist 를 8 · 16 · 32 로 바꿔 볼 수 있어요
const MODELS = new Map();
function model(nl) {
  if (!MODELS.has(nl)) {
    const D = data(), km = nl === NLIST ? D.km16 : kmeans(D.pts, nl, 5), R = search(D.q, D.pts, km.cs, km.as);
    const pFix = (R.at.find((a) => a.hit === K) || R.at[R.at.length - 1]).p; // 진짜 이웃을 다 찾는 가장 작은 nprobe
    MODELS.set(nl, { nl, km, R, pFix, sizes: km.cs.map((_, j) => km.as.filter((a) => a === j).length) });
  }
  return MODELS.get(nl);
}

// 단계 — 겹(layer)을 켜고 끄는 표. probe: 연 칸 수 ("user" = 다이얼) · lines: 거리 잰 선 · rings: 고리 · ann: ANN 답 10개
function stepsFor(mode) {
  const M = model(NLIST), a1 = M.R.at[0], miss = K - a1.hit, n1 = a1.cand.length, pct = Math.round((n1 / N) * 100);
  if (mode === "recall") return [
    { cap: "먼저 Flat 으로 질문(주황 점)과 모든 점의 거리를 재서 진짜 가까운 10개(초록 고리)를 구해요. 이게 정답이에요.", lines: "all", rings: "truth", q: 1 },
    { cap: "같은 질문을 근사 검색(ANN)으로 찾아요. 여기서는 파란 칸 안의 점만 보고 가까운 10개(큰 파란 점)를 골랐어요.", cells: 1, probe: 1, ann: 1, q: 1 },
    { cap: `두 결과에 함께 든 것을 세요. 정답 10개 중 ${a1.hit}개가 겹쳐서 recall@10 = ${a1.hit}/10 = ${a1.hit / 10} 이에요. 빨간 고리가 놓친 정답이에요.`, cells: 1, probe: 1, ann: 1, rings: "hit", q: 1 },
    { cap: "더 넓게 보면(칸을 더 열면) 놓친 정답이 줄어 recall 이 올라가요. 이제 직접 열어 볼 칸 수를 바꿔 보세요.", cells: 1, probe: "user", ann: 1, rings: "hit", q: 1, free: 1 },
  ];
  return [
    { cap: `Flat 은 질문(주황 점)과 모든 점 ${N}개의 거리를 하나씩 다 재요. 그래서 가장 가까운 10개(초록 고리)를 늘 정확히 찾아요 — 이게 정답 기준이에요.`, lines: "all", rings: "truth", q: 1 },
    { cap: `IVF 는 미리 k-means 로 점들을 nlist = ${NLIST}칸으로 나눠 둬요. 칸마다 중심(검은 마름모)이 하나 있고, 점은 가장 가까운 중심의 칸에 들어가요.`, cells: 1, cent: 1, train: 1 },
    { cap: `질문이 오면 중심 ${NLIST}개와만 거리를 재서, 가장 가까운 칸 nprobe = 1개(파란 칸)만 열어요.`, cells: 1, cent: 1, probe: 1, lines: "cent", q: 1 },
    { cap: `그 칸 안의 점(파란 점)과만 거리를 재요. ${N}번 대신 ${n1}번이에요(전체의 ${pct}%).`, cells: 1, cent: 1, probe: 1, lines: "cand", q: 1, count: 1 },
    { cap: `그런데 진짜 이웃 중 ${miss}개(빨간 고리)는 경계 바로 너머 옆 칸에 있어서 놓쳤어요. recall@10 = ${a1.hit}/10 이에요.`, cells: 1, cent: 1, probe: 1, lines: "cand", rings: "hit", q: 1 },
    { cap: `nprobe 를 ${M.pFix}로 올리면 옆 칸까지 열어서 놓친 이웃을 찾아요(10/10). 이제 직접 nprobe 와 nlist 를 바꿔 보세요.`, cells: 1, cent: 1, probe: "user", lines: "cand", rings: "hit", q: 1, free: 1 },
  ];
}

export default {
  aspect: H / W,
  steps: (o) => stepsFor(o.mode).map((s) => s.cap),
  hint: "아래 다이얼을 움직여 보세요",
  mount(stage, f) {
    const mode = f.opts.mode === "recall" ? "recall" : "ivf", STEPS = stepsFor(mode), LAST = STEPS.length - 1;
    const { pts, q } = data();
    const s = svg(stage, W, H, "점 320개를 k-means 로 칸으로 나누고, 질문과 가까운 칸만 열어 보는 IVF 검색 그림");
    el(s, "rect", { x: PAD, y: PAD, width: W - 2 * PAD, height: H - 2 * PAD, fill: "none", stroke: C.line, "stroke-width": 1 });
    const cellG = g(s), openG = g(s), lineG = g(s), ptG = g(s), centG = g(s), ringG = g(s), qG = g(s);
    let cellP = [], cents = [];
    const dots = pts.map((p) => circle(ptG, p[0], p[1], 3.2, { fill: C.sub }));
    circle(qG, q[0], q[1], 7.5, { fill: C.b, stroke: C.bg, sw: 2.5 });
    // '질문' 글자는 진짜 이웃(고리)과 가장 덜 겹치는 쪽에
    const truth16 = model(NLIST).R.truth;
    const spots = [[14, -15, "start"], [-14, -15, "end"], [14, 17, "start"], [-14, 17, "end"], [0, -20, "middle"], [0, 23, "middle"]];
    const spot = spots.map(([dx, dy, an]) => {
      const cx = q[0] + dx + (an === "start" ? 16 : an === "end" ? -16 : 0), cy = q[1] + dy;
      const out = cx < PAD + 24 || cx > W - PAD - 24 || cy < PAD + 12 || cy > H - PAD - 12;
      return { dx, dy, an, score: out ? -1 : Math.min(...truth16.map((i) => Math.hypot(pts[i][0] - cx, pts[i][1] - cy))) };
    }).sort((a, b) => b.score - a.score)[0];
    text(qG, q[0] + spot.dx, q[1] + spot.dy, "질문", { size: 16, weight: 700, fill: C.b, anchor: spot.an, cls: "halo" });

    const ctl = f.controls(), ro = readout(ctl);
    let userP = model(NLIST).pFix, userNl = NLIST, maxP = NLIST, step = 0, gen = 0, prev = { open: new Set(), cand: new Set() };
    const toLast = () => { if (step !== LAST) f.goto(LAST); else { gen++; render(STEPS[LAST]); } };
    const nlC = mode === "recall" ? null : choice(ctl, [[8, "nlist 8"], [16, "16"], [32, "32"]].map(([k, l]) => [String(k), l]), String(NLIST), (k) => {
      userNl = Number(k); userP = Math.min(userP, userNl); toLast();
    }, "nlist — 칸 수");
    const sl = slider(ctl, { label: mode === "recall" ? "열어 볼 칸" : "nprobe", min: 1, max: NLIST, value: userP, fmt: (v) => (v === maxP ? `${v} (전부)` : String(v)) }, (v) => { userP = v; toLast(); });

    const diamond = (c, r = 6.5) => `M${c[0]},${c[1] - r}L${c[0] + r},${c[1]}L${c[0]},${c[1] + r}L${c[0] - r},${c[1]}Z`;
    // 칸 수가 바뀌면 칸 · 중심 모양을 새로 만들어요
    function ensure(nl) {
      if (cellP.length === nl) return;
      cellG.replaceChildren(); centG.replaceChildren();
      cellP = Array.from({ length: nl }, () => el(cellG, "path", { d: "", fill: "none", stroke: C.line, "stroke-width": 1.3, "stroke-linejoin": "round" }));
      cents = Array.from({ length: nl }, () => el(centG, "path", { d: "", fill: C.ink, stroke: C.bg, "stroke-width": 1.5 }));
    }
    function drawCells(cs) { ensure(cs.length); cs.forEach((c, j) => { cellP[j].setAttribute("d", polyD(cellOf(j, cs))); cents[j].setAttribute("d", diamond(c, cs.length > 20 ? 5.5 : 6.5)); }); }
    const pct = (n) => Math.round((n / N) * 100);
    const recallHtml = (hit) => `recall@10 = <b style="color:${hit === K ? "var(--fg-c)" : "var(--fg-no)"}">${hit}/10</b>`;
    const countRow = (p, nl, n) => `열어 본 칸 <b>${p}</b> / ${nl} · 거리를 잰 점 <b>${n}</b>개 <span class="dim">/ ${N}개 (${pct(n)}%) · 중심 ${nl}개는 따로</span>`;

    // 한 단계의 모습을 처음부터 다 그려요 (어느 단계에서 와도 같은 모습). cs: 2단계 움직임 중의 중심 자리
    function render(st, cs) {
      const M = model(st.free ? userNl : NLIST), R = M.R, nl = M.nl;
      const p = st.probe === "user" ? Math.min(userP, nl) : st.probe || 0, A = p ? R.at[p - 1] : null;
      cellG.style.display = st.cells ? "" : "none"; centG.style.display = st.cent ? "" : "none";
      qG.style.display = st.q ? "" : "none";
      drawCells(cs || M.km.cs);
      // 연 칸 (파란 칸) — 회색 칸 선 위에 그려서 파란 테두리가 보이게
      openG.replaceChildren();
      if (st.cells && A) for (const j of A.open) el(openG, "path", { d: polyD(cellOf(j, M.km.cs)), fill: C.aSoft, stroke: C.a, "stroke-width": 1.8, "stroke-linejoin": "round", "data-new": prev.open.has(`${nl}:${j}`) ? null : "1" });
      // 점 색: Flat = 전부 잰 점(파랑) · 칸을 열면 후보만 파랑, 나머지는 흐리게
      const cand = A ? new Set(A.cand) : null, measured = st.lines === "all" || st.lines === "cand" || st.ann;
      dots.forEach((d, i) => {
        const inC = cand?.has(i);
        d.style.fill = st.lines === "all" || (cand && measured && inC) ? C.a : C.sub;
        d.style.opacity = cand && measured && !inC ? "0.4" : "1";
        d.setAttribute("r", cand && inC && measured ? 3.5 : 3.2);
      });
      // 거리 잰 선
      lineG.replaceChildren();
      if (st.lines === "all") pts.forEach((pt) => (line(lineG, q[0], q[1], pt[0], pt[1], { color: C.a, width: 0.7 }).style.opacity = "0.2"));
      if (st.lines === "cand" && A) A.cand.forEach((i) => { const l = line(lineG, q[0], q[1], pts[i][0], pts[i][1], { color: C.a, width: 1 }); l.style.opacity = "0.5"; if (!prev.cand.has(i)) l.dataset.new = "1"; });
      if (st.lines === "cent") M.km.cs.forEach((c) => (line(lineG, q[0], q[1], c[0], c[1], { color: C.b, width: 1.3, dash: "4 4" }).style.opacity = "0.85"));
      // ANN 이 고른 10개 (recall 모드)
      if (st.ann && A) A.ann.forEach((i) => circle(lineG, pts[i][0], pts[i][1], 5.2, { fill: C.a, stroke: C.bg, sw: 1.5 }));
      // 고리: 정답(초록) · 놓친 정답(빨강)
      ringG.replaceChildren();
      if (st.rings) R.truth.forEach((i) => {
        const ok = st.rings === "truth" || (A && A.ann.includes(i));
        el(ringG, "circle", { cx: pts[i][0], cy: pts[i][1], r: 7.5, fill: "none", stroke: ok ? C.c : C.no, "stroke-width": 2.2 });
      });
      // 계산 칸 (늘 두 줄 — 단계를 넘겨도 높이가 그대로)
      const rows = [];
      if (!st.cells) rows.push(`Flat: 거리를 잰 점 <b>${N}</b>개 <span class="dim">/ ${N}개 (100%)</span>`, `${recallHtml(K)} <span class="dim">· Flat 결과가 곧 정답(초록 고리)</span>`);
      else if (st.train) rows.push(`nlist = <b>${nl}</b>칸 · 한 칸에 평균 <b>${N / nl}</b>개 <span class="dim">(${N} ÷ ${nl})</span>`, `<span class="dim">칸마다 점 ${Math.min(...M.sizes)} ~ ${Math.max(...M.sizes)}개 · 학습은 질문이 오기 전에 미리 해 둬요</span>`);
      else if (st.lines === "cent") rows.push(`중심 <b>${nl}</b>개와 거리 비교 → 가장 가까운 칸 <b>1</b>개를 열어요 <span class="dim">(nprobe = 1)</span>`, `<span class="dim">아직 칸 안의 점과는 거리를 재지 않았어요</span>`);
      else {
        rows.push(countRow(p, nl, A.cand.length));
        if (mode === "recall" && st.rings) rows.push(`정답 10개 ∩ ANN 10개 = <b>${A.hit}</b>개 → ${recallHtml(A.hit)} = <b>${A.hit / 10}</b>${A.hit < K ? ` <span class="dim">· 빨간 고리 = 놓친 정답</span>` : ""}`);
        else if (st.rings) rows.push(`${recallHtml(A.hit)} <span class="dim">· ${p === nl ? "칸을 다 열면 Flat 과 같아요" : A.hit < K ? "빨간 고리 = 놓친 진짜 이웃" : "진짜 이웃을 다 찾았어요"}</span>`);
        else rows.push(mode === "recall" ? `<span class="dim">ANN 결과 10개 = 파란 칸 안에서 가장 가까운 10개</span>` : `<span class="dim">recall 은 다음 단계에서 Flat 정답과 비교해요</span>`);
      }
      ro.set(rows.map((x) => `<div>${x}</div>`).join(""));
      prev = { open: new Set(st.cells && A ? [...A.open].map((j) => `${nl}:${j}`) : []), cand: st.lines === "cand" && A ? new Set(A.cand) : new Set() };
      // 조절 칸: 칸이 없는 단계에선 잠가요 (Flat · 학습)
      maxP = nl; sl.input.max = String(nl); sl.input.disabled = !st.probe; sl.el.style.opacity = st.probe ? "" : "0.45";
      sl.set(st.probe ? p : 1);
      if (!st.probe) sl.el.querySelector("output").textContent = "—";
      if (nlC) { nlC.set(String(nl)); nlC.el.style.opacity = st.probe ? "" : "0.45"; nlC.el.querySelectorAll("button").forEach((b) => (b.disabled = !st.probe)); }
    }
    const fade = (nodes, ms) => {
      const target = nodes.map((n) => n.style.opacity || "1");
      nodes.forEach((n) => (n.style.opacity = "0"));
      return anim(ms, (t) => nodes.forEach((n, k) => (n.style.opacity = String(t * Number(target[k])))));
    };

    return {
      async go(i, animate) {
        const my = ++gen, st = STEPS[i];
        step = i;
        if (!animate) { render(st); return; }
        // 2단계: k-means 가 중심을 옮기며 칸이 자리를 잡아요 (기록을 차례로 이어 그려요)
        if (st.train) {
          const Hs = model(NLIST).km.hist, F = Hs.length - 1;
          render(st, Hs[0]);
          await anim(Math.min(2200, 260 + F * 150), (t) => {
            if (my !== gen) return;
            const u = Math.max(0, Math.min(1, t)) * F, a = Math.min(F - 1, Math.floor(u)), fr = u - a; // 첫 장면에 t 가 아주 조금 음수일 수 있어요
            drawCells(Hs[a].map((c, j) => [c[0] + (Hs[a + 1][j][0] - c[0]) * fr, c[1] + (Hs[a + 1][j][1] - c[1]) * fr]));
          }, (t) => t);
          if (my === gen) render(st);
          return;
        }
        render(st);
        // 새로 생긴 선 · 칸 · 고리가 차례로 나타나요
        const lines = [...lineG.children].filter((n) => n.tagName === "line"), rings = [...ringG.children], opens = [...openG.children];
        if (st.lines === "all") {
          // Flat: 저장된 순서대로 하나씩 재요
          const o = lines.map((n) => n.style.opacity);
          lines.forEach((n) => (n.style.opacity = "0")); rings.forEach((n) => (n.style.opacity = "0"));
          await anim(1100, (t) => { if (my !== gen) return; const k = Math.floor(t * lines.length); for (let j = 0; j < k; j++) lines[j].style.opacity = o[j]; }, (t) => t);
          if (my !== gen) return;
          lines.forEach((n, j) => (n.style.opacity = o[j]));
          await fade(rings, 350);
          return;
        }
        if (st.lines === "cent") { await fade(lines, 450); if (my === gen) await fade(opens, 400); return; }
        if (st.count) {
          // 잰 점 수가 320 → n 으로 줄어드는 걸 숫자로도
          const n = model(NLIST).R.at[0].cand.length, row = ro.el.firstElementChild, p0 = fade(lines, 700);
          await anim(700, (t) => { if (my === gen && row) row.innerHTML = countRow(1, NLIST, Math.round(N + (n - N) * t)); });
          await p0; return;
        }
        if (st.free) { await Promise.all([fade(opens.filter((n) => n.dataset.new), 450), fade(lines.filter((n) => n.dataset.new), 450)]); return; }
        if (st.rings) { await fade(rings, 450); return; }
        if (st.ann) await fade(opens, 400);
      },
      destroy() { gen++; },
    };
  },
};
