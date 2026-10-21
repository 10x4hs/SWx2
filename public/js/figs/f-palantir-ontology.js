// 그림: Palantir Foundry 온톨로지의 부품 — 항공사 정비 예시 (항공기 · 부품 · 정비작업)
//   데이터셋(원본 표) → 객체 타입(속성 · 기본 키) → 링크 타입 → 액션 타입(입력 칸 · 규칙 · 라이트백) → 함수.
//   마지막 단계: 의미(semantic · 명사: 객체 · 속성 · 링크) vs 동역학(kinetic · 동사: 액션 · 함수)으로 나눠 봐요.
import { svg, g, el, text, rect, line, anim, arrowHead, readout, C } from "./kit.js";

const STEPS = [
  "출발점은 흩어진 원본 표(데이터셋)예요. 열 이름은 시스템마다 제각각이고, 표끼리 무슨 사이인지는 사람 머릿속에만 있어요.",
  "객체 타입: 표 한 줄 = 현실의 물건 하나(항공기 HL7701). 속성(기종 · 비행시간)과 기본 키(꼬리번호)를 정하고, 어느 데이터셋에서 채울지 연결해요.",
  "링크 타입: 객체끼리의 관계에 이름을 붙여요. 항공기 –장착됨→ 부품(1:N), 정비작업 –대상→ 항공기(N:1). 이제 '이 항공기의 부품'을 바로 따라가요.",
  "액션 타입: 사람이 하는 일을 정해진 양식으로. 입력 칸(정비작업 · 완료 시각 · 교체 부품) + 규칙(정비사만 · 진행 중일 때만) → 제출하면 객체에 라이트백(상태 = 완료).",
  "함수: 객체를 읽어 계산하는 코드예요. '남은 비행시간 = 한도 − 비행시간'. 앱 · 액션 · AI 가 같은 함수를 불러 써요.",
  "정리: 객체 · 속성 · 링크는 '무엇이 있나'(의미 · 명사), 액션 · 함수는 '무엇을 하나'(동역학 · 동사). 둘이 합쳐져야 데이터가 결정과 실행으로 이어져요.",
];

export default {
  aspect: 430 / 680,
  aspectNarrow: 640 / 380,
  steps: STEPS,
  mount(stage, f) {
    const nar = !!f.narrow, W = nar ? 380 : 680, H = nar ? 640 : 430;
    const s = svg(stage, W, H, "데이터셋에서 객체 타입 · 링크 · 액션 · 함수로 이어지는 Palantir 온톨로지 부품");
    const bandG = g(s), wireG = g(s), boxG = g(s), ro = readout(f.controls());
    const fs = nar ? 12 : 13;
    // 자리
    const L = nar
      ? { ds: [[8, 26], [132, 26], [256, 26]], dsW: 116, ob: [[8, 136], [132, 136], [256, 136]], obW: 116,
          fn: [70, 300, 240, 62], act: [8, 392, 364, 226] }
      : { ds: [[14, 40], [14, 168], [14, 296]], dsW: 136, ob: [[214, 34], [214, 162], [214, 290]], obW: 176,
          fn: [440, 316, 226, 84], act: [440, 30, 226, 262] };
    const DS = [
      { n: "parts_raw", cols: ["pn", "nm", "ac"], rows: [["P-77", "블레이드", "7701"]] },
      { n: "aircraft_raw", cols: ["tail", "typ", "hrs"], rows: [["7701", "B737", "41,962"]] },
      { n: "mx_log", cols: ["wo", "st", "ac"], rows: [["311", "진행", "7701"]] },
    ];
    const OB = [
      { n: "부품", pk: "부품번호", props: ["이름", "장착일"] },
      { n: "항공기", pk: "꼬리번호", props: ["기종", "비행시간"] },
      { n: "정비작업", pk: "작업ID", props: ["상태", "예정일"] },
    ];
    function table(x, y, w, d) {
      const gg = g(boxG), rh = nar ? 18 : 20, cw = w / 3;
      text(gg, x, y - 9, d.n, { size: fs - 1, weight: 700, fill: C.sub, mono: true });
      rect(gg, x, y, w, rh * 2 + 4, { r: 3, fill: C.bg, stroke: C.line, sw: 1 });
      rect(gg, x, y, w, rh, { r: 3, fill: C.soft });
      d.cols.forEach((c, k) => text(gg, x + 5 + k * cw, y + rh / 2, c, { size: fs - 1.5, weight: 700, fill: C.mute, mono: true }));
      d.rows[0].forEach((v, k) => text(gg, x + 5 + k * cw, y + rh * 1.5 + 2, v, { size: fs - 1.5, fill: C.ink }));
      return { g: gg, x, y, w, h: rh * 2 + 4 };
    }
    function card(x, y, w, o) {
      const gg = g(boxG), rh = nar ? 19 : 21, h = 30 + rh * 3 + 6;
      rect(gg, x, y, w, h, { r: 8, fill: C.aSoft, stroke: C.a, sw: 1.8 });
      text(gg, x + 10, y + 16, o.n, { size: fs + 2, weight: 800, fill: C.a });
      line(gg, x + 8, y + 30, x + w - 8, y + 30, { color: C.a, width: 0.8 });
      const pkw = 22; rect(gg, x + 8, y + 32 + rh / 2 - 8, pkw, 16, { r: 3, fill: C.a });
      text(gg, x + 8 + pkw / 2, y + 32 + rh / 2, "PK", { size: 9.5, anchor: "middle", weight: 800, fill: C.bg });
      text(gg, x + 14 + pkw, y + 32 + rh / 2, o.pk, { size: fs, weight: 700 });
      o.props.forEach((p, k) => text(gg, x + 12, y + 32 + rh * (k + 1.5), p, { size: fs, weight: 500, fill: C.sub }));
      return { g: gg, x, y, w, h };
    }
    const wire = (d, color, o = {}) => el(wireG, "path", { d, fill: "none", stroke: color, "stroke-width": o.w || 1.8, "stroke-dasharray": o.dash || null, "marker-end": o.head === false ? null : arrowHead(s, color), "stroke-linecap": "round" });
    const lab = (x, y, t, color, o = {}) => text(wireG, x, y, t, { size: o.size || 12, weight: 700, fill: color, anchor: o.anchor || "middle", cls: "fg-t halo" });

    function draw(i, animate) {
      bandG.replaceChildren(); wireG.replaceChildren(); boxG.replaceChildren();
      const fresh = [];
      const before = () => ({ b: boxG.children.length, w: wireG.children.length });
      const take = (b0) => [...[...boxG.children].slice(b0.b), ...[...wireG.children].slice(b0.w)];
      const step = (k, fn) => { if (i < k) return; const b0 = before(); fn(); if (i === k) fresh.push(...take(b0)); };
      // 0 데이터셋
      const T = DS.map((d, k) => table(...L.ds[k], L.dsW, d));
      if (i === 0) {
        if (nar) text(boxG, W / 2, 112, "표끼리 무슨 사이? → 열 이름만 봐선 몰라요", { size: 12.5, anchor: "middle", weight: 600, fill: C.mute });
        else text(boxG, 214, 200, "← 흩어진 원본 표", { size: 14, weight: 600, fill: C.mute });
      }
      let O = [];
      step(1, () => {
        O = OB.map((o, k) => card(...L.ob[k], L.obW, o));
        O.forEach((o, k) => {
          const t = T[k];
          if (nar) wire(`M${t.x + t.w / 2},${t.y + t.h + 2} L${o.x + o.w / 2},${o.y - 4}`, C.mute, { dash: "3 3", w: 1.4 });
          else wire(`M${t.x + t.w + 2},${t.y + t.h / 2} L${o.x - 4},${o.y + 30}`, C.mute, { dash: "3 3", w: 1.4 });
        });
        if (!nar) lab(170, 30, "데이터셋 → 객체", C.mute, { size: 11.5 });
      });
      if (i < 1) O = [];
      step(2, () => {
        if (nar) {
          const y = O[0].y + O[0].h / 2;
          wire(`M${O[1].x - 2},${y} L${O[0].x + O[0].w + 4},${y}`, C.c, { w: 2.4 }); lab(O[0].x + O[0].w + 4, O[0].y + O[0].h + 12, "↔ 장착됨 1:N", C.c, { size: 11 });
          wire(`M${O[2].x - 2},${y} L${O[1].x + O[1].w + 4},${y}`, C.c, { w: 2.4 }); lab(O[1].x + O[1].w + 4, O[1].y + O[1].h + 12, "↔ 대상 N:1", C.c, { size: 11 });
        } else {
          const x = O[0].x + O[0].w / 2;
          wire(`M${x},${O[1].y - 2} L${x},${O[0].y + O[0].h + 4}`, C.c, { w: 2.4 }); lab(x + 8, (O[0].y + O[0].h + O[1].y) / 2, "장착됨 (1:N)", C.c, { anchor: "start" });
          wire(`M${x},${O[2].y - 2} L${x},${O[1].y + O[1].h + 4}`, C.c, { w: 2.4 }); lab(x + 8, (O[1].y + O[1].h + O[2].y) / 2, "대상 (N:1)", C.c, { anchor: "start" });
        }
      });
      step(3, () => {
        const [x, y, w, h] = L.act, gg = g(boxG);
        rect(gg, x, y, w, h, { r: 8, fill: C.bg, stroke: C.b, sw: 1.8 });
        text(gg, x + 12, y + 18, "액션: 정비작업 완료", { size: fs + 1.5, weight: 800, fill: C.b });
        const P = [["정비작업", "WO-311"], ["완료 시각", "10-21 14:00"], ["교체 부품", "P-77"]];
        const rh = nar ? 30 : 32;
        P.forEach(([k, v], j) => {
          const yy = y + 44 + j * rh;
          text(gg, x + 12, yy, k, { size: fs, weight: 600, fill: C.sub });
          rect(gg, x + (nar ? 96 : 84), yy - 11, w - (nar ? 108 : 96), 22, { r: 4, fill: C.soft, stroke: C.line, sw: 1 });
          text(gg, x + (nar ? 104 : 92), yy, v, { size: fs, weight: 600 });
        });
        const ry = y + 44 + 3 * rh;
        rect(gg, x + 10, ry - 12, w - 20, nar ? 26 : 44, { r: 4, fill: C.bSoft });
        if (nar) text(gg, x + 18, ry + 1, "규칙: 정비사만 · 상태가 '진행'일 때만", { size: fs - 0.5, weight: 600, fill: C.b });
        else { text(gg, x + 18, ry + 1, "규칙: 정비사만 제출", { size: fs - 0.5, weight: 600, fill: C.b }); text(gg, x + 18, ry + 21, "· 상태가 '진행'일 때만", { size: fs - 0.5, weight: 600, fill: C.b }); }
        const by = y + h - 30;
        rect(gg, x + w - 82, by - 2, 70, 26, { r: 5, fill: C.b });
        text(gg, x + w - 47, by + 11, "제출", { size: fs, anchor: "middle", weight: 800, fill: C.bg });
        text(gg, x + 12, by + 11, "→ 라이트백", { size: fs, weight: 700, fill: C.b });
        // 라이트백 선: 정비작업(상태 = 완료) · 부품(장착일)
        if (nar) {
          wire(`M${x + 300},${y - 2} L${O[2].x + O[2].w / 2 + 10},${O[2].y + O[2].h + 4}`, C.b, { w: 2.2 });
          lab(x + 300, y - 22 - 0, "상태 = 완료", C.b, { size: 11 });
          wire(`M${x + 50},${y - 2} L${O[0].x + O[0].w / 2},${O[0].y + O[0].h + 4}`, C.b, { w: 2.2, dash: "5 3" });
          lab(x + 46, y - 22, "장착일 갱신", C.b, { size: 11 });
        } else {
          wire(`M${x - 2},${y + h - 30} C${x - 30},${y + h} ${O[2].x + O[2].w + 40},${O[2].y + 30} ${O[2].x + O[2].w + 4},${O[2].y + 30}`, C.b, { w: 2.2 });
          lab(O[2].x + O[2].w + 26, O[2].y + 14, "상태 = 완료", C.b, { anchor: "start" });
          wire(`M${x - 2},${y + 30} L${O[0].x + O[0].w + 4},${O[0].y + 30}`, C.b, { w: 2.2, dash: "5 3" });
          lab(x + 2, y - 12, "← 장착일 갱신", C.b, { anchor: "start" });
        }
      });
      step(4, () => {
        const [x, y, w, h] = L.fn, gg = g(boxG);
        rect(gg, x, y, w, h, { r: 8, fill: C.dSoft, stroke: C.d, sw: 1.8 });
        text(gg, x + 10, y + 17, "함수: 남은 비행시간", { size: fs + 1, weight: 800, fill: C.d });
        text(gg, x + 10, y + (nar ? 40 : 42), "= 한도 − 항공기.비행시간", { size: fs - 0.5, weight: 600, fill: C.ink, mono: true });
        if (!nar) text(gg, x + 10, y + 66, "→ HL7701: 38시간 남음", { size: fs, weight: 700, fill: C.d });
        else text(gg, x + w - 10, y + 17, "→ 38시간", { size: fs, weight: 700, fill: C.d, anchor: "end" });
        if (nar) wire(`M${O[1].x + O[1].w / 2},${O[1].y + O[1].h + 2} L${O[1].x + O[1].w / 2},${y - 4}`, C.d, { w: 2 });
        else wire(`M${O[1].x + O[1].w + 2},${O[1].y + O[1].h - 14} C${O[1].x + O[1].w + 40},${O[1].y + O[1].h + 20} ${x - 40},${y + h / 2} ${x - 4},${y + h / 2}`, C.d, { w: 2 });
      });
      step(5, () => {
        const gg = g(bandG);
        if (nar) {
          rect(gg, 2, 128, W - 4, 136, { r: 10, fill: C.aSoft, stroke: "none" }); gg.lastChild.style.opacity = "0.45";
          rect(gg, 2, 286, W - 4, H - 290, { r: 10, fill: C.bSoft, stroke: "none" }); gg.lastChild.style.opacity = "0.45";
          text(gg, W - 8, 124, "의미 · 명사 — 무엇이 있나", { size: 12, weight: 800, fill: C.a, anchor: "end" });
          text(gg, W - 8, 282, "동역학 · 동사 — 무엇을 하나", { size: 12, weight: 800, fill: C.b, anchor: "end" });
        } else {
          rect(gg, 200, 8, 210, H - 16, { r: 10, fill: C.aSoft, stroke: "none" }); gg.lastChild.style.opacity = "0.45";
          rect(gg, 426, 8, 250, H - 16, { r: 10, fill: C.bSoft, stroke: "none" }); gg.lastChild.style.opacity = "0.45";
          text(gg, 305, H - 18, "의미 · 명사 — 무엇이 있나", { size: 12.5, weight: 800, fill: C.a, anchor: "middle" });
          text(gg, 551, H - 18, "동역학 · 동사 — 무엇을 하나", { size: 12.5, weight: 800, fill: C.b, anchor: "middle" });
        }
        fresh.push(gg);
      });
      if (animate && fresh.length) { fresh.forEach((e) => (e.style.opacity = "0")); return anim(450, (t) => fresh.forEach((e) => (e.style.opacity = String(t)))).then(() => fresh.forEach((e) => (e.style.opacity = ""))); }
    }
    const READ = [
      `<div>원본 표 3개 — <span class="dim">tail · ac · hrs … 같은 '항공기'를 표마다 다르게 불러요</span></div>`,
      `<div><span class="a">객체 타입</span> = 명사 하나 · <b>PK</b>(기본 키)로 한 대 한 대를 구별 · 속성은 데이터셋 열에서 채워요</div>`,
      `<div><span class="c">링크 타입</span> = 객체 사이의 이름 붙은 선 — <span class="dim">조인을 매번 짜지 않고 '따라가기'로 찾아요</span></div>`,
      `<div><span class="b">액션 타입</span> = 입력 칸 + 규칙 + 라이트백 — <span class="dim">누가 · 언제 · 무엇을 바꿨는지 기록이 남아요</span></div>`,
      `<div><span class="d">함수</span> = 객체를 읽는 계산 (TypeScript · Python) — <span class="dim">같은 계산을 앱 · 액션 · AIP 가 함께 써요</span></div>`,
      `<div><span class="a">의미(semantic)</span>: 객체 · 속성 · 링크 &nbsp;|&nbsp; <span class="b">동역학(kinetic)</span>: 액션 · 함수 — <span class="dim">'디지털 쌍둥이'를 보고 바로 움직일 수 있게</span></div>`,
    ];
    return { go(i, animate) { ro.set(READ[i]); return draw(i, animate); } };
  },
};
