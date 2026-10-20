// 그림: 차원의 저주 — 무작위 점 150개의 '모든 쌍 거리 ÷ 평균' 막대그래프 (Vector & Graph 01 — 카드 9)
//   2 → 10 → 100 → 1,000차원으로 늘리면 막대가 평균(1) 근처로 좁아지고, 질문 점의 가장 가까운 점(파란 선)과 가장 먼 점(주황 선)이 붙어요.
//   점은 kit.rng 씨앗으로 뿌려서 늘 같은 그림 · 차원마다 한 번만 계산해서 기억해요 (1,000차원도 수십 ms).
import { svg, g, text, line, rect, el, tween, readout, choice, rng, C, fmt } from "./kit.js";

const N = 150, DIMS = [2, 10, 100, 1000], BIN = 0.05, XMAX = 2.75, NB = Math.round(XMAX / BIN);
const PAIRS = (N * (N - 1)) / 2;
const comma = (n) => n.toLocaleString("en-US");
const dimName = (d) => `${comma(d)}차원`;

// d차원 단위 정육면체에 점 N개 → 모든 쌍 거리 · 평균 · 막대 · 질문 점(0번)의 가장 가까운/먼 거리
const cache = new Map();
function sim(d) {
  if (cache.has(d)) return cache.get(d);
  const r = rng(7 + d), X = new Float64Array(N * d);
  for (let i = 0; i < X.length; i++) X[i] = r();
  const D = new Float64Array(PAIRS);
  let k = 0, sum = 0;
  for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
    let s = 0;
    for (let a = i * d, b = j * d, e = a + d; a < e; a++, b++) { const t = X[a] - X[b]; s += t * t; }
    D[k++] = Math.sqrt(s); sum += D[k - 1];
  }
  const mean = sum / PAIRS, bins = new Array(NB).fill(0);
  let lo = Infinity, hi = 0;
  for (let p = 0; p < PAIRS; p++) {
    const v = D[p] / mean; lo = Math.min(lo, v); hi = Math.max(hi, v);
    bins[Math.min(NB - 1, Math.floor(v / BIN))]++;
  }
  // 질문 점 = 0번 점: 쌍 (0, j) 는 D 의 맨 앞 N−1 칸
  let near = Infinity, far = 0;
  for (let j = 0; j < N - 1; j++) { near = Math.min(near, D[j]); far = Math.max(far, D[j]); }
  const out = { d, mean, share: bins.map((b) => (b / PAIRS) * 100), lo, hi, near, far, ratio: near / far };
  cache.set(d, out);
  return out;
}
// y 축 눈금: 가장 높은 막대보다 조금 큰 '좋은' 수
const niceMax = (m) => [2, 4, 5, 8, 10, 15, 20, 25, 30, 40, 50, 60, 80, 100].find((v) => v >= m * 1.05) || 100;

function captions() {
  const [a, b, c, e] = DIMS.map(sim);
  return [
    `점 150개를 2차원(정사각형)에 무작위로 뿌리고, 모든 쌍의 거리를 평균 거리로 나눠 막대로 쌓았어요. 0 근처부터 ${fmt(a.hi, 1)}까지 넓게 퍼져요.`,
    `10차원으로 늘리면 막대가 평균(1) 쪽으로 모여요. 질문 점에서 가장 가까운 점(파란 선)이 가장 먼 점(주황 선)의 ${fmt(b.ratio, 2)}배예요.`,
    `100차원: 거의 모든 쌍이 평균 근처예요. 가장 가까운 점도 가장 먼 점의 ${fmt(c.ratio, 2)}배나 멀어요.`,
    `1,000차원: 가까운 ÷ 먼 = ${fmt(e.ratio, 2)}. 다 비슷하게 멀어서 '가장 가까운 것'을 고르는 의미가 약해져요.`,
    "이제 직접 차원을 바꿔 보세요. 실제 임베딩은 무작위 숫자와 달리, 뜻이 몇몇 방향에 몰리도록 학습돼 있어요.",
  ];
}

export default {
  aspect: 0.6,
  aspectNarrow: 0.92,
  steps: () => captions(),
  hint: "아래에서 차원을 골라 보세요",
  mount(stage, f) {
    const nar = !!f.narrow;
    const W = nar ? 380 : 560, H = nar ? 350 : 336;
    const L = nar ? 48 : 64, R = W - (nar ? 16 : 24), T = nar ? 84 : 72, B = H - (nar ? 58 : 56); // 그래프 칸
    const xs = (v) => L + (v / XMAX) * (R - L);
    const s = svg(stage, W, H, "무작위 점들의 쌍 거리 ÷ 평균 거리 막대그래프. 차원이 커지면 막대가 1 근처로 모여요");

    // 위: 지금 차원 · 가까운 ÷ 먼
    const head = g(s);
    const dimT = text(head, nar ? 14 : 18, 26, "", { size: 20, weight: 700 });
    const ratioT = el(head, "text", { x: R, y: 26, "text-anchor": "end", "dominant-baseline": "middle", "font-size": 16, "font-weight": 700, class: "fg-t tab" });
    el(ratioT, "tspan", { fill: C.a }, "가까운");
    el(ratioT, "tspan", { fill: C.ink }, " ÷ ");
    el(ratioT, "tspan", { fill: C.b }, "먼");
    const rV = el(ratioT, "tspan", { fill: C.ink }, " = ");

    // 축 · 눈금
    const axes = g(s);
    const yTicks = [0, 1, 2].map((k) => ({ ln: line(axes, L, 0, R, 0, { color: C.grid }), t: text(axes, L - 6, 0, "", { size: 14, anchor: "end", fill: C.mute, cls: "fg-t tab" }), k }));
    for (let v = 0; v <= XMAX + 1e-9; v += 0.5) {
      line(axes, xs(v), B, xs(v), B + 5, { color: C.line });
      text(axes, xs(v), B + 18, fmt(v, 1), { size: 14, anchor: "middle", fill: C.mute, cls: "fg-t tab" });
    }
    text(axes, (L + R) / 2, B + 42, "거리 ÷ 평균 거리", { size: 14, anchor: "middle", fill: C.sub, weight: 600 });
    line(axes, xs(1), T - 4, xs(1), B, { color: C.sub, dash: "4 4", width: 1.2 });

    // 막대
    const barG = g(s), bw = (R - L) / NB;
    const bars = Array.from({ length: NB }, (_, k) => rect(barG, L + k * bw + 0.5, B, Math.max(1, bw - 1), 0, { r: 0, fill: C.mute }));
    bars.forEach((b) => b.style.setProperty("fill-opacity", "0.5"));
    line(g(s), L, B, R, B, { color: C.ink, width: 1.2 }); // 바닥선은 막대 위에

    // 질문 점의 가장 가까운(파란) · 가장 먼(주황) 거리 선
    const mk = g(s);
    const mkLine = (color) => line(mk, 0, T - 6, 0, B, { color, width: 2.4 });
    const nearL = mkLine(C.a), farL = mkLine(C.b);
    const nearT = text(mk, 0, T - 16, "가장 가까운 점", { size: 14, weight: 700, fill: C.a, cls: "fg-t halo" });
    const farT = text(mk, 0, T - 16, "가장 먼 점", { size: 14, weight: 700, fill: C.b, cls: "fg-t halo" });

    // 아래 칸: 차원 고르기 + 계산
    const ctl = f.controls();
    const pick = choice(ctl, DIMS.map((d) => [String(d), dimName(d)]), "2", (k) => {
      const d = Number(k);
      if (f.step() === DIMS.length) { free = d; draw(d, true); }
      else f.goto(DIMS.indexOf(d));
    }, "차원 고르기");
    const ro = readout(ctl);

    let cur = { ymax: 4, h: new Array(NB).fill(0), near: 0.5, far: 1.5 }, free = 1000, tok = 0;
    function paint(o) {
      const ys = (v) => B - (v / o.ymax) * (B - T);
      for (let k = 0; k < NB; k++) { const y = ys(o.h[k]); bars[k].setAttribute("y", y); bars[k].setAttribute("height", Math.max(0, B - y)); }
      yTicks.forEach((t) => { const v = (o.ymax * t.k) / 2, y = ys(v); t.ln.setAttribute("y1", y); t.ln.setAttribute("y2", y); t.t.setAttribute("y", y); t.t.textContent = t.k ? `${fmt(v, 1)}%` : "0"; });
      const xn = xs(o.near), xf = xs(o.far);
      for (const [ln, x] of [[nearL, xn], [farL, xf]]) { ln.setAttribute("x1", x); ln.setAttribute("x2", x); }
      // 이름표: 파란 것은 선 왼쪽, 주황은 오른쪽 (자리가 없으면 반대쪽)
      const wN = 100, wF = 72;
      if (xn - 6 - wN > 2) { nearT.setAttribute("x", xn - 6); nearT.setAttribute("text-anchor", "end"); } else { nearT.setAttribute("x", xn + 6); nearT.setAttribute("text-anchor", "start"); }
      if (xf + 6 + wF < W - 2) { farT.setAttribute("x", xf + 6); farT.setAttribute("text-anchor", "start"); } else { farT.setAttribute("x", xf - 6); farT.setAttribute("text-anchor", "end"); }
      const clash = nearT.getAttribute("text-anchor") === "start" && xf - xn < wN + 12;
      farT.setAttribute("y", clash ? T - 38 : T - 16);
    }
    // d차원 모습으로 (animate 면 막대 · 선이 부드럽게 옮겨 가요)
    async function draw(d, animate) {
      const S = sim(d), my = ++tok;
      pick.set(String(d));
      dimT.textContent = dimName(d);
      rV.textContent = ` = ${fmt(S.ratio, 2)}`;
      const to = { ymax: niceMax(Math.max(...S.share)), near: S.near / S.mean, far: S.far / S.mean };
      const seen = DIMS.filter((x) => x <= d || f.step() === DIMS.length);
      ro.set(`<div><b>${dimName(d)}</b> · 점 ${N}개 · 모든 쌍 ${comma(PAIRS)}개 · 평균 거리 ${fmt(S.mean, 2)} · 거리 ÷ 평균은 ${fmt(S.lo, 2)} ~ ${fmt(S.hi, 2)}</div>`
        + `<div>질문 점에서 <span class="a">가장 가까운 점</span> ${fmt(S.near, 2)} · <span class="b">가장 먼 점</span> ${fmt(S.far, 2)} → 가까운 ÷ 먼 = <b>${fmt(S.ratio, 2)}</b></div>`
        + `<div class="dim">${seen.map((x) => (x === d ? `<b>${dimName(x)} ${fmt(sim(x).ratio, 2)}</b>` : `${dimName(x)} ${fmt(sim(x).ratio, 2)}`)).join(" → ")}${seen.length < DIMS.length ? " → …" : " (1 에 가까워져요)"}</div>`);
      const from = { ymax: cur.ymax, near: cur.near, far: cur.far, t: 0 }, h0 = cur.h.slice();
      await tween(from, { ...to, t: 1 }, animate ? 750 : 0, (o) => {
        if (my !== tok) return;
        cur = { ymax: o.ymax, near: o.near, far: o.far, h: h0.map((v, k) => v + (S.share[k] - v) * o.t) };
        paint(cur);
      });
      if (my === tok) { cur = { ...to, h: S.share.slice() }; paint(cur); }
    }
    return {
      go(i, animate) { return draw(i < DIMS.length ? DIMS[i] : free, animate); },
    };
  },
};
