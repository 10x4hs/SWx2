// 그림: word2vec — 주변 단어가 뜻을 알려줘요 (Vector & Graph 01 — 카드 3)
//   카드의 예 '커피를 ___ 마셨다' 로 만든 두 문장 위로 창(양옆 한 단어)을 밀며 (가운데 → 주변) 학습 짝을 모아요. 가운데 = 파란, 주변 = 주황.
//   짝을 가운데 단어별로 모으면 '따뜻하게'와 '차갑게'의 주변이 똑같아요. 마지막 단계는 진짜로 아주 작은 Skip-gram 을 학습시켜서
//   (2칸 벡터 · 씨앗 고정이라 늘 같은 그림) 벡터가 움직이는 모습을 보여 줘요 — 주변이 같은 단어끼리 가까이 모여요.
import { svg, g, text, rect, circle, el, tween, anim, readout, rng, C, fmt } from "./kit.js";

const SENT = [["아침에", "커피를", "따뜻하게", "마셨다"], ["오후에", "커피를", "차갑게", "마셨다"]];
const VOCAB = ["아침에", "오후에", "커피를", "따뜻하게", "차갑게", "마셨다"];
const ID = Object.fromEntries(VOCAB.map((w, i) => [w, i]));
const WIN = 1; // 창: 양옆 한 단어
const HUE = { 따뜻하게: "c", 차갑게: "c", 아침에: "d", 오후에: "d" }; // 평면에서 칠하는 두 쌍
const SIDE = { 아침에: "t", 오후에: "b", 커피를: "r", 따뜻하게: "t", 차갑게: "b", 마셨다: "r" };
const ALL = SENT.flatMap((ws, si) => ws.map((_, k) => [si, k]));
const key = (p) => `${p[0]}:${p[1]}`;

// (가운데 → 주변) 짝: 문장 si 의 k 번째 단어가 가운데일 때
const pairsAt = (si, k) => { const out = []; for (let j = k - WIN; j <= k + WIN; j++) if (j !== k && j >= 0 && j < SENT[si].length) out.push([SENT[si][k], SENT[si][j]]); return out; };
// 아주 작은 Skip-gram: 가운데 단어 벡터(2칸)로 주변 단어를 맞히게 (전체 softmax · 경사하강). 매 반복의 벡터를 기록해요
function train(epochs = 170, seed = 4, lr = 1) {
  const r = rng(seed), n = VOCAB.length;
  const Wv = VOCAB.map(() => [r() * 2 - 1, r() * 2 - 1]), U = VOCAB.map(() => [(r() * 2 - 1) * 0.5, (r() * 2 - 1) * 0.5]);
  const P = ALL.flatMap(([si, k]) => pairsAt(si, k).map(([c, o]) => [ID[c], ID[o]]));
  const snaps = [Wv.map((v) => v.slice())];
  for (let e = 0; e < epochs; e++) {
    const gW = VOCAB.map(() => [0, 0]), gU = VOCAB.map(() => [0, 0]);
    for (const [c, o] of P) {
      const v = Wv[c], lg = U.map((u) => u[0] * v[0] + u[1] * v[1]), m = Math.max(...lg), ex = lg.map((x) => Math.exp(x - m)), Z = ex.reduce((a, b) => a + b, 0);
      for (let k = 0; k < n; k++) { const gk = ex[k] / Z - (k === o ? 1 : 0); gW[c][0] += gk * U[k][0]; gW[c][1] += gk * U[k][1]; gU[k][0] += gk * v[0]; gU[k][1] += gk * v[1]; }
    }
    for (let i = 0; i < n; i++) for (let d = 0; d < 2; d++) { Wv[i][d] -= (lr * gW[i][d]) / P.length; U[i][d] -= (lr * gU[i][d]) / P.length; }
    snaps.push(Wv.map((v) => v.slice()));
  }
  return snaps;
}
const d2 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const spread = (F) => Math.max(...F.flatMap((a) => F.map((b) => d2(a, b))));

const STEPS = [
  { cap: "word2vec 은 가운데 단어(파란)를 보고 양옆 주변 단어(주황)를 맞히는 연습을 해요. 그래서 (가운데 → 주변) 짝을 만들어요.", seen: [[0, 1]], win: [0, 1], s: 0 },
  { cap: "창을 한 칸씩 밀면서 짝을 모아요. 문장 하나에서 학습 짝 6개가 나와요.", seen: ALL.filter((p) => p[0] === 0), win: [0, 3], s: 0 },
  { cap: "다른 문장도 똑같이 모아요. '따뜻하게'와 '차갑게'는 문장이 달라도 주변 단어가 똑같이 '커피를', '마셨다'예요.", seen: ALL, win: null, s: 1, same: 1 },
  { cap: "학습하면서 가운데 단어의 벡터를 조금씩 고쳐요. 맞혀야 할 주변이 같은 '따뜻하게'와 '차갑게'는 벡터가 같은 쪽으로 움직여 가까이 모여요.", seen: ALL, win: null, s: 1, plane: 1 },
];

export default {
  aspect: 0.7,
  aspectNarrow: 1.16,
  steps: STEPS.map((s) => s.cap),
  mount(stage, f) {
    const nar = !!f.narrow;
    const W = nar ? 380 : 560, H = nar ? 440 : 392;
    const L = nar
      ? { fs: 15, sx: 62, sy: [32, 76], bh: 32, gap: 8, cw: 15, tY: 136, rh: 34, tl: 92, tc: 116, cf: 13, plane: [12, 120, 368, 426], mx: 124, my: 80 }
      : { fs: 16, sx: 84, sy: [34, 82], bh: 34, gap: 10, cw: 16, tY: 138, rh: 37, tl: 118, tc: 146, cf: 14, plane: [36, 118, 524, 384], mx: 170, my: 96 };
    const s = svg(stage, W, H, "두 문장 위를 미끄러지는 창, 가운데 → 주변 학습 짝 표, 학습된 단어 벡터 평면");

    // ── 문장 두 줄 (단어 상자) ──
    const sentG = SENT.map((ws, si) => {
      const gg = g(s);
      text(gg, nar ? 8 : 14, L.sy[si], `문장 ${si + 1}`, { size: 13, fill: C.mute });
      let x = L.sx;
      const boxes = ws.map((w) => {
        const bw = w.length * L.cw + 18, bx = x; x += bw + L.gap;
        const r = rect(gg, bx, L.sy[si] - L.bh / 2, bw, L.bh, { r: 7, fill: C.bg, stroke: C.line, sw: 1.2 });
        const t = text(gg, bx + bw / 2, L.sy[si], w, { size: L.fs, anchor: "middle", weight: 600, fill: C.ink });
        return { r, t, x: bx, w: bw, word: w };
      });
      return { g: gg, boxes };
    });
    // 창: 가운데 ± 1 칸을 감싸는 점선 상자
    const winR = el(s, "rect", { rx: 10, fill: "none", stroke: C.ink, "stroke-width": 1.6, "stroke-dasharray": "5 4" });
    const winT = text(s, 0, 0, "창", { size: 13, weight: 700, fill: C.ink, anchor: "middle", cls: "fg-t halo" });

    // ── 짝 표: 가운데 단어 → 주변 단어 칩 (칩 하나 = 학습 짝 하나) ──
    const tabG = g(s);
    const rowY = (i) => L.tY + i * L.rh;
    const sameR = rect(tabG, 6, rowY(3) - L.rh / 2 + 1, W - 12, L.rh * 2 - 2, { r: 9, fill: "none", stroke: C.c, sw: 2 });
    const sameT = text(tabG, W - 18, (rowY(3) + rowY(4)) / 2, "주변이 똑같아요", { size: 14, weight: 700, fill: C.c, anchor: "end", cls: "fg-t halo" });
    const rows = VOCAB.map((w, i) => ({ y: rowY(i), lab: text(tabG, L.tl, rowY(i), w, { size: L.fs, anchor: "end", weight: 700, fill: C.a }), arr: text(tabG, L.tl + 10, rowY(i), "→", { size: 14, fill: C.mute }), chips: [] }));
    function chip(row, word) {
      const x0 = row.chips.reduce((x, c) => x + c.w + 6, L.tc), w = word.length * L.cf + 14, gg = g(tabG);
      rect(gg, x0, row.y - 13, w, 26, { r: 6, fill: C.bSoft, stroke: C.b, sw: 1 });
      text(gg, x0 + w / 2, row.y, word, { size: L.cf, anchor: "middle", weight: 600, fill: C.b });
      row.chips.push({ g: gg, w });
    }
    const tabCount = text(tabG, W - 14, H - 14, "", { size: 14, anchor: "end", fill: C.sub, weight: 600 });

    // ── 학습된 벡터 평면 ──
    const snaps = train(), LAST = snaps.length - 1, last = snaps[LAST];
    // 마지막 모습에서 가장 넓게 퍼진 방향을 가로로 (돌리기만 해서 거리는 그대로)
    const mean = [0, 1].map((d) => last.reduce((a, v) => a + v[d], 0) / last.length);
    let sxx = 0, syy = 0, sxy = 0; for (const v of last) { const x = v[0] - mean[0], y = v[1] - mean[1]; sxx += x * x; syy += y * y; sxy += x * y; }
    const th = -0.5 * Math.atan2(2 * sxy, sxx - syy), ct = Math.cos(th), sn = Math.sin(th);
    const rot = (v) => [v[0] * ct - v[1] * sn, v[0] * sn + v[1] * ct];
    const [PX0, PY0, PX1, PY1] = L.plane;
    // 한 모습에 맞춘 배율(가운데 · 같은 배율) — 그 배율로 지나온 길도 그려요
    function frame(F) {
      const R = F.map(rot), xs = R.map((v) => v[0]), ys = R.map((v) => v[1]);
      const cx = (Math.max(...xs) + Math.min(...xs)) / 2, cy = (Math.max(...ys) + Math.min(...ys)) / 2;
      const k = Math.min((PX1 - PX0 - L.mx) / Math.max(1e-6, Math.max(...xs) - Math.min(...xs)), (PY1 - PY0 - L.my) / Math.max(1e-6, Math.max(...ys) - Math.min(...ys)));
      return (v) => { const p = rot(v); return [(PX0 + PX1) / 2 + (p[0] - cx) * k, (PY0 + PY1) / 2 + 8 - (p[1] - cy) * k]; };
    }
    const plG = g(s);
    rect(plG, PX0, PY0, PX1 - PX0, PY1 - PY0, { r: 10, fill: "none", stroke: C.grid, sw: 1.2 });
    const plT = text(plG, PX0 + 12, PY0 + 18, "", { size: 14, weight: 700, fill: C.sub });
    const hue = (w) => (HUE[w] ? C[HUE[w]] : null);
    const trails = VOCAB.map((w) => el(plG, "polyline", { fill: "none", stroke: hue(w) || C.mute, "stroke-width": 1.4, "stroke-opacity": 0.4, "stroke-linejoin": "round", "stroke-dasharray": "3 3" }));
    const starts = VOCAB.map((w) => circle(plG, 0, 0, 4, { fill: C.bg, stroke: hue(w) || C.mute, sw: 1.2 }));
    const dots = VOCAB.map((w) => ({ c: circle(plG, 0, 0, 7.5, { fill: hue(w) || C.sub, stroke: C.bg, sw: 2 }), t: text(plG, 0, 0, w, { size: 15, weight: 700, fill: hue(w) || C.ink, anchor: "middle", cls: "fg-t halo" }) }));
    const OFF = { t: [0, -17, "middle"], b: [0, 19, "middle"], r: [12, 1, "start"] };
    function drawPlane(e) {
      const ei = Math.max(0, Math.min(LAST, Math.round(e))), map = frame(snaps[ei]), stepK = Math.max(1, Math.ceil(ei / 48));
      VOCAB.forEach((w, i) => {
        const [x, y] = map(snaps[ei][i]), [dx, dy, an] = OFF[SIDE[w]];
        dots[i].c.setAttribute("cx", x); dots[i].c.setAttribute("cy", y);
        dots[i].t.setAttribute("x", x + dx); dots[i].t.setAttribute("y", y + dy); dots[i].t.setAttribute("text-anchor", an);
        const pts = []; for (let k = 0; k < ei; k += stepK) pts.push(map(snaps[k][i])); pts.push([x, y]);
        trails[i].setAttribute("points", pts.map((p) => p.map((v) => v.toFixed(1)).join(",")).join(" "));
        starts[i].setAttribute("cx", pts[0][0]); starts[i].setAttribute("cy", pts[0][1]); starts[i].style.opacity = ei > 0 ? "1" : "0";
      });
      plT.textContent = ei === 0 ? "학습 전 · 벡터는 아무렇게나 (2칸 예시)" : `학습 ${ei}번 반복 · 빈 동그라미 = 처음 자리`;
    }

    const ro = readout(f.controls());
    const st = { seen: new Set(), s: 0, same: 0, plane: 0 };
    let tok = 0;

    function paintText(at) {
      sentG.forEach((S, si) => {
        S.g.style.opacity = si <= st.s ? (st.plane > 0.5 ? "0.4" : "1") : "0";
        S.boxes.forEach((b, i) => {
          const isC = at && at[0] === si && at[1] === i, isX = at && at[0] === si && Math.abs(at[1] - i) <= WIN && !isC;
          const hi = st.same > 0.5 && HUE[b.word] === "c";
          const c = isC ? "a" : isX ? "b" : hi ? "c" : null;
          b.r.style.fill = c ? `var(--fg-${c}-soft)` : C.bg; b.r.style.stroke = c ? C[c] : C.line; b.t.style.fill = c ? C[c] : C.ink;
        });
      });
      if (at) {
        const S = sentG[at[0]], lo = Math.max(0, at[1] - WIN), hi = Math.min(S.boxes.length - 1, at[1] + WIN);
        const x0 = S.boxes[lo].x - 5, x1 = S.boxes[hi].x + S.boxes[hi].w + 5, y = L.sy[at[0]];
        Object.entries({ x: x0, y: y - L.bh / 2 - 5, width: x1 - x0, height: L.bh + 10 }).forEach(([k, v]) => winR.setAttribute(k, v));
        winT.setAttribute("x", (x0 + x1) / 2); winT.setAttribute("y", y - L.bh / 2 - 13);
      }
      winR.style.display = at ? "" : "none"; winT.style.display = at && at[0] === 0 ? "" : "none";
    }
    function rebuildTable() {
      rows.forEach((r) => { r.chips.forEach((c) => c.g.remove()); r.chips = []; });
      let n = 0;
      for (const p of ALL) if (st.seen.has(key(p))) for (const [c, o] of pairsAt(p[0], p[1])) { chip(rows[ID[c]], o); n++; }
      rows.forEach((r) => { const on = r.chips.length > 0; r.lab.style.fill = on ? C.a : C.mute; r.lab.style.opacity = on ? "1" : "0.5"; r.arr.style.opacity = on ? "1" : "0"; });
      tabCount.textContent = `학습 짝 ${n}개`;
      return n;
    }
    function layers() {
      tabG.style.opacity = String(1 - st.plane); tabG.style.display = st.plane > 0.99 ? "none" : "";
      plG.style.opacity = String(st.plane); plG.style.display = st.plane < 0.01 ? "none" : "";
      sameR.style.opacity = String(st.same); sameT.style.opacity = String(st.same);
    }
    const sayWin = (at, n, note) => ro.set(`<div>창 크기 1 (양옆 한 단어) · 지금까지 학습 짝 <b>${n}</b>개</div><div class="dim">문제: 가운데 <span class="a">${SENT[at[0]][at[1]]}</span> → 주변 단어는? 답: ${pairsAt(at[0], at[1]).map(([, o]) => `<span class="b">${o}</span>`).join(", ")}</div>${note ? `<div class="dim">가운데 → 주변을 맞히는 이 방식이 Skip-gram 이에요 (주변 → 가운데는 CBOW)</div>` : ""}`);
    function say(i, n) {
      if (STEPS[i].win) { sayWin(STEPS[i].win, n, i === 0); return; }
      const ctx = (w) => ALL.filter((p) => st.seen.has(key(p)) && SENT[p[0]][p[1]] === w).flatMap((p) => pairsAt(p[0], p[1]).map(([, o]) => o));
      if (!STEPS[i].plane) { ro.set(`<div>학습 짝 <b>${n}</b>개 · <span class="c">따뜻하게</span> → ${ctx("따뜻하게").join(", ")} · <span class="c">차갑게</span> → ${ctx("차갑게").join(", ")}</div><div class="dim"><span class="d">아침에</span>와 <span class="d">오후에</span>도 주변이 '커피를' 하나로 같아요</div>`); return; }
      const F0 = snaps[0], s0 = spread(F0), s1 = spread(last), dd = (a, b, M, sp) => fmt(d2(M[ID[a]], M[ID[b]]) / sp, 2);
      ro.set(`<div>거리 (가장 먼 쌍 = 1): <span class="c">따뜻하게–차갑게</span> ${dd("따뜻하게", "차갑게", F0, s0)} → <b>${dd("따뜻하게", "차갑게", last, s1)}</b> · <span class="d">아침에–오후에</span> ${dd("아침에", "오후에", F0, s0)} → <b>${dd("아침에", "오후에", last, s1)}</b></div><div class="dim">비교: 따뜻하게–커피를 ${dd("따뜻하게", "커피를", last, s1)} · 진짜 word2vec 은 16억 단어 같은 큰 데이터로 배워요</div>`);
    }
    const sleep = (ms) => anim(ms, () => {}, (t) => t);
    async function go(i, animate) {
      const S = STEPS[i], my = ++tok, target = new Set(S.seen.map(key));
      const finish = () => { st.seen = new Set(target); st.s = S.s; st.same = S.same ? 1 : 0; st.plane = S.plane ? 1 : 0; const n = rebuildTable(); paintText(S.win); layers(); drawPlane(S.plane ? LAST : 0); say(i, n); };
      if (!animate) { finish(); return; }
      if (S.plane) {
        // 표 → 평면, 그리고 학습을 처음부터 돌려 보여 줘요
        st.seen = new Set(target); st.same = 0; rebuildTable(); drawPlane(0); say(i, 0);
        const o = { p: st.plane };
        await tween(o, { p: 1 }, 450, () => { if (my === tok) { st.plane = o.p; layers(); paintText(null); } });
        if (my !== tok) return;
        await sleep(400);
        if (my !== tok) return;
        await anim(2600, (t) => { if (my === tok) drawPlane(LAST * t); }, (t) => 1 - (1 - t) ** 2);
        if (my === tok) finish();
        return;
      }
      if (st.plane > 0) { const o = { p: st.plane }; await tween(o, { p: 0 }, 350, () => { if (my === tok) { st.plane = o.p; layers(); } }); if (my !== tok) return; }
      const adds = ALL.filter((p) => target.has(key(p)) && !st.seen.has(key(p)));
      if (!adds.length || [...st.seen].some((k) => !target.has(k))) { finish(); return; } // 뒤로 가기: 바로 그 모습
      // 창이 한 칸씩 밀리며 짝이 쌓여요 (2단계는 문장 처음부터 다시 훑어요)
      st.same = 0; layers();
      const path = i === 1 ? ALL.filter((p) => p[0] === 0) : adds, wait = Math.min(700, 3000 / path.length);
      for (const p of path) {
        if (my !== tok) return;
        st.seen.add(key(p)); st.s = Math.max(st.s, p[0]);
        sayWin(p, rebuildTable()); paintText(p);
        await sleep(wait);
      }
      if (my !== tok) return;
      finish();
      if (S.same) { const o = { v: 0 }; st.same = 0; layers(); await tween(o, { v: 1 }, 500, () => { if (my === tok) { st.same = o.v; layers(); paintText(null); } }); }
    }
    return { go };
  },
};
