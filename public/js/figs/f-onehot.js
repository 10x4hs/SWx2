// 그림: 원-핫은 뜻을 모르고, 분산 표현은 알아요 (Vector & Graph 01 — 카드 2)
//   단어 4개의 원-핫 줄(0/1 표) → 어느 두 단어든 겹치는 1 이 없어서 cos 0 · 거리 √2 로 다 똑같아요(오른쪽 막대 6개가 같은 길이).
//   분산 표현(숫자 2개짜리 예시)은 평면 위의 점 — 비슷한 단어는 가깝고 아니면 멀어요. 막대가 줄어드는 게 핵심 변화예요. 거리 · cos 은 코드로 계산해요.
import { svg, g, text, line, rect, circle, el, tween, readout, clamp, C, fmt } from "./kit.js";

const WORDS = [
  { t: "고양이", c: "a", dense: [0.9, 0.2] },
  { t: "강아지", c: "b", dense: [0.8, 0.3] },
  { t: "회의", c: "c", dense: [0.2, 0.9] },
  { t: "미팅", c: "d", dense: [0.3, 0.8] },
];
const HOT = WORDS.map((_, i) => WORDS.map((__, k) => (k === i ? 1 : 0))); // 원-핫 줄
const PAIRS = [[0, 1], [2, 3], [0, 2], [0, 3], [1, 2], [1, 3]]; // 비슷한 쌍 먼저
const dist = (a, b) => Math.sqrt(a.reduce((s, x, k) => s + (x - b[k]) ** 2, 0));
const dot = (a, b) => a.reduce((s, x, k) => s + x * b[k], 0);
const cos = (a, b) => dot(a, b) / Math.sqrt(dot(a, a) * dot(b, b));
const MAXD = 1.5; // 막대 끝 = 거리 1.5

const STEPS = [
  { cap: "단어 4개를 원-핫으로 바꿨어요. 단어마다 자기 칸 하나만 1 이라서, 단어가 5만 개면 칸도 5만 개예요.", view: "hot", bars: 0 },
  { cap: "파란 고양이와 주황 강아지는 1 이 켜진 칸이 겹치지 않아요. 같은 칸끼리 곱하면 전부 0 이라서 cos 은 0, 거리는 √2 ≈ 1.41 이에요.", view: "hot", bars: 1, pick: [0, 1] },
  { cap: "어느 두 단어를 골라도 똑같아요. 6쌍 모두 거리 1.41, cos 0 — 원-핫은 고양이가 회의보다 강아지와 비슷하다는 걸 몰라요.", view: "hot", bars: 6 },
  { cap: "분산 표현은 모든 칸에 조금씩 값이 있어요. 숫자 2개짜리라면 평면 위의 점이 되고, 뜻이 비슷한 단어끼리 가까이 놓여요 (예시 숫자).", view: "dense", bars: 6, dimBars: 1 },
  { cap: "거리를 다시 재면 고양이–강아지는 가깝고 고양이–회의는 멀어요. 이제 거리가 뜻을 알려줘요 — '미팅'으로 '회의'를 찾을 수 있는 이유예요.", view: "dense", bars: 6, denseBars: 1 },
];

export default {
  aspect: 0.6,
  aspectNarrow: 1.42,
  steps: STEPS.map((s) => s.cap),
  mount(stage, f) {
    const nar = !!f.narrow;
    const W = nar ? 380 : 560, H = nar ? 540 : 336;
    // 자리: 왼쪽(또는 위) = 표/평면, 오른쪽(또는 아래) = 쌍 거리 막대
    const T = nar ? { lx: 96, cx: 108, cw: 52, step: 60, hy: 30, ry: 66, rh: 40, py: 244 } : { lx: 84, cx: 96, cw: 46, step: 52, hy: 34, ry: 72, rh: 40, py: 250 };
    const PL = nar ? { x0: 74, y0: 270, s: 220 } : { x0: 70, y0: 292, s: 210 };
    const B = nar ? { x: 22, ty: 318, y: 354, rh: 30, tx: 134, tw: 168 } : { x: 322, ty: 34, y: 72, rh: 38, tx: 420, tw: 96 };
    const s = svg(stage, W, H, "단어 4개의 원-핫 표와 분산 표현 평면, 그리고 단어 쌍 6개의 거리 막대");

    // ── 원-핫 표 ──
    const hotG = g(s);
    for (let k = 0; k < 4; k++) text(hotG, T.cx + k * T.step + T.cw / 2, T.hy, `칸 ${k + 1}`, { size: 14, anchor: "middle", fill: C.mute });
    const rowBg = WORDS.map((w, i) => { const r = rect(hotG, 8, T.ry + i * T.rh - T.rh / 2 + 3, T.cx + 3 * T.step + T.cw - 2, T.rh - 6, { r: 8, fill: `var(--fg-${w.c}-soft)` }); r.style.opacity = "0"; return r; });
    const cells = WORDS.map((w, i) => {
      text(hotG, T.lx, T.ry + i * T.rh, w.t, { size: 16, anchor: "end", weight: 700, fill: C[w.c] });
      return HOT[i].map((v, k) => {
        const x = T.cx + k * T.step, y = T.ry + i * T.rh - 15;
        rect(hotG, x, y, T.cw, 30, { r: 6, fill: v ? `var(--fg-${w.c}-soft)` : C.bg, stroke: v ? C[w.c] : C.line, sw: v ? 1.6 : 1 });
        return text(hotG, x + T.cw / 2, y + 15, String(v), { size: 16, anchor: "middle", weight: v ? 700 : 500, fill: v ? C[w.c] : C.mute, cls: "fg-t tab" });
      });
    });
    // 곱 줄 (고양이 × 강아지)
    const prodG = g(hotG);
    line(prodG, T.cx - 4, T.py - 26, T.cx + 3 * T.step + T.cw + 4, T.py - 26, { color: C.line });
    text(prodG, T.lx, T.py, "곱", { size: 15, anchor: "end", weight: 700, fill: C.ink });
    for (let k = 0; k < 4; k++) { const x = T.cx + k * T.step; rect(prodG, x, T.py - 15, T.cw, 30, { r: 6, fill: C.soft }); text(prodG, x + T.cw / 2, T.py, String(HOT[0][k] * HOT[1][k]), { size: 16, anchor: "middle", weight: 700, fill: C.ink, cls: "fg-t tab" }); }

    // ── 분산 표현 평면 ──
    const plG = g(s);
    const px = (v) => [PL.x0 + v[0] * PL.s, PL.y0 - v[1] * PL.s];
    for (let k = 0; k <= 4; k++) {
      const t = (k / 4) * PL.s;
      line(plG, PL.x0 + t, PL.y0, PL.x0 + t, PL.y0 - PL.s, { color: C.grid });
      line(plG, PL.x0, PL.y0 - t, PL.x0 + PL.s, PL.y0 - t, { color: C.grid });
    }
    line(plG, PL.x0, PL.y0, PL.x0 + PL.s + 8, PL.y0, { color: C.sub, width: 1.4 });
    line(plG, PL.x0, PL.y0, PL.x0, PL.y0 - PL.s - 8, { color: C.sub, width: 1.4 });
    [0, 0.5, 1].forEach((v) => { text(plG, PL.x0 + v * PL.s, PL.y0 + 16, fmt(v, 1), { size: 13, anchor: "middle", fill: C.mute, cls: "fg-t tab" }); if (v) text(plG, PL.x0 - 8, PL.y0 - v * PL.s, fmt(v, 1), { size: 13, anchor: "end", fill: C.mute, cls: "fg-t tab" }); });
    text(plG, PL.x0 + PL.s, PL.y0 + 36, "칸 1 (동물 쪽)", { size: 14, anchor: "end", fill: C.sub, weight: 600 });
    text(plG, PL.x0 - 6, PL.y0 - PL.s - 22, "칸 2 (업무 쪽)", { size: 14, anchor: "start", fill: C.sub, weight: 600 });
    // 이름표 자리 (점에 겹치지 않게): [dx, dy, anchor]
    const LAB = [[0, 24, "middle"], [-12, -16, "end"], [12, -8, "start"], [12, 8, "start"]];
    WORDS.forEach((w, i) => {
      const [x, y] = px(w.dense), [dx, dy, an] = LAB[i];
      circle(plG, x, y, 7, { fill: C[w.c], stroke: C.bg, sw: 2 });
      const t = el(plG, "text", { x: x + dx, y: y + dy, "text-anchor": an, "dominant-baseline": "middle", "font-size": 15, "font-weight": 700, class: "fg-t halo tab" });
      el(t, "tspan", { fill: C[w.c] }, w.t + " ");
      el(t, "tspan", { fill: C.sub, "font-weight": 500 }, `[${w.dense.map((v) => fmt(v, 1)).join(", ")}]`);
    });

    // ── 쌍 거리 막대 ──
    const barG = g(s);
    const barTitle = text(barG, B.x, B.ty, "", { size: 15, weight: 700, fill: C.ink });
    const bars = PAIRS.map(([a, b], k) => {
      const y = B.y + k * B.rh;
      const lt = el(barG, "text", { x: B.x, y, "dominant-baseline": "middle", "font-size": 15, "font-weight": 700, class: "fg-t" });
      el(lt, "tspan", { fill: C[WORDS[a].c] }, WORDS[a].t); el(lt, "tspan", { fill: C.mute }, "–"); el(lt, "tspan", { fill: C[WORDS[b].c] }, WORDS[b].t);
      rect(barG, B.tx, y - 7, B.tw, 14, { r: 3, fill: C.soft });
      const ghost = line(barG, 0, y - 10, 0, y + 10, { color: C.mute, width: 1.5, dash: "3 2" });
      const fill = rect(barG, B.tx, y - 7, 0, 14, { r: 3, fill: C.sub });
      const val = text(barG, B.tx + B.tw + 6, y, "", { size: 14, weight: 700, fill: C.ink, cls: "fg-t tab" });
      return { fill, val, ghost, hot: dist(HOT[a], HOT[b]), dense: dist(WORDS[a].dense, WORDS[b].dense), a, b };
    });
    const bw = (d) => (clamp(d, 0, MAXD) / MAXD) * B.tw;
    bars.forEach((b) => { const x = B.tx + bw(b.hot); b.ghost.setAttribute("x1", x); b.ghost.setAttribute("x2", x); });

    const ro = readout(f.controls());
    const st = { hot: 1, dense: 0, pick: 0, dimB: 0, mix: 0, fills: bars.map(() => 0) };
    let tok = 0;
    function paint() {
      hotG.style.opacity = String(st.hot); plG.style.opacity = String(st.dense);
      hotG.style.display = st.hot < 0.01 ? "none" : ""; plG.style.display = st.dense < 0.01 ? "none" : "";
      rowBg.forEach((r, i) => (r.style.opacity = String(i < 2 ? st.pick : 0)));
      prodG.style.opacity = String(st.pick);
      bars.forEach((b, k) => {
        const d = b.hot + (b.dense - b.hot) * st.mix, w = bw(d) * st.fills[k];
        b.fill.setAttribute("width", Math.max(0, w));
        b.val.setAttribute("x", B.tx + B.tw + 6); b.val.textContent = st.fills[k] > 0.98 ? fmt(d, 2) : "";
        b.ghost.style.opacity = String(st.mix * 0.9);
      });
      barG.style.opacity = String(1 - 0.55 * st.dimB);
    }
    function say(i) {
      const w = (k) => `<span class="${WORDS[k].c}">${WORDS[k].t}</span>`, hv = (k) => `[${HOT[k].join(", ")}]`;
      if (i === 0) ro.set(`<div>원-핫: 단어 4개 → 칸 4개, 1 은 자기 칸 하나뿐</div><div class="dim">${WORDS.map((_, k) => `${w(k)} ${hv(k)}`).join(" · ")}</div>`);
      else if (i === 1) {
        const a = HOT[0], b = HOT[1];
        ro.set(`<div>${w(0)} ${hv(0)} · ${w(1)} ${hv(1)}</div><div>내적 = ${a.map((x, k) => `${x}×${b[k]}`).join(" + ")} = <b>${dot(a, b)}</b> → cos = ${dot(a, b)} ÷ (1 × 1) = <b>${fmt(cos(a, b), 2)}</b></div><div>거리 = √(${a.map((x, k) => `${(x - b[k]) ** 2}`).join(" + ")}) = √2 ≈ <b>${fmt(dist(a, b), 2)}</b></div>`);
      } else if (i === 2) ro.set(`<div>6쌍 모두 내적 <b>0</b> · cos <b>0</b> · 거리 √2 ≈ <b>${fmt(Math.SQRT2, 2)}</b></div><div class="dim">1 이 켜진 칸이 늘 달라서, 어느 쌍이든 다른 칸이 딱 2개예요</div>`);
      else if (i === 3) ro.set(`<div>분산 표현 (예시 숫자 · 칸 2개): ${WORDS.map((x, k) => `${w(k)} [${x.dense.map((v) => fmt(v, 1)).join(", ")}]`).join(" · ")}</div><div class="dim">300칸쯤인 진짜 분산 표현도 모든 칸에 값이 있어요</div>`);
      else {
        const row = (a, b) => { const A = WORDS[a].dense, Bv = WORDS[b].dense; return `${w(a)}–${w(b)}: √(${A.map((x, k) => `${fmt(Math.abs(x - Bv[k]), 1)}²`).join(" + ")}) = <b>${fmt(dist(A, Bv), 2)}</b> · cos ${fmt(cos(A, Bv), 2)}`; };
        ro.set(`<div>${row(0, 1)}</div><div>${row(0, 2)}</div><div class="dim">점선 = 원-핫일 때 거리 1.41</div>`);
      }
    }
    async function go(i, animate) {
      const S = STEPS[i], my = ++tok;
      barTitle.textContent = S.denseBars ? "분산 표현일 때 쌍 거리" : "원-핫일 때 쌍 거리";
      say(i);
      const to = { hot: S.view === "hot" ? 1 : 0, dense: S.view === "dense" ? 1 : 0, pick: S.pick ? 1 : 0, dimB: S.dimBars ? 1 : 0, mix: S.denseBars ? 1 : 0 };
      const fillTo = bars.map((_, k) => (k < S.bars ? 1 : 0));
      if (!animate) { Object.assign(st, to); st.fills = fillTo; paint(); return; }
      // 새로 재는 막대는 하나씩 차례로 차올라요
      const f0 = st.fills.slice(), o = { hot: st.hot, dense: st.dense, pick: st.pick, dimB: st.dimB, mix: st.mix, t: 0 };
      const moving = bars.map((_, k) => k).filter((k) => f0[k] !== fillTo[k]), gap = 0.14;
      await tween(o, { ...to, t: 1 }, i === 4 ? 1100 : 900, (v) => {
        if (my !== tok) return;
        Object.assign(st, { hot: v.hot, dense: v.dense, pick: v.pick, dimB: v.dimB, mix: v.mix });
        st.fills = f0.map((a, k) => { const j = moving.indexOf(k); if (j < 0) return a; const lag = clamp(v.t * (1 + gap * (moving.length - 1)) - j * gap, 0, 1); return a + (fillTo[k] - a) * lag; });
        paint();
      });
      if (my === tok) { Object.assign(st, to); st.fills = fillTo; paint(); }
    }
    return { go };
  },
};
