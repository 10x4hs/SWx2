// 그림: RDF 트리플 하나씩 — 주어 –술어→ 목적어 (Turtle 글과 그래프를 나란히)
//   트리플을 한 줄 더할 때마다 그래프에 선 하나가 생기고, 옆(좁으면 아래) Turtle 글에서 그 줄이 밝아져요.
//   같은 이름(URI)은 같은 점 → 트리플이 모이면 저절로 그래프가 돼요. 마지막: URI(동그라미) vs 리터럴(네모 · 값).
import { svg, g, el, text, rect, anim, arrowHead, readout, C } from "./kit.js";

// ---- 작은 그래프 그리기 (이 그림 안에서만 써요) ----
const tw = (s, z) => [...String(s)].reduce((a, ch) => a + (ch.charCodeAt(0) > 0x2e80 ? z * 1.02 : ch === " " ? z * 0.32 : z * 0.62), 0);
function node(par, x, y, label, o = {}) {
  const z = o.size || 14, w = tw(label, z) + 22, h = z + 16, gg = g(par);
  el(gg, "rect", { x: x - w / 2, y: y - h / 2, width: w, height: h, rx: o.lit ? 2 : h / 2, fill: o.fill || C.bg, stroke: o.stroke || C.ink, "stroke-width": o.sw || 1.6 });
  text(gg, x, y, label, { size: z, anchor: "middle", weight: 600, fill: o.color || C.ink, mono: o.mono });
  return { g: gg, cx: x, cy: y, w, h };
}
function rim(n, tx, ty, pad = 3) {
  const dx = tx - n.cx, dy = ty - n.cy; if (!dx && !dy) return [n.cx, n.cy];
  const s = Math.min(dx ? (n.w / 2 + pad) / Math.abs(dx) : 1e9, dy ? (n.h / 2 + pad) / Math.abs(dy) : 1e9);
  return [n.cx + dx * s, n.cy + dy * s];
}
function edge(par, A, B, o = {}) {
  const s = par.ownerSVGElement || par, color = o.color || C.sub;
  const [x1, y1] = rim(A, B.cx, B.cy), [x2, y2] = rim(B, A.cx, A.cy, 5), gg = g(par);
  el(gg, "path", { d: `M${x1},${y1} L${x2},${y2}`, fill: "none", stroke: color, "stroke-width": o.width || 2, "marker-end": arrowHead(s, color), "stroke-linecap": "round" });
  if (o.label) text(gg, (x1 + x2) / 2 + (o.lx || 0), (y1 + y2) / 2 + (o.ly || 0), o.label, { size: 12.5, anchor: "middle", weight: 600, fill: color, cls: "fg-t halo", mono: true });
  return gg;
}
// ---- 그래프 도구 끝 ----

// 트리플 4개 (ex: = <http://hosp.example/>)
const TRIPLES = [
  { s: "홍길동", p: "a", o: "환자", ttl: "ex:홍길동 a ex:환자 ." },
  { s: "홍길동", p: "ex:처방받음", o: "아스피린", ttl: "ex:홍길동 ex:처방받음 ex:아스피린 ." },
  { s: "아스피린", p: "a", o: "약", ttl: "ex:아스피린 a ex:약 ." },
  { s: "홍길동", p: "ex:이름", o: "\"홍길동\"", lit: true, ttl: "ex:홍길동 ex:이름 \"홍길동\" ." },
];
const STEPS = [
  "트리플 하나 = 주어 → 술어 → 목적어. '홍길동은 환자의 한 종류다'를 화살표 하나로 적어요 (a = rdf:type, '~의 종류').",
  "두 번째 트리플: 홍길동 –처방받음→ 아스피린. 주어가 같으니 같은 점(홍길동)에서 새 선이 나가요.",
  "세 번째: 아스피린 a 약. 앞 트리플의 목적어였던 아스피린이 이번엔 주어 — 같은 이름이라 같은 점이고, 그래서 그래프가 이어져요.",
  "네 번째: 목적어가 따옴표 \"홍길동\" — 이건 다른 곳을 가리키는 이름이 아니라 그냥 값(글자)이에요.",
  "URI(동그라미)는 세상에 하나뿐인 이름 — ex:홍길동 은 사실 <http://hosp.example/홍길동>. 리터럴(네모)은 값이라 거기서 선이 더 나갈 수 없어요.",
];

export default {
  aspect: 380 / 680,
  aspectNarrow: 560 / 380,
  steps: STEPS,
  mount(stage, f) {
    const nar = !!f.narrow, W = nar ? 380 : 680, H = nar ? 560 : 380;
    const s = svg(stage, W, H, "트리플을 하나씩 더하며 자라는 RDF 그래프와 Turtle 글");
    const gG = g(s), tG = g(s), ro = readout(f.controls());
    // 그래프 자리
    const POS = nar ? { 홍길동: [100, 150], 환자: [100, 50], 아스피린: [270, 150], 약: [270, 50], lit: [150, 250] } : { 홍길동: [110, 170], 환자: [110, 56], 아스피린: [300, 170], 약: [300, 56], lit: [170, 280] };
    // Turtle 판
    const T = nar ? { x: 14, y: 318, w: 352, h: 228, fs: 12.2, lh: 30 } : { x: 384, y: 24, w: 282, h: 332, fs: 11.4, lh: 40 };
    function draw(i, animate) {
      gG.replaceChildren(); tG.replaceChildren();
      const shown = TRIPLES.slice(0, i >= 4 ? 4 : i + 1), last = i < 4 ? i : -1;
      const N = {}, uriMode = i === 4;
      const uri = (k) => uriMode ? { fill: C.aSoft, stroke: C.a } : {};
      const need = new Set(); shown.forEach((t) => { need.add(t.s); need.add(t.lit ? "lit" : t.o); });
      let fresh = [];
      for (const k of need) {
        const isLit = k === "lit", label = isLit ? "\"홍길동\"" : "ex:" + k;
        const isNew = shown[last] && (shown[last].s === k || (shown[last].lit ? "lit" : shown[last].o) === k) && !TRIPLES.slice(0, last).some((t) => t.s === k || (t.lit ? "lit" : t.o) === k);
        N[k] = node(gG, ...POS[k], label, { lit: isLit, mono: true, size: 13, ...(isLit ? (uriMode ? { fill: C.bSoft, stroke: C.b } : {}) : uri(k)) });
        if (isNew) fresh.push(N[k].g);
      }
      shown.forEach((t, k) => {
        const B = N[t.lit ? "lit" : t.o], on = k === last;
        const e = edge(gG, N[t.s], B, { label: t.p, color: on ? C.b : C.sub, width: on ? 2.6 : 1.8, lx: t.p === "a" ? (nar ? -12 : -14) : 0, ly: t.p === "a" ? 0 : -11 });
        if (on) fresh.push(e);
      });
      if (i === 0) {
        // 주어 · 술어 · 목적어 이름표
        const a = N["홍길동"], b = N["환자"];
        text(gG, a.cx + a.w / 2 + 8, a.cy, "주어", { size: 13, weight: 700, fill: C.a });
        text(gG, b.cx + b.w / 2 + 8, b.cy, "목적어", { size: 13, weight: 700, fill: C.c });
        text(gG, a.cx + 14, (a.cy + b.cy) / 2, "술어", { size: 13, weight: 700, fill: C.b });
      }
      if (uriMode) {
        text(gG, nar ? 190 : 190, nar ? 296 : 346, "ex:홍길동 = <http://hosp.example/홍길동>", { size: nar ? 11.5 : 12.5, anchor: "middle", weight: 600, fill: C.a, mono: true });
        const l = N.lit; text(gG, l.cx + l.w / 2 + 8, l.cy, nar ? "값 — 끝" : "값(리터럴) — 여기서 끝", { size: 12.5, weight: 700, fill: C.b });
      }
      // Turtle 글
      rect(tG, T.x, T.y, T.w, T.h, { r: 6, fill: C.soft, stroke: C.grid, sw: 1 });
      text(tG, T.x + 10, T.y + 16, "Turtle (글로 쓴 RDF)", { size: 12, weight: 700, fill: C.sub });
      const lines = ["@prefix ex: <http://hosp.example/> .", ...TRIPLES.map((t) => t.ttl)];
      lines.forEach((l, k) => {
        const y = T.y + 42 + k * T.lh, isT = k > 0, idx = k - 1, vis = !isT || idx < shown.length, on = isT && idx === last;
        if (!vis) { text(tG, T.x + 10, y, "…", { size: T.fs, fill: C.mute, mono: true }); return; }
        if (on) { const hb = rect(tG, T.x + 4, y - T.fs * 0.9, T.w - 8, T.fs * 1.8, { r: 4, fill: C.hi }); fresh.push(hb); }
        // 긴 줄은 둘로 (술어 앞에서)
        const parts = tw(l, T.fs * 0.98) > T.w - 20 && isT ? [l.slice(0, l.indexOf(" ", 3)), "    " + l.slice(l.indexOf(" ", 3) + 1)] : [l];
        parts.forEach((p, m) => text(tG, T.x + 10, y + m * T.fs * 1.25 - (parts.length - 1) * T.fs * 0.62, p, { size: T.fs, weight: on ? 700 : 500, fill: !isT ? C.mute : on ? C.ink : C.sub, mono: true }));
      });
      if (animate && fresh.length) { fresh.forEach((e) => (e.style.opacity = "0")); return anim(450, (t) => fresh.forEach((e) => (e.style.opacity = String(t)))).then(() => fresh.forEach((e) => (e.style.opacity = ""))); }
    }
    const READ = [
      `<div><span class="a">주어</span> ex:홍길동 · <span class="b">술어</span> a · <span class="c">목적어</span> ex:환자 — <span class="dim">트리플 1개 = 선 1개</span></div>`,
      `<div>트리플 2개 · 점 3개 — <span class="dim">같은 주어는 같은 점에서 출발해요</span></div>`,
      `<div>트리플 3개 · 점 4개 — <span class="dim">따로 쓴 문장들이 이름이 같아서 하나로 이어졌어요</span></div>`,
      `<div><span class="b">"홍길동"</span> 은 따옴표 = 값 · <span class="dim">ex:홍길동(사람)과 "홍길동"(글자 세 개)은 서로 달라요</span></div>`,
      `<div><span class="a">URI</span> = 어디서나 같은 대상을 가리키는 이름(주어 · 술어 · 목적어 다 될 수 있어요) · <span class="b">리터럴</span> = 값(목적어 자리에만)</div>`,
    ];
    return { go(i, animate) { ro.set(READ[i]); return draw(i, animate); } };
  },
};
