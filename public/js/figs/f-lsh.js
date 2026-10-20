// 그림: LSH — 무작위 선(평면)으로 자르고, 같은 쪽 비트끼리 한 통 (Vector & Graph 02 — 카드 7)
//   점(벡터) 160개가 원점 둘레에 있어요. 원점을 지나는 선 하나 = 비트 하나(선의 한쪽 1 · 반대쪽 0). 비트를 이으면 그 점의 코드 = 통.
//   질문은 자기 통의 점만 후보로 비교해요. 선을 늘리면 통이 잘게 쪼개져 후보는 줄고 놓치는 이웃은 늘어요 → 표(선 묶음)를 여러 개 쓰면 되찾아요.
//   카드 예: 선 3개면 코드 8가지(2³) · [0.2, 0.9] 와 [0.3, 0.8] 은 같은 통 '101'. 2D 에서는 선 h개가 2h칸만 만들어서, 그 차이도 계산 칸에 적어요.
import { svg, el, g, text, line, circle, path, slider, choice, readout, drag, anim, rng, gauss, C } from "./kit.js";

const W = 520, H = 420, OX = 260, OY = 212, S = 160, N = 160, K = 10, HMAX = 8, RL = 1.24 * S, RF = 1.05 * S;
const Q0 = [0.2, 0.9], P38 = [0.3, 0.8]; // 카드의 두 벡터 — 질문과 그 옆의 점
const px = (v) => [OX + v[0] * S, OY - v[1] * S];
const angOf = (v) => Math.atan2(v[1], v[0]);
const angDiff = (a, b) => { let d = Math.abs(a - b) % (2 * Math.PI); return d > Math.PI ? 2 * Math.PI - d : d; };
const bit = (n, v) => (n[0] * v[0] + n[1] * v[1] > 0 ? "1" : "0");
const codeOf = (ns, h, v) => ns.slice(0, h).map((n) => bit(n, v)).join("");

// 점 160개: 방향이 몇 군데에 뭉친 점 + 고르게 흩어진 점 (길이는 0.78 ~ 1)
function makePoints() {
  const r = rng(42), pts = [P38], centers = [100, 150, 205, 262, 318, 20].map((d) => (d * Math.PI) / 180);
  for (let guard = 0; pts.length < N && guard < 20000; guard++) {
    const a = r() < 0.35 ? r() * 2 * Math.PI : centers[Math.floor(r() * centers.length)] + gauss(r) * 0.22;
    const rad = 0.78 + r() * 0.22, p = [Math.cos(a) * rad, Math.sin(a) * rad];
    if (pts.some((o) => Math.hypot((o[0] - p[0]) * S, (o[1] - p[1]) * S) < 8)) continue;
    if (Math.hypot((Q0[0] - p[0]) * S, (Q0[1] - p[1]) * S) < 12) continue;
    pts.push(p);
  }
  return pts;
}
// 무작위 방향(법선) h개 — np.random.randn(h, 2) 처럼
function normals(seed) { const r = rng(seed); return Array.from({ length: HMAX }, () => { const a = [gauss(r), gauss(r)], L = Math.hypot(a[0], a[1]); return [a[0] / L, a[1] / L]; }); }

// 질문 하나 → 후보(같은 통) · 진짜 이웃 10개(방향 = 코사인 기준) · 맞힌 수
function query(D, q, h, T) {
  const qc = [codeOf(D.t1, h, q), codeOf(D.t2, h, q)];
  const cand = new Set(D.pts.map((_, i) => i).filter((i) => codeOf(D.t1, h, D.pts[i]) === qc[0] || (T > 1 && codeOf(D.t2, h, D.pts[i]) === qc[1])));
  const qa = angOf(q), truth = D.pts.map((p, i) => [i, angDiff(angOf(p), qa)]).sort((a, b) => a[1] - b[1]).slice(0, K).map((x) => x[0]);
  return { qc, cand, truth, hit: truth.filter((i) => cand.has(i)).length };
}

// 선 묶음의 씨앗은 미리 찾아 둔 값이에요. 조건: 선 3개면 [0.2, 0.9] 와 [0.3, 0.8] 이 둘 다 '101' · 선이 고르게 퍼짐 ·
//   선 3개는 진짜 이웃을 다 찾고, 선 6개는 몇 개 놓치고, 둘째 표를 합치면 되찾음. (숫자는 아래에서 늘 새로 계산해요)
const SEED1 = 3450, SEED2 = 5014;
let DATA = null;
function data() {
  if (!DATA) DATA = { pts: makePoints(), t1: normals(SEED1), t2: normals(SEED2) };
  return DATA;
}

function stepsFor() {
  const D = data(), a3 = query(D, Q0, 3, 1), a6 = query(D, Q0, 6, 1), a62 = query(D, Q0, 6, 2);
  return [
    { cap: "선 하나 = 비트 하나예요. 원점을 지나는 무작위 선을 그으면, 선의 한쪽(파란 점)은 1, 반대쪽(회색 점)은 0 을 받아요.", h: 1, T: 1, half: 1 },
    { cap: "선을 하나씩 더 그을 때마다 점마다 비트가 하나씩 붙어요. 선 3개면 코드가 3비트(예: 101)가 되고, 코드가 같은 점끼리 한 통이에요.", h: 3, T: 1, codes: 1, grow: [1, 3] },
    { cap: `질문(주황 점) [0.2, 0.9] 의 코드도 '${a3.qc[0]}'. 방향이 비슷한 [0.3, 0.8] 도 같은 통(파란 칸)에 떨어져요. 이 통의 점 ${a3.cand.size}개만 후보로 비교해요.`, h: 3, T: 1, codes: 1, q: 1 },
    { cap: `선을 6개로 늘리면 통이 잘게 쪼개져요. 후보는 ${a6.cand.size}개로 줄어 빨라지지만, 진짜 이웃이 선 너머로 잘려 나가요(빨간 고리 ${K - a6.hit}개).`, h: 6, T: 1, codes: 1, q: 1, grow: [3, 6] },
    { cap: `그래서 무작위 선 묶음(표)을 여러 개 써요. 두 번째 표(보라 점선)에서 같은 통인 점도 후보에 넣으면, 놓쳤던 이웃을 되찾아요(${a62.hit}/10).`, h: 6, T: 2, codes: 1, q: 1, add2: 1 },
    { cap: "이제 직접 선 수와 표 수를 바꾸고, 주황 점(질문)을 끌어 보세요.", h: "user", T: "user", codes: 1, q: 1, free: 1 },
  ];
}

export default {
  aspect: H / W,
  steps: () => stepsFor().map((s) => s.cap),
  hint: "주황 점을 끌어 보세요",
  mount(stage, f) {
    const STEPS = stepsFor(), LAST = STEPS.length - 1, D = data(), pts = D.pts;
    const s = svg(stage, W, H, "원점을 지나는 무작위 선으로 점들을 통에 나누는 LSH 그림");
    // 바탕: 원점 십자 · 반지름 1 원
    const base = g(s);
    line(base, OX - RL, OY, OX + RL, OY, { color: C.grid }); line(base, OX, OY - RL + 10, OX, OY + RL - 10, { color: C.grid });
    el(base, "circle", { cx: OX, cy: OY, r: S, fill: "none", stroke: C.grid, "stroke-width": 1 });
    const halfG = g(s), secG = g(s), lineG = g(s), codeG = g(s), ptG = g(s), ringG = g(s), qG = g(s);
    const dots = pts.map((p) => { const [x, y] = px(p); return circle(ptG, x, y, 3.3, { fill: C.sub }); });
    // 카드의 [0.3, 0.8] — 테두리를 두르고, 원 바깥에 이름표 + 가는 선
    const p38 = px(P38), u38 = [P38[0] / Math.hypot(...P38), P38[1] / Math.hypot(...P38)], l38 = [OX + u38[0] * S * 1.2, OY - u38[1] * S * 1.2];
    const p38G = g(s);
    line(p38G, p38[0] + u38[0] * 6, p38[1] - u38[1] * 6, l38[0] - 1, l38[1] + 8, { color: C.sub, width: 1 });
    el(p38G, "circle", { cx: p38[0], cy: p38[1], r: 5.5, fill: "none", stroke: C.ink, "stroke-width": 1.6 });
    const p38T = text(p38G, l38[0] + 3, l38[1], "[0.3, 0.8]", { size: 15, weight: 600, fill: C.ink, cls: "halo tab" });
    circle(base, OX, OY, 2.5, { fill: C.sub });
    // 질문 (끌 수 있어요)
    let qv = Q0.slice(), p38Shown = false;
    const qHit = circle(qG, 0, 0, 18, { fill: "transparent" }), qDot = circle(qG, 0, 0, 7.5, { fill: C.b, stroke: C.bg, sw: 2.5 });
    const qT = text(qG, 0, 0, "질문 [0.2, 0.9]", { size: 15, weight: 700, fill: C.b, anchor: "end", cls: "halo tab" });
    qDot.style.pointerEvents = "none"; qT.style.pointerEvents = "none"; // 보이는 점이 끄는 손잡이(투명 원)를 가리지 않게

    const ctl = f.controls(), ro = readout(ctl);
    let userH = 6, userT = 2, step = 0, gen = 0;
    const toLast = () => { if (step !== LAST) f.goto(LAST); else { gen++; render(STEPS[LAST]); } };
    const tC = choice(ctl, [["1", "표 1개"], ["2", "표 2개"]], String(userT), (k) => { userT = Number(k); toLast(); }, "표 수");
    const sl = slider(ctl, { label: "선(비트) 수", min: 1, max: HMAX, value: userH }, (v) => { userH = v; toLast(); });

    // 선 하나 그리기 (원점 양쪽으로 len 만큼) — 법선 n 에 수직인 방향
    function lineEl(parent, n, len, o) {
      const d = [-n[1], n[0]], a = px([d[0] * len / S, d[1] * len / S]), b = px([-d[0] * len / S, -d[1] * len / S]);
      return line(parent, a[0], a[1], b[0], b[1], o);
    }
    // 부채꼴(통 하나) — 각도 a0 → a1 (수학 방향, 반시계)
    function sector(a0, a1, r) {
      const p0 = [OX + Math.cos(a0) * r, OY - Math.sin(a0) * r], p1 = [OX + Math.cos(a1) * r, OY - Math.sin(a1) * r];
      const large = ((a1 - a0 + 4 * Math.PI) % (2 * Math.PI)) > Math.PI ? 1 : 0;
      return `M${OX},${OY}L${p0[0].toFixed(1)},${p0[1].toFixed(1)}A${r},${r} 0 ${large} 0 ${p1[0].toFixed(1)},${p1[1].toFixed(1)}Z`;
    }
    // 선 h개가 만든 칸들: 반직선 각도를 정렬해서 이웃한 두 반직선 사이가 한 칸
    function wedges(ns, h) {
      const rays = [];
      ns.slice(0, h).forEach((n) => { const a = Math.atan2(n[0], -n[1]); rays.push(a, a + Math.PI); });
      const rs = rays.map((a) => ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)).sort((x, y) => x - y);
      if (rs.length === 2) return [[rs[0], rs[1]], [rs[1], rs[0] + 2 * Math.PI]];
      return rs.map((a, i) => [a, i + 1 < rs.length ? rs[i + 1] : rs[0] + 2 * Math.PI]);
    }
    const wedgeOf = (ws, a) => { const t = ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI); return ws.find(([a0, a1]) => (t >= a0 && t < a1) || (t + 2 * Math.PI >= a0 && t + 2 * Math.PI < a1)); };

    function placeQ() {
      const [x, y] = px(qv), u = [qv[0] / Math.hypot(...qv), qv[1] / Math.hypot(...qv)];
      qHit.setAttribute("cx", x); qHit.setAttribute("cy", y); qDot.setAttribute("cx", x); qDot.setAttribute("cy", y);
      // 글자는 원 바깥쪽 — [0.3, 0.8] 이름표가 있으면 그 왼쪽으로, 아니면 위치에 따라 왼쪽 · 가운데 · 오른쪽
      const lx = OX + u[0] * (S * 1.2), ly = OY - u[1] * (S * 1.2);
      const an = p38Shown ? "end" : u[0] > 0.3 ? "start" : u[0] < -0.3 ? "end" : "middle";
      // 설명 단계는 카드의 좌표까지, 직접 끌 때는 '질문'만 (원 옆에서도 그림판 안에 들어가게)
      qT.textContent = p38Shown ? "질문 [0.2, 0.9]" : "질문";
      const tw = p38Shown ? 118 : 34;
      let tx = lx + (an === "end" ? -4 : an === "start" ? 4 : 0);
      if (an === "start") tx = Math.min(tx, W - 6 - tw); else if (an === "end") tx = Math.max(tx, 6 + tw); else tx = Math.max(6 + tw / 2, Math.min(W - 6 - tw / 2, tx));
      qT.setAttribute("x", tx); qT.setAttribute("y", Math.max(16, Math.min(H - 10, ly)));
      qT.setAttribute("text-anchor", an);
    }

    // 한 단계의 모습을 처음부터 다 그려요. upto: 움직임 중 지금까지 그은 선 수 (없으면 h 전부)
    function render(st, upto) {
      const h = st.h === "user" ? userH : st.h, T = st.T === "user" ? userT : st.T, hh = upto ?? h;
      const A = query(D, qv, hh, T), ws1 = wedges(D.t1, hh), ws2 = T > 1 ? wedges(D.t2, hh) : null;
      qG.style.display = st.q ? "" : "none";
      p38Shown = !!(st.q && !st.free); p38G.style.display = p38Shown ? "" : "none";
      placeQ();
      // 1단계: 선 하나의 1 쪽 반평면 + 1 / 0
      halfG.replaceChildren();
      if (st.half) {
        const n = D.t1[0], a = Math.atan2(n[0], -n[1]); // 선 방향
        el(halfG, "path", { d: sector(a + Math.PI, a + 2 * Math.PI, RL * 0.98), fill: C.aSoft, stroke: "none" }).style.opacity = "0.75";
        // 법선 쪽이 1 (위쪽 = n 방향)
        const side = (sgn) => [OX + n[0] * sgn * 0.42 * S, OY - n[1] * sgn * 0.42 * S];
        const p1 = side(1), p0 = side(-1);
        // 반평면 색: n 쪽이 1 — sector 의 방향을 n 에 맞춰요
        const mid = a + 1.5 * Math.PI, dot = Math.cos(mid) * n[0] + Math.sin(mid) * n[1];
        if (dot < 0) halfG.firstChild.setAttribute("d", sector(a, a + Math.PI, RL * 0.98));
        text(halfG, p1[0], p1[1], "1", { size: 30, weight: 700, fill: C.a, anchor: "middle", cls: "halo" });
        text(halfG, p0[0], p0[1], "0", { size: 30, weight: 700, fill: C.sub, anchor: "middle", cls: "halo" });
      }
      // 질문의 통 (파란 칸 · 두 번째 표는 보라 칸)
      secG.replaceChildren();
      if (st.q) {
        if (ws2) { const w2 = wedgeOf(ws2, angOf(qv)); el(secG, "path", { d: sector(w2[0], w2[1], RF), fill: C.dSoft, stroke: C.d, "stroke-width": 1.5, "stroke-dasharray": "5 4" }); }
        const w = wedgeOf(ws1, angOf(qv)); el(secG, "path", { d: sector(w[0], w[1], RF), fill: C.aSoft, stroke: C.a, "stroke-width": 1.6, "fill-opacity": ws2 ? 0.75 : 1 });
      }
      // 선 (첫 표 = 진한 실선 · 둘째 표 = 보라 점선) + 선 번호 (선 3개까지)
      lineG.replaceChildren();
      if (ws2) D.t2.slice(0, hh).forEach((n) => lineEl(lineG, n, RL, { color: C.d, width: 1.4, dash: "6 5" }));
      D.t1.slice(0, hh).forEach((n, j) => {
        lineEl(lineG, n, RL, { color: C.ink, width: 1.6 });
        if (hh <= 3) { const d = [-n[1], n[0]], sg = d[0] >= 0 ? 1 : -1, e = px([d[0] * sg * (RL + 12) / S, d[1] * sg * (RL + 12) / S]); text(lineG, e[0], e[1], `선${j + 1}`, { size: 14, weight: 600, fill: C.sub, anchor: "middle", cls: "halo" }); }
      });
      // 칸마다 코드 (안쪽 빈 곳에) — 좁은 칸은 건너뛰고, 질문의 칸은 늘 굵게
      codeG.replaceChildren();
      if (st.codes) {
        const qw = st.q ? wedgeOf(ws1, angOf(qv)) : null, rr = 0.5 * S, wTxt = hh * 9 + 8;
        for (const w of ws1) {
          const mid = (w[0] + w[1]) / 2, v = [Math.cos(mid), Math.sin(mid)], mine = qw && w[0] === qw[0];
          if (!mine && 2 * rr * Math.sin((w[1] - w[0]) / 2) < wTxt) continue;
          text(codeG, OX + v[0] * rr, OY - v[1] * rr, codeOf(D.t1, hh, v), { size: 15, weight: mine ? 700 : 500, fill: mine ? C.a : C.sub, anchor: "middle", mono: 1, cls: "halo" });
        }
      }
      // 점 색: 1단계 = 비트(1 파랑 · 0 회색) · 질문이 있으면 후보(같은 통)만 파랑
      dots.forEach((d, i) => {
        const b1 = st.half && bit(D.t1[0], pts[i]) === "1", inC = st.q && A.cand.has(i);
        d.style.fill = b1 || inC ? C.a : C.sub;
        d.style.opacity = st.q && !inC ? "0.55" : "1";
      });
      // 고리: 진짜 이웃 10개 — 후보 안(초록) · 놓침(빨강)
      ringG.replaceChildren();
      if (st.q) A.truth.forEach((i) => { const [x, y] = px(pts[i]); el(ringG, "circle", { cx: x, cy: y, r: 7.5, fill: "none", stroke: A.cand.has(i) ? C.c : C.no, "stroke-width": 2.2 }); });
      // 계산 칸 (늘 두 줄)
      const bins = 2 ** hh, cells = hh === 1 ? 2 : 2 * hh;
      const r1 = `선 <b>${hh}</b>개 → 점마다 <b>${hh}</b>비트 · 가능한 코드 2<sup>${hh}</sup> = <b>${bins}</b>가지${cells < bins ? ` <span class="dim">(2D 그림에선 ${cells}칸만 생겨요 · 차원이 높으면 다 생겨요)</span>` : ""}`;
      const n1 = pts.filter((p) => bit(D.t1[0], p) === "1").length;
      const recall = `recall@10 = <b style="color:${A.hit === K ? "var(--fg-c)" : "var(--fg-no)"}">${A.hit}/10</b>`;
      const r2 = st.half ? `<span class="a">1</span> 쪽 점 <b>${n1}</b>개 · 0 쪽 점 <b>${N - n1}</b>개 <span class="dim">— 비트 하나로는 반씩 나뉠 뿐이에요</span>`
        : !st.q ? `<span class="dim">비트는 선 번호 순서예요: 첫 글자 = 선1, 둘째 = 선2 …</span>`
        : `질문 코드 <b class="b">${A.qc[0]}</b>${T > 1 ? ` · 둘째 표 <b class="d">${A.qc[1]}</b>` : ""} · ${T > 1 ? "두 통 합친 " : "같은 통 "}후보 <b>${A.cand.size}</b>개 <span class="dim">/ ${N}개</span> · ${recall}`;
      ro.set(`<div>${r1}</div><div>${r2}</div>`);
      sl.set(h); tC.set(String(T));
    }

    drag(s, qHit, (x, y) => {
      const a = Math.atan2(OY - y, x - OX), r = 0.92;
      qv = [Math.cos(a) * r, Math.sin(a) * r];
      if (step !== LAST) { f.goto(LAST); return; }
      gen++; render(STEPS[LAST]);
    }, { get: () => px(qv), step: 10, label: "질문 점 — 화살표 키로 원을 따라 움직여요" });

    return {
      async go(i, animate) {
        const my = ++gen, st = STEPS[i];
        step = i;
        if (!st.free) qv = Q0.slice(); // 설명 단계는 늘 카드의 질문 [0.2, 0.9] 로
        if (!animate || !st.grow) { render(st); if (animate && st.add2) { const n = [...secG.children, ...[...lineG.children].filter((e) => e.getAttribute("stroke-dasharray") === "6 5")]; n.forEach((e) => (e.style.opacity = "0")); await anim(600, (t) => { if (my === gen) n.forEach((e) => (e.style.opacity = String(t))); }); } return; }
        // 선을 하나씩 그어요: 원점에서 양쪽으로 자라나고, 다 그으면 칸 코드가 한 비트 늘어요
        const [from, to] = st.grow;
        for (let h = from + 1; h <= to; h++) {
          render(st, h - 1);
          const n = D.t1[h - 1], ln = lineEl(lineG, n, 0, { color: C.ink, width: 2.2 });
          await anim(to - from > 2 ? 380 : 520, (t) => {
            if (my !== gen) return;
            const d = [-n[1], n[0]], L = RL * t, a = px([d[0] * L / S, d[1] * L / S]), b = px([-d[0] * L / S, -d[1] * L / S]);
            ln.setAttribute("x1", a[0]); ln.setAttribute("y1", a[1]); ln.setAttribute("x2", b[0]); ln.setAttribute("y2", b[1]);
          });
          if (my !== gen) return;
        }
        render(st);
      },
      destroy() { gen++; },
    };
  },
};
