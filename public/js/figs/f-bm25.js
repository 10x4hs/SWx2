// 그림: TF-IDF 는 직선, BM25 는 포화 — 횟수(tf)에 따른 단어 점수 (Vector & Graph 04 — 카드 2 · 3)
//   카드의 숫자 그대로: 노트 N = 1,000개, '오로라'는 10개 · '회의'는 600개에 나와요. 로그는 자연로그.
//   TF-IDF = tf × log(N/n) · BM25 = IDF × tf(k1+1) / (tf + k1(1 − b + b·dl/avgdl)), IDF = log((N − n + 0.5)/(n + 0.5) + 1).
//   카드 코드의 예(tf 3, k1 1.2, b 0.75, dl/avgdl 2 → 5.9)가 4단계에 그대로 나와요. 마지막 단계: k1 · b · 길이 · 단어 + tf 점 끌기.
//   opts.mode = "tfidf" — 카드 2 용 3단계 (TF-IDF 직선 · 드문 단어 · 반복 문제).
import { svg, g, text, line, circle, path, slider, choice, readout, drag, anim, arrowHead, C, fmt } from "./kit.js";

const TMAX = 12, SMAX = 20, NDOC = 1000;
// 그래프 판: 넓은 칸 · 좁은 칸(폰 — 판을 좁혀서 같은 그래프의 글씨가 커져요)
const GW = { W: 600, H: 380, X0: 62, X1: 486, Y0: 334, Y1: 26 }, GN = { W: 400, H: 360, X0: 44, X1: 300, Y0: 300, Y1: 30 };
const SHORT = { "짧은 노트 (½)": "짧은 ½", "평균 길이": "평균", "긴 노트 (2배)": "긴 2배", "TF-IDF · 오로라": "TF-IDF", "BM25 · 회의": "BM25 회의" }; // 좁은 칸 이름표
const WORDS = { 오로라: 10, 회의: 600 };
const idfT = (n) => Math.log(NDOC / n);
const idfB = (n) => Math.log((NDOC - n + 0.5) / (n + 0.5) + 1);
const bm25 = (tf, idf, k1, b, L) => (tf <= 0 ? 0 : (idf * tf * (k1 + 1)) / (tf + k1 * (1 - b + b * L)));
const score = (c, tf) => (c.kind === "tfidf" ? tf * (c.idf ?? idfT(WORDS[c.word])) : bm25(tf, c.idf ?? idfB(WORDS[c.word]), c.k1, c.b, c.L));
const f2 = (x) => fmt(x, 2);
const LENS = { "0.5": "짧은 노트 (½)", 1: "평균 길이", 2: "긴 노트 (2배)" };

// 단계: curves = 그릴 선들, marks = 선 위에 값을 적을 점, tf = 세로 점선 자리
const A = { kind: "bm25", word: "오로라", k1: 1.2, b: 0.75, L: 1 };
const T = { kind: "tfidf", word: "오로라" };
const iA = idfB(10), iM = idfB(600), tA = idfT(10), tM = idfT(600);
const rise = (a, b) => bm25(b, iA, 1.2, 0.75, 1) - bm25(a, iA, 1.2, 0.75, 1);
function stepsFor(mode) {
  if (mode === "tfidf") return [
    { cap: `TF-IDF = 횟수(TF) × 드문 정도(IDF)예요. '오로라'는 노트 1,000개 중 10개에만 나와 IDF = log(1000/10) ≈ ${f2(tA)} 이라서, 한 번 나올 때마다 ${f2(tA)}씩 직선으로 올라가요.`,
      curves: [{ ...T, col: "b", main: 1, label: "TF-IDF · 오로라" }], tf: 3 },
    { cap: `'회의'는 1,000개 중 600개에 나와 IDF = log(1000/600) ≈ ${f2(tM)} 이에요. 같은 3번이어도 ${f2(3 * tM)}점이라, 드문 '오로라'(${f2(3 * tA)})보다 훨씬 작아요.`,
      curves: [{ ...T, col: "b", main: 1, label: "오로라" }, { ...T, word: "회의", col: "d", main: 1, label: "회의" }], tf: 3, grow: 1 },
    { cap: `그런데 TF 만 키우면 '회의'를 12번 쓴 노트(${f2(12 * tM)})가 '오로라'가 한 번 나온 노트(${f2(tA)})를 이겨요. BM25 는 반복이 쌓일수록 덜 오르게 해서 이걸 다듬어요.`,
      curves: [{ ...T, col: "b", main: 1, label: "오로라", op: 0.45 }, { ...T, word: "회의", col: "d", main: 1, label: "회의" }, { ...A, word: "회의", col: "d", dash: "6 4", label: "BM25 · 회의" }],
      marks: [[1, 12, "회의 ×12"], [0, 1, "오로라 ×1"]] },
  ];
  return [
    { cap: `TF-IDF 는 횟수(TF) × 드문 정도(IDF)예요. '오로라'(노트 1,000개 중 10개)는 IDF ≈ ${f2(tA)} 이라서, 한 번 더 나올 때마다 ${f2(tA)}씩 직선으로 올라가요.`,
      curves: [{ ...T, col: "b", main: 1, label: "TF-IDF" }], tf: 3, ctl: A },
    { cap: `BM25 는 반복될수록 덜 오르게 눌러요(포화). 1→2번은 +${f2(rise(1, 2))} 오르지만 10→11번은 +${f2(rise(10, 11))} 뿐이에요.`,
      curves: [{ ...T, col: "b", label: "TF-IDF", op: 0.45 }, { ...A, col: "a", main: 1, label: "BM25" }], rises: 1, grow: 1, ctl: A },
    { cap: "k1 이 클수록 천장(IDF × (k1 + 1))이 높아져 오래 올라가고, 작을수록 금방 평평해져요. 흔히 1.2 ~ 2.0 을 써요.",
      curves: [{ ...A, k1: 0.5, col: "a", dash: "6 4", label: "k1 0.5", from: { k1: 1.2 } }, { ...A, col: "a", main: 1, label: "k1 1.2" }, { ...A, k1: 2, col: "a", dash: "6 4", label: "k1 2.0", from: { k1: 1.2 } }], ctl: A },
    { cap: `b 는 긴 노트를 깎아요. 평균보다 2배 긴 노트는 같은 3번이어도 ${f2(bm25(3, iA, 1.2, 0.75, 2))}점이에요(카드 예). b = 0 이면 길이를 무시해서 세 선이 겹쳐요.`,
      curves: [{ ...A, L: 0.5, col: "a", dash: "6 4", label: LENS["0.5"], from: { b: 0 } }, { ...A, col: "a", dash: "2 4", label: LENS[1] }, { ...A, L: 2, col: "a", main: 1, label: LENS[2], from: { b: 0 } }], tf: 3, ctl: { ...A, L: 2 } },
    { cap: `드문 단어일수록 크게 쳐요. '오로라'(10개)는 IDF ${f2(iA)}, '회의'(600개)는 ${f2(iM)} 이라서 같은 횟수여도 약 ${Math.round(iA / iM)}배 차이 나요.`,
      curves: [{ ...A, col: "a", main: 1, label: "오로라" }, { ...A, word: "회의", col: "d", main: 1, label: "회의", from: { idf: iA } }], tf: 3, ctl: A },
    { cap: "이제 직접 k1 · b · 노트 길이 · 단어를 바꾸고, 아래 tf 점을 끌어 보세요.", free: 1, tf: "user" },
  ];
}

export default {
  aspect: GW.H / GW.W,
  aspectNarrow: GN.H / GN.W,
  steps: (o) => stepsFor(o.mode).map((s) => s.cap),
  hint: "아래 tf 점을 끌어 보세요",
  mount(stage, f) {
    const mode = f.opts.mode === "tfidf" ? "tfidf" : "bm25", STEPS = stepsFor(mode), LAST = STEPS.length - 1, FREE = !!STEPS[LAST].free;
    if (!FREE) f.figure?.querySelector(".fig-hint")?.remove(); // tfidf 모드는 끌 것이 없어요
    const NAR = !!f.narrow, { W, H, X0, X1, Y0, Y1 } = NAR ? GN : GW;
    const xOf = (tf) => X0 + (tf / TMAX) * (X1 - X0), yOf = (v) => Y0 - (v / SMAX) * (Y0 - Y1);
    const labOf = (c) => (NAR ? SHORT[c.label] || c.label : c.label);
    const s = svg(stage, W, H, "단어가 나온 횟수(tf)에 따라 TF-IDF 와 BM25 점수가 어떻게 오르는지 보여 주는 그래프");
    // 축 · 눈금
    const ax = g(s);
    for (let v = 0; v <= SMAX; v += 5) { line(ax, X0, yOf(v), X1, yOf(v), { color: v ? C.grid : C.line, width: v ? 1 : 1.4 }); text(ax, X0 - 8, yOf(v), String(v), { size: 14, fill: C.mute, anchor: "end", cls: "tab" }); }
    for (let t = 0; t <= TMAX; t += 2) { line(ax, xOf(t), Y0, xOf(t), Y0 + 5, { color: C.line }); text(ax, xOf(t), Y0 + 17, String(t), { size: 14, fill: C.mute, anchor: "middle", cls: "tab" }); }
    line(ax, X0, Y1 - 6, X0, Y0, { color: C.line, width: 1.4 });
    text(ax, X1, Y0 + 36, "단어가 나온 횟수 tf →", { size: 14, fill: C.sub, anchor: "end", weight: 600 });
    text(ax, X0 - 8, Y1 - 14, "점수", { size: 14, fill: C.sub, anchor: "end", weight: 600 });
    const tfG = g(s), curveG = g(s), riseG = g(s), labG = g(s), markG = g(s), hG = g(s);
    // tf 손잡이 (마지막 단계에서 끌어요)
    const hHit = circle(hG, 0, Y0, 16, { fill: "transparent" }), hDot = circle(hG, 0, Y0, 7, { fill: C.ink, stroke: C.bg, sw: 2 });
    hDot.style.pointerEvents = "none";

    const ctl = f.controls(), ro = readout(ctl);
    const user = { k1: 1.2, b: 0.75, L: 1, word: "오로라", tf: 3 };
    let step = 0, gen = 0;
    const toLast = () => { if (step !== LAST) f.goto(LAST); else { gen++; render(STEPS[LAST]); } };
    const ui = FREE ? {
      k1: slider(ctl, { label: "k1", min: 0, max: 3, step: 0.1, value: user.k1, fmt: (v) => fmt(v, 1) }, (v) => { user.k1 = v; toLast(); }),
      b: slider(ctl, { label: "b", min: 0, max: 1, step: 0.05, value: user.b, fmt: (v) => fmt(v, 2) }, (v) => { user.b = v; toLast(); }),
      L: choice(ctl, [["0.5", "짧은 ½"], ["1", "평균"], ["2", "긴 2배"]], "1", (k) => { user.L = Number(k); toLast(); }, "노트 길이 (dl ÷ avgdl)"),
      word: choice(ctl, [["오로라", "오로라 (드묾)"], ["회의", "회의 (흔함)"]], "오로라", (k) => { user.word = k; toLast(); }, "단어"),
    } : null;

    const colOf = (c) => ({ a: C.a, b: C.b, d: C.d }[c] || C.a);
    function curvesOf(st) {
      if (!st.free) return st.curves;
      return [{ ...T, word: user.word, col: "b", label: "TF-IDF", op: 0.5 }, { kind: "bm25", word: user.word, k1: user.k1, b: user.b, L: user.L, col: user.word === "회의" ? "d" : "a", main: 1, label: "BM25" }];
    }
    // 선 하나: 0 ~ 12 를 촘촘히. 위로 넘치면 거기서 자르고 화살촉 (TF-IDF 는 계속 올라가요)
    function curvePath(c) {
      const pts = [];
      let clipped = false;
      for (let t = 0; t <= TMAX + 1e-9; t += 0.05) {
        const v = score(c, t);
        if (v > SMAX) { const t0 = t - 0.05, v0 = score(c, t0), tt = t0 + ((SMAX - v0) / (v - v0)) * 0.05; pts.push([xOf(tt), yOf(SMAX)]); clipped = true; break; }
        pts.push([xOf(t), yOf(v)]);
      }
      return { d: "M" + pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join("L"), end: pts[pts.length - 1], clipped };
    }
    // 오른쪽 끝 이름표: 겹치지 않게 위아래로 밀어요
    function placeLabels(items) {
      items.sort((a, b) => a.y - b.y);
      for (let i = 1; i < items.length; i++) if (items[i].y - items[i - 1].y < 18) items[i].y = items[i - 1].y + 18;
      const over = items.length ? items[items.length - 1].y - (Y0 - 6) : 0;
      if (over > 0) items.forEach((it) => (it.y -= over));
      return items;
    }

    function render(st, over) {
      const cs = (over || curvesOf(st));
      curveG.replaceChildren(); labG.replaceChildren(); markG.replaceChildren(); riseG.replaceChildren(); tfG.replaceChildren();
      const labs = [];
      cs.forEach((c) => {
        const P = curvePath(c), col = colOf(c.col);
        const pe = path(curveG, P.d, { stroke: col, width: c.main ? 3 : 2, dash: c.dash || null });
        pe.style.opacity = String(c.op ?? (c.main ? 1 : 0.75));
        if (P.clipped) { pe.setAttribute("marker-end", arrowHead(s, col)); text(labG, P.end[0] + 10, P.end[1] + 12, `${labOf(c)} ↑ 계속`, { size: 15, weight: 700, fill: col, cls: "halo" }).style.opacity = String(c.op ?? 1); }
        else labs.push({ y: P.end[1], x: P.end[0], c, col });
      });
      placeLabels(labs).forEach((it) => {
        if (Math.abs(it.y - yOf(score(it.c, TMAX))) > 3) line(labG, it.x + 2, yOf(score(it.c, TMAX)), it.x + 8, it.y, { color: it.col, width: 1 });
        text(labG, it.x + 10, it.y, labOf(it.c), { size: 15, weight: it.c.main ? 700 : 600, fill: it.col, cls: "halo" }).style.opacity = String(it.c.op ?? 1);
      });
      // 포화: 1→2 와 10→11 의 오름폭
      if (st.rises) {
        const c = cs.find((x) => x.kind === "bm25");
        for (const [a, b] of [[1, 2], [10, 11]]) {
          const ya = yOf(score(c, a)), yb = yOf(score(c, b)), xa = xOf(a), xb = xOf(b);
          line(riseG, xa, ya, xb, ya, { color: C.a, width: 1.4, dash: "3 3" });
          line(riseG, xb, ya, xb, yb, { color: C.a, width: 2.6 });
          // 1→2 는 선 옆에, 10→11 은 오름폭이 너무 작아서 선 아래에
          if (b === 2) text(riseG, xb + 6, (ya + yb) / 2, `+${f2(score(c, b) - score(c, a))}`, { size: 15, weight: 700, fill: C.a, cls: "halo" });
          else text(riseG, (xa + xb) / 2, ya + 18, `+${f2(score(c, b) - score(c, a))}`, { size: 15, weight: 700, fill: C.a, anchor: "middle", cls: "halo" });
        }
      }
      // tf 세로 점선 + 선 위의 값
      const tfv = st.tf === "user" ? user.tf : st.tf;
      const marks = st.marks ? st.marks.map(([ci, t, lab]) => [cs[ci], t, lab]) : tfv ? cs.filter((c) => c.main).map((c) => [c, tfv, null]) : [];
      if (tfv) {
        line(tfG, xOf(tfv), Y0, xOf(tfv), Y1, { color: C.sub, width: 1.2, dash: "4 4" });
        text(tfG, xOf(tfv), Y1 - 12, `tf = ${tfv}`, { size: 14, weight: 700, fill: C.sub, anchor: "middle", cls: "halo" });
      }
      const used = [];
      marks.forEach(([c, t, lab]) => {
        const v = score(c, t), x = xOf(t), col = colOf(c.col);
        let y = yOf(Math.min(v, SMAX));
        circle(markG, x, y, 5, { fill: col, stroke: C.bg, sw: 2 });
        let ly = y - 12; while (used.some((u) => Math.abs(u - ly) < 17)) ly += 17; used.push(ly);
        const right = x < X1 - 90;
        text(markG, x + (right ? 9 : -9), ly, `${lab ? lab + " = " : ""}${f2(v)}`, { size: 15, weight: 700, fill: col, anchor: right ? "start" : "end", cls: "halo tab" });
      });
      // 손잡이
      hG.style.display = st.free ? "" : "none";
      hHit.setAttribute("cx", xOf(user.tf)); hDot.setAttribute("cx", xOf(user.tf));
      hHit.setAttribute("aria-valuetext", `tf ${user.tf}`);
      readoutFor(st, cs, tfv);
      // 조절 칸을 지금 선의 값으로
      if (ui) {
        const m = st.free ? user : st.ctl || A;
        ui.k1.set(m.k1); ui.b.set(m.b); ui.L.set(String(m.L)); ui.word.set(m.word);
      }
    }
    function bmTxt(tf, c) {
      const idf = c.idf ?? idfB(WORDS[c.word]);
      return `${f2(idf)} × ${tf}×${fmt(c.k1 + 1, 2)} ÷ (${tf} + ${fmt(c.k1, 2)}×(1 − ${fmt(c.b, 2)} + ${fmt(c.b, 2)}×${c.L})) = <b class="${c.word === "회의" ? "d" : "a"}">${f2(bm25(tf, idf, c.k1, c.b, c.L))}</b>`;
    }
    function readoutFor(st, cs, tfv) {
      let rows;
      const n = (w) => WORDS[w];
      if (mode === "tfidf") {
        rows = step === 0 ? [`IDF(오로라) = log(1000 ÷ 10) = <b>${f2(tA)}</b> <span class="dim">(자연로그)</span>`, `TF-IDF(tf = 3) = 3 × ${f2(tA)} = <b class="b">${f2(3 * tA)}</b> <span class="dim">· tf 가 1 늘 때마다 +${f2(tA)}</span>`]
          : step === 1 ? [`IDF: 오로라 log(1000 ÷ 10) = <b class="b">${f2(tA)}</b> · 회의 log(1000 ÷ 600) = <b class="d">${f2(tM)}</b>`, `TF-IDF(tf = 3): 오로라 <b class="b">${f2(3 * tA)}</b> · 회의 <b class="d">${f2(3 * tM)}</b>`]
          : [`TF-IDF: 회의 ×12 = 12 × ${f2(tM)} = <b class="d">${f2(12 * tM)}</b> &gt; 오로라 ×1 = <b class="b">${f2(tA)}</b>`, `BM25(k1 1.2, b 0.75): 회의 ×12 = <b class="d">${f2(bm25(12, iM, 1.2, 0.75, 1))}</b> · 오로라 ×1 = <b class="b">${f2(bm25(1, iA, 1.2, 0.75, 1))}</b> <span class="dim">→ 오로라가 이겨요</span>`];
      } else if (st.free) {
        const c = cs[1];
        rows = [`BM25(tf = ${tfv}) = ${bmTxt(tfv, c)}`, `IDF(${c.word}) = log((1000 − ${n(c.word)} + 0.5) ÷ (${n(c.word)} + 0.5) + 1) = <b>${f2(idfB(n(c.word)))}</b> · TF-IDF(tf = ${tfv}) = <b class="b">${f2(tfv * idfT(n(c.word)))}</b>`];
      } else rows = [
        [`IDF(오로라) = log(1000 ÷ 10) = <b>${f2(tA)}</b> <span class="dim">(자연로그)</span>`, `TF-IDF(tf = 3) = 3 × ${f2(tA)} = <b class="b">${f2(3 * tA)}</b> <span class="dim">· tf 가 1 늘 때마다 +${f2(tA)}</span>`],
        [`BM25 의 IDF = log((1000 − 10 + 0.5) ÷ (10 + 0.5) + 1) = log(${fmt((NDOC - 10 + 0.5) / 10.5 + 1, 1)}) ≈ <b>${f2(iA)}</b>`, `BM25 오름폭: 1→2번 <b class="a">+${f2(rise(1, 2))}</b> · 10→11번 <b class="a">+${f2(rise(10, 11))}</b> <span class="dim">(TF-IDF 는 늘 +${f2(tA)})</span>`],
        [`천장 = IDF × (k1 + 1): k1 0.5 → <b>${f2(iA * 1.5)}</b> · 1.2 → <b>${f2(iA * 2.2)}</b> · 2.0 → <b>${f2(iA * 3)}</b>`, `<span class="dim">세 선 모두 b = 0.75, 평균 길이 노트</span>`],
        [`긴 노트: BM25(tf = 3) = ${bmTxt(3, { ...A, L: 2 })} <span class="dim">· 카드 코드와 같은 값</span>`, `같은 3번 — 짧은 노트 <b>${f2(bm25(3, iA, 1.2, 0.75, 0.5))}</b> · 평균 <b>${f2(bm25(3, iA, 1.2, 0.75, 1))}</b> · 긴 노트 <b>${f2(bm25(3, iA, 1.2, 0.75, 2))}</b>`],
        [`IDF: 오로라(10개) <b class="a">${f2(iA)}</b> · 회의(600개) <b class="d">${f2(iM)}</b> <span class="dim">→ 약 ${Math.round(iA / iM)}배</span>`, `BM25(tf = 3): 오로라 <b class="a">${f2(bm25(3, iA, 1.2, 0.75, 1))}</b> · 회의 <b class="d">${f2(bm25(3, iM, 1.2, 0.75, 1))}</b>`],
      ][step];
      ro.set(rows.map((x) => `<div>${x}</div>`).join(""));
    }
    drag(s, hHit, (x) => {
      const t = Math.max(1, Math.min(TMAX, Math.round(((x - X0) / (X1 - X0)) * TMAX)));
      if (t === user.tf) return;
      user.tf = t;
      if (step !== LAST) f.goto(LAST); else { gen++; render(STEPS[LAST]); }
    }, { get: () => [xOf(user.tf), Y0], step: (X1 - X0) / TMAX, label: "tf 점 — 화살표 키로 횟수를 바꿔요" });
    if (!FREE) hG.style.display = "none";

    return {
      async go(i, animate) {
        const my = ++gen, st = STEPS[i];
        step = i;
        if (!animate || st.free) { render(st); return; }
        // 바뀌는 선만 움직여요: from 이 있는 선은 그 값에서 출발 (k1 이 벌어지고 · b 가 0 에서 0.75 로 · IDF 가 내려가고)
        const movers = st.curves.filter((c) => c.from);
        if (movers.length) {
          await anim(900, (t) => {
            if (my !== gen) return;
            render(st, st.curves.map((c) => { if (!c.from) return c; const o = { ...c }; for (const k in c.from) { const end = k === "idf" ? idfB(WORDS[c.word]) : c[k]; o[k] = c.from[k] + (end - c.from[k]) * t; } return o; }));
          });
          if (my === gen) render(st);
          return;
        }
        render(st);
        if (st.grow) {
          // 새 선이 왼쪽에서 오른쪽으로 그려져요
          const p = [...curveG.children].filter((e, k) => st.curves[k]?.main).pop();
          if (!p) return;
          const L = p.getTotalLength?.() || 600;
          p.style.strokeDasharray = `${L}`; p.style.strokeDashoffset = `${L}`;
          await anim(800, (t) => { if (my === gen) p.style.strokeDashoffset = String(L * (1 - t)); });
          if (my === gen) { p.style.strokeDasharray = ""; p.style.strokeDashoffset = ""; }
        }
      },
      destroy() { gen++; },
    };
  },
};
