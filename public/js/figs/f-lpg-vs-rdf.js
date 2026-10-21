// 그림: 속성 그래프(LPG) vs RDF — 같은 사실을 두 방식으로
//   사실: 홍길동(환자, 52세)이 아스피린(약, 성분 ASA)을 처방받음 — 날짜 10-01, 용량 100mg.
//   LPG(Neo4j 같은): 점과 선 안에 key: value 속성을 넣어요. 선에도 속성이 붙어요.
//   RDF: 모든 게 트리플. 속성값은 리터럴 점으로 따로 나와요. 선의 속성은? → 사건 점(처방#1)으로 풀거나 RDF-star(<< >>)로 감싸요.
import { svg, g, el, text, rect, anim, arrowHead, choice, readout, C } from "./kit.js";

// ---- 작은 그래프 그리기 (이 그림 안에서만 써요) ----
const tw = (s, z) => [...String(s)].reduce((a, ch) => a + (ch.charCodeAt(0) > 0x2e80 ? z * 1.02 : ch === " " ? z * 0.32 : z * 0.62), 0);
function node(par, x, y, label, o = {}) {
  const z = o.size || 14, w = tw(label, z) + 20, h = z + 14, gg = g(par);
  el(gg, "rect", { x: x - w / 2, y: y - h / 2, width: w, height: h, rx: o.lit ? 2 : h / 2, fill: o.fill || C.bg, stroke: o.stroke || C.ink, "stroke-width": 1.6, "stroke-dasharray": o.dash || null });
  text(gg, x, y, label, { size: z, anchor: "middle", weight: o.lit ? 500 : 700, fill: o.color || C.ink });
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
  el(gg, "path", { d: `M${x1},${y1} L${x2},${y2}`, fill: "none", stroke: color, "stroke-width": o.width || 1.8, "stroke-dasharray": o.dash || null, "marker-end": arrowHead(s, color), "stroke-linecap": "round" });
  if (o.label) text(gg, (x1 + x2) / 2 + (o.lx || 0), (y1 + y2) / 2 + (o.ly || 0), o.label, { size: 12.5, anchor: "middle", weight: 600, fill: o.lcolor || color, cls: "fg-t halo" });
  return gg;
}
// ---- 그래프 도구 끝 ----

const STEPS = [
  "속성 그래프(LPG): 점 2개 · 선 1개. 점 안에 종류(:환자)와 속성(나이: 52)이, 선 안에도 속성(날짜 · 용량)이 들어 있어요.",
  "RDF: 모든 게 '주어 술어 목적어' 트리플이에요. 종류도 트리플(a 환자), 나이도 트리플(나이 \"52\") — 속성값이 따로 떨어진 리터럴 점이 돼요.",
  "그런데 선의 속성(날짜 · 용량)은 붙일 곳이 없어요. 방법 1: 처방 자체를 점(처방#1)으로 만들고 거기에 날짜 · 용량을 달아요 (사건 노드 · 구체화).",
  "방법 2: RDF-star — 트리플 하나를 << >> 로 감싸 그 자체를 주어로 써요. << 홍길동 처방받음 아스피린 >> 날짜 \"10-01\". 표준 RDF 1.2 에 들어가요.",
];

export default {
  aspect: 390 / 660,
  aspectNarrow: 520 / 380,
  steps: STEPS,
  hint: "아래 단추로 두 방식을 바꿔 보세요",
  mount(stage, f) {
    const nar = !!f.narrow, W = nar ? 380 : 660, H = nar ? 520 : 390;
    const s = svg(stage, W, H, "같은 처방 사실을 속성 그래프와 RDF 트리플로 그린 그림");
    const root = g(s), ctl = f.controls();
    let stepNow = 0;
    const pick = choice(ctl, [["lpg", "속성 그래프 (LPG)"], ["rdf", "RDF 트리플"]], "lpg", (k) => {
      if (k === "lpg") f.goto(0); else if (stepNow === 0) f.goto(1); else pick.set("rdf");
    }, "보기 고르기");
    const ro = readout(ctl);

    // LPG 점: 이름 + 종류 칩 + 속성 줄
    function pnode(x, y, name, label, props) {
      const gg = g(root), w = nar ? 170 : 184, h = 40 + props.length * 22 + 8;
      rect(gg, x - w / 2, y - h / 2, w, h, { r: 12, fill: C.aSoft, stroke: C.a, sw: 1.8 });
      text(gg, x - w / 2 + 14, y - h / 2 + 22, name, { size: 16, weight: 800 });
      const cw = tw(label, 12.5) + 14; rect(gg, x + w / 2 - cw - 10, y - h / 2 + 11, cw, 22, { r: 11, fill: C.bg, stroke: C.a, sw: 1 });
      text(gg, x + w / 2 - cw / 2 - 10, y - h / 2 + 22, label, { size: 12.5, anchor: "middle", weight: 700, fill: C.a });
      props.forEach((p, k) => text(gg, x - w / 2 + 14, y - h / 2 + 50 + k * 22, p, { size: 13.5, weight: 500, fill: C.ink }));
      return { g: gg, cx: x, cy: y, w, h };
    }
    function draw(i, animate) {
      root.replaceChildren();
      const fresh = [];
      if (i === 0) {
        const A = nar ? pnode(190, 80, "홍길동", ":환자", ["나이: 52"]) : pnode(140, 170, "홍길동", ":환자", ["나이: 52"]);
        const B = nar ? pnode(190, 420, "아스피린", ":약", ["성분: ASA"]) : pnode(520, 170, "아스피린", ":약", ["성분: ASA"]);
        edge(root, A, B, { color: C.b, width: 2.6 });
        const ex = nar ? 190 : 330, ey = nar ? 250 : 170, eg = g(root), ew = nar ? 168 : 150;
        rect(eg, ex - ew / 2, ey - 44, ew, 88, { r: 6, fill: C.bSoft, stroke: C.b, sw: 1.4 });
        text(eg, ex, ey - 24, ":처방받음", { size: 14, weight: 800, anchor: "middle", fill: C.b });
        text(eg, ex, ey + 2, "날짜: 10-01", { size: 13.5, anchor: "middle" });
        text(eg, ex, ey + 24, "용량: 100mg", { size: 13.5, anchor: "middle" });
        text(root, W / 2, H - 18, "점 2 · 선 1 — 속성은 점과 선 '안에'", { size: 13, weight: 600, anchor: "middle", fill: C.sub });
      } else {
        const P = nar
          ? { 홍: [100, 150], 아: [290, 150], 환: [100, 50], 약: [290, 50], n52: [60, 250], asa: [320, 250], ev: [190, 320], d: [100, 420], q: [290, 420], d3: [150, 330], q3: [250, 330] }
          : { 홍: [170, 160], 아: [490, 160], 환: [170, 56], 약: [490, 56], n52: [70, 250], asa: [590, 250], ev: [330, 250], d: [240, 334], q: [420, 334], d3: [240, 300], q3: [420, 300] };
        const N = {};
        N.홍 = node(root, ...P.홍, "홍길동"); N.아 = node(root, ...P.아, "아스피린");
        N.환 = node(root, ...P.환, "환자"); N.약 = node(root, ...P.약, "약");
        N.n52 = node(root, ...P.n52, "\"52\"", { lit: true, fill: C.bSoft, stroke: C.b }); N.asa = node(root, ...P.asa, "\"ASA\"", { lit: true, fill: C.bSoft, stroke: C.b });
        edge(root, N.홍, N.환, { label: "a", lx: -10 }); edge(root, N.아, N.약, { label: "a", lx: -10 });
        edge(root, N.홍, N.n52, { label: "나이", lx: nar ? -16 : -14, ly: -4 }); edge(root, N.아, N.asa, { label: "성분", lx: nar ? 18 : 14, ly: -4 });
        const main = edge(root, N.홍, N.아, { label: "처방받음", color: C.a, width: 2.4, ly: -11 });
        if (i === 2) {
          main.style.opacity = "0.35";
          const ev = g(root); fresh.push(ev);
          N.ev = node(ev, ...P.ev, "처방#1", { fill: C.dSoft, stroke: C.d });
          N.d = node(ev, ...P.d, "\"10-01\"", { lit: true, fill: C.bSoft, stroke: C.b }); N.q = node(ev, ...P.q, "\"100mg\"", { lit: true, fill: C.bSoft, stroke: C.b });
          edge(ev, N.ev, N.홍, { label: "환자", color: C.d, lx: -14 }); edge(ev, N.ev, N.아, { label: "약", color: C.d, lx: 12 });
          edge(ev, N.ev, N.d, { label: "날짜", color: C.d, lx: -16 }); edge(ev, N.ev, N.q, { label: "용량", color: C.d, lx: 16 });
        }
        if (i === 3) {
          const qg = g(root); fresh.push(qg);
          const x0 = N.홍.cx - N.홍.w / 2 - 12, x1 = N.아.cx + N.아.w / 2 + 12, y0 = N.홍.cy - 34, y1 = N.홍.cy + 26;
          el(qg, "rect", { x: x0, y: y0, width: x1 - x0, height: y1 - y0, rx: 14, fill: "none", stroke: C.d, "stroke-width": 2, "stroke-dasharray": "6 4" });
          text(qg, (x0 + x1) / 2, y0 - 10, "<< … >> 감싼 트리플", { size: 13, weight: 800, fill: C.d, cls: "fg-t halo", anchor: "middle" });
          const box = { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w: x1 - x0, h: y1 - y0 };
          N.d = node(qg, ...P.d3, "\"10-01\"", { lit: true, fill: C.bSoft, stroke: C.b }); N.q = node(qg, ...P.q3, "\"100mg\"", { lit: true, fill: C.bSoft, stroke: C.b });
          const bot = (n) => ({ cx: n.cx, cy: y1 + 1, w: 2, h: 2 });
          edge(qg, bot(N.d), N.d, { label: "날짜", color: C.d, lx: -18 }); edge(qg, bot(N.q), N.q, { label: "용량", color: C.d, lx: 18 });
          void box;
        }
        const cnt = [0, 5, 9, 7][i];
        text(root, W / 2, H - 18, `트리플 ${cnt}개 — ${i === 1 ? "속성값도 점(리터럴)" : i === 2 ? "처방#1 점으로 4개 더" : "감싼 트리플에 2개 더"}`, { size: 13, weight: 600, anchor: "middle", fill: C.sub });
      }
      pick.set(i === 0 ? "lpg" : "rdf");
      if (animate && fresh.length) { fresh.forEach((e) => (e.style.opacity = "0")); return anim(450, (t) => fresh.forEach((e) => (e.style.opacity = String(t)))).then(() => fresh.forEach((e) => (e.style.opacity = ""))); }
      if (animate) { root.style.opacity = "0"; return anim(350, (t) => (root.style.opacity = String(t))).then(() => (root.style.opacity = "")); }
    }
    const READ = [
      `<div><span class="a">점</span>: 종류 + 속성 · <span class="b">선</span>: 종류 + 속성 — <span class="dim">한 회사 안의 그래프 DB, 빠른 길 찾기에 편해요 (Cypher)</span></div>`,
      `<div>RDF 트리플 5개: 홍길동 a 환자 · 홍길동 나이 "52" · 아스피린 a 약 · 아스피린 성분 "ASA" · <span class="a">홍길동 처방받음 아스피린</span></div>`,
      `<div><span class="d">처방#1</span> 환자 홍길동 · 약 아스피린 · 날짜 "10-01" · 용량 "100mg" — <span class="dim">선을 점으로 바꾸면 무엇이든 달 수 있지만 트리플이 늘어요</span></div>`,
      `<div><span class="d">&lt;&lt; 홍길동 처방받음 아스피린 &gt;&gt;</span> 날짜 "10-01" ; 용량 "100mg" — <span class="dim">LPG 의 '선 속성'과 거의 같은 모양 (SPARQL 1.2 도 지원)</span></div>`,
    ];
    return { go(i, animate) { stepNow = i; ro.set(READ[i]); return draw(i, animate); } };
  },
};
