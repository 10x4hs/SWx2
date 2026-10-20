// 그림: 곱 양자화(PQ) — 벡터를 조각내 번호로 바꿔요 (Vector & Graph 02 — 카드 13) · opts.mode = "ivfpq" 면 잔차 PQ (카드 14) · "sq" 면 스칼라 · 이진 양자화 (카드 15)
//   PQ: 숫자 8개(float32 = 32바이트) → 2개씩 4조각 → 조각마다 대표 8개(코드북 · 실제는 256개) 중 가장 가까운 번호 → 번호 4개 = 4바이트.
//       검색: 질문과 대표들의 거리²를 조각별 표로 미리 계산 → 저장된 번호로 표를 4번 찾아 더해요. 마지막 단계에서 파란 점을 끌어요.
//   SQ: 카드 퀴즈의 [0.3, −0.2, 0.7, −0.1] 을 float32 → float16 → int8 → 1비트로. 오차와 768차원 크기(3,072 · 1,536 · 768 · 96바이트)를 같이 보여 줘요.
import { svg, el, g, text, line, circle, rect, path, readout, drag, anim, arrowHead, rng, gauss, C } from "./kit.js";

const W = 600, H = 440, WN = 360, HN = 470; // 넓은 칸 · 좁은 칸(폰) 판 크기
const d2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
const near = (cs, p) => cs.reduce((b, c, j) => (d2(p, c) < d2(p, cs[b]) ? j : b), 0);
const r2 = (x) => Math.round(x * 100) / 100;
const fx = (x, d = 2) => { const s = Math.abs(x).toFixed(d); return (x < 0 && Number(s) !== 0 ? "−" : "") + s; }; // 화면용 숫자 (진짜 빼기 기호)

// ===================== PQ =====================
const KC = 8, PS = 132, PY = 92, KS = 52; // 조각마다 대표 8개 · 칸 크기 · 칸 위치 · 1.0 = 52
const PX = (j) => 21 + j * 142;
const toP = (j, v) => [PX(j) + PS / 2 + v[0] * KS, PY + PS / 2 - v[1] * KS];

// 2차원 k-means (k-means++ 로 시작)
function kmeans2(pts, k, r) {
  const cs = [pts[Math.floor(r() * pts.length)].slice()];
  while (cs.length < k) {
    const d = pts.map((p) => Math.min(...cs.map((c) => d2(p, c))));
    let t = r() * d.reduce((a, b) => a + b, 0), i = 0;
    while (i < d.length - 1 && t > d[i]) { t -= d[i]; i++; }
    cs.push(pts[i].slice());
  }
  for (let it = 0; it < 30; it++) {
    const sum = cs.map(() => [0, 0, 0]);
    pts.forEach((p) => { const b = near(cs, p); sum[b][0] += p[0]; sum[b][1] += p[1]; sum[b][2]++; });
    cs.forEach((c, j) => { if (sum[j][2]) { c[0] = sum[j][0] / sum[j][2]; c[1] = sum[j][1] / sum[j][2]; } });
  }
  return cs;
}
// 조각 하나 근처의 점 (가장 가까운 대표가 분명하게)
function nearPoint(r, cs, rmin, rmax, avoid) {
  for (let guard = 0; guard < 800; guard++) {
    const ci = Math.floor(r() * KC); if (ci === avoid) continue;
    const a = r() * 2 * Math.PI, rad = rmin + r() * (rmax - rmin);
    const p = [r2(cs[ci][0] + Math.cos(a) * rad), r2(cs[ci][1] + Math.sin(a) * rad)];
    if (Math.abs(p[0]) > 1.05 || Math.abs(p[1]) > 1.05) continue;
    const ds = cs.map((c) => Math.sqrt(d2(p, c))).sort((x, y) => x - y);
    if (near(cs, p) !== ci || ds[1] - ds[0] < 0.1) continue;
    return p;
  }
  return [0, 0];
}
let PQD = null;
function pqData() {
  if (PQD) return PQD;
  const r = rng(77), books = [];
  for (let j = 0; j < 4; j++) {
    const centers = [];
    for (let guard = 0; centers.length < KC && guard < 5000; guard++) {
      const c = [(r() * 2 - 1) * 0.82, (r() * 2 - 1) * 0.82];
      if (centers.every((o) => Math.sqrt(d2(o, c)) > 0.46)) centers.push(c);
    }
    const samples = [];
    centers.forEach((c) => { for (let i = 0; i < 24; i++) samples.push([c[0] + gauss(r) * 0.12, c[1] + gauss(r) * 0.12]); });
    books.push({ samples, cents: kmeans2(samples, KC, r) });
  }
  const rv = rng(91), v = books.map((b) => nearPoint(rv, b.cents, 0.15, 0.24));
  const codes = v.map((p, j) => near(books[j].cents, p));
  const rq = rng(93), q = books.map((b, j) => nearPoint(rq, b.cents, 0.08, 0.3, codes[j]));
  return (PQD = { books, v, q, codes });
}
// 지금 벡터 v 로 계산: 번호 · 조각별 표 · 표로 찾은 거리² · 진짜 거리² · 되돌린 오차
function pqCalc(D, v) {
  const codes = v.map((p, j) => near(D.books[j].cents, p));
  const tabs = D.q.map((qj, j) => D.books[j].cents.map((c) => d2(qj, c)));
  const look = codes.map((c, j) => tabs[j][c]);
  const approx = look.reduce((a, b) => a + b, 0), exact = v.reduce((a, p, j) => a + d2(p, D.q[j]), 0);
  const err = Math.sqrt(v.reduce((a, p, j) => a + d2(p, D.books[j].cents[codes[j]]), 0));
  return { codes, tabs, look, approx, exact, err };
}
function pqSteps() {
  const D = pqData(), A = pqCalc(D, D.v);
  return [
    { cap: "벡터 하나 = 숫자 8개(float32 라서 32바이트)예요. PQ 는 이걸 2개씩 4조각으로 나누고, 조각 하나는 평면 위의 점 하나(파란 점)로 그려요." },
    { cap: "조각마다 따로 대표 8개(코드북)를 k-means 로 미리 배워 둬요(실제로는 256개). 회색 점이 배울 때 쓴 샘플이에요.", book: 1, train: 1 },
    { cap: `조각마다 가장 가까운 대표의 번호만 남겨요. 이 벡터는 번호 [${A.codes.join(", ")}] 가 돼요.`, book: 1, code: 1 },
    { cap: "번호 하나는 1바이트(대표 256개까지)라서 32바이트가 4바이트로 8배 작아져요. 카드의 768차원은 3,072바이트 → 96바이트(32배)예요.", book: 1, code: 1, mem: 1 },
    { cap: "질문(주황 점)과 대표들의 거리²를 조각마다 표(아래 막대)로 미리 계산해 둬요. 그러면 거리는 저장된 번호로 표를 4번 찾아 더하기만 하면 돼요.", book: 1, code: 1, q: 1 },
    { cap: "이제 직접 파란 점을 끌어 보세요. 가장 가까운 대표가 바뀌면 번호와 표에서 찾는 칸이 같이 바뀌어요.", book: 1, code: 1, q: 1, free: 1 },
  ];
}

function mountPQ(stage, f) {
  const STEPS = pqSteps(), LAST = STEPS.length - 1, D = pqData(), NAR = !!f.narrow;
  let v = D.v.map((p) => p.slice()), step = 0, gen = 0;
  // 판 배치: 넓으면 위에 숫자 8칸 + 칸 4개 한 줄 · 좁으면(폰) 칸 2 × 2 (조각 이름 옆에 숫자 두 개, 칸 아래에 번호 · 표)
  const L = NAR
    ? { W: WN, H: HN, ps: 130, ks: 54, px: (j) => 27 + (j % 2) * 176, py: (j) => 24 + (j >> 1) * 208 }
    : { W, H, ps: PS, ks: KS, px: PX, py: () => PY };
  const toP = (j, p) => [L.px(j) + L.ps / 2 + p[0] * L.ks, L.py(j) + L.ps / 2 - p[1] * L.ks];
  const s = svg(stage, L.W, L.H, "숫자 8개짜리 벡터를 4조각으로 나눠 조각마다 가장 가까운 대표 번호로 바꾸는 곱 양자화 그림");
  // 원본 숫자: 넓으면 위에 8칸 + 조각 괄호 · 좁으면 칸마다 이름 줄 '조각 1 (0.97, −0.70)'
  const cellT = [], labT = [];
  if (!NAR) {
    const top = g(s);
    text(top, 21, 11, "원본 벡터 — float32 숫자 8개 = 32바이트", { size: 14, fill: C.sub, weight: 600 });
    for (let j = 0; j < 4; j++) {
      for (let c = 0; c < 2; c++) {
        rect(top, PX(j) + c * 66 + 1, 22, 64, 32, { r: 4, fill: C.bg, stroke: C.line, sw: 1.2 });
        cellT.push(text(top, PX(j) + c * 66 + 33, 38.5, "", { size: 15, anchor: "middle", mono: 1, cls: "tab" }));
      }
      path(top, `M${PX(j) + 3},58L${PX(j) + 3},63L${PX(j) + PS - 3},63L${PX(j) + PS - 3},58`, { stroke: C.sub, width: 1.2 });
      text(top, PX(j) + PS / 2, 77, `조각 ${j + 1}`, { size: 14, anchor: "middle", fill: C.sub, weight: 600 });
    }
  } else for (let j = 0; j < 4; j++) {
    const t = text(s, L.px(j) - 17, L.py(j) - 11, `조각 ${j + 1}`, { size: 14, weight: 700, fill: C.sub, cls: "tab" });
    const ts = el(t, "tspan", { dx: 6, "font-weight": 600, fill: C.ink }, ""); ts.style.fontFamily = "var(--fg-mono)";
    labT.push(ts);
  }
  // 칸(평면) 4개: 샘플 · 대표 · 연결선 · 질문 · 파란 점
  const P = [0, 1, 2, 3].map((j) => {
    const G = g(s), x0 = L.px(j), y0 = L.py(j), c0 = toP(j, [0, 0]);
    rect(G, x0, y0, L.ps, L.ps, { r: 6, fill: "none", stroke: C.line, sw: 1.2 });
    line(G, x0 + 6, c0[1], x0 + L.ps - 6, c0[1], { color: C.grid }); line(G, c0[0], y0 + 6, c0[0], y0 + L.ps - 6, { color: C.grid });
    const sampG = g(G); D.books[j].samples.forEach((p) => { const [x, y] = toP(j, p); circle(sampG, x, y, 1.6, { fill: C.mute }); });
    const qLineG = g(G), linkG = g(G), centG = g(G), qG = g(G), vG = g(G);
    D.books[j].cents.forEach((c, k) => {
      const [x, y] = toP(j, c);
      circle(centG, x, y, 4.3, { fill: C.ink });
      const dx = c[0] >= 0 ? 7 : -7; // 번호는 칸 가운데에서 먼 쪽에
      text(centG, x + dx, y - 9, String(k), { size: 14, weight: 600, fill: C.sub, anchor: dx > 0 ? "start" : "end", cls: "halo" });
    });
    const ring = el(linkG, "circle", { r: 8.5, fill: "none", stroke: C.a, "stroke-width": 2 });
    const link = line(linkG, 0, 0, 0, 0, { color: C.a, width: 2 });
    const qDot = circle(qG, 0, 0, 5.5, { fill: C.b, stroke: C.bg, sw: 2 });
    const hit = circle(vG, 0, 0, 15, { fill: "transparent" }), dot = circle(vG, 0, 0, 5.8, { fill: C.a, stroke: C.bg, sw: 2 });
    dot.setAttribute("pointer-events", "none"); // 보이는 점이 손잡이(투명 원)를 가리지 않게
    // 번호 칸 (칸 아래 — 좁으면 왼쪽에 작게, 오른쪽엔 거리 표)
    const codeG = g(s), cb = NAR ? { x: x0 - 17, y: y0 + L.ps + 10, w: 44, h: 28 } : { x: x0 + L.ps / 2 - 30, y: 236, w: 60, h: 30 };
    rect(codeG, cb.x, cb.y, cb.w, cb.h, { r: 6, fill: C.aSoft, stroke: C.a, sw: 1.5 });
    const codeT = text(codeG, cb.x + cb.w / 2, cb.y + cb.h / 2 + 0.5, "", { size: 16, weight: 700, fill: C.a, anchor: "middle", cls: "tab" });
    return { G, sampG, qLineG, linkG, centG, qG, vG, ring, link, qDot, hit, dot, codeG, codeT };
  });
  // 아래 1: 메모리 (바이트 하나 = 작은 칸 하나) — 원본 줄은 처음부터, PQ 줄은 4단계부터
  const memG = g(s), memRows = [], memRowG = [];
  const M = NAR ? { y0: 426, dy: 22, h: 16, lx: 10, cx: 52, step: 8, w: 6, size: 14 } : { y0: 300, dy: 44, h: 20, lx: 21, cx: 96, step: 12, w: 10, size: 15 };
  [["원본", 32, C.sub, "32바이트"], [NAR ? "PQ" : "PQ 코드", 4, C.a, "4바이트 (번호 4개)"]].forEach(([lab, n, col, note], r) => {
    const y = M.y0 + r * M.dy, row = g(memG);
    text(row, M.lx, y + M.h / 2, lab, { size: M.size, weight: 700, fill: r ? C.a : C.ink });
    const cells = Array.from({ length: n }, (_, k) => rect(row, M.cx + k * M.step, y, M.w, M.h, { r: 2, fill: col }));
    if (!r) cells.forEach((c) => (c.style.opacity = "0.55"));
    text(row, M.cx + n * M.step + 6, y + M.h / 2, note, { size: 14, fill: C.sub, cls: "tab" });
    memRows.push(cells); memRowG.push(row);
  });
  // 아래 2: 조각별 거리 표 (막대 8개씩) — 넓으면 아래 한 줄, 좁으면 칸마다 번호 칸 오른쪽
  const tabG = g(s);
  const T = NAR ? { bx: (j) => L.px(j) + 35, step: 14, w: 11, base: (j) => L.py(j) + L.ps + 40, bh: 26 } : { bx: (j) => PX(j) + 3, step: 16, w: 13, base: () => 404, bh: 74 };
  if (!NAR) {
    text(tabG, 21, 290, "질문과 대표 8개의 거리² — 검색 전에 조각마다 미리 계산한 표", { size: 14, fill: C.sub, weight: 600 });
    line(tabG, 21, 404, W - 21, 404, { color: C.line });
    [1, 2, 3].forEach((j) => text(tabG, PX(j) - 5, 378, "+", { size: 20, weight: 700, fill: C.sub, anchor: "middle" }));
  }
  const maxT = Math.max(...D.q.map((qj, j) => Math.max(...D.books[j].cents.map((c) => d2(qj, c)))));
  const bars = [0, 1, 2, 3].map((j) => {
    const base = T.base(j);
    if (NAR) line(tabG, T.bx(j) - 2, base, T.bx(j) + 8 * T.step, base, { color: C.line });
    return D.books[j].cents.map((_, k) => {
      const x = T.bx(j) + k * T.step;
      text(tabG, x + T.w / 2, base + 12, String(k), { size: 14, fill: C.sub, anchor: "middle", weight: 600 });
      const b = rect(tabG, x, base, T.w, 0, { r: 2, fill: C.b }); b.dataset.base = base;
      return b;
    });
  });
  const lookT = [0, 1, 2, 3].map(() => text(tabG, 0, 0, "", { size: 14, weight: 700, fill: C.a, anchor: "middle", cls: "halo tab" }));

  const ro = readout(f.controls());

  // 한 단계의 모습을 처음부터 다 그려요
  function render(st) {
    const A = pqCalc(D, v);
    // 멈춘 움직임이 남긴 흐림을 지워요 (단계를 빨리 넘겨도 늘 같은 모습)
    P.forEach((p) => [p.sampG, p.centG, p.codeG, p.qG, p.qLineG, p.linkG].forEach((e) => (e.style.opacity = "")));
    memRows[1].forEach((c) => (c.style.opacity = ""));
    v.forEach((p, j) => { if (NAR) labT[j].textContent = `(${fx(p[0])}, ${fx(p[1])})`; else { cellT[2 * j].textContent = fx(p[0]); cellT[2 * j + 1].textContent = fx(p[1]); } });
    P.forEach((p, j) => {
      const [x, y] = toP(j, v[j]), c = toP(j, D.books[j].cents[A.codes[j]]), q = toP(j, D.q[j]);
      p.hit.setAttribute("cx", x); p.hit.setAttribute("cy", y); p.dot.setAttribute("cx", x); p.dot.setAttribute("cy", y);
      p.hit.setAttribute("aria-valuetext", `조각 ${j + 1}: (${fx(v[j][0])}, ${fx(v[j][1])}) → ${A.codes[j]}번`);
      p.ring.setAttribute("cx", c[0]); p.ring.setAttribute("cy", c[1]);
      p.link.setAttribute("x1", x); p.link.setAttribute("y1", y); p.link.setAttribute("x2", c[0]); p.link.setAttribute("y2", c[1]);
      p.qDot.setAttribute("cx", q[0]); p.qDot.setAttribute("cy", q[1]);
      p.qLineG.replaceChildren();
      if (st.q) D.books[j].cents.forEach((cc) => { const [a, b] = toP(j, cc); line(p.qLineG, q[0], q[1], a, b, { color: C.b, width: 1, dash: "3 3" }).style.opacity = "0.7"; });
      p.sampG.style.display = st.train ? "" : "none";
      p.centG.style.display = st.book ? "" : "none";
      p.linkG.style.display = st.code ? "" : "none";
      p.qG.style.display = st.q ? "" : "none";
      p.codeG.style.display = st.code ? "" : "none";
      p.codeT.textContent = `${A.codes[j]}번`;
      p.hit.style.cursor = st.free ? "grab" : "default";
    });
    memG.style.display = st.q ? "none" : ""; memRowG[1].style.display = st.mem ? "" : "none";
    tabG.style.display = st.q ? "" : "none";
    bars.forEach((bs, j) => bs.forEach((b, k) => {
      const base = Number(b.dataset.base), h = Math.max(2, (A.tabs[j][k] / maxT) * T.bh), mine = k === A.codes[j];
      b.setAttribute("y", base - h); b.setAttribute("height", h);
      b.style.fill = mine ? C.a : C.b; b.style.opacity = mine ? "1" : "0.32";
      if (mine) { lookT[j].setAttribute("x", T.bx(j) + k * T.step + T.w / 2); lookT[j].setAttribute("y", base - h - (NAR ? 8 : 10)); lookT[j].textContent = fx(A.tabs[j][k]); }
    }));
    // 계산 칸 (늘 두 줄)
    const codes = `<b class="a">[${A.codes.join(", ")}]</b>`;
    const rows = !st.book ? [`숫자 8개 × 4바이트(float32) = <b>32바이트</b> · 2개씩 4조각`, `<span class="dim">카드의 실제 크기: 768차원 = 768 × 4바이트 = 3,072바이트</span>`]
      : st.train ? [`조각마다 대표 <b>${KC}</b>개 <span class="dim">— 그림용이에요. 실제 PQ 는 256개라서 번호 하나가 1바이트(8비트)예요</span>`, `<span class="dim">회색 = k-means 를 배울 때 쓴 샘플 · 검은 점 = 대표(번호 0 ~ ${KC - 1})</span>`]
      : st.mem ? [`32바이트 → <b class="a">4바이트</b> <span class="dim">(8배 작게)</span>`, `카드: 768차원 3,072바이트 → 96조각 × 1바이트 = <b>96바이트</b> <span class="dim">(32배 작게)</span>`]
      : st.q ? [`표에서 찾은 거리² = ${A.look.map((x) => fx(x)).join(" + ")} = <b class="a">${fx(A.approx)}</b>`, `진짜 거리² = <b>${fx(A.exact)}</b> <span class="dim">· 더하기 4번이면 끝나지만, 대표로 바꾼 만큼 조금 틀려요</span>`]
      : [`번호 ${codes} <span class="dim">· 조각마다 가장 가까운 대표</span>`, `<span class="dim">파란 선 = 대표로 바꿀 때 생기는 오차 · 되돌린 벡터와 원본의 거리 ${fx(A.err)}</span>`];
    ro.set(rows.map((x) => `<div>${x}</div>`).join(""));
  }
  // 파란 점 끌기 (마지막 단계)
  P.forEach((p, j) => drag(s, p.hit, (x, y) => {
    const cl = (u) => r2(Math.max(-1.1, Math.min(1.1, u)));
    const nv = [cl((x - L.px(j) - L.ps / 2) / L.ks), cl((L.py(j) + L.ps / 2 - y) / L.ks)];
    if (nv[0] === v[j][0] && nv[1] === v[j][1]) return;
    if (step !== LAST) { v = D.v.map((q) => q.slice()); v[j] = nv; f.goto(LAST); return; }
    v[j] = nv; gen++; render(STEPS[LAST]);
  }, { get: () => toP(j, v[j]), step: L.ks * 0.05, label: `조각 ${j + 1} 의 파란 점 — 화살표 키로 움직여요` }));

  return {
    async go(i, animate) {
      const my = ++gen, st = STEPS[i];
      step = i;
      if (!st.free) v = D.v.map((p) => p.slice()); // 설명 단계는 늘 같은 벡터로
      render(st);
      if (!animate) return;
      const fade = (nodes, ms) => { nodes.forEach((n) => (n.style.opacity = "0")); return anim(ms, (t) => { if (my === gen) nodes.forEach((n) => (n.style.opacity = String(t))); }); };
      if (st.train) { await fade(P.map((p) => p.sampG), 450); if (my === gen) await fade(P.map((p) => p.centG), 400); return; }
      if (st.code && !st.mem && !st.q) {
        // 파란 점에서 가장 가까운 대표로 선이 뻗고, 번호 칸이 나타나요
        const A = pqCalc(D, v);
        P.forEach((p) => (p.codeG.style.opacity = "0"));
        await anim(500, (t) => {
          if (my !== gen) return;
          P.forEach((p, j) => { const [x, y] = toP(j, v[j]), c = toP(j, D.books[j].cents[A.codes[j]]); p.link.setAttribute("x2", x + (c[0] - x) * t); p.link.setAttribute("y2", y + (c[1] - y) * t); });
        });
        if (my === gen) await fade(P.map((p) => p.codeG), 350);
        return;
      }
      if (st.mem) {
        // PQ 줄의 바이트 칸 4개가 하나씩 생겨요
        const cells = memRows[1];
        cells.forEach((c) => (c.style.opacity = "0"));
        await anim(600, (t) => { if (my === gen) cells.forEach((c, k) => (c.style.opacity = String(Math.min(1, Math.max(0, t * 4 - k))))); });
        return;
      }
      if (st.q && !st.free) {
        await fade(P.flatMap((p) => [p.qG, p.qLineG]), 400);
        if (my !== gen) return;
        const all = bars.flat(), hs = all.map((b) => Number(b.getAttribute("height")));
        await anim(600, (t) => { if (my === gen) all.forEach((b, k) => { const h = hs[k] * Math.max(0, t); b.setAttribute("height", h); b.setAttribute("y", Number(b.dataset.base) - h); }); });
        if (my === gen) render(st);
      }
    },
    destroy() { gen++; },
  };
}

// ===================== SQ (스칼라 · 이진 양자화) =====================
const SV = [0.3, -0.2, 0.7, -0.1], OTHER = [0.4, 0.1, 0.5, -0.3]; // 카드 퀴즈의 벡터 · 해밍 거리 비교용 다른 벡터
const BX = [92, 182, 272, 362], BW = 52, Y0 = 160, SC = 150; // 막대 가운데 · 너비 · 0 선 · 1.0 = 150
// float16 으로 반올림 (지원하면 Math.f16round)
const f16 = Math.f16round || ((x) => { if (!x) return 0; const a = Math.abs(x), e = Math.max(-14, Math.floor(Math.log2(a))), q = 2 ** (e - 10); return Math.sign(x) * Math.round(a / q) * q; });
const AMAX = Math.max(...SV.map(Math.abs)), STEP8 = AMAX / 127; // int8: 가장 큰 크기를 127 로
const Q8 = SV.map((x) => Math.round(x / STEP8)), DQ8 = Q8.map((k) => k * STEP8);
const BITS = SV.map((x) => (x > 0 ? 1 : 0)), OBITS = OTHER.map((x) => (x > 0 ? 1 : 0));
const maxErr = (a) => Math.max(...SV.map((x, i) => Math.abs(x - a[i])));
const E16 = maxErr(SV.map(f16)), E8 = maxErr(DQ8);
const sig = (x) => { const e = Math.floor(Math.log10(x)); return Number(x.toPrecision(1)).toFixed(Math.max(0, -e)); }; // 오차를 한 자리 유효숫자로
const MEM = [["float32", 3072, "원본"], ["float16", 1536, "1/2"], ["int8", 768, "1/4"], ["1비트", 96, "1/32"]];

function sqSteps() {
  return [
    { cap: "카드의 벡터 [0.3, −0.2, 0.7, −0.1] 을 막대로 그렸어요. float32 는 숫자 하나에 4바이트라서, 768차원이면 3,072바이트예요.", fmt: 0 },
    { cap: `float16 은 숫자 하나에 2바이트 — 절반이에요. 막대는 거의 그대로예요(가장 큰 오차 약 ${sig(E16)}).`, fmt: 1 },
    { cap: `int8 은 1바이트(1/4)예요. 가장 큰 값 0.7 을 127 로 맞추고 나머지를 비율대로 정수로 반올림해서(0.3 → ${Q8[0]}), 확대하면 막대 끝이 눈금으로 조금 옮겨져요.`, fmt: 2 },
    { cap: `1비트(이진)는 부호만 남겨요: 양수는 1, 음수는 0 → ${BITS.join("")}. 1/32 로 작아지지만 0.3 과 0.7 이 둘 다 1 이 돼서 크기 정보가 사라져요.`, fmt: 3 },
    { cap: "이진 코드끼리는 다른 비트 수(해밍 거리)만 세서 아주 빠르게 비교해요. 손실이 크니, 거칠게 뽑은 뒤 원본으로 다시 점수를 매겨(재정렬) 보완해요.", fmt: 3, ham: 1 },
  ];
}

function mountSQ(stage, f) {
  const STEPS = sqSteps(), NAR = !!f.narrow;
  let gen = 0;
  f.figure?.querySelector(".fig-hint")?.remove(); // 이 모드에는 끌 것이 없어요 (안내 글은 그림 파일마다 하나라서 여기서 지워요)
  // 판 배치: 넓으면 막대 오른쪽에 확대 창 · 좁으면(폰) 막대 아래에 확대 창(또는 비트 줄), 그 아래 768차원 크기
  const S = NAR
    ? { W: WN, H: HN, BX: [96, 160, 224, 288], BW: 44, Y0: 130, SC: 140, zl: [70, 330], zx: 64,
      Z: { x: 10, y: 196, w: 340, h: 112, lev: 2, l0: 70, l1: 44, bar: [120, 46], seg: [110, 180], vLab: 184, cLab: 143 },
      bits: { y: [216, 244], lx: 8, hl: [200, 58], ham: [192, 282, "middle"] }, mem: { ty: 326, y0: 338, dy: 26, lx: 8, bx: 84, bw: 176, unit: "B" } }
    : { W, H, BX, BW, Y0, SC, zl: [48, 408], zx: 44,
      Z: { x: 436, y: 24, w: 152, h: 192, lev: 3, l0: 8, l1: 34, bar: [30, 46], seg: [24, 82], vLab: 86, cLab: 53 },
      bits: { y: [246, 274], lx: 21, hl: [230, 58], ham: [400, 260, "start"] }, mem: { ty: 312, y0: 322, dy: 26, lx: 21, bx: 104, bw: 380, unit: "바이트" } };
  const s = svg(stage, S.W, S.H, "벡터 [0.3, −0.2, 0.7, −0.1] 을 float32 · float16 · int8 · 1비트로 줄이는 그림");
  const yv = (x) => S.Y0 - x * S.SC;
  // 막대 그림판
  line(s, S.zl[0], S.Y0, S.zl[1], S.Y0, { color: C.line, width: 1.4 });
  text(s, S.zx, S.Y0, "0", { size: 14, fill: C.mute, anchor: "end" });
  const ghostG = g(s), barG = g(s), labG = g(s);
  SV.forEach((x, i) => el(ghostG, "rect", { x: S.BX[i] - S.BW / 2, y: Math.min(yv(x), S.Y0), width: S.BW, height: Math.abs(x) * S.SC, rx: 3, fill: "none", stroke: C.sub, "stroke-width": 1.4, "stroke-dasharray": "4 3" }));
  const barsE = SV.map((x, i) => rect(barG, S.BX[i] - S.BW / 2, S.Y0, S.BW, 0, { r: 3, fill: C.a }));
  const labs = SV.map((x, i) => text(labG, S.BX[i], 0, "", { size: 15, weight: 700, anchor: "middle", mono: 1, cls: "halo tab" }));
  // 확대 창 (int8): 첫 막대(0.3) 끝 근처를 크게 — int8 눈금(정수 한 칸 = 0.7 ÷ 127)이 보여요
  const Z = S.Z, zoomG = g(s), ZC = Z.y + Z.h / 2 + 7, SPAN = (Z.lev + 0.5) * STEP8, ZK = (Z.h / 2 - 14) / SPAN;
  rect(zoomG, Z.x, Z.y, Z.w, Z.h, { r: 6, fill: C.bg, stroke: C.line, sw: 1.2 });
  text(zoomG, Z.x + 10, Z.y + 15, `막대 끝 확대 (약 ${Math.round(ZK / S.SC)}배)`, { size: 14, fill: C.sub, weight: 600 });
  const zy = (x) => ZC - (x - SV[0]) * ZK;
  for (let k = Q8[0] - Z.lev; k <= Q8[0] + Z.lev; k++) {
    const y = zy(k * STEP8);
    line(zoomG, Z.x + Z.l0, y, Z.x + Z.w - Z.l1, y, { color: C.line });
    text(zoomG, Z.x + Z.w - 8, y, String(k), { size: 14, fill: k === Q8[0] ? C.a : C.mute, anchor: "end", weight: k === Q8[0] ? 700 : 500, cls: "tab" });
  }
  el(zoomG, "rect", { x: Z.x + Z.bar[0], y: zy(DQ8[0]), width: Z.bar[1], height: Z.y + Z.h - 6 - zy(DQ8[0]), fill: C.aSoft });
  line(zoomG, Z.x + Z.seg[0], zy(DQ8[0]), Z.x + Z.seg[1], zy(DQ8[0]), { color: C.a, width: 3 });
  line(zoomG, Z.x + Z.seg[0], zy(SV[0]), Z.x + Z.seg[1], zy(SV[0]), { color: C.ink, width: 1.6, dash: "4 3" });
  text(zoomG, Z.x + Z.vLab, zy(SV[0]) - 1, "0.3", { size: 14, fill: C.ink, weight: 600, cls: "halo" });
  text(zoomG, Z.x + Z.cLab, zy(DQ8[0]) + 15, `${Q8[0]}칸`, { size: 14, fill: C.a, weight: 700, anchor: "middle", cls: "halo" });
  // 막대 쪽 확대 표시 (작은 네모 + 가는 선)
  const mark = rect(zoomG, S.BX[0] - S.BW / 2 - 4, yv(SV[0]) - 7, S.BW + 8, 14, { r: 3, fill: "none", stroke: C.sub, sw: 1.2 });
  mark.setAttribute("stroke-dasharray", "3 2");
  if (NAR) line(zoomG, S.BX[0] - S.BW / 2 - 4, yv(SV[0]), Z.x + 24, Z.y, { color: C.sub, width: 1, dash: "3 3" });
  else line(zoomG, S.BX[0] + S.BW / 2 + 4, yv(SV[0]), Z.x, Z.y + 40, { color: C.sub, width: 1, dash: "3 3" });
  // 비트 줄 (1비트 단계)
  const B = S.bits, bitG = g(s), hamG = g(s);
  const bitRow = (parent, y, bits, label, col) => {
    text(parent, B.lx, y, label, { size: 14, fill: C.sub, weight: 600 });
    bits.forEach((b, i) => { rect(parent, S.BX[i] - 15, y - 12, 30, 24, { r: 4, fill: C.bg, stroke: col, sw: 1.4 }); text(parent, S.BX[i], y + 0.5, String(b), { size: 16, weight: 700, fill: col, anchor: "middle", mono: 1 }); });
  };
  const diffs = BITS.map((b, i) => (b !== OBITS[i] ? i : -1)).filter((i) => i >= 0);
  diffs.forEach((i) => rect(hamG, S.BX[i] - 21, B.hl[0], 42, B.hl[1], { r: 6, fill: C.hi }));
  bitRow(bitG, B.y[0], BITS, "이 벡터", C.a);
  bitRow(hamG, B.y[1], OBITS, "다른 벡터", C.d);
  text(hamG, B.ham[0], B.ham[1], `다른 비트 ${diffs.length}개`, { size: 15, weight: 700, fill: C.ink, anchor: B.ham[2], cls: "halo" });
  // 768차원 크기 (카드의 숫자)
  const Mm = S.mem, memG = g(s);
  text(memG, Mm.lx, Mm.ty, "768차원 벡터 하나의 크기", { size: 14, fill: C.sub, weight: 600 });
  const memBars = MEM.map(([name, bytes, ratio], r) => {
    const y = Mm.y0 + r * Mm.dy, w = Math.max(3, (bytes / 3072) * Mm.bw);
    text(memG, Mm.lx, y + 9, name, { size: 15, weight: 600, fill: C.ink, mono: 1 });
    const b = rect(memG, Mm.bx, y, w, 18, { r: 3, fill: C.a });
    const t = text(memG, Mm.bx + w + 8, y + 9, `${bytes.toLocaleString("en-US")}${Mm.unit}${r ? ` (${ratio})` : ""}`, { size: 14, fill: C.sub, cls: "tab" });
    return { b, t };
  });
  const ro = readout(f.controls());
  const shown = (fmt) => (fmt === 0 ? SV : fmt === 1 ? SV.map(f16) : fmt === 2 ? DQ8 : BITS.map((b) => (b ? 0.27 : -0.27)));

  let cur = SV.slice(), curFmt = 0;
  function drawBars(vals, fmt) {
    vals.forEach((x, i) => {
      const b = barsE[i];
      b.setAttribute("y", Math.min(yv(x), S.Y0)); b.setAttribute("height", Math.max(0.5, Math.abs(x) * S.SC));
      b.style.fill = fmt === 3 && x < 0 ? C.sub : C.a; b.style.opacity = fmt === 3 ? "0.8" : "1";
      const Lb = labs[i], up = SV[i] >= 0;
      Lb.setAttribute("x", S.BX[i]); Lb.setAttribute("y", up ? Math.min(yv(x), yv(SV[i])) - 12 : Math.max(yv(x), yv(SV[i])) + 15);
      Lb.textContent = fmt === 0 ? fx(SV[i], 1) : fmt === 1 ? fx(f16(SV[i]), NAR ? 4 : 5) : fmt === 2 ? String(Q8[i]).replace("-", "−") : String(BITS[i]);
      Lb.style.fill = fmt === 3 ? (BITS[i] ? C.a : C.sub) : fmt === 2 ? C.a : C.ink;
    });
  }
  function render(st) {
    cur = shown(st.fmt); curFmt = st.fmt;
    zoomG.style.opacity = ""; hamG.style.opacity = "";
    drawBars(cur, st.fmt);
    ghostG.style.display = st.fmt ? "" : "none";
    zoomG.style.display = st.fmt === 2 ? "" : "none";
    bitG.style.display = st.fmt === 3 ? "" : "none";
    hamG.style.display = st.ham ? "" : "none";
    memBars.forEach((m, r) => { m.b.style.fill = r === st.fmt ? C.a : r < st.fmt ? C.aSoft : C.soft; m.b.style.stroke = r === st.fmt ? "" : r < st.fmt ? C.a : C.line; m.b.style.strokeWidth = "1"; m.t.style.fill = r === st.fmt ? C.ink : C.sub; m.t.style.fontWeight = r === st.fmt ? "700" : "500"; });
    const rows = [
      [`float32: 숫자 4개 × 4바이트 = <b>16바이트</b> <span class="dim">· 768차원이면 3,072바이트</span>`, `오차 <b>0</b> <span class="dim">(원본 그대로)</span>`],
      [`float16: 4 × 2바이트 = <b>8바이트</b> <span class="dim">· 768차원이면 1,536바이트</span>`, `저장된 값 ${SV.map((x) => fx(f16(x), 5)).join(" · ")} → 가장 큰 오차 <b>${sig(E16)}</b>`],
      [`int8: 4 × 1바이트 = <b>4바이트</b> <span class="dim">· 768차원이면 768바이트 · 눈금 한 칸 = 0.7 ÷ 127 ≈ ${fx(STEP8, 4)}</span>`, `정수 <b class="a">${Q8.map((k) => String(k).replace("-", "−")).join(" · ")}</b> → 되돌리면 ${DQ8.map((x) => fx(x, 4)).join(" · ")} → 가장 큰 오차 <b>${sig(E8)}</b>`],
      [`1비트: 숫자마다 1비트 = 4비트 <span class="dim">· 768차원이면 768비트 = 96바이트</span>`, `코드 <b class="a">${BITS.join("")}</b> <span class="dim">· 0.3 과 0.7 이 둘 다 1 — 크기는 사라지고 부호만 남아요</span>`],
    ];
    const r = st.ham ? [`해밍 거리: <b class="a">${BITS.join("")}</b> vs <b class="d">${OBITS.join("")}</b> → 다른 비트 <b>${diffs.length}</b>개`, `<span class="dim">다른 비트 수만 세면 돼서 빨라요 · 정확한 순서는 원본으로 재정렬</span>`] : rows[st.fmt];
    ro.set(r.map((x) => `<div>${x}</div>`).join(""));
  }
  return {
    async go(i, animate) {
      const my = ++gen, st = STEPS[i], from = cur.slice(), fromFmt = curFmt, to = shown(st.fmt);
      if (!animate) { render(st); return; }
      render(st);
      // 1비트로 갈 때(또는 돌아올 때) 막대가 부호 덩어리로 바뀌는 게 핵심 — 그때만 움직여요
      if ((st.fmt === 3) !== (fromFmt === 3)) {
        await anim(650, (t) => { if (my === gen) drawBars(from.map((x, k) => x + (to[k] - x) * t), st.fmt); });
        if (my === gen) render(st);
      } else if (st.fmt === 2) {
        zoomG.style.opacity = "0"; await anim(400, (t) => { if (my === gen) zoomG.style.opacity = String(t); });
      } else if (st.ham) {
        hamG.style.opacity = "0"; await anim(400, (t) => { if (my === gen) hamG.style.opacity = String(t); });
      }
    },
    destroy() { gen++; },
  };
}

// ===================== IVF-PQ (카드 14): 칸 중심과의 차이(잔차)를 PQ 로 =====================
//   벡터 480개(숫자 8개)를 IVF 로 6칸에 나누고, 보여 줄 벡터 하나의 '벡터 − 칸 중심 = 잔차'를 조각마다 그려요.
//   대표 8개를 원래 값으로 배울 때와 잔차로 배울 때의 되돌린 오차를 전체 벡터로 계산해서 비교해요.
const PXI = (j) => 70 + j * 130, PSI = 120, PYI = 134, KR = 52, KZ = 110; // 칸 위치 · 크기 · 원래 배율 · 2배 확대 배율
const NC = 6, NV = 480;
const near8 = (cs, x) => cs.reduce((b, c, j) => (c.reduce((a, v, d) => a + (v - x[d]) ** 2, 0) < cs[b].reduce((a, v, d) => a + (v - x[d]) ** 2, 0) ? j : b), 0);
const chunkOf = (v, j) => [v[2 * j], v[2 * j + 1]];
let IVD = null;
function ivData() {
  if (IVD) return IVD;
  const r = rng(131);
  const centres = Array.from({ length: NC }, () => Array.from({ length: 8 }, () => (r() * 2 - 1) * 0.75));
  const X = Array.from({ length: NV }, () => centres[Math.floor(r() * NC)].map((x) => x + gauss(r) * 0.17));
  // IVF 학습: 8차원 k-means (k-means++ 로 시작)
  const cs = [X[Math.floor(r() * NV)].slice()];
  while (cs.length < NC) {
    const dd = X.map((x) => Math.min(...cs.map((c) => c.reduce((a, v, d) => a + (v - x[d]) ** 2, 0))));
    let t = r() * dd.reduce((a, b) => a + b, 0), i = 0;
    while (i < dd.length - 1 && t > dd[i]) { t -= dd[i]; i++; }
    cs.push(X[i].slice());
  }
  for (let it = 0; it < 25; it++) {
    const sum = cs.map(() => new Array(9).fill(0));
    X.forEach((x) => { const b = near8(cs, x); x.forEach((v, d) => (sum[b][d] += v)); sum[b][8]++; });
    cs.forEach((c, j) => { if (sum[j][8]) c.forEach((_, d) => (c[d] = sum[j][d] / sum[j][8])); });
  }
  const cell = X.map((x) => near8(cs, x)), R = X.map((x, i) => x.map((v, d) => v - cs[cell[i]][d]));
  const bookRaw = [0, 1, 2, 3].map((j) => kmeans2(X.map((x) => chunkOf(x, j)), KC, r));
  const bookRes = [0, 1, 2, 3].map((j) => kmeans2(R.map((x) => chunkOf(x, j)), KC, r));
  const err = (data, books) => data.reduce((a, x) => a + Math.sqrt([0, 1, 2, 3].reduce((t, j) => { const p = chunkOf(x, j); return t + d2(p, books[j][near(books[j], p)]); }, 0)), 0) / data.length;
  const mAbs = (data) => data.reduce((a, x) => a + x.reduce((t, v) => t + Math.abs(v), 0) / 8, 0) / data.length;
  // 보여 줄 벡터: 잔차 크기가 중간쯤인 것. 화면 숫자는 소수 둘째 자리 — 잔차도 그 숫자로 빼서 맞아떨어지게
  const order = R.map((x, i) => [i, Math.hypot(...x)]).sort((a, b) => a[1] - b[1]), pick = order[Math.floor(NV * 0.6)][0];
  const v = X[pick].map(r2), c = cs[cell[pick]].map(r2), res = v.map((x, d) => r2(x - c[d]));
  const codes = [0, 1, 2, 3].map((j) => near(bookRes[j], chunkOf(res, j)));
  return (IVD = { X, cs, cell, R, bookRes, eRaw: err(X, bookRaw), eRes: err(R, bookRes), mX: mAbs(X), mR: mAbs(R), v, c, res, codes, cellNo: cell[pick] });
}
function ivfpqSteps() {
  const D = ivData();
  return [
    { cap: "IVF-PQ 는 먼저 IVF 로 벡터를 가장 가까운 칸 중심(검은 마름모)에 넣어요. 거리는 숫자 8개 전체로 재고, 조각마다 보면 중심도 점 하나예요." },
    { cap: "칸 중심과의 차이(잔차) = 벡터 − 중심이에요(파란 화살표). 칸마다 자기 중심을 빼면, 흩어져 있던 덩어리들이 원점 근처 한 덩어리로 작게 모여요.", shift: 1 },
    { cap: `잔차들로 배운 대표 8개는 0 근처에 촘촘해요(2배 확대). 조각마다 가장 가까운 대표의 번호 [${D.codes.join(", ")}] 를 남겨요.`, shift: 1, zoom: 1, book: 1 },
    { cap: `칸 목록에는 이 번호 4개(4바이트)만 적어 두고, 검색은 nprobe 칸만 열어 이 압축본으로 거리를 재요. 같은 대표 8개인데 잔차로 배우면 되돌린 오차가 ${fx(D.eRaw)} → ${fx(D.eRes)} 로 줄어요.`, shift: 1, zoom: 1, book: 1, err: 1 },
  ];
}
function mountIVFPQ(stage, f) {
  const STEPS = ivfpqSteps(), D = ivData(), NAR = !!f.narrow;
  let gen = 0;
  f.figure?.querySelector(".fig-hint")?.remove(); // 이 모드에는 끌 것이 없어요
  // 판 배치: 넓으면 위에 숫자 세 줄(벡터 − 칸 중심 = 잔차) + 칸 4개 한 줄 · 좁으면(폰) 칸 2 × 2, 칸마다 위에 세 줄
  const L = NAR
    ? { W: WN, H: HN, ps: 110, kr: 48, kz: 96, px: (j) => 37 + (j % 2) * 176, py: (j) => 54 + (j >> 1) * 200, codeY: (j) => 54 + (j >> 1) * 200 + 116,
      err: { ty: 414, y0: 424, dy: 24, h: 16, lx: 8, bx: 70, k: 600, size: 14 } }
    : { W, H, ps: PSI, kr: KR, kz: KZ, px: PXI, py: () => PYI, codeY: () => 264,
      err: { ty: 318, y0: 336, dy: 40, h: 22, lx: 6, bx: 92, k: 560, size: 15 } };
  const s = svg(stage, L.W, L.H, "벡터에서 칸 중심을 뺀 잔차를 조각마다 대표 번호로 바꾸는 IVF-PQ 그림");
  // 숫자 세 줄: 벡터 − 칸 중심 = 잔차 (rowG[2] = 잔차 줄은 2단계부터)
  const rowG = [];
  [["벡터", C.a, D.v], [NAR ? "중심" : "칸 중심", C.ink, D.c], ["잔차", C.a, D.res]].forEach(([lab, col, vals], r) => {
    const G = g(s); rowG.push(G);
    if (NAR) {
      for (let j = 0; j < 4; j++) {
        const t = text(G, L.px(j) - 27, L.py(j) - 41 + r * 16, lab, { size: 14, weight: 700, fill: col, cls: "tab" });
        const ts = el(t, "tspan", { dx: 6, "font-weight": 600, fill: C.ink }, `(${fx(vals[2 * j])}, ${fx(vals[2 * j + 1])})`); ts.style.fontFamily = "var(--fg-mono)";
      }
      return;
    }
    const rowsY = [16, 52, 88];
    text(G, 6, rowsY[r] + 15.5, lab, { size: 14, weight: 700, fill: col });
    vals.forEach((x, k) => {
      const j = k >> 1, c = k & 1, x0 = PXI(j) + c * 60 + 1;
      rect(G, x0, rowsY[r], 58, 30, { r: 4, fill: r === 2 ? C.aSoft : C.bg, stroke: r === 2 ? C.a : C.line, sw: 1.2 });
      text(G, x0 + 29, rowsY[r] + 15.5, fx(x), { size: 15, anchor: "middle", mono: 1, cls: "tab", fill: C.ink });
    });
  });
  // 조각 칸 4개
  const P = [0, 1, 2, 3].map((j) => {
    const G = g(s), x0 = L.px(j), y0 = L.py(j), PS2 = L.ps, cx = x0 + PS2 / 2, cy = y0 + PS2 / 2;
    rect(G, x0, y0, PS2, PS2, { r: 6, fill: "none", stroke: C.line, sw: 1.2 });
    line(G, x0 + 5, cy, x0 + PS2 - 5, cy, { color: C.grid }); line(G, cx, y0 + 5, cx, y0 + PS2 - 5, { color: C.grid });
    if (NAR) text(G, x0 + 6, y0 + 13, `조각 ${j + 1}`, { size: 14, weight: 600, fill: C.sub, cls: "halo" });
    else text(G, cx, y0 - 7, `조각 ${j + 1}`, { size: 14, weight: 600, fill: C.sub, anchor: "middle" });
    // 벡터 480개의 이 조각(회색 점) — 칸(IVF)마다 묶어 둬요. 잔차 단계에서 묶음마다 자기 칸 중심만큼 옮겨져 원점으로 모여요
    const cid = `ivpq${j}-${Math.random().toString(36).slice(2, 7)}`, defs = s.querySelector("defs") || el(s, "defs");
    el(el(defs, "clipPath", { id: cid }), "rect", { x: x0 + 1, y: y0 + 1, width: PS2 - 2, height: PS2 - 2, rx: 5 });
    const clipG = g(G, { "clip-path": `url(#${cid})` }), world = g(clipG), cellGs = Array.from({ length: NC }, () => g(world));
    D.X.forEach((x, i) => { const p = chunkOf(x, j); circle(cellGs[D.cell[i]], p[0], p[1], 1.5 / L.kr, { fill: C.mute }); });
    world.style.opacity = "0.6";
    // 잔차 대표(검은 점 + 번호) — 2배 확대 배율로 미리 그려 둬요
    const bookG = g(G);
    D.bookRes[j].forEach((c, k) => { circle(bookG, cx + c[0] * L.kz, cy - c[1] * L.kz, 4, { fill: C.ink }); text(bookG, cx + c[0] * L.kz + (c[0] >= 0 ? 6 : -6), cy - c[1] * L.kz - 8, String(k), { size: 14, weight: 600, fill: C.sub, anchor: c[0] >= 0 ? "start" : "end", cls: "halo" }); });
    const ring = el(G, "circle", { r: 8, fill: "none", stroke: C.a, "stroke-width": 2 });
    const arrowE = line(G, 0, 0, 0, 0, { color: C.a, width: 2.2 }); arrowE.setAttribute("marker-end", arrowHead(s, C.a));
    const dia = el(G, "path", { d: "", fill: C.ink, stroke: C.bg, "stroke-width": 1.5 });
    const dot = circle(G, 0, 0, 5.5, { fill: C.a, stroke: C.bg, sw: 2 });
    const zoomT = text(G, x0 + PS2 - 5, y0 + PS2 - 10, "2배 확대", { size: 14, fill: C.sub, anchor: "end", weight: 600, cls: "halo" });
    const codeG = g(s), cyc = L.codeY(j);
    rect(codeG, cx - 30, cyc, 60, NAR ? 26 : 28, { r: 6, fill: C.aSoft, stroke: C.a, sw: 1.5 });
    text(codeG, cx, cyc + (NAR ? 13.5 : 14.5), `${D.codes[j]}번`, { size: 16, weight: 700, fill: C.a, anchor: "middle", cls: "tab" });
    return { cx, cy, bookG, ring, arrowE, dia, dot, zoomT, codeG, world, cellGs };
  });
  // 아래: 되돌린 오차 비교 (전체 벡터 평균)
  const E = L.err, errG = g(s);
  text(errG, E.lx, E.ty, NAR ? `되돌린 오차 — 벡터 ${NV}개 평균` : `되돌린 오차 — 벡터 ${NV}개 평균 · 조각마다 대표 8개로 같은 조건`, { size: 14, fill: C.sub, weight: 600 });
  const errBars = [["그냥 PQ", D.eRaw, C.sub], ["잔차 PQ", D.eRes, C.a]].map(([lab, e, col], r) => {
    const y = E.y0 + r * E.dy;
    text(errG, E.lx, y + E.h / 2, lab, { size: E.size, weight: 700, fill: r ? C.a : C.ink });
    const b = rect(errG, E.bx, y, e * E.k, E.h, { r: 3, fill: col });
    text(errG, E.bx + e * E.k + 8, y + E.h / 2, fx(e), { size: E.size, weight: 700, fill: r ? C.a : C.ink, cls: "tab" });
    return { b, w: e * E.k };
  });
  const ro = readout(f.controls());
  const diaD = (x, y, rr = 6.5) => `M${x},${y - rr}L${x + rr},${y}L${x},${y + rr}L${x - rr},${y}Z`;
  // 그리기: t = 화살표를 원점으로 옮긴 정도(0 ~ 1) · k = 배율
  function draw(t, k) {
    P.forEach((p, j) => {
      const c = chunkOf(D.c, j), rr = chunkOf(D.res, j);
      const tail = [c[0] * (1 - t), c[1] * (1 - t)], tip = [tail[0] + rr[0], tail[1] + rr[1]];
      const X = (q) => p.cx + q[0] * k, Y = (q) => p.cy - q[1] * k;
      const len = Math.hypot(rr[0], rr[1]) * k, sh = len > 9 ? 7 / len : 0; // 화살촉이 점에 가리지 않게 조금 짧게
      p.arrowE.setAttribute("x1", X(tail)); p.arrowE.setAttribute("y1", Y(tail));
      p.arrowE.setAttribute("x2", X(tail) + (X(tip) - X(tail)) * (1 - sh)); p.arrowE.setAttribute("y2", Y(tail) + (Y(tip) - Y(tail)) * (1 - sh));
      p.dia.setAttribute("d", diaD(X(tail), Y(tail))); p.dia.style.opacity = String(1 - t * 0.85);
      p.dot.setAttribute("cx", X(tip)); p.dot.setAttribute("cy", Y(tip));
      const cb = D.bookRes[j][D.codes[j]]; p.ring.setAttribute("cx", p.cx + cb[0] * L.kz); p.ring.setAttribute("cy", p.cy - cb[1] * L.kz);
      // 회색 점들: 배율 k 로 그리고, 칸 묶음마다 자기 중심의 t 만큼 옮겨요 (t = 1 이면 잔차)
      p.world.setAttribute("transform", `translate(${p.cx},${p.cy}) scale(${k},${-k})`);
      p.cellGs.forEach((cg, ci) => cg.setAttribute("transform", `translate(${(-t * D.cs[ci][2 * j]).toFixed(4)},${(-t * D.cs[ci][2 * j + 1]).toFixed(4)})`));
    });
  }
  function render(st) {
    draw(st.shift ? 1 : 0, st.zoom ? L.kz : L.kr);
    [rowG[2], ...P.flatMap((p) => [p.arrowE, p.bookG, p.ring, p.codeG])].forEach((e) => (e.style.opacity = ""));
    errBars.forEach((e) => e.b.setAttribute("width", e.w));
    rowG[2].style.display = st.shift ? "" : "none";
    P.forEach((p) => { [p.bookG, p.ring, p.codeG].forEach((e) => (e.style.display = st.book ? "" : "none")); p.zoomT.style.display = st.zoom ? "" : "none"; p.arrowE.style.display = st.shift ? "" : "none"; });
    errG.style.display = st.err ? "" : "none";
    const rows = !st.shift ? [`칸 <b>${D.cellNo + 1}</b>번 <span class="dim">(칸 ${NC}개 중 · 숫자 8개 전체로 가장 가까운 중심)</span>`, `<span class="dim">회색 = 벡터 ${NV}개의 같은 조각 · IVF = 어디를 볼지, PQ = 얼마나 작게 담을지</span>`]
      : !st.book ? [`잔차 = 벡터 − 칸 중심 <span class="dim">(숫자마다 빼기)</span>`, `숫자 크기 평균: 원래 <b>${fx(D.mX)}</b> → 잔차 <b class="a">${fx(D.mR)}</b> <span class="dim">(벡터 ${NV}개 전체)</span>`]
      : !st.err ? [`잔차 번호 <b class="a">[${D.codes.join(", ")}]</b> · 조각마다 대표 8개`, `<span class="dim">회색 = 모든 벡터의 잔차(대표를 배울 때 쓴 것) · 2배 확대해서 그렸어요</span>`]
      : [`되돌린 오차(평균): 그냥 PQ <b>${fx(D.eRaw)}</b> → 잔차 PQ <b class="a">${fx(D.eRes)}</b>`, `<span class="dim">카드의 Faiss "IVF4096,PQ64" = 칸 4,096개 + 벡터마다 64바이트 코드</span>`];
    ro.set(rows.map((x) => `<div>${x}</div>`).join(""));
  }
  return {
    async go(i, animate) {
      const my = ++gen, st = STEPS[i], prev = STEPS[Math.max(0, i - 1)];
      render(st);
      if (!animate) return;
      const fade = (nodes, ms) => { nodes.forEach((n) => (n.style.opacity = "0")); return anim(ms, (t) => { if (my === gen) nodes.forEach((n) => (n.style.opacity = String(t))); }); };
      if (st.shift && !st.zoom) {
        // 잔차 줄과 화살표가 나타나고, 칸 묶음마다 자기 중심만큼 옮겨져 모두 원점 근처로 모여요
        draw(0, L.kr);
        await fade([rowG[2], ...P.map((p) => p.arrowE)], 400);
        if (my === gen) await anim(1100, (t) => { if (my === gen) draw(t, L.kr); });
      } else if (st.zoom && !st.err && !prev.zoom) {
        P.forEach((p) => [p.bookG, p.ring, p.codeG].forEach((e) => (e.style.opacity = "0")));
        await anim(700, (t) => { if (my === gen) draw(1, L.kr + (L.kz - L.kr) * t); });
        if (my === gen) await fade(P.map((p) => p.bookG), 400);
        if (my === gen) await fade(P.flatMap((p) => [p.ring, p.codeG]), 350);
      } else if (st.err) {
        errBars.forEach((e) => e.b.setAttribute("width", 0));
        await anim(700, (t) => { if (my === gen) errBars.forEach((e) => e.b.setAttribute("width", e.w * Math.max(0, t))); }); // 첫 장면에 t 가 아주 조금 음수일 수 있어요
        if (my === gen) errBars.forEach((e) => e.b.setAttribute("width", e.w));
      }
    },
    destroy() { gen++; },
  };
}

export default {
  aspect: H / W,
  aspectNarrow: HN / WN, // 좁은 칸(폰): 칸 2 × 2 · 확대 창은 막대 아래 — 세 모드 모두 같은 판 크기
  steps: (o) => (o.mode === "sq" ? sqSteps() : o.mode === "ivfpq" ? ivfpqSteps() : pqSteps()).map((s) => s.cap),
  hint: "파란 점을 끌어 보세요",
  mount(stage, f) { return f.opts.mode === "sq" ? mountSQ(stage, f) : f.opts.mode === "ivfpq" ? mountIVFPQ(stage, f) : mountPQ(stage, f); },
};
