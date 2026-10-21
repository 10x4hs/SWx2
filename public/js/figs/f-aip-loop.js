// 그림: AIP 에이전트 한 바퀴 — 질문에서 라이트백 · 평가까지 (주황 토큰이 한 칸씩 움직여요)
//   사용자 질문 → LLM 이 도구 선택 → 온톨로지 객체 조회 → [권한 · 마킹 관문] → 함수 계산 → 액션 초안 → 사람 승인 → 라이트백 → 기록 · 평가(AIP Evals).
//   가운데는 온톨로지(객체 · 링크) — 조회는 거기서 읽고, 라이트백은 거기에 써요. 옆(좁으면 아래) 칸이 그 단계에서 실제로 오가는 것을 보여 줘요.
import { svg, g, el, text, rect, line, circle, anim, arrowHead, readout, C } from "./kit.js";

const ST = [
  ["사용자", "질문"], ["LLM", "도구 선택"], ["객체 조회", "Object Set"], ["함수", "계산"],
  ["액션", "초안"], ["사람", "승인"], ["라이트백", "객체에 쓰기"], ["기록 · 평가", "AIP Evals"],
];
const GATE_AFTER = 2; // 객체 조회 → (관문) → LLM/함수
const STEPS = [
  "정비 팀장이 물어요: '내일 첫 비행 전에 정비가 급한 항공기는?' — 질문이 에이전트에 들어가요.",
  "LLM 은 답을 지어내지 않고 쓸 도구를 골라요. 이번엔 '객체 조회' — 온톨로지에서 내일 뜨는 항공기를 찾아요.",
  "조회 결과는 LLM 에 가기 전에 권한 관문을 지나요. 이 사람이 볼 수 없는 행(마킹: 군 전용)은 걸러져서 LLM 은 아예 못 봐요.",
  "함수가 계산해요: 남은 비행시간 = 한도 − 비행시간. LLM 이 숫자를 어림하지 않고 정해진 코드가 계산해요.",
  "LLM 이 액션을 '초안'으로 만들어요: 정비작업 생성 — HL7701, 사유: 38시간 남음. 아직 아무것도 바뀌지 않았어요.",
  "사람이 확인하고 승인해요. 권한 있는 사람만 누를 수 있고, 거절하면 여기서 멈춰요.",
  "승인된 액션이 온톨로지에 라이트백돼요: 정비작업 WO-412 생성 · HL7701 상태 = 정비 예정. 앱 · 대시보드에 바로 보여요.",
  "전 과정이 기록되고 AIP Evals 가 테스트 질문 세트로 채점해요. 틀린 곳을 고치면 다음 바퀴가 더 나아져요.",
];

export default {
  aspect: 430 / 680,
  aspectNarrow: 640 / 380,
  steps: STEPS,
  mount(stage, f) {
    const nar = !!f.narrow, W = nar ? 380 : 680, H = nar ? 640 : 430;
    const s = svg(stage, W, H, "AIP 에이전트가 질문에서 라이트백과 평가까지 한 바퀴 도는 고리");
    const ringG = g(s), tokG = g(s), panG = g(s), ro = readout(f.controls());
    const R = nar ? { cx: 190, cy: 182, r: 138 } : { cx: 204, cy: 214, r: 150 };
    const PAN = nar ? { x: 10, y: 372, w: 360, h: 256 } : { x: 420, y: 22, w: 250, h: 386 };
    const ang = (k) => -Math.PI / 2 + (k / ST.length) * Math.PI * 2;
    const at = (a, r = R.r) => [R.cx + Math.cos(a) * r, R.cy + Math.sin(a) * r];
    const bw = nar ? 78 : 92, bh = nar ? 40 : 44;
    // 바깥 고리 + 가운데 온톨로지 + 관문 (한 번만 그려요)
    el(ringG, "circle", { cx: R.cx, cy: R.cy, r: R.r, fill: "none", stroke: C.grid, "stroke-width": 2 });
    for (let k = 0; k < ST.length; k++) { // 방향 화살촉 (칸 사이 가운데)
      const a = (ang(k) + ang(k + 1)) / 2, [x, y] = at(a), t = a + Math.PI / 2;
      if (k === GATE_AFTER) continue;
      el(ringG, "path", { d: `M${x - Math.cos(t) * 2},${y - Math.sin(t) * 2} L${x + Math.cos(t) * 6},${y + Math.sin(t) * 6}`, stroke: C.line, "stroke-width": 2, "marker-end": arrowHead(s, C.line) });
    }
    const ow = nar ? 96 : 112, oh = nar ? 50 : 56;
    rect(ringG, R.cx - ow / 2, R.cy - oh / 2, ow, oh, { r: 10, fill: C.aSoft, stroke: C.a, sw: 1.8 });
    text(ringG, R.cx, R.cy - 9, "온톨로지", { size: nar ? 14 : 15, anchor: "middle", weight: 800, fill: C.a });
    text(ringG, R.cx, R.cy + 11, "객체 · 링크", { size: 12, anchor: "middle", weight: 600, fill: C.sub });
    const spoke = (k, color, label) => { const a0 = ang(k), [x, y] = at(a0, R.r - Math.abs(Math.cos(a0)) * bw / 2 - Math.abs(Math.sin(a0)) * bh / 2 - 4); const gg = g(ringG); el(gg, "line", { x1: x, y1: y, x2: R.cx + (x - R.cx) * 0.38, y2: R.cy + (y - R.cy) * 0.38, stroke: color, "stroke-width": 1.6, "stroke-dasharray": "4 3" }); return gg; };
    const spokeRead = spoke(2, C.a), spokeWrite = spoke(6, C.b);
    const ga = (ang(GATE_AFTER) + ang(GATE_AFTER + 1)) / 2, [gx, gy] = at(ga);
    const gate = g(ringG);
    rect(gate, gx - 30, gy - 15, 60, 30, { r: 4, fill: C.bg, stroke: C.ink, sw: 2 });
    text(gate, gx, gy, "권한 관문", { size: 11.5, anchor: "middle", weight: 800 });
    // 칸 8개
    const boxes = ST.map(([a, b], k) => {
      const [x, y] = at(ang(k)), gg = g(ringG);
      const r0 = rect(gg, x - bw / 2, y - bh / 2, bw, bh, { r: 8, fill: C.bg, stroke: C.line, sw: 1.6 });
      text(gg, x, y - 8, a, { size: nar ? 12.5 : 13.5, anchor: "middle", weight: 800 });
      text(gg, x, y + 10, b, { size: nar ? 10.5 : 11.5, anchor: "middle", weight: 600, fill: C.sub });
      return { r0, x, y };
    });
    const tok = circle(tokG, ...at(ang(0)), 9, { fill: C.b, stroke: C.bg, sw: 2.5 });
    let tokA = ang(0);
    const putTok = (a) => { const [x, y] = at(a); tok.setAttribute("cx", x); tok.setAttribute("cy", y - bh / 2 - 7); tokA = a; };
    putTok(ang(0));

    // 옆 칸 내용
    function panel(i) {
      panG.replaceChildren();
      const { x, y, w, h } = PAN, P = (dx, dy) => [x + dx, y + dy];
      rect(panG, x, y, w, h, { r: 8, fill: C.soft, stroke: C.grid, sw: 1 });
      text(panG, ...P(12, 18), `${i + 1}. ${ST[i][0]} — ${ST[i][1]}`, { size: 13, weight: 800, fill: C.sub });
      const T = (dx, dy, t, o = {}) => text(panG, ...P(dx, dy), t, { size: 13, weight: 600, ...o });
      const chip = (dx, dy, cw, t, o = {}) => { rect(panG, ...P(dx, dy - 13), cw, 26, { r: 5, fill: o.fill || C.bg, stroke: o.stroke || C.line, sw: o.sw || 1.2 }); text(panG, ...P(dx + 10, dy), t, { size: 12.5, weight: o.weight || 600, fill: o.color || C.ink }); };
      if (i === 0) {
        rect(panG, ...P(12, 40), w - 24, 66, { r: 12, fill: C.bg, stroke: C.line, sw: 1.2 });
        T(24, 62, "내일 첫 비행 전에"); T(24, 86, "정비가 급한 항공기는?");
        T(12, 134, "— 정비 팀장 (권한: 정비 부서)", { size: 12, fill: C.sub });
      } else if (i === 1) {
        T(12, 48, "도구 목록", { fill: C.sub, size: 12 });
        chip(12, 76, w - 24, "✓ 객체 조회 — 항공기 찾기", { fill: C.aSoft, stroke: C.a, weight: 800, color: C.a });
        chip(12, 110, w - 24, "함수 실행 — 남은 비행시간"); chip(12, 144, w - 24, "액션 제안 — 정비작업 생성");
        T(12, 184, "답을 지어내는 대신", { size: 12.5, fill: C.sub }); T(12, 204, "도구를 고르고 결과로 답해요", { size: 12.5, fill: C.sub });
      } else if (i === 2) {
        T(12, 46, "항공기 · 내일 운항 · 비행시간 큰 순", { size: 12, fill: C.sub, mono: true });
        const rows = [["HL7701", "41,962h", 0], ["HL7702", "39,588h", 0], ["HL8001", "마킹: 군 전용", 1]];
        rows.forEach(([a, b, bad], k) => { const yy = 74 + k * 32; chip(12, yy, w - 24, `${a}   ${b}`, bad ? { fill: C.bSoft, stroke: C.no, color: C.no } : {}); if (bad) text(panG, ...P(w - 22, yy), "✗ 걸러짐", { size: 12, weight: 800, fill: C.no, anchor: "end" }); else text(panG, ...P(w - 22, yy), "✓", { size: 13, weight: 800, fill: C.c, anchor: "end" }); });
        line(panG, ...P(12, 182), ...P(w - 12, 182), { color: C.ink, width: 2 });
        T(12, 202, "권한 관문 통과 → LLM 에 2행만", { weight: 800 });
        T(12, 224, "볼 수 없는 데이터는 프롬프트에도 없어요", { size: 12, fill: C.sub });
      } else if (i === 3) {
        T(12, 46, "남은 = 한도(42,000h) − 비행시간", { size: 12, fill: C.sub, mono: true });
        chip(12, 78, w - 24, "HL7701   38시간", { fill: C.bSoft, stroke: C.b, weight: 800, color: C.b }); text(panG, ...P(w - 22, 78), "급함", { size: 12, weight: 800, fill: C.b, anchor: "end" });
        chip(12, 112, w - 24, "HL7702   2,412시간");
        T(12, 152, "계산은 코드(함수)가 —", { size: 12.5, fill: C.sub }); T(12, 172, "LLM 은 결과를 읽고 설명만 해요", { size: 12.5, fill: C.sub });
      } else if (i === 4) {
        rect(panG, ...P(12, 36), w - 24, 128, { r: 6, fill: C.bg, stroke: C.b, sw: 1.6 }); panG.lastChild.setAttribute("stroke-dasharray", "5 3");
        T(24, 56, "액션: 정비작업 생성", { weight: 800, fill: C.b });
        T(24, 84, "대상  HL7701"); T(24, 108, "사유  남은 38시간"); T(24, 132, "기한  내일 06:00 전");
        chip(w - 78, 56, 56, "초안", { fill: C.bSoft, stroke: C.b, color: C.b, weight: 800 });
        T(12, 190, "아직 아무것도 바뀌지 않았어요", { size: 12.5, fill: C.sub });
      } else if (i === 5) {
        T(12, 48, "정비 팀장이 초안을 확인해요", { size: 12.5, fill: C.sub });
        chip(12, 84, (w - 36) / 2, "  ✓ 승인", { fill: C.c, stroke: C.c, color: C.bg, weight: 800 });
        chip(24 + (w - 36) / 2, 84, (w - 36) / 2, "  거절", {});
        T(12, 128, "규칙: 정비 팀장 이상만 승인", { size: 12.5, weight: 700, fill: C.b });
        T(12, 152, "사람이 마지막 결정을 해요", { size: 12.5, fill: C.sub });
      } else if (i === 6) {
        T(12, 48, "온톨로지에 쓰기", { size: 12, fill: C.sub });
        chip(12, 80, w - 24, "+ 정비작업 WO-412 (예정)", { fill: C.aSoft, stroke: C.a, weight: 700 });
        chip(12, 114, w - 24, "HL7701 상태 = 정비 예정", { fill: C.aSoft, stroke: C.a, weight: 700 });
        T(12, 154, "누가 · 언제 · 무엇을 — 기록 남음", { size: 12.5, fill: C.sub });
        T(12, 176, "대시보드 · 앱에 바로 보여요", { size: 12.5, fill: C.sub });
      } else {
        T(12, 48, "기록: 질문 → 도구 → 결과 → 승인", { size: 12, fill: C.sub, mono: true });
        T(12, 82, "평가 세트 20문항", { weight: 700 });
        rect(panG, ...P(12, 96), w - 24, 14, { r: 7, fill: C.bg, stroke: C.line, sw: 1 });
        rect(panG, ...P(12, 96), (w - 24) * 0.95, 14, { r: 7, fill: C.c });
        T(12, 128, "19 / 20 통과 · 1개는 프롬프트 수정", { size: 12.5, weight: 700, fill: C.c });
        T(12, 156, "→ 다음 바퀴에 반영", { size: 12.5, fill: C.sub });
      }
    }
    function paint(i) {
      boxes.forEach((b, k) => { b.r0.style.fill = k === i ? C.bSoft : k < i ? C.soft : C.bg; b.r0.style.stroke = k === i ? C.b : k < i ? C.sub : C.line; });
      gate.style.opacity = i >= 2 ? "1" : "0.45";
      gate.querySelector("rect").style.stroke = i === 2 ? C.no : C.ink;
      spokeRead.style.opacity = i === 2 ? "1" : "0.35"; spokeWrite.style.opacity = i === 6 ? "1" : "0.35";
      spokeRead.querySelector("line").setAttribute("stroke-width", i === 2 ? 2.6 : 1.6); spokeWrite.querySelector("line").setAttribute("stroke-width", i === 6 ? 2.6 : 1.6);
    }
    const READ = [
      `<div>토큰 = 지금 처리 중인 일 — <span class="dim">한 바퀴: 질문 → … → 평가</span></div>`,
      `<div><span class="a">도구 = 온톨로지 위의 기능</span> (조회 · 함수 · 액션) — <span class="dim">LLM 은 고르기만 해요</span></div>`,
      `<div><span class="b">권한 관문</span>: 조회 결과가 LLM 에 닿기 <b>전에</b> 사용자 권한 · 마킹으로 걸러요</div>`,
      `<div><span class="d">함수</span>는 같은 입력이면 같은 답 — <span class="dim">숫자는 모델이 아니라 코드가</span></div>`,
      `<div><span class="b">초안</span> = 제안일 뿐, 실행이 아니에요</div>`,
      `<div><span class="c">사람 승인</span> — <span class="dim">위험한 쓰기는 사람 손을 거쳐요</span></div>`,
      `<div><span class="a">라이트백</span>: 액션 타입의 규칙대로만 객체가 바뀌어요</div>`,
      `<div><span class="c">AIP Evals</span>: 같은 질문 세트로 매번 채점 — <span class="dim">'잘 되는 것 같다'를 숫자로</span></div>`,
    ];
    return {
      async go(i, animate) {
        paint(i); panel(i); ro.set(READ[i]);
        let to = ang(i); if (to < tokA - 0.001) { if (i === 0) to = ang(ST.length); }
        if (!animate) { putTok(ang(i)); return; }
        const from = tokA, target = to < from && i !== 0 ? to : to;
        panG.style.opacity = "0";
        await anim(Math.min(900, 250 + Math.abs(target - from) * 260), (t) => putTok(from + (target - from) * t));
        putTok(ang(i));
        await anim(300, (t) => (panG.style.opacity = String(t))); panG.style.opacity = "";
      },
    };
  },
};
