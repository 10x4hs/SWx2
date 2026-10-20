// 그림: PageRank — 점수가 링크를 따라 흐르고, 15%는 순간이동으로 모두에게 똑같이 (Vector & Graph 07 — 카드 8)
//   카드의 작은 예 A→B, B→C, C→A, D→C 를 그대로 써요. 모든 값은 거듭제곱 반복(power iteration)으로 코드에서 계산해요.
//   노드 넓이 = 점수. 1회 반복 = 나누기(링크로 보내기) → 섞기(d × 받은 점수 + (1−d)/N). 아래 다이얼로 d 를 바꾸면 처음부터 다시 계산해요.
import { svg, g, text, line, circle, rect, el, arrowHead, anim, tween, show, slider, readout, C, fix, lerp } from "./kit.js";

// 판 두 가지: 넓은 칸(그래프 왼쪽 · 작은 그래프 오른쪽) / 좁은 칸(폰 · 튜터 — 작은 그래프를 아래로, 글씨가 커 보이게)
const WIDE = { W: 600, H: 400, POS: [[100, 158], [300, 158], [200, 300], [52, 352]], POOL: [200, 42], CH: { x0: 392, x1: 578, y0: 330, y1: 104, vmax: 0.5 } };
const NARROW = { W: 380, H: 570, POS: [[96, 158], [296, 158], [196, 300], [48, 352]], POOL: [196, 42], CH: { x0: 52, x1: 344, y0: 540, y1: 432, vmax: 0.5 } };
const NAMES = ["A", "B", "C", "D"], N = 4;
const EDGES = [[0, 1], [1, 2], [2, 0], [3, 2]]; // 카드: A→B, B→C, C→A, D→C
const OUT = NAMES.map((_, i) => EDGES.filter(([u]) => u === i).length);
const COL = [C.a, C.b, C.c, C.d], SOFT = [C.aSoft, C.bSoft, C.cSoft, C.dSoft], CLS = ["a", "b", "c", "d"];
const TOL = 1e-4, MAXIT = 500, SHOW_IT = 5; // '반복' 단계에서 하나씩 보여 줄 횟수

// 받은 점수 (나누기 결과) · 한 번 반복 · 끝까지 반복
const recv = (p) => { const q = new Array(N).fill(0); for (const [u, v] of EDGES) q[v] += p[u] / OUT[u]; return q; };
const mix = (r, d) => r.map((x) => d * x + (1 - d) / N);
function trace(d) {
  const rows = [new Array(N).fill(1 / N)];
  for (let t = 0; t < MAXIT; t++) {
    const p = rows[rows.length - 1], q = mix(recv(p), d);
    rows.push(q);
    if (Math.max(...q.map((x, i) => Math.abs(x - p[i]))) < TOL) break;
  }
  return rows;
}
const argmax = (a) => a.indexOf(Math.max(...a));
const uniqMax = (a) => { const m = argmax(a); return a.every((x, i) => i === m || x < a[m] - 1e-9) ? m : -1; }; // 1등이 하나일 때만
const T0 = trace(0.85), R1 = recv(T0[0]), K0 = T0.length - 1, FIN = T0[K0];
const f4 = (v) => fix(v, 4);

const CAPS = [
  `시작: 노드 4개가 모두 1/4 = ${f4(T0[0][0])}점씩 가지고 시작해요. 노드 넓이가 점수예요.`,
  `나누기: 각 노드가 자기 점수를 나가는 링크 수로 나눠 보내요. 여기선 링크가 하나씩이라 통째로 가요. 초록 C 는 두 곳(B, D)에서 받아 ${fix(R1[2], 2)}, 보라 D 는 0 이에요.`,
  `섞기: 받은 점수의 85%만 남고, 15%는 '순간이동 몫'으로 모여 모두에게 똑같이 0.15 ÷ 4 = ${f4(0.15 / N)}씩 가요. 1번 반복 뒤 C = ${f4(T0[1][2])}.`,
  `반복: 같은 일을 되풀이하면 점수가 고리 A → B → C 를 따라 돌며 출렁여요. 1등이 ${[1, 2, 3].map((t) => NAMES[argmax(T0[t])]).join(" → ")} 로 바뀌어요.`,
  `${K0}번 반복하면 값이 거의 안 바뀌어서 멈춰요. C(${f4(FIN[2])})가 가장 크고, C 가 가리키는 A(${f4(FIN[0])})도 커요. 아무도 안 가리키는 D 는 순간이동 몫 ${f4(FIN[3])}뿐이에요.`,
  "이제 직접 d 를 바꿔 보세요. d 가 작을수록 순간이동이 많아져 점수가 고르게 퍼지고, 빨리 멈춰요.",
];

const rad = (v) => Math.max(0, 30 * Math.sqrt(v / 0.25)); // 넓이 ∝ 점수 (0.25 → 반지름 30)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default {
  aspect: WIDE.H / WIDE.W,
  aspectNarrow: NARROW.H / NARROW.W,
  steps: () => CAPS,
  hint: "아래 d 다이얼을 움직여 보세요",
  mount(stage, f) {
    const { W, H, POS, POOL, CH } = f.narrow ? NARROW : WIDE;
    const s = svg(stage, W, H, "노드 A, B, C, D 와 링크 A→B, B→C, C→A, D→C. 점수가 링크를 따라 흐르는 PageRank 그림");
    let d = 0.85, rows = T0, K = K0, alive = true;
    const live = (i) => alive && f.step() === i;

    // 순간이동 몫 (모두에게 똑같이)
    const poolG = g(s);
    el(poolG, "rect", { x: POOL[0] - 70, y: POOL[1] - 19, width: 140, height: 38, rx: 19, fill: C.soft, stroke: C.line, "stroke-width": 1.4, "stroke-dasharray": "5 4" });
    const poolT = text(poolG, POOL[0], POOL[1], "순간이동 15%", { size: 15, anchor: "middle", weight: 600, fill: C.sub });
    const poolLines = g(poolG);
    POS.forEach(([x, y]) => line(poolLines, POOL[0], POOL[1] + 19, x, y, { color: C.line, dash: "2 5" }));

    // 링크 (화살표) · 노드
    const edgeG = g(s), dotG = g(s), nodeG = g(s), labG = g(s); // 점은 노드 아래로 — 노드 안으로 들어가고 노드에서 나와요
    const edges = EDGES.map(() => { const l = line(edgeG, 0, 0, 0, 0, { color: C.sub, width: 2 }); l.setAttribute("marker-end", arrowHead(s, C.sub)); return l; });
    const nodes = POS.map(([x, y], i) => {
      const under = circle(nodeG, x, y, 30, { fill: C.bg }); // 밤 모드의 반투명 색 아래로 점이 비치지 않게
      const c = circle(nodeG, x, y, 30, { fill: SOFT[i], stroke: COL[i], sw: 2.2 });
      const empty = el(nodeG, "circle", { cx: x, cy: y, r: 9, fill: "none", stroke: COL[i], "stroke-width": 1.4, "stroke-dasharray": "3 3" });
      const t = text(nodeG, x, y + 1, NAMES[i], { size: 18, anchor: "middle", weight: 700, fill: COL[i] });
      const v = text(labG, x, y, "", { size: 16, anchor: "middle", weight: 700, fill: C.ink, cls: "halo tab" });
      return { c, t, v, empty, under };
    });
    // 값 글자 자리: A·B 는 위, C 는 아래, D 는 오른쪽 아래
    const labAt = (i, r) => [[POS[0][0], POS[0][1] - r - 13], [POS[1][0], POS[1][1] - r - 13], [POS[2][0], POS[2][1] + r + 16], [POS[3][0] + Math.max(r, 9) + 30, POS[3][1] + 10]][i];

    // 오른쪽: 반복할수록 (점수 변화)
    const chG = g(s);
    line(chG, CH.x0, CH.y0, CH.x1, CH.y0, { color: C.line, width: 1.2 });
    line(chG, CH.x0, CH.y0, CH.x0, CH.y1 - 6, { color: C.line, width: 1.2 });
    const cy = (v) => lerp(CH.y0, CH.y1, v / CH.vmax);
    for (const v of [0.25, 0.5]) { line(chG, CH.x0, cy(v), CH.x1, cy(v), { color: C.grid }); text(chG, CH.x0 - 6, cy(v), String(v), { size: 14, anchor: "end", fill: C.mute, cls: "fg-t tab" }); }
    text(chG, CH.x0 - 6, CH.y0, "0", { size: 14, anchor: "end", fill: C.mute });
    text(chG, CH.x0, CH.y1 - 22, "반복할수록 →", { size: 15, weight: 600, fill: C.sub });
    text(chG, CH.x0, CH.y0 + 16, "0", { size: 14, anchor: "middle", fill: C.mute });
    const xLabK = text(chG, CH.x1, CH.y0 + 16, "", { size: 14, anchor: "end", fill: C.mute, cls: "fg-t tab" });
    const polys = NAMES.map((_, i) => el(chG, "polyline", { fill: "none", stroke: COL[i], "stroke-width": 2, "stroke-linejoin": "round", points: "" }));
    const ends = NAMES.map((n, i) => text(chG, 0, 0, n, { size: 14, weight: 700, fill: COL[i], cls: "halo" }));
    const nowLine = line(chG, CH.x0, CH.y0, CH.x0, CH.y1, { color: C.mute, dash: "3 4" });

    const ctl = f.controls();
    const dial = slider(ctl, { label: "d (따라갈 확률)", min: 0.5, max: 0.95, step: 0.05, value: 0.85, fmt: (v) => v.toFixed(2) }, (v) => {
      d = v; rows = trace(d); K = rows.length - 1;
      if (f.step() !== CAPS.length - 1) f.goto(CAPS.length - 1); else render(CAPS.length - 1);
    });
    const ro = readout(ctl);

    // 지금 그림의 상태
    const st = { vals: rows[0].slice(), upto: 0, pool: false, recv: false };
    function draw() {
      const r = st.vals.map(rad);
      nodes.forEach((n, i) => {
        n.c.setAttribute("r", Math.max(0.01, r[i])); n.under.setAttribute("r", Math.max(0.01, r[i]));
        n.under.style.opacity = st.vals[i] > 1e-9 ? "1" : "0";
        n.c.style.opacity = st.vals[i] > 1e-9 ? "1" : "0";
        n.empty.style.opacity = st.vals[i] > 1e-9 ? "0" : "1";
        const inside = r[i] >= 13;
        n.t.setAttribute("x", POS[i][0] + (inside ? 0 : -(Math.max(r[i], 9) + 12))); n.t.setAttribute("y", POS[i][1] + 1);
        const [lx, ly] = labAt(i, r[i]);
        n.v.setAttribute("x", lx); n.v.setAttribute("y", ly); n.v.textContent = f4(st.vals[i]);
      });
      EDGES.forEach(([u, v], k) => {
        const [x1, y1] = POS[u], [x2, y2] = POS[v], L = Math.hypot(x2 - x1, y2 - y1), ux = (x2 - x1) / L, uy = (y2 - y1) / L;
        const a = Math.max(r[u], 9) + 4, b = Math.max(r[v], 9) + 3;
        edges[k].setAttribute("x1", x1 + ux * a); edges[k].setAttribute("y1", y1 + uy * a);
        edges[k].setAttribute("x2", x2 - ux * b); edges[k].setAttribute("y2", y2 - uy * b);
      });
      // 작은 그래프
      const xr = Math.max(SHOW_IT + 1, st.upto); // 처음엔 앞부분을 넓게, 끝까지 가면 전체를
      const cx = (t) => lerp(CH.x0, CH.x1, t / xr);
      xLabK.textContent = `${xr}번`;
      polys.forEach((p, i) => p.setAttribute("points", rows.slice(0, st.upto + 1).map((row, t) => `${cx(t).toFixed(1)},${cy(row[i]).toFixed(1)}`).join(" ")));
      const last = rows[Math.min(st.upto, K)], yy = last.map(cy), order = [0, 1, 2, 3].sort((a, b) => yy[a] - yy[b]);
      let prev = -1e9; // 끝 글자가 겹치지 않게 아래로 밀어요
      for (const i of order) { const y = Math.max(yy[i], prev + 15); prev = y; ends[i].setAttribute("x", cx(st.upto) + 6); ends[i].setAttribute("y", y); }
      ends.forEach((e) => (e.style.opacity = st.upto > 0 ? "1" : "0"));
      nowLine.setAttribute("x1", cx(st.upto)); nowLine.setAttribute("x2", cx(st.upto));
      show(poolG, st.pool, 250); show(poolLines, st.pool && st.poolLines, 200);
      poolT.textContent = `순간이동 ${Math.round((1 - d) * 100)}%`;
    }
    // 아래 계산 칸: 반복마다 한 줄
    function table(upto, note) {
      const pick = upto <= 5 ? [...Array(upto + 1).keys()] : [0, 1, 2, 3, -1, upto];
      const head = `<tr><th style="text-align:left;font-weight:600;padding:0 10px 2px 0">반복</th>${NAMES.map((n, i) => `<th style="padding:0 8px 2px;text-align:right"><span class="${CLS[i]}">${n}</span></th>`).join("")}</tr>`;
      const body = pick.map((t) => {
        if (t < 0) return `<tr><td class="dim">…</td>${NAMES.map(() => `<td class="dim" style="text-align:right;padding:0 8px">…</td>`).join("")}</tr>`;
        const row = rows[t], m = uniqMax(row);
        return `<tr><td style="padding:0 10px 0 0;white-space:nowrap">${t === 0 ? "0 시작" : t === K ? `${t} 끝` : t}</td>${row.map((v, i) => `<td style="text-align:right;padding:0 8px">${i === m ? `<b>${f4(v)}</b>` : f4(v)}</td>`).join("")}</tr>`;
      }).join("");
      ro.set(`${note ? `<div>${note}</div>` : ""}<div style="overflow-x:auto"><table style="border-collapse:collapse;font-variant-numeric:tabular-nums">${head}${body}</table></div><div class="dim">새 점수 = ${fix(1 - d, 2)} ÷ 4 + ${fix(d, 2)} × 받은 점수 · 굵은 숫자 = 그 줄의 1등</div>`);
    }

    // 점 하나를 a → b 로 (점 크기 = 옮기는 양)
    const dotR = (amt) => Math.max(3.2, 11 * Math.sqrt(amt / 0.25));
    async function fly(list, ms) {
      const ds = list.map(([a, b, amt, col]) => ({ a, b, e: circle(dotG, a[0], a[1], dotR(amt), { fill: col, stroke: C.bg, sw: 1.5 }) }));
      await anim(ms, (t) => ds.forEach(({ a, b, e }) => { e.setAttribute("cx", lerp(a[0], b[0], t)); e.setAttribute("cy", lerp(a[1], b[1], t)); }));
      ds.forEach(({ e }) => e.remove());
    }
    const edgePts = (u, v) => { const [x1, y1] = POS[u], [x2, y2] = POS[v], L = Math.hypot(x2 - x1, y2 - y1), ux = (x2 - x1) / L, uy = (y2 - y1) / L, ru = rad(st.vals[u]), rv = rad(st.vals[v]); return [[x1 + ux * ru * 0.6, y1 + uy * ru * 0.6], [x2 - ux * Math.max(rv, 9) * 0.6, y2 - uy * Math.max(rv, 9) * 0.6]]; };
    const grow = (to, ms) => { const o = { t: 0 }, from = st.vals.slice(); return tween(o, { t: 1 }, ms, () => { st.vals = from.map((x, i) => lerp(x, to[i], o.t)); draw(); }); };
    // 반복 한 번 (p = 시작 점수, 끝나면 q)
    async function iterate(p, q, ms, i) {
      st.vals = p.slice(); draw();
      await fly(EDGES.map(([u, v]) => { const [a, b] = edgePts(u, v); return [a, b, p[u] / OUT[u], COL[u]]; }), ms * 0.55);
      if (!live(i)) return;
      st.poolLines = true; draw();
      await Promise.all([fly(POS.map((pp, k) => [POOL, pp, (1 - d) / N, C.sub]), ms * 0.45), grow(q, ms * 0.45)]);
      st.poolLines = false;
    }

    // 단계마다 다 그려요 (어느 상태에서 와도 같은 모습)
    function render(i) {
      const last = CAPS.length - 1;
      if (i === 0) { Object.assign(st, { vals: rows[0].slice(), upto: 0, pool: false, poolLines: false }); draw(); table(0); return; }
      if (i === 1) { Object.assign(st, { vals: recv(rows[0]), upto: 0, pool: false, poolLines: false }); draw(); const r = recv(rows[0]); table(0, `받은 점수: ${r.map((v, k) => `<span class="${CLS[k]}">${NAMES[k]}</span> ${fix(v, 2)}`).join(" · ")} <span class="dim">(아직 섞기 전)</span>`); return; }
      if (i === 2) { Object.assign(st, { vals: rows[1].slice(), upto: 1, pool: true, poolLines: false }); draw(); const r = recv(rows[0]); table(1, `<span class="c">C</span> = ${fix(1 - d, 2)} ÷ 4 + ${fix(d, 2)} × (B ${fix(rows[0][1], 2)} + D ${fix(rows[0][3], 2)}) = <b>${f4(rows[1][2])}</b> · <span class="d">D</span> = ${fix(1 - d, 2)} ÷ 4 + ${fix(d, 2)} × ${fix(r[3], 0)} = <b>${f4(rows[1][3])}</b>`); return; }
      if (i === 3) { const u = Math.min(SHOW_IT, K); Object.assign(st, { vals: rows[u].slice(), upto: u, pool: true, poolLines: false }); draw(); table(u); return; }
      Object.assign(st, { vals: rows[K].slice(), upto: K, pool: true, poolLines: false }); draw();
      const m = argmax(rows[K]);
      table(K, `${K}번 반복 뒤 변화 &lt; ${TOL} → 멈춤 · 1등 <span class="${CLS[m]}">${NAMES[m]}</span>${i === last ? ` <span class="dim">(d = ${d.toFixed(2)})</span>` : ""}`);
    }

    let shown = -1;
    async function go(i, animate) {
      const from = shown; shown = i;
      if (!animate || from !== i - 1) { render(i); return; }
      if (i === 1) { // 나누기: 링크를 따라 점이 가요
        render(0);
        await fly(EDGES.map(([u, v]) => { const [a, b] = edgePts(u, v); return [a, b, rows[0][u] / OUT[u], COL[u]]; }), 900);
        if (!live(i)) { render(i); return; }
        await grow(recv(rows[0]), 350);
      } else if (i === 2) { // 섞기: 15% 는 모아서 모두에게 똑같이
        render(1); st.pool = true; draw(); await sleep(250);
        const r = recv(rows[0]);
        await Promise.all([fly(POS.map((pp, k) => [pp, POOL, (1 - d) * r[k], COL[k]]).filter((x) => x[2] > 0), 650), grow(r.map((x) => d * x), 650)]);
        if (!live(i)) { render(i); return; }
        st.poolLines = true; draw();
        await Promise.all([fly(POS.map((pp) => [POOL, pp, (1 - d) / N, C.sub]), 650), grow(rows[1], 650)]);
        st.poolLines = false; st.upto = 1; draw();
      } else if (i === 3) { // 반복: 한 번씩 빠르게
        render(2);
        for (let t = 1; t < Math.min(SHOW_IT, K); t++) {
          if (!live(i)) break;
          await iterate(rows[t], rows[t + 1], 900, i);
          st.upto = t + 1; draw(); table(t + 1);
        }
      } else if (i === 4) { // 끝까지: 작은 그래프가 쭉 그려져요
        render(3);
        const o = { t: Math.min(SHOW_IT, K) };
        await tween(o, { t: K }, 1400, () => { const t = Math.round(o.t); if (t === st.upto) return; st.upto = t; st.vals = rows[t].slice(); draw(); });
      }
      if (alive) render(i);
    }
    render(0);
    return { go, destroy() { alive = false; } };
  },
};
