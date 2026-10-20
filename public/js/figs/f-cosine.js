// 그림: 두 화살표로 보는 내적 · 코사인 · L2 거리 · 정규화 (Vector & Graph 01 — 카드 5 ~ 8)
//   opts.mode = "dot" | "cos" | "l2" | "norm". 화살표 끝의 점을 끌면(또는 초점 + 화살표 키) 아래 계산이 바로 바뀌어요. 0.5 칸씩 붙어요.
import { svg, el, g, text, line, circle, path, arrowHead, drag, readout, tween, show, C, num as fmt } from "./kit.js";

const W = 600, H = 380, OX = 230, OY = 250, S = 48; // 원점 · 한 칸 = 48
let BX = [-4.5, 7.5], BY = [-2.5, 5]; // 끌 수 있는 범위 (칸) — 좁은 칸에서는 아래 mount 에서 줄여요
const px = (v) => [OX + v[0] * S, OY - v[1] * S];
const len = (v) => Math.hypot(v[0], v[1]);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
const ang = (v) => Math.atan2(v[1], v[0]);

const STEPS = {
  dot: [
    { cap: "A = [3, 1], B = [2, 2.5]. 내적은 같은 칸끼리 곱해서 더해요: 3×2 + 1×2.5 = 8.5.", a: [3, 1], b: [2, 2.5] },
    { cap: "그림으로 보면, B 를 A 위로 비춘 그림자 길이 × A 의 길이와 같아요.", a: [3, 1], b: [2, 2.5], proj: 1 },
    { cap: "B 를 A 쪽으로 돌리면 그림자가 길어져서 내적이 커져요.", a: [3, 1], b: [3, 2], proj: 1 },
    { cap: "직각이면 그림자가 0 이라서 내적도 0 이에요.", a: [3, 1], b: [-1, 3], proj: 1 },
    { cap: "B 의 길이를 두 배로 늘리면 내적도 두 배가 돼요. 내적은 길이에 영향을 받아요 — 긴 글 편애가 여기서 생겨요.", a: [3, 1], b: [5, 3], proj: 1, ghost: [2.5, 1.5] },
    { cap: "이제 직접 끌어 보세요. 화살표 끝의 점을 움직이면 계산이 바로 바뀌어요.", proj: 1, free: 1 },
  ],
  cos: [
    { cap: "코사인은 두 화살표 사이의 각도만 봐요. cos θ = A·B ÷ (|A| × |B|).", a: [3, 1], b: [2, 2.5], arc: 1 },
    { cap: "B 를 같은 방향으로 두 배 늘려도 각도가 그대로라서 cos 도 그대로예요. 길이는 빼고 방향만 봐요.", a: [3, 1], b: [4, 5], arc: 1, ghost: [2, 2.5] },
    { cap: "각도가 작을수록 cos 가 1 에 가까워요 — 뜻이 비슷하다는 신호예요.", a: [3, 1], b: [4, 2], arc: 1 },
    { cap: "직각이면 cos = 0 이에요. 관계가 없다는 뜻이에요.", a: [3, 1], b: [-1, 3], arc: 1 },
    { cap: "반대 방향이면 cos = −1 이에요.", a: [3, 1], b: [-3, -1], arc: 1 },
    { cap: "이제 직접 끌어 보세요. 길이를 바꿀 때와 방향을 바꿀 때 cos 가 어떻게 다른지 보세요.", arc: 1, free: 1 },
  ],
  l2: [
    { cap: "L2 거리는 두 화살표 끝점 사이의 직선 길이예요. 작을수록 가까워요.", a: [3, 1], b: [2, 2.5], gap: 1 },
    { cap: "[1.5, 2] 와 [3, 4] 는 방향이 같아서 cos = 1 이지만, 끝점 사이 거리는 2.5 예요. L2 는 길이 차이까지 봐요.", a: [1.5, 2], b: [3, 4], gap: 1, arc: 1 },
    { cap: "그래서 정렬 방향이 반대예요. 코사인 · 내적은 클수록, L2 는 작을수록 비슷한 거예요.", a: [3, 1], b: [2.5, 1.5], gap: 1, arc: 1 },
    { cap: "이제 직접 끌어 보세요. 거리와 코사인이 서로 다르게 움직이는 곳을 찾아보세요.", gap: 1, arc: 1, free: 1 },
  ],
  norm: [
    { cap: "정규화는 화살표를 길이 1 로 줄이는 거예요. 끝이 반지름 1 인 원 위에 놓여요.", a: [3, 1], b: [2, 2.5], unit: 1 },
    { cap: "길이가 1 이면 분모가 1 × 1 이라서 cos = 내적이에요. 나눗셈이 없어 더 빨라요.", a: [3, 1], b: [2, 2.5], unit: 1, arc: 1 },
    { cap: "길이만 다른 [1.5, 2] 와 [3, 4] 는 정규화하면 같은 점 [0.6, 0.8] 이 돼요.", a: [1.5, 2], b: [3, 4], unit: 1 },
    { cap: "L2 순위도 같아져요. 원 위의 두 점 사이 거리는 |Â − B̂|² = 2 − 2·cos 로 cos 만으로 정해져요.", a: [3, 1], b: [2, 2.5], unit: 1, ugap: 1 },
    { cap: "이제 직접 끌어 보세요. 원 위의 점(Â, B̂)은 방향만 따라 움직여요.", unit: 1, ugap: 1, free: 1 },
  ],
};

export default {
  aspect: H / W,
  aspectNarrow: 0.75, // 폰: 원점 둘레만 크게 (글자가 작아지지 않게)
  steps: (o) => (STEPS[o.mode] || STEPS.cos).map((s) => s.cap),
  hint: "화살표 끝의 점을 끌어 보세요",
  mount(stage, f) {
    const mode = STEPS[f.opts.mode] ? f.opts.mode : "cos", steps = STEPS[mode];
    const s = svg(stage, W, H, "두 화살표 A, B 와 그 사이의 관계를 보여 주는 좌표 평면");
    if (f.narrow) { BX = [-3.4, 5.4]; BY = [-1.4, 5.1]; s.setAttribute("viewBox", `${OX - 3.6 * S} ${OY - 5.3 * S} ${9.2 * S} ${6.9 * S}`); }
    else { BX = [-4.5, 7.5]; BY = [-2.5, 5]; }
    // 모눈
    const grid = g(s);
    for (let x = Math.ceil(BX[0]); x <= BX[1]; x++) line(grid, OX + x * S, OY - BY[1] * S - 10, OX + x * S, OY - BY[0] * S + 10, { color: C.grid });
    for (let y = Math.ceil(BY[0]); y <= BY[1]; y++) line(grid, OX + BX[0] * S - 10, OY - y * S, OX + BX[1] * S + 10, OY - y * S, { color: C.grid });
    line(grid, OX + BX[0] * S - 10, OY, OX + BX[1] * S + 10, OY, { color: C.line, width: 1.4 });
    line(grid, OX, OY - BY[1] * S - 10, OX, OY - BY[0] * S + 10, { color: C.line, width: 1.4 });
    for (let x = 1; x <= 7; x++) text(grid, OX + x * S, OY + 14, String(x), { size: 11, anchor: "middle", fill: C.mute });
    for (let y = 1; y <= 5; y++) text(grid, OX - 10, OY - y * S, String(y), { size: 11, anchor: "end", fill: C.mute });
    text(grid, OX - 8, OY + 14, "0", { size: 11, anchor: "end", fill: C.mute });

    // 겹 (보였다 숨겼다)
    const unitG = g(s), projG = g(s), arcG = g(s), gapG = g(s), ghostG = g(s);
    const unitC = el(unitG, "circle", { cx: OX, cy: OY, r: S, fill: "none", stroke: C.sub, "stroke-dasharray": "4 4", "stroke-width": 1.4 });
    const ua = line(unitG, 0, 0, 0, 0, { color: C.a, width: 2.5 }), ub = line(unitG, 0, 0, 0, 0, { color: C.b, width: 2.5 });
    ua.setAttribute("marker-end", arrowHead(s, C.a)); ub.setAttribute("marker-end", arrowHead(s, C.b));
    const uaT = text(unitG, 0, 0, "Â", { size: 14, weight: 700, fill: C.a, cls: "halo" }), ubT = text(unitG, 0, 0, "B̂", { size: 14, weight: 700, fill: C.b, cls: "halo" });
    const ugap = line(unitG, 0, 0, 0, 0, { color: C.ink, width: 2, dash: "3 3" });
    const shadow = el(projG, "line", { stroke: C.b, "stroke-width": 9, "stroke-linecap": "round", opacity: 0.28 });
    const perp = line(projG, 0, 0, 0, 0, { color: C.b, dash: "5 4", width: 1.5 });
    const shT = text(projG, 0, 0, "그림자", { size: 13, weight: 600, fill: C.b, anchor: "middle", cls: "halo" });
    const arc = path(arcG, "", { stroke: C.ink, width: 1.6 });
    const arcT = text(arcG, 0, 0, "", { size: 15, weight: 700, fill: C.ink, cls: "halo" });
    const gap = line(gapG, 0, 0, 0, 0, { color: C.ink, width: 2, dash: "6 5" });
    const gapT = text(gapG, 0, 0, "", { size: 14, weight: 700, fill: C.ink, anchor: "middle", cls: "halo" });
    const ghost = el(ghostG, "line", { stroke: C.b, "stroke-width": 2.5, "stroke-dasharray": "4 5", opacity: 0.5, x1: OX, y1: OY });
    const ghostT = text(ghostG, 0, 0, "전", { size: 12, fill: C.b, cls: "halo" });

    // 화살표 A, B + 끄는 점
    function vec(color, name) {
      const gg = g(s);
      const l = line(gg, OX, OY, OX, OY, { color, width: 3.2 }); l.setAttribute("marker-end", arrowHead(s, color));
      const t = text(gg, 0, 0, name, { size: 18, weight: 700, fill: color, cls: "halo" });
      const dotE = circle(gg, 0, 0, 6.5, { fill: color, stroke: C.bg, sw: 2 }); dotE.setAttribute("pointer-events", "none");
      const hit = circle(gg, 0, 0, 18, { fill: "transparent" }); // 잡는 칸은 보이는 점보다 크게, 맨 위에
      return { l, t, hit, dot: dotE, g: gg };
    }
    const A = vec(C.a, "A"), B = vec(C.b, "B");
    const st = { a: steps[0].a.slice(), b: steps[0].b.slice(), on: steps[0], ghost: null };
    const ro = readout(f.controls());

    const snap = (v) => Math.round(v * 2) / 2;
    const fmtV = (v) => `[${fmt(v[0], 2)}, ${fmt(v[1], 2)}]`;
    function draw() {
      const { a, b } = st, on = st.on;
      for (const [V, v] of [[A, a], [B, b]]) {
        const [x, y] = px(v), L = len(v), k = L > 0.01 ? Math.max(0, (L * S - 2) / (L * S)) : 0;
        V.l.setAttribute("x2", OX + (x - OX) * k); V.l.setAttribute("y2", OY + (y - OY) * k);
        V.dot.setAttribute("cx", x); V.dot.setAttribute("cy", y); V.hit.setAttribute("cx", x); V.hit.setAttribute("cy", y);
        const n = L > 0.01 ? [v[0] / L, v[1] / L] : [1, 0];
        V.t.setAttribute("x", x + n[0] * 18 + (n[1] > 0.9 ? 12 : 0)); V.t.setAttribute("y", y - n[1] * 18);
        V.hit.setAttribute("aria-valuetext", fmtV(v));
      }
      const la = len(a), lb = len(b), d = dot(a, b), cos = la && lb ? d / (la * lb) : 0;
      // 그림자 (B 를 A 위로)
      const t = la ? d / (la * la) : 0, pr = [a[0] * t, a[1] * t], [p1x, p1y] = px(pr), [bx, by] = px(b);
      shadow.setAttribute("x1", OX); shadow.setAttribute("y1", OY); shadow.setAttribute("x2", p1x); shadow.setAttribute("y2", p1y);
      perp.setAttribute("x1", bx); perp.setAttribute("y1", by); perp.setAttribute("x2", p1x); perp.setAttribute("y2", p1y);
      shT.setAttribute("x", (OX + p1x) / 2 + 10); shT.setAttribute("y", (OY + p1y) / 2 + 16);
      // 각도 호
      const a1 = ang(a), a2 = ang(b);
      let da = a2 - a1; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
      const r = 36, sx = OX + Math.cos(a1) * r, sy = OY - Math.sin(a1) * r, ex = OX + Math.cos(a1 + da) * r, ey = OY - Math.sin(a1 + da) * r;
      arc.setAttribute("d", la && lb ? `M${sx},${sy} A${r},${r} 0 0 ${da > 0 ? 0 : 1} ${ex},${ey}` : "");
      const mid = a1 + da / 2;
      arcT.setAttribute("x", OX + Math.cos(mid) * (r + 22) - 8); arcT.setAttribute("y", OY - Math.sin(mid) * (r + 22));
      arcT.textContent = `θ ${Math.round(Math.abs(da) * 180 / Math.PI)}°`;
      // 끝점 사이
      const [ax, ay] = px(a);
      gap.setAttribute("x1", ax); gap.setAttribute("y1", ay); gap.setAttribute("x2", bx); gap.setAttribute("y2", by);
      const l2 = Math.hypot(a[0] - b[0], a[1] - b[1]);
      gapT.setAttribute("x", (ax + bx) / 2 + 14); gapT.setAttribute("y", (ay + by) / 2 - 10); gapT.textContent = fmt(l2, 2);
      // 단위원 위
      const na = la ? [a[0] / la, a[1] / la] : [0, 0], nb = lb ? [b[0] / lb, b[1] / lb] : [0, 0], [uax, uay] = px(na), [ubx, uby] = px(nb);
      ua.setAttribute("x1", OX); ua.setAttribute("y1", OY); ua.setAttribute("x2", uax); ua.setAttribute("y2", uay);
      ub.setAttribute("x1", OX); ub.setAttribute("y1", OY); ub.setAttribute("x2", ubx); ub.setAttribute("y2", uby);
      uaT.setAttribute("x", uax + na[0] * 12 + 4); uaT.setAttribute("y", uay - na[1] * 14 + 2); ubT.setAttribute("x", ubx + nb[0] * 12 - 14); ubT.setAttribute("y", uby - nb[1] * 14 - 4);
      ugap.setAttribute("x1", uax); ugap.setAttribute("y1", uay); ugap.setAttribute("x2", ubx); ugap.setAttribute("y2", uby);
      if (st.ghost) { const [gx, gy] = px(st.ghost); ghost.setAttribute("x2", gx); ghost.setAttribute("y2", gy); ghostT.setAttribute("x", gx + 6); ghostT.setAttribute("y", gy - 8); }
      // 계산 칸
      const A_ = `<span class="a">A</span>`, B_ = `<span class="b">B</span>`;
      const vecs = `${A_} = ${fmtV(a)} · ${B_} = ${fmtV(b)}`;
      const dotL = `${A_}·${B_} = ${fmt(a[0], 2)}×${fmt(b[0], 2)} + ${fmt(a[1], 2)}×${fmt(b[1], 2)} = <b>${fmt(d, 2)}</b>`;
      const lens = `|${A_}| = ${fmt(la, 2)} · |${B_}| = ${fmt(lb, 2)}`;
      const cosL = `cos θ = ${fmt(d, 2)} ÷ (${fmt(la, 2)} × ${fmt(lb, 2)}) = <b>${la && lb ? fmt(cos, 3) : "—"}</b>`;
      const rows = mode === "dot" ? [vecs, dotL, `${A_} 의 길이 × 그림자 = ${fmt(la, 2)} × ${fmt(la ? d / la : 0, 2)} = ${fmt(d, 2)}`]
        : mode === "cos" ? [vecs, `${A_}·${B_} = ${fmt(d, 2)} · ${lens}`, cosL]
        : mode === "l2" ? [vecs, `${A_} − ${B_} = ${fmtV([a[0] - b[0], a[1] - b[1]])} → L2 = √(${fmt((a[0] - b[0]) ** 2, 2)} + ${fmt((a[1] - b[1]) ** 2, 2)}) = <b>${fmt(l2, 2)}</b> <span class="dim">(작을수록 가까움)</span>`, `비교: cos θ = <b>${la && lb ? fmt(cos, 3) : "—"}</b> <span class="dim">(클수록 가까움)</span>`]
        : [`Â = ${A_} ÷ ${fmt(la, 2)} = ${fmtV(na)} · B̂ = ${B_} ÷ ${fmt(lb, 2)} = ${fmtV(nb)}`, `Â·B̂ = <b>${fmt(dot(na, nb), 3)}</b> = cos θ`, `|Â − B̂|² = 2 − 2×${fmt(cos, 3)} = <b>${fmt(2 - 2 * cos, 3)}</b>`];
      ro.set(rows.map((x) => `<div>${x}</div>`).join(""));
    }
    function layers(on) {
      show(projG, !!on.proj); show(arcG, !!on.arc); show(gapG, !!on.gap); show(ghostG, !!on.ghost && !!st.ghost);
      show(unitG, !!on.unit); show(ugap, !!on.ugap);
    }
    // 끌기
    for (const [V, k] of [[A, "a"], [B, "b"]]) {
      drag(s, V.hit, (x, y) => {
        const v = [Math.min(BX[1], Math.max(BX[0], snap((x - OX) / S))), Math.min(BY[1], Math.max(BY[0], snap((OY - y) / S)))];
        if (v[0] === st[k][0] && v[1] === st[k][1]) return;
        st[k] = v; st.ghost = null; show(ghostG, false); draw();
      }, { get: () => px(st[k]), step: S / 2, label: `${k === "a" ? "A" : "B"} 화살표 끝 — 화살표 키로 움직여요` });
    }
    layers(steps[0]); draw();
    return {
      async go(i, animate) {
        const on = steps[i]; st.on = on; st.ghost = on.ghost || null;
        layers(on);
        if (on.free || !on.a) { draw(); return; }
        const cur = { ax: st.a[0], ay: st.a[1], bx: st.b[0], by: st.b[1] };
        await tween(cur, { ax: on.a[0], ay: on.a[1], bx: on.b[0], by: on.b[1] }, animate ? 750 : 0, (o) => { st.a = [o.ax, o.ay]; st.b = [o.bx, o.by]; draw(); });
        st.a = on.a.slice(); st.b = on.b.slice(); draw();
      },
    };
  },
};
