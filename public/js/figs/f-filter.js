// 그림: 필터는 언제 거나 — 사후(뽑고 → 거르기) vs 사전(거르고 → 뽑기) (Vector & Graph 03 카드 3 · Vector & Graph 02 카드 18)
//   같은 점 120개를 왼쪽 · 오른쪽에 나란히. 보라 점 = 조건에 맞는 '내 노트'. 질문(주황)과 가까운 '내 노트' 5개(k = 5)를 찾아요.
//   사후: 가까운 5개를 먼저 뽑고 거르면 결과가 모자라요. 사전: 보라 점만 남기고 그 안에서 다 재면 5개를 채우지만, 보라 점이 많으면 다 재야 해요(Flat 처럼).
//   다이얼 = 조건에 맞는 비율. 점마다 정해 둔 순번(u)이 비율보다 작으면 보라 — 비율을 올려도 이미 보라였던 점은 그대로예요.
import { svg, el, g, text, line, circle, slider, readout, anim, rng, C } from "./kit.js";

const W = 600, H = 400, N = 120, K = 5, PW = 284, PT = 36, PB = 392;
const PANX = [8, 308]; // 왼쪽(사후) · 오른쪽(사전)
const d2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
const SCL = PW - 28, ASP = (PB - PT - 28) / SCL; // 점 자리는 가로 0~1 · 세로 0~ASP — 가로세로 같은 배율이라 화면 거리 = 계산 거리
const toP = (side, p) => [PANX[side] + 14 + p[0] * SCL, PT + 14 + p[1] * SCL];

function makeData() {
  const r = rng(61), pts = [];
  for (let guard = 0; pts.length < N && guard < 30000; guard++) {
    const p = [0.02 + r() * 0.96, (0.02 + r() * 0.96) * ASP];
    if (pts.some((o) => d2(o, p) < 0.047 ** 2)) continue;
    pts.push(p);
  }
  // 순번: 무작위로 섞은 0 ~ N−1 → 비율 s 면 순번 < s·N 인 점이 보라 (보라 점 수가 정확히 s·N)
  const order = pts.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  const rank = new Array(N); order.forEach((i, k) => (rank[i] = k));
  // 질문 자리: 비율 20% 에서 사후 필터가 정확히 1개, 80% 에서 4개 이상 남는 곳 (가장자리는 피해서)
  let q = [0.5, 0.5], best = -1;
  for (let x = 0.25; x <= 0.75; x += 0.02) for (let y = 0.25; y <= 0.75; y += 0.02) {
    const c = [x, y * ASP];
    if (pts.some((o) => d2(o, c) < 0.035 ** 2)) continue;
    const top = pts.map((p, i) => [i, d2(p, c)]).sort((a, b) => a[1] - b[1]).slice(0, K).map((t) => t[0]);
    const at = (s) => top.filter((i) => rank[i] < Math.round(s * N)).length;
    if (at(0.2) !== 1 || at(0.8) < 4) continue;
    const score = -Math.hypot(x - 0.5, (y - 0.5) * ASP);
    if (score > best || best === -1) { best = score; q = c; }
  }
  return { pts, rank, q };
}
let DATA = null;
const data = () => DATA || (DATA = makeData());

// 비율 s 에서 두 방법의 결과
function solve(s) {
  const { pts, rank, q } = data(), m = Math.round(s * N), ok = (i) => rank[i] < m;
  const byD = pts.map((p, i) => [i, d2(p, q)]).sort((a, b) => a[1] - b[1]).map((t) => t[0]);
  const top = byD.slice(0, K), post = top.filter(ok), pre = byD.filter(ok).slice(0, K);
  return { m, ok, top, post, pre, measured: m };
}
const pctTxt = (s) => `${Math.round(s * 100)}%`;

function stepsFor() {
  const a = solve(0.2), b = solve(0.8);
  return [
    { cap: "점마다 꼬리표가 있어요. 보라 점이 '내 노트'(조건에 맞는 점)예요. 질문(주황 점)과 가까운 '내 노트' 5개를 찾고 싶어요.", s: 0.2 },
    { cap: "사후 필터(post-filter)는 먼저 조건 없이 질문과 가까운 5개(검은 고리)를 뽑아요.", s: 0.2, post: 1 },
    { cap: `그다음 '내 노트'가 아닌 것을 버려요. 5개 중 ${a.post.length}개만 남아 결과가 모자라요 — 카드 예처럼 40개를 뽑아도 10%만 맞으면 평균 4개예요.`, s: 0.2, post: 2 },
    { cap: `사전 필터(pre-filter)는 먼저 보라 점만 남기고, 그 ${a.m}개를 전부 재서 가까운 5개를 골라요. 5개를 다 채우고 정확해요.`, s: 0.2, post: 2, pre: 1 },
    { cap: `조건이 넓으면(80%) 반대예요. 사후 필터는 ${b.post.length}개가 남지만, 사전 필터는 맞는 점 ${b.m}개를 다 재야 해서 Flat 처럼 느려져요.`, s: 0.8, post: 2, pre: 1 },
    { cap: "이제 직접 조건에 맞는 비율을 바꿔 보세요. 좁을수록 사후 필터는 비고, 넓을수록 사전 필터가 잴 점이 늘어요.", s: "user", post: 2, pre: 1, free: 1 },
  ];
}

export default {
  aspect: H / W,
  steps: () => stepsFor().map((s) => s.cap),
  hint: "아래 다이얼을 움직여 보세요",
  mount(stage, f) {
    const STEPS = stepsFor(), LAST = STEPS.length - 1, { pts, q } = data();
    const s = svg(stage, W, H, "같은 점들에 사후 필터와 사전 필터를 걸어 결과 개수와 거리 계산 수를 비교하는 그림");
    const sides = [0, 1].map((side) => {
      const G = g(s), x0 = PANX[side];
      el(G, "rect", { x: x0, y: PT, width: PW, height: PB - PT, rx: 8, fill: "none", stroke: C.line, "stroke-width": 1.2 });
      const t = text(G, x0 + 4, 18, side ? "사전 필터" : "사후 필터", { size: 16, weight: 700, fill: C.ink });
      el(t, "tspan", { "font-weight": 500, fill: C.sub, dx: 8 }, side ? "거르고 → 뽑기" : "뽑고 → 거르기");
      const lineG = g(G), ptG = g(G), markG = g(G), qG = g(G);
      const dots = pts.map((p) => { const [x, y] = toP(side, p); return circle(ptG, x, y, 3.6, { fill: C.mute }); });
      const [qx, qy] = toP(side, q);
      circle(qG, qx, qy, 7, { fill: C.b, stroke: C.bg, sw: 2.5 });
      const qT = text(qG, qx + 11, qy - 13, "질문", { size: 15, weight: 700, fill: C.b, cls: "halo" });
      return { G, lineG, ptG, markG, dots, qx, qy, qT };
    });
    const ctl = f.controls(), ro = readout(ctl);
    let userS = 0.2, step = 0, gen = 0;
    const sl = slider(ctl, { label: "조건에 맞는 비율", min: 5, max: 100, step: 5, value: 20, fmt: (v) => `${v}%` }, (v) => {
      userS = v / 100;
      if (step !== LAST) f.goto(LAST); else { gen++; render(STEPS[LAST]); }
    });

    const ring = (G, side, i, color, dash) => { const [x, y] = toP(side, pts[i]); return el(G, "circle", { cx: x, cy: y, r: 8.5, fill: "none", stroke: color, "stroke-width": 2.2, "stroke-dasharray": dash || null }); };
    const cross = (G, side, i) => { const [x, y] = toP(side, pts[i]), k = 5.5; line(G, x - k, y - k, x + k, y + k, { color: C.no, width: 2.4 }); line(G, x - k, y + k, x + k, y - k, { color: C.no, width: 2.4 }); };

    // 한 단계의 모습 (비율 sv 는 움직임 중의 값을 줄 수 있어요)
    function render(st, sv) {
      const sh = sv ?? (st.s === "user" ? userS : st.s), R = solve(sh);
      const [L, Rt] = sides;
      sides.forEach((S) => { S.lineG.style.opacity = ""; S.markG.style.opacity = ""; }); // 멈춘 움직임의 흐림 지우기
      // 점 색: 보라 = 조건에 맞음. 사전 필터 쪽은 거른 뒤라 회색 점을 흐리게
      sides.forEach((S, side) => S.dots.forEach((d, i) => {
        const ok = R.ok(i);
        d.style.fill = ok ? C.d : C.mute;
        d.setAttribute("r", ok ? 4 : 3.4);
        d.style.opacity = side === 1 && st.pre && !ok ? "0.18" : "1";
      }));
      // 왼쪽(사후): 가까운 5개 → 거르기
      L.lineG.replaceChildren(); L.markG.replaceChildren();
      if (st.post) {
        R.top.forEach((i) => { const [x, y] = toP(0, pts[i]); line(L.lineG, L.qx, L.qy, x, y, { color: C.a, width: 1.2 }).style.opacity = "0.55"; });
        R.top.forEach((i) => {
          if (st.post === 1) ring(L.markG, 0, i, C.ink);
          else if (R.ok(i)) ring(L.markG, 0, i, C.c);
          else { ring(L.markG, 0, i, C.no, "3 3"); cross(L.markG, 0, i); }
        });
      }
      // 오른쪽(사전): 보라 점 전부와 거리 → 가까운 5개
      Rt.lineG.replaceChildren(); Rt.markG.replaceChildren();
      if (st.pre) {
        pts.forEach((p, i) => { if (!R.ok(i)) return; const [x, y] = toP(1, p); line(Rt.lineG, Rt.qx, Rt.qy, x, y, { color: C.a, width: 0.9 }).style.opacity = "0.35"; });
        R.pre.forEach((i) => ring(Rt.markG, 1, i, C.c));
      }
      // '질문' 글자는 그 칸의 고리와 가장 덜 겹치는 모서리에
      [[L, st.post ? R.top : []], [Rt, st.pre ? R.pre : []]].forEach(([S, ringed], side) => {
        // 가까운 자리부터 조금 먼 자리까지 — 고리와의 거리가 크고 점에서 너무 멀지 않은 곳
        const spots = [[11, -13, "start"], [-11, -13, "end"], [11, 15, "start"], [-11, 15, "end"], [0, -24, "middle"], [0, 26, "middle"], [24, -26, "start"], [-24, -26, "end"], [24, 28, "start"], [-24, 28, "end"]];
        const best = spots.map(([dx, dy, an], k) => {
          const cx = S.qx + dx + (an === "start" ? 15 : an === "end" ? -15 : 0), cy = S.qy + dy;
          const clear = ringed.length ? Math.min(...ringed.map((i) => { const [x, y] = toP(side, pts[i]); return Math.hypot(x - cx, y - cy); })) : (k === 0 ? 1e9 : 0);
          return { dx, dy, an, sc: Math.min(clear, 26) - Math.hypot(dx, dy) * 0.08 }; // 고리에서 26 넘게 떨어지면 충분 — 그다음은 점에 가까운 쪽
        }).sort((a, b) => b.sc - a.sc)[0];
        S.qT.setAttribute("x", S.qx + best.dx); S.qT.setAttribute("y", S.qy + best.dy); S.qT.setAttribute("text-anchor", best.an);
      });
      // 아직 안 쓰는 쪽은 흐리게
      L.G.style.opacity = "1"; Rt.G.style.opacity = st.post && !st.pre ? "0.35" : "1";
      // 계산 칸 (늘 두 줄)
      const okc = (n) => `<b style="color:${n >= K ? "var(--fg-c)" : "var(--fg-no)"}">${n}</b>`;
      const exp = `<span class="dim">(평균 5 × ${pctTxt(sh)} = ${+(K * sh).toFixed(2)}개)</span>`;
      const rows = !st.post
        ? [`조건에 맞는 점(<span class="d">보라</span>) <b>${R.m}</b>개 / ${N}개 <span class="dim">(${pctTxt(sh)})</span> · k = ${K}`, `<span class="dim">찾고 싶은 것: 보라 점 중에서 질문과 가까운 5개</span>`]
        : [
          st.post === 1 ? `사후 필터: 조건 없이 가까운 <b>5</b>개를 먼저 뽑았어요 <span class="dim">(보라 ${R.top.filter(R.ok).length}개 · 회색 ${K - R.top.filter(R.ok).length}개)</span>` : `사후 필터: 결과 ${okc(R.post.length)}개 / ${K}개 ${exp}`,
          st.pre ? `사전 필터: 결과 ${okc(R.pre.length)}개 / ${K}개 · 거리 계산 <b>${R.measured}</b>번 <span class="dim">(보라 점 전부 · 전체 ${N}개${R.measured === N ? " = Flat" : ""})</span>` : `<span class="dim">사전 필터는 4단계에서 비교해요</span>`,
        ];
      ro.set(rows.map((x) => `<div>${x}</div>`).join(""));
      sl.set(Math.round(sh * 100));
    }

    return {
      async go(i, animate) {
        const my = ++gen, st = STEPS[i], prevS = step === LAST ? userS : STEPS[step].s === "user" ? userS : STEPS[step].s;
        step = i;
        const target = st.s === "user" ? userS : st.s;
        // 비율이 바뀌는 단계(80%)에서는 보라 점이 하나씩 늘어나는 걸 보여 줘요
        if (animate && Math.abs(target - prevS) > 0.001 && !st.free) {
          await anim(1100, (t) => { if (my === gen) render(st, Math.round((prevS + (target - prevS) * t) * 100) / 100); }, (t) => t);
          if (my === gen) render(st);
          return;
        }
        render(st);
        if (!animate) return;
        const [L, Rt] = sides, fade = (nodes, ms) => { nodes.forEach((n) => (n.style.opacity = "0")); return anim(ms, (t) => { if (my === gen) nodes.forEach((n) => (n.style.opacity = String(t))); }); };
        if (st.post === 1) await fade([L.lineG, L.markG], 450);
        else if (st.post === 2 && !st.pre) await fade([L.markG], 400);
        else if (st.pre && !st.free && i === 3) await fade([Rt.lineG, Rt.markG], 600);
      },
      destroy() { gen++; },
    };
  },
};
