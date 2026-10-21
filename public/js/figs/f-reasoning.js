// 그림: 추론 — 규칙(TBox)과 사실(ABox)에서 안 적힌 사실이 나와요
//   위: TBox — 아스피린 ⊑ NSAID ⊑ 진통제 (하위 클래스), 처방함의 정의역(의사) · 치역(약), 속함은 이행적.
//   아래: ABox — 적힌 사실 4개. 한 단계마다 규칙 하나가 '발동'해서 추론된 선을 보라 점선으로 그려요 (근거가 된 선은 굵게).
import { svg, g, el, text, line, anim, arrowHead, readout, C } from "./kit.js";

// ---- 작은 그래프 그리기 (이 그림 안에서만 써요) ----
const tw = (s, z) => [...String(s)].reduce((a, ch) => a + (ch.charCodeAt(0) > 0x2e80 ? z * 1.02 : ch === " " ? z * 0.32 : z * 0.62), 0);
function node(par, x, y, label, o = {}) {
  const z = o.size || 14, w = tw(label, z) + 18, h = z + 14, gg = g(par);
  el(gg, "rect", { x: x - w / 2, y: y - h / 2, width: w, height: h, rx: o.inst ? h / 2 : 5, fill: o.fill || C.bg, stroke: o.stroke || C.ink, "stroke-width": o.sw || 1.6 });
  text(gg, x, y, label, { size: z, anchor: "middle", weight: o.inst ? 600 : 700, fill: o.color || C.ink });
  return { g: gg, cx: x, cy: y, w, h };
}
function rim(n, tx, ty, pad = 3) {
  const dx = tx - n.cx, dy = ty - n.cy; if (!dx && !dy) return [n.cx, n.cy];
  const s = Math.min(dx ? (n.w / 2 + pad) / Math.abs(dx) : 1e9, dy ? (n.h / 2 + pad) / Math.abs(dy) : 1e9);
  return [n.cx + dx * s, n.cy + dy * s];
}
function edge(par, A, B, o = {}) {
  const s = par.ownerSVGElement || par, color = o.color || C.sub, bend = o.bend || 0;
  const len = Math.hypot(B.cx - A.cx, B.cy - A.cy) || 1;
  const qx = (A.cx + B.cx) / 2 - ((B.cy - A.cy) / len) * bend, qy = (A.cy + B.cy) / 2 + ((B.cx - A.cx) / len) * bend;
  const [x1, y1] = rim(A, bend ? qx : B.cx, bend ? qy : B.cy), [x2, y2] = rim(B, bend ? qx : A.cx, bend ? qy : A.cy, 5);
  const gg = g(par);
  el(gg, "path", { d: bend ? `M${x1},${y1} Q${qx},${qy} ${x2},${y2}` : `M${x1},${y1} L${x2},${y2}`, fill: "none", stroke: color, "stroke-width": o.width || 1.8, "stroke-dasharray": o.dash || null, "marker-end": arrowHead(s, color), "stroke-linecap": "round" });
  if (o.label) {
    const t = o.t ?? 0.5, lx = bend ? (1 - t) ** 2 * x1 + 2 * (1 - t) * t * qx + t * t * x2 : x1 + (x2 - x1) * t, ly = bend ? (1 - t) ** 2 * y1 + 2 * (1 - t) * t * qy + t * t * y2 : y1 + (y2 - y1) * t;
    text(gg, lx + (o.lx || 0), ly + (o.ly || 0), o.label, { size: o.size || 12.5, anchor: "middle", weight: 700, fill: o.lcolor || color, cls: "fg-t halo" });
  }
  return gg;
}
// ---- 그래프 도구 끝 ----

const STEPS = [
  "위는 TBox(틀 · 규칙), 아래는 ABox(사실)예요. 적힌 사실은 4개뿐: 아스피린정은 아스피린, 김의사가 아스피린정을 처방함, 심장내과 ⊂ 내과 ⊂ 진료부.",
  "하위 클래스 규칙: x 가 아스피린이고 아스피린 ⊑ NSAID 이면 → x 는 NSAID. 아스피린정 → NSAID (보라 점선 = 추론).",
  "같은 규칙이 한 번 더: 아스피린정은 NSAID, NSAID ⊑ 진통제 → 아스피린정은 진통제. 사슬을 따라 끝까지 올라가요.",
  "정의역 · 치역 규칙: '처방함'의 주어는 의사, 목적어는 약이라고 했으니 → 김의사는 의사, 아스피린정은 약. 아무도 적지 않았는데 알게 됐어요.",
  "이행 규칙: 속함이 이행적이니 심장내과 속함 내과, 내과 속함 진료부 → 심장내과 속함 진료부. 적힌 4개에서 새 사실 5개가 나왔어요.",
];

export default {
  aspect: 430 / 660,
  aspectNarrow: 540 / 380,
  steps: STEPS,
  mount(stage, f) {
    const nar = !!f.narrow, W = nar ? 380 : 660, H = nar ? 540 : 430;
    const s = svg(stage, W, H, "TBox 규칙과 ABox 사실에서 규칙이 하나씩 발동해 새 사실이 추론되는 그림");
    const back = g(s), eG = g(s), nG = g(s), ro = readout(f.controls());
    const L = nar
      ? { 약: [40, 100], 아스피린: [128, 100], NSAID: [226, 100], 진통제: [326, 100], 의사: [326, 146], ax: [[14, 40], [14, 62]], sep: 184, abox: 204,
          정: [128, 300], 김: [300, 300], 심: [58, 420], 내: [190, 420], 진: [318, 420] }
      : { 약: [62, 112], 아스피린: [180, 112], NSAID: [306, 112], 진통제: [426, 112], 의사: [574, 112], ax: [[18, 46], [18, 70]], sep: 156, abox: 176,
          정: [196, 266], 김: [470, 266], 심: [120, 362], 내: [330, 362], 진: [540, 362] };
    // 바탕: TBox · ABox 이름표, 공리 글
    text(back, nar ? 14 : 18, nar ? 18 : 22, "TBox — 틀 · 규칙", { size: 13, weight: 700, fill: C.sub });
    const ax = nar ? ["처방함: 정의역 = 의사 · 치역 = 약", "속함: 이행적 (a⊂b, b⊂c → a⊂c)"] : ["처방함 : 정의역(주어 쪽) = 의사 · 치역(목적어 쪽) = 약", "속함 : 이행적 — a 속함 b, b 속함 c 이면 a 속함 c"];
    const axT = ax.map((t, k) => text(back, ...L.ax[k], t, { size: 13, weight: 600, fill: C.ink }));
    line(back, 10, L.sep, W - 10, L.sep, { color: C.grid, width: 1.2, dash: "5 4" });
    text(back, nar ? 14 : 18, L.abox, "ABox — 사실", { size: 13, weight: 700, fill: C.sub });

    function draw(i, animate) {
      eG.replaceChildren(); nG.replaceChildren();
      const N = {};
      for (const k of ["약", "아스피린", "NSAID", "진통제", "의사"]) N[k] = node(nG, ...L[k], k);
      const inst = { 정: "아스피린정", 김: "김의사", 심: "심장내과", 내: "내과", 진: "진료부" };
      for (const [k, v] of Object.entries(inst)) N[k] = node(nG, ...L[k], v, { inst: true, fill: C.aSoft, stroke: C.a });
      // 근거로 쓰인 것 (이번 단계)
      const HL = [[], ["t정", "s1"], ["i1", "s2"], ["p", "ax0"], ["d1", "d2", "ax1"]][i];
      const hot = (k) => HL.includes(k);
      const E = (k, a, b, o) => edge(eG, N[a], N[b], { ...o, color: hot(k) ? C.ink : o.color, width: hot(k) ? 3 : o.width });
      E("s1", "아스피린", "NSAID", { label: "⊑", color: C.sub, ly: -10 });
      E("s2", "NSAID", "진통제", { label: "⊑", color: C.sub, ly: -10 });
      E("t정", "정", "아스피린", { label: "종류", color: C.mute, dash: "3 3", t: 0.5, lx: -18 });
      E("p", "김", "정", { label: "처방함", color: C.a, ly: -11, width: 2.2 });
      E("d1", "심", "내", { label: "속함", color: C.a, ly: -11, width: 2.2 });
      E("d2", "내", "진", { label: "속함", color: C.a, ly: -11, width: 2.2 });
      axT.forEach((t, k) => { t.style.fill = hot("ax" + k) ? C.b : C.ink; });
      // 추론된 선 (보라 점선). 이번 단계에 새로 생긴 건 더 진하게 + 규칙 이름
      const INF = [
        { at: 1, a: "정", b: "NSAID", label: nar ? "하위 클래스" : "하위 클래스 규칙", bend: nar ? -10 : -14, t: 0.55 },
        { at: 2, a: "정", b: "진통제", label: nar ? "하위 클래스" : "하위 클래스 규칙", bend: nar ? -26 : -30, t: 0.6 },
        { at: 3, a: "김", b: "의사", label: nar ? "정의역" : "정의역 규칙", bend: nar ? 20 : -16, t: 0.5 },
        { at: 3, a: "정", b: "약", label: nar ? "치역" : "치역 규칙", bend: nar ? 14 : 18, t: 0.5 },
        { at: 4, a: "심", b: "진", label: "이행 규칙", bend: nar ? -48 : -44, t: 0.5 },
      ];
      const fresh = [];
      for (const e of INF) {
        if (e.at > i) continue;
        const now = e.at === i;
        const gg = edge(eG, N[e.a], N[e.b], { color: C.d, dash: "6 4", width: now ? 2.6 : 1.6, bend: e.bend, label: now ? e.label : "", t: e.t });
        if (now) fresh.push(gg);
      }
      if (animate && fresh.length) {
        fresh.forEach((gg) => { const p = gg.querySelector("path"), len = p.getTotalLength(); p.style.strokeDasharray = `${len}`; p.style.strokeDashoffset = `${len}`; gg.querySelector("text") && (gg.querySelector("text").style.opacity = "0"); });
        return anim(700, (t) => fresh.forEach((gg) => { const p = gg.querySelector("path"); p.style.strokeDashoffset = String(p.getTotalLength() * (1 - t)); })).then(() => fresh.forEach((gg) => { const p = gg.querySelector("path"); p.style.strokeDasharray = ""; p.style.strokeDashoffset = ""; const tx = gg.querySelector("text"); if (tx) tx.style.opacity = ""; }));
      }
    }
    const READ = [
      `<div>적힌 사실 <b>4개</b> · 추론 <b>0개</b> — <span class="dim">질문 "진통제를 처방받은 게 있나?" 에 지금은 답이 없어요</span></div>`,
      `<div><span class="d">추론</span> 아스피린정 a NSAID ← 아스피린정 a 아스피린 + 아스피린 ⊑ NSAID</div>`,
      `<div><span class="d">추론</span> 아스피린정 a 진통제 ← 아스피린정 a NSAID + NSAID ⊑ 진통제 — <span class="dim">이제 "진통제" 로 찾아도 나와요</span></div>`,
      `<div><span class="d">추론</span> 김의사 a 의사 (정의역) · 아스피린정 a 약 (치역) — <span class="dim">반대로, 간호사가 '처방함'의 주어면 규칙 위반을 잡아낼 수도 있어요</span></div>`,
      `<div><span class="d">추론</span> 심장내과 속함 진료부 (이행) — 적힌 <b>4개</b> → 추론 <b>5개</b>. <span class="dim">추론기(reasoner)는 더 나올 게 없을 때까지 규칙을 반복해요</span></div>`,
    ];
    return { go(i, animate) { ro.set(READ[i]); return draw(i, animate); } };
  },
};
