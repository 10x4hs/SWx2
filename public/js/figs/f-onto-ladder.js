// 그림: 목록 → 분류 → 시소러스 → 온톨로지 → 지식그래프 (온톨로지 사다리)
//   같은 병원 낱말(환자 · 의사 · 진료 · 약 · 아스피린 · 타이레놀)을 다섯 칸에서 차례로 보여 줘요.
//   한 칸 올라갈 때마다 하나씩 더해져요: 위·아래(상위어) → 동의어 · 관련어 → 이름 붙은 관계 + 규칙 → 실제 사례(인스턴스).
import { svg, g, el, text, rect, anim, arrowHead, readout, C } from "./kit.js";

// ---- 작은 그래프 그리기 (이 그림 안에서만 써요) ----
const tw = (s, z) => [...String(s)].reduce((a, ch) => a + (ch.charCodeAt(0) > 0x2e80 ? z * 1.02 : ch === " " ? z * 0.32 : z * 0.62), 0);
const KIND = {
  word: { fill: C.soft, stroke: C.line, r: 6 },
  cls: { fill: C.bg, stroke: C.ink, r: 6, weight: 700 },
  inst: { fill: C.aSoft, stroke: C.a, r: 99 },
  syn: { fill: C.cSoft, stroke: C.c, r: 6, dash: "4 3" },
  ghost: { fill: C.bg, stroke: C.grid, r: 6, color: C.mute },
};
function node(par, x, y, label, kind = "cls", o = {}) {
  const k = { ...KIND[kind], ...o }, z = k.size || 14, lines = String(label).split("\n");
  const w = Math.max(...lines.map((l) => tw(l, z))) + 18, h = lines.length * z * 1.25 + 12;
  const gg = g(par);
  el(gg, "rect", { x: x - w / 2, y: y - h / 2, width: w, height: h, rx: Math.min(k.r, h / 2), fill: k.fill, stroke: k.stroke, "stroke-width": 1.6, "stroke-dasharray": k.dash || null });
  lines.forEach((l, i) => text(gg, x, y + (i - (lines.length - 1) / 2) * z * 1.25, l, { size: z, anchor: "middle", weight: k.weight || 600, fill: k.color || C.ink }));
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
  const [x1, y1] = rim(A, bend ? qx : B.cx, bend ? qy : B.cy), [x2, y2] = rim(B, bend ? qx : A.cx, bend ? qy : A.cy, o.head === false ? 3 : 5);
  const gg = g(par);
  el(gg, "path", { d: bend ? `M${x1},${y1} Q${qx},${qy} ${x2},${y2}` : `M${x1},${y1} L${x2},${y2}`, fill: "none", stroke: color, "stroke-width": o.width || 1.8, "stroke-dasharray": o.dash || null, "marker-end": o.head === false ? null : arrowHead(s, color), "stroke-linecap": "round" });
  if (o.label) {
    const lx = bend ? (x1 + 2 * qx + x2) / 4 : (x1 + x2) / 2, ly = bend ? (y1 + 2 * qy + y2) / 4 : (y1 + y2) / 2;
    text(gg, lx + (o.lx || 0), ly + (o.ly || 0), o.label, { size: o.size || 12.5, anchor: "middle", weight: 600, fill: o.lcolor || color, cls: "fg-t halo" });
  }
  return gg;
}
function stager() {
  let prev = new Set();
  return (items, animate) => {
    const fresh = items.filter((it) => !prev.has(it.k)).map((it) => it.el);
    prev = new Set(items.map((it) => it.k));
    if (!animate || !fresh.length) return Promise.resolve();
    fresh.forEach((e) => (e.style.opacity = "0"));
    return anim(420, (t) => fresh.forEach((e) => (e.style.opacity = String(t)))).then(() => fresh.forEach((e) => (e.style.opacity = "")));
  };
}
// ---- 그래프 도구 끝 ----

const RUNGS = ["목록", "분류", "시소러스", "온톨로지", "지식그래프"];
const STEPS = [
  "① 목록: 낱말을 그냥 모아 둔 것이에요. '아스피린'과 '약'이 무슨 사이인지 컴퓨터는 몰라요.",
  "② 분류(택소노미): 위·아래를 정해요. 아스피린은 약의 한 종류, 환자 · 의사는 사람의 한 종류 — 나무 모양이 돼요.",
  "③ 시소러스: 같은 뜻(동의어)과 관련 있는 말(관련어)을 이어요. 'ASA'로 찾아도 아스피린이 나와요.",
  "④ 온톨로지: 관계에 이름과 방향을 붙이고 규칙을 더해요. '의사 –수행→ 진료 –처방→ 약' · '처방하는 사람은 의사여야 해요'.",
  "⑤ 지식그래프: 온톨로지(틀)에 실제 사례를 채워요. 김의사가 진료 #1024 에서 홍길동에게 아스피린정을 처방했어요.",
];

export default {
  aspect: 400 / 640,
  aspectNarrow: 520 / 380,
  steps: STEPS,
  mount(stage, f) {
    const nar = !!f.narrow, W = nar ? 380 : 640, H = nar ? 520 : 400;
    const s = svg(stage, W, H, "같은 병원 낱말이 목록에서 지식그래프까지 한 칸씩 풍부해지는 사다리");
    const top = g(s), body = g(s), ro = readout(f.controls()), fade = stager();
    const bx = 22, by = nar ? 62 : 58, bw = W - 44, bh = H - by - 16;
    const P = (nx, ny) => [bx + nx * bw, by + ny * bh];
    // 사다리 칸 (위)
    const rungs = RUNGS.map((r, k) => {
      const gg = g(top), cw = (W - 24) / 5, x = 12 + k * cw;
      const bg = rect(gg, x + 2, 10, cw - 4, 30, { r: 6, fill: C.soft });
      const t = text(gg, x + cw / 2, 25, r, { size: nar ? 12 : 14, anchor: "middle", weight: 700, fill: C.mute });
      if (k < 4) text(gg, x + cw, 25, "›", { size: 14, anchor: "middle", fill: C.mute });
      return { bg, t };
    });
    function paintRungs(i) {
      rungs.forEach((r, k) => {
        r.bg.style.fill = k === i ? C.aSoft : k < i ? C.soft : C.bg;
        r.bg.style.stroke = k === i ? C.a : C.grid; r.bg.setAttribute("stroke-width", "1.4");
        r.t.style.fill = k === i ? C.a : k < i ? C.sub : C.mute;
      });
    }
    function draw(i) {
      body.replaceChildren();
      const items = [], N = {};
      const add = (k, e) => { items.push({ k, el: e.g || e }); return e; };
      const nd = (k, nx, ny, label, kind, o) => (N[k] = add("n:" + k + ":" + kind, node(body, ...P(nx, ny), label, kind, o)));
      if (i === 0) {
        const words = ["환자", "의사", "진료", "약", "아스피린", "타이레놀"];
        words.forEach((w, k) => nd(w, nar ? 0.25 + (k % 2) * 0.5 : 0.17 + (k % 3) * 0.33, nar ? 0.15 + Math.floor(k / 2) * 0.22 : 0.25 + Math.floor(k / 3) * 0.3, w, "word"));
        add("note0", text(body, ...P(0.5, nar ? 0.86 : 0.88), "이름만 있고, 이어진 선이 하나도 없어요", { size: 14, anchor: "middle", fill: C.sub }));
      } else {
        // 분류 나무 (② ③) / 온톨로지 · 지식그래프 (④ ⑤)
        if (i <= 2) {
          const yR = 0.08, yC = nar ? 0.36 : 0.42;
          nd("사람", 0.2, yR, "사람"); nd("행위", 0.52, yR, "행위"); nd("약", 0.84, yR, "약");
          const kids = nar ? [["환자", 0.07, "사람"], ["의사", 0.31, "사람"], ["진료", 0.52, "행위"], ["아스피린", 0.73, "약"], ["타이레놀", 0.92, "약"]]
            : [["환자", 0.1, "사람"], ["의사", 0.3, "사람"], ["진료", 0.52, "행위"], ["아스피린", 0.74, "약"], ["타이레놀", 0.93, "약"]];
          kids.forEach(([w, x, p], k) => { const y = nar && k % 2 ? yC + 0.1 : yC; nd(w, x, y, w, "cls", { weight: 600 }); add("e:" + w, edge(body, N[p], N[w], { color: C.line, head: false, width: 1.6 })); });
          if (i === 1) add("note1", text(body, ...P(0.5, nar ? 0.8 : 0.82), "선 하나 = '~의 한 종류' (상위어 → 하위어)", { size: 14, anchor: "middle", fill: C.sub }));
          if (i === 2) {
            const yS = nar ? 0.74 : 0.78;
            nd("syn1", nar ? 0.68 : 0.72, yS, nar ? "ASA\n아세틸살리실산" : "ASA · 아세틸살리실산", "syn", { size: 13 });
            add("e:syn1", edge(body, N["아스피린"], N.syn1, { color: C.c, dash: "4 3", head: false, label: "동의어", lx: nar ? 22 : 28 }));
            nd("syn2", nar ? 0.26 : 0.3, yS, nar ? "닥터\n의사 선생님" : "닥터 · 의사 선생님", "syn", { size: 13 });
            add("e:syn2", edge(body, N["의사"], N.syn2, { color: C.c, dash: "4 3", head: false, label: "동의어", lx: nar ? 22 : 28 }));
            add("e:rt", edge(body, N["진료"], N["약"], { color: C.a, dash: "2 4", head: false, bend: 26, label: "관련어", width: 2 }));
          }
        } else {
          const cy = i === 3 ? 0.12 : 0.08, ghost = i === 4 ? "ghost" : "cls";
          nd("의사", 0.12, cy, "의사", ghost); nd("진료", 0.5, cy, "진료", ghost); nd("환자", 0.88, cy, "환자", ghost);
          if (i === 3) {
            nd("약", 0.5, 0.52, "약"); nd("아스피린", nar ? 0.84 : 0.82, 0.52, "아스피린"); nd("타이레놀", nar ? 0.16 : 0.18, 0.52, "타이레놀");
            add("r1", edge(body, N["의사"], N["진료"], { color: C.a, label: "수행한다", width: 2.2, ly: -11 }));
            add("r2", edge(body, N["진료"], N["환자"], { color: C.a, label: "대상", width: 2.2, ly: -11 }));
            add("r3", edge(body, N["진료"], N["약"], { color: C.a, label: "처방", width: 2.2, lx: 24 }));
            add("s1", edge(body, N["아스피린"], N["약"], { color: C.ink, label: nar ? "하위" : "하위 클래스", width: 1.6, ly: -11 }));
            add("s2", edge(body, N["타이레놀"], N["약"], { color: C.ink, label: nar ? "하위" : "하위 클래스", width: 1.6, ly: -11 }));
            const [rx0, ry0] = P(0.03, nar ? 0.76 : 0.8), rh = nar ? 76 : 40, rg = g(body);
            rect(rg, rx0, ry0, bw * 0.94, rh, { r: 6, fill: C.bSoft, stroke: C.b, sw: 1.2 });
            const rl = nar ? ["처방하는 사람은 의사여야 해요", "진료의 대상은 환자 한 명이에요"] : ["처방하는 사람은 의사여야 해요 · 진료의 대상은 환자 한 명이에요"];
            text(rg, rx0 + 12, ry0 + (nar ? 18 : rh / 2), "규칙", { size: 13, weight: 700, fill: C.b });
            rl.forEach((l, k) => text(rg, rx0 + (nar ? 12 : 56), ry0 + (nar ? 40 + 22 * k : rh / 2), l, { size: 13, weight: 600, fill: C.ink }));
            add("rules", rg);
          } else {
            nd("아스피린c", 0.85, 0.88, "아스피린", "ghost");
            const iy = 0.5;
            nd("김의사", 0.12, iy, "김의사", "inst"); nd("진료1024", 0.5, iy, "진료 #1024", "inst"); nd("홍길동", 0.88, iy, "홍길동", "inst");
            nd("약1", nar ? 0.38 : 0.45, 0.88, "아스피린정\n100mg", "inst", { size: 13 });
            add("t1", edge(body, N["김의사"], N["의사"], { color: C.mute, dash: "3 3", label: "종류", lx: 18 }));
            add("t2", edge(body, N["진료1024"], N["진료"], { color: C.mute, dash: "3 3", label: "종류", lx: 18 }));
            add("t3", edge(body, N["홍길동"], N["환자"], { color: C.mute, dash: "3 3", label: "종류", lx: -18 }));
            add("t4", edge(body, N["약1"], N["아스피린c"], { color: C.mute, dash: "3 3", label: "종류", ly: -11 }));
            add("i1", edge(body, N["김의사"], N["진료1024"], { color: C.a, label: "수행한다", width: 2.2, ly: -11 }));
            add("i2", edge(body, N["진료1024"], N["홍길동"], { color: C.a, label: "대상", width: 2.2, ly: -11 }));
            add("i3", edge(body, N["진료1024"], N["약1"], { color: C.a, label: "처방", width: 2.2, lx: nar ? -22 : 24 }));
          }
        }
      }
      return items;
    }
    const READ = [
      `<div>낱말 6개 · 관계 0개 — <span class="dim">검색은 글자가 똑같을 때만 돼요</span></div>`,
      `<div><span class="a">더한 것</span>: 위·아래 (상위어 → 하위어) · <span class="dim">"약을 다 보여 줘" → 아스피린 · 타이레놀</span></div>`,
      `<div><span class="c">동의어</span>(같은 뜻) · <span class="a">관련어</span>(관련 있음, 방향 없음) — <span class="dim">사람이 읽기엔 좋지만 '무슨 관계'인지는 아직 이름이 없어요</span></div>`,
      `<div><span class="a">관계에 이름 · 방향</span>(수행한다 · 대상 · 처방) + <span class="b">규칙</span> → 컴퓨터가 검사하고 추론할 수 있어요</div>`,
      `<div><span class="a">파란 동그라미 = 실제 사례</span> · 회색 점선 = '무슨 종류인지' — <span class="dim">온톨로지(틀) + 사례(데이터) = 지식그래프</span></div>`,
    ];
    return {
      go(i, animate) { paintRungs(i); ro.set(READ[i]); return fade(draw(i), animate); },
    };
  },
};
