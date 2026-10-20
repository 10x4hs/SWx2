// 그림: RAG — 찾아 보고 답하기 · 파이프라인 5단계 (Vector & Graph 05 — 카드 1 ~ 2)
//   위 줄 = 미리(오프라인): 1 수집 → 2 청킹 → 3 임베딩·색인 → 벡터 DB. 아래 줄 = 질문이 올 때(온라인): 4 검색 → 5 생성.
//   1단계는 검색 없이 물어서 지어내는 모습(카드 1), 마지막은 새 노트가 와도 모델은 그대로 두고 색인만 바꾸는 모습이에요.
//   질문 · 조각 · 답 글은 '메모리' 앱의 회의 노트(청킹 그림과 같은 노트)를 써요. 긴 글은 아래 계산 칸(HTML)에 보여요.
//   좁은 칸(폰 · 튜터)에선 아래 줄을 세로로 쌓아서(질문 → 프롬프트 → LLM, 답은 옆) 글씨가 커 보이게 그려요.
import { svg, g, text, line, rect, el, arrow, anim, show, readout, C, lerp } from "./kit.js";

const Q_TEXT = "지난주 회의에서 정한 출시일은?";
const NOTE = "10/14 기획 > 결정 사항";
const CHUNKS = ["출시일은 11월 3일이에요.", "근거 링크를 꼭 달아요."];
const ANSWER = "10/14 기획 회의에서 출시일을 11월 3일로 정했어요 [1]. 답에는 근거 링크를 달기로 했어요 [2].";
// 자리 — 넓은 칸 / 좁은 칸
const WIDE = {
  W: 600, H: 400, OFFLAB: [16, 18], UNSEEN: [86, 86], ONLAB: [16, 186],
  DOCS: [["노트", 46], ["PDF", 74], ["슬랙", 102]], DX: 16, DW: 56, DH: 22, NEWY: 130,
  PAGE: { x: 132, y: 52, w: 40, h: 66 }, CK: { x: 228, w: 44, h: 16, ys: [56, 78, 100] }, DB: { x: 378, y: 46, w: 84, h: 80 },
  A1: [80, 85, 126, 85], L1: [103, 66], A2: [178, 85, 222, 85], L2: [200, 66], A3: [278, 85, 372, 85], L3: [325, 66],
  Q: { x: 16, y: 206, w: 150, h: 54 }, V: { x: 232, y: 160 }, L4: [[318, 118], [352, 160]],
  P: { x: 196, y: 236, w: 160, h: 102 }, QTOP: [91, 262, 192, 275],
  LLM: { x: 420, y: 262, w: 80, h: 50 }, S5: { a: [362, 287, 416, 287], lab: [389, 250, "middle"] }, KEEP: [460, 330],
  PLAIN: [170, 241, 416, 293], A: { x: 512, y: 246, w: 82, h: 82 },
};
const NARROW = {
  W: 380, H: 500, OFFLAB: [12, 18], UNSEEN: [72, 93], ONLAB: [12, 186],
  DOCS: [["노트", 54], ["PDF", 80], ["슬랙", 106]], DX: 12, DW: 48, DH: 22, NEWY: 132,
  PAGE: { x: 98, y: 60, w: 36, h: 62 }, CK: { x: 172, w: 38, h: 15, ys: [63, 84, 105] }, DB: { x: 272, y: 52, w: 84, h: 80 },
  A1: [64, 93, 92, 93], L1: [79, 44], A2: [138, 93, 166, 93], L2: [152, 44], A3: [214, 93, 266, 93], L3: [240, 44],
  Q: { x: 12, y: 200, w: 150, h: 54 }, V: { x: 196, y: 176 }, L4: [[210, 136], [204, 156]],
  P: { x: 12, y: 286, w: 160, h: 102 }, QTOP: [60, 256, 60, 282],
  LLM: { x: 52, y: 420, w: 80, h: 50 }, S5: { a: [92, 392, 92, 416], lab: [106, 404, "start"] }, KEEP: [92, 490],
  PLAIN: [87, 256, 92, 416], A: { x: 196, y: 402, w: 160, h: 86 },
};

const STEPS = [
  { cap: "검색 없이 물으면 LLM 은 외워 둔 것(파라미터 기억)만으로 답해요. 우리 회의록은 본 적이 없어서 그럴듯하게 지어낼 수 있어요.", show: "plain" },
  { cap: "RAG 는 '찾아 보고 답하기'예요. 미리 할 일 1 · 수집: 노트 · PDF · 슬랙을 텍스트로 꺼내요. 2 · 청킹: 검색 단위로 잘라요.", show: "off12" },
  { cap: "3 · 임베딩 · 색인: 조각마다 벡터를 만들어 벡터 DB 에 넣어요. 여기까지가 미리(오프라인) 하는 일이에요.", show: "off3" },
  { cap: "질문(파란 말풍선)이 오면 4 · 검색: 질문도 같은 모델로 벡터로 바꾸고, 가까운 조각 k 개(주황, 여기선 2개)를 꺼내요.", show: "on4" },
  { cap: "5 · 생성: 질문 + 조각을 프롬프트에 넣으면 LLM 이 그걸 근거로 답해요. 어느 노트를 봤는지 [1] [2]로 보여 줄 수 있어요.", show: "on5" },
  { cap: "새 노트(초록)가 생기면 모델은 다시 학습하지 않고, 새 노트를 임베딩해 색인에만 더해요. 다음 질문부터 바로 찾을 수 있어요.", show: "new" },
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default {
  aspect: WIDE.H / WIDE.W,
  aspectNarrow: NARROW.H / NARROW.W,
  steps: () => STEPS.map((s) => s.cap),
  mount(stage, f) {
    const LY = f.narrow ? NARROW : WIDE, { W, H, DOCS, DX, DW, DH, PAGE, CK, DB, Q, V, P, LLM, A } = LY, DBC = DB.x + DB.w / 2, VN = 6, VCW = 8;
    const s = svg(stage, W, H, "RAG 파이프라인: 위는 미리 하는 수집 · 청킹 · 임베딩 · 색인, 아래는 질문이 올 때 하는 검색 · 생성");
    let alive = true;
    const live = (i) => alive && f.step() === i;
    const label = (p, x, y, str, o = {}) => text(p, x, y, str, { size: o.size || 15, anchor: o.anchor || "middle", weight: o.weight || 700, fill: o.fill || C.ink, cls: o.cls || "halo" });

    // ---------- 위 줄: 미리 ----------
    const off = g(s);
    const offLab = label(off, ...LY.OFFLAB, "미리 해 두기 · 오프라인", { anchor: "start", fill: C.sub, weight: 600, cls: "fg-t" });
    const unseen = label(off, ...LY.UNSEEN, "← 우리 회의록 · LLM 은 본 적이 없어요", { size: 14, anchor: "start", weight: 600, fill: C.mute, cls: "fg-t" });
    const docs = DOCS.map(([n, y]) => { const gg = g(off); rect(gg, DX, y, DW, DH, { r: 4, fill: C.bg, stroke: C.line, sw: 1.4 }); label(gg, DX + DW / 2, y + DH / 2 + 1, n, { size: 14, weight: 600, cls: "fg-t" }); return gg; });
    const newDoc = g(off); rect(newDoc, DX, LY.NEWY, DW, DH, { r: 4, fill: C.cSoft, stroke: C.c, sw: 1.6 }); label(newDoc, DX + DW / 2, LY.NEWY + DH / 2 + 1, "새 노트", { size: 14, weight: 700, fill: C.c, cls: "fg-t" });
    const a1 = g(off), a2 = g(off), a3 = g(off);
    arrow(a1, ...LY.A1, { color: C.sub }); label(a1, ...LY.L1, "1 · 수집");
    const page = g(off); rect(page, PAGE.x, PAGE.y, PAGE.w, PAGE.h, { r: 3, fill: C.bg, stroke: C.line, sw: 1.4 });
    for (let k = 0; k < 5; k++) line(page, PAGE.x + 7, PAGE.y + 12 + k * 10.5, PAGE.x + PAGE.w - (k === 4 ? 16 : 7), PAGE.y + 12 + k * 10.5, { color: C.mute, width: 1.4 });
    arrow(a2, ...LY.A2, { color: C.sub }); label(a2, ...LY.L2, "2 · 청킹");
    const chunks = CK.ys.map((y, k) => { const gg = g(off); rect(gg, CK.x, y, CK.w, CK.h, { r: 3, fill: C.bSoft, stroke: C.b, sw: 1.2 }); line(gg, CK.x + 6, y + CK.h / 2, CK.x + CK.w - (k === 1 ? 14 : 6), y + CK.h / 2, { color: C.b, width: 1.4 }); return gg; });
    arrow(a3, ...LY.A3, { color: C.sub }); label(a3, ...LY.L3, "3 · 임베딩·색인");
    // 벡터 DB (원기둥) + 안에 쌓인 벡터 줄
    const db = g(off);
    const rx = DB.w / 2, ry = 9;
    el(db, "path", { d: `M${DB.x},${DB.y + ry} L${DB.x},${DB.y + DB.h - ry} A${rx},${ry} 0 0 0 ${DB.x + DB.w},${DB.y + DB.h - ry} L${DB.x + DB.w},${DB.y + ry}`, fill: C.bg, stroke: C.ink, "stroke-width": 1.6 });
    el(db, "ellipse", { cx: DBC, cy: DB.y + ry, rx, ry, fill: C.soft, stroke: C.ink, "stroke-width": 1.6 });
    const rows = g(db);
    label(db, DBC, DB.y + DB.h + 18, "벡터 DB", { fill: C.ink });
    const strip = (p, x, y, col, n = VN, cw = VCW) => { const gg = g(p); for (let k = 0; k < n; k++) rect(gg, x + k * cw, y, cw - 1, 10, { r: 1, fill: col, stroke: null }); return gg; };
    const DBROWS = 6;
    // 줄 하나 = 저장된 벡터 하나 · hit = 색칠할 줄 (검색에 걸림 = 주황, 새로 넣음 = 초록)
    function drawRows(n, hit = [], col = C.b) { rows.replaceChildren(); for (let k = 0; k < Math.min(n, DBROWS); k++) { const y = DB.y + 24 + k * 8.5; const on = hit.includes(k); rect(rows, DB.x + 14, y, DB.w - 28, 5.5, { r: 2, fill: on ? col : C.mute, stroke: null }).style.opacity = on ? "1" : "0.55"; } }

    // ---------- 아래 줄: 질문이 올 때 ----------
    const on = g(s);
    label(on, ...LY.ONLAB, "질문이 올 때 · 온라인", { anchor: "start", fill: C.sub, weight: 600, cls: "fg-t" });
    const qG = g(on); rect(qG, Q.x, Q.y, Q.w, Q.h, { r: 14, fill: C.aSoft, stroke: C.a, sw: 1.6 });
    label(qG, Q.x + Q.w / 2, Q.y + 18, "지난주 회의에서", { size: 15, weight: 600, cls: "fg-t" }); label(qG, Q.x + Q.w / 2, Q.y + 37, "정한 출시일은?", { size: 15, weight: 600, cls: "fg-t" });
    // 4 · 검색: 질문 → 벡터 → DB
    const s4 = g(on);
    arrow(s4, Q.x + Q.w + 2, Q.y + 10, V.x - 6, V.y + 9, { color: C.a });
    strip(s4, V.x, V.y, C.a);
    arrow(s4, V.x + VN * VCW + 6, V.y + 2, DB.x + 8, DB.y + DB.h - 10, { color: C.a, dash: "6 5" });
    label(s4, ...LY.L4[0], "4 · 검색", { fill: C.a });
    label(s4, ...LY.L4[1], "가까운 k = 2개", { size: 14, weight: 600, fill: C.sub });
    // 프롬프트 = 질문 + 조각
    const pG = g(on);
    rect(pG, P.x, P.y, P.w, P.h, { r: 8, fill: C.bg, stroke: C.ink, sw: 1.6 });
    label(pG, P.x + 12, P.y + 16, "프롬프트", { size: 14, anchor: "start", weight: 700, fill: C.sub, cls: "fg-t" });
    const pQ = g(pG); rect(pQ, P.x + 12, P.y + 30, P.w - 24, 18, { r: 4, fill: C.aSoft, stroke: C.a, sw: 1.2 }); label(pQ, P.x + 22, P.y + 39, "질문", { size: 14, anchor: "start", weight: 700, fill: C.a, cls: "fg-t" });
    const pC = [0, 1].map((k) => { const gg = g(pG); rect(gg, P.x + 12, P.y + 54 + k * 22, P.w - 24, 18, { r: 4, fill: C.bSoft, stroke: C.b, sw: 1.2 }); label(gg, P.x + 22, P.y + 63 + k * 22, `[${k + 1}] 조각`, { size: 14, anchor: "start", weight: 700, fill: C.b, cls: "fg-t" }); return gg; });
    const qToP = arrow(on, ...LY.QTOP, { color: C.a });
    const dropLine = arrow(on, DBC + 6, DB.y + DB.h + 26, P.x + P.w - 30, P.y - 4, { color: C.b, dash: "6 5" });
    // 5 · 생성
    const s5 = g(on);
    arrow(s5, ...LY.S5.a, { color: C.sub });
    label(s5, LY.S5.lab[0], LY.S5.lab[1], "5 · 생성", { anchor: LY.S5.lab[2] });
    const llm = g(on); rect(llm, LLM.x, LLM.y, LLM.w, LLM.h, { r: 10, fill: C.soft, stroke: C.ink, sw: 1.8 }); label(llm, LLM.x + LLM.w / 2, LLM.y + LLM.h / 2 + 1, "LLM", { size: 17, cls: "fg-t" });
    const keep = g(on); label(keep, ...LY.KEEP, "그대로 (재학습 ✕)", { size: 14, weight: 700, fill: C.c });
    const plainLine = arrow(on, ...LY.PLAIN, { color: C.mute, dash: "5 5" });
    // 답
    const ans = g(on);
    const aBox = rect(ans, A.x, A.y, A.w, A.h, { r: 12, fill: C.bg, stroke: C.ink, sw: 1.6 });
    const aT1 = label(ans, A.x + A.w / 2, A.y + 26, "", { size: 15, cls: "fg-t" }), aT2 = label(ans, A.x + A.w / 2, A.y + 48, "", { size: 15, cls: "fg-t" });
    const chips = g(ans), cx0 = A.x + A.w / 2 - 28;
    [0, 1].forEach((k) => { rect(chips, cx0 + k * 30, A.y + 58, 26, 18, { r: 5, fill: C.bSoft, stroke: C.b, sw: 1.2 }); label(chips, cx0 + 13 + k * 30, A.y + 67, `[${k + 1}]`, { size: 14, weight: 700, fill: C.b, cls: "fg-t" }); });
    const noBasis = label(ans, A.x + A.w / 2, A.y + 66, "근거 없음", { size: 14, fill: C.no, cls: "fg-t" });
    const llmToA = arrow(on, LLM.x + LLM.w + 2, LLM.y + LLM.h / 2, A.x - 4, LLM.y + LLM.h / 2, { color: C.sub });
    const ro = readout(f.controls());

    // 움직이는 꾸러미 (데이터 한 덩어리가 단계를 지나가요)
    const flyG = g(s);
    function packet(kind) {
      const gg = g(flyG);
      if (kind === "doc") rect(gg, -14, -9, 28, 18, { r: 3, fill: C.bg, stroke: C.sub, sw: 1.4 });
      else if (kind === "chunk") rect(gg, -14, -6, 28, 12, { r: 3, fill: C.bSoft, stroke: C.b, sw: 1.2 });
      else if (kind === "vec") strip(gg, -20, -5, C.sub, 5);
      else if (kind === "qvec") strip(gg, -20, -5, C.a, 5);
      else if (kind === "hit") rect(gg, -16, -6, 32, 12, { r: 3, fill: C.b, stroke: null });
      else if (kind === "q") rect(gg, -16, -7, 32, 14, { r: 4, fill: C.aSoft, stroke: C.a, sw: 1.2 });
      else if (kind === "new") rect(gg, -14, -9, 28, 18, { r: 3, fill: C.cSoft, stroke: C.c, sw: 1.4 });
      return gg;
    }
    async function fly(list, ms) { // list: [kind, [x0,y0], [x1,y1]]
      const ps = list.map(([k, a, b]) => ({ e: packet(k), a, b }));
      await anim(ms, (t) => ps.forEach(({ e, a, b }) => e.setAttribute("transform", `translate(${lerp(a[0], b[0], t)},${lerp(a[1], b[1], t)})`)));
      ps.forEach(({ e }) => e.remove());
    }

    // ---------- 단계마다 보이는 것 ----------
    const SHOW = ["plain", "off12", "off3", "on4", "on5", "new"];
    function render(i) {
      const k = SHOW.indexOf(STEPS[i].show);
      const plain = k === 0;
      // 위 줄
      docs.forEach((d) => show(d, true, 0)); show(newDoc, k === 5, 250);
      show(offLab, !plain, 0); show(unseen, plain, 0); // 0단계: 노트는 있지만 LLM 은 못 봐요
      show(a1, k >= 1, 0); show(page, k >= 1, 0); show(a2, k >= 1, 0); chunks.forEach((c) => show(c, k >= 1, 0));
      show(a3, k >= 2, 0); show(db, k >= 2, 0);
      drawRows(k >= 5 ? 6 : k >= 2 ? 5 : 0, k === 3 || k === 4 ? [1, 3] : k === 5 ? [5] : [], k === 5 ? C.c : C.b);
      // 아래 줄
      show(qG, true, 0); show(s4, k >= 3, 0); show(dropLine, k >= 3, 0); show(pG, k >= 3, 0); pC.forEach((c) => show(c, k >= 3, 0)); show(pQ, k >= 4, 0); show(qToP, k >= 4, 0);
      show(s5, k >= 4, 0); show(llm, plain || k >= 4, 0); show(keep, k === 5, 250); show(plainLine, plain, 0);
      show(ans, plain || k >= 4, 0); show(llmToA, plain || k >= 4, 0);
      aT1.textContent = plain ? "12월" : "11월 3일"; aT2.textContent = plain ? "쯤일까요?" : "이에요";
      aBox.style.stroke = plain ? "var(--fg-no)" : "var(--fg-ink)";
      show(chips, !plain && k >= 4, 0); show(noBasis, plain, 0);
      ro.set(readHtml(k));
    }
    const B = (n, str) => `<span class="${n}">${str}</span>`;
    function readHtml(k) {
      if (k === 0) return `<div>${B("a", "질문")} ${Q_TEXT}</div><div>LLM(검색 없음): "출시일은 12월쯤일까요?" <span style="color:var(--fg-no);font-weight:700">근거 없음</span> <span class="dim">(예: 지어낸 답)</span></div>`;
      if (k === 1) return `<div>1 · 수집: 노트 · PDF · 슬랙 → 텍스트 <span class="dim">(표가 깨진 채 들어오면 뒤 단계가 다 무너져요)</span></div><div>2 · 청킹: 텍스트 → ${B("b", "조각")} 여러 개 <span class="dim">(검색 단위)</span></div>`;
      if (k === 2) return `<div>3 · 임베딩: ${B("b", "조각")}마다 벡터 하나 → 벡터 DB 에 넣기(색인)</div><div class="dim">1 ~ 3 은 노트를 저장할 때 미리 해 둬요</div>`;
      if (k === 3) return `<div>4 · 검색: ${B("a", "질문")}을 같은 임베딩 모델로 벡터로 → 가까운 조각 k = 2</div><div>${B("b", "[1]")} ${CHUNKS[0]} · ${B("b", "[2]")} ${CHUNKS[1]} <span class="dim">(${NOTE})</span></div>`;
      if (k === 4) return `<div>프롬프트 = 아래 조각을 근거로 답하세요 · ${B("b", "[1]")} ${CHUNKS[0]} ${B("b", "[2]")} ${CHUNKS[1]} · ${B("a", "질문")} ${Q_TEXT}</div><div>답: ${ANSWER.replace(/\[(\d)\]/g, (m) => B("b", m))}</div>`;
      return `<div>${B("c", "새 노트")} → 수집 · 청킹 · 임베딩 → 색인에 추가 · LLM 은 그대로</div><div class="dim">지식은 모델 밖 색인(비파라미터 기억)에 있어서, 색인만 바꾸면 돼요</div>`;
    }

    const mid = (o) => [o.x + o.w / 2, o.y + o.h / 2];
    let shown = -1;
    async function go(i, animate) {
      const from = shown; shown = i;
      if (!animate || from !== i - 1) { render(i); return; }
      const k = SHOW.indexOf(STEPS[i].show);
      if (k === 1) { // 수집 → 청킹
        render(i); show(page, false, 0); chunks.forEach((c) => show(c, false, 0));
        await fly(DOCS.map(([, y]) => ["doc", [DX + DW / 2, y + DH / 2], mid(PAGE)]), 800);
        if (!live(i)) return render(i);
        show(page, true, 150); await sleep(200);
        await fly(CK.ys.map((y) => ["chunk", mid(PAGE), [CK.x + CK.w / 2, y + CK.h / 2]]), 700);
      } else if (k === 2) { // 임베딩 → 색인
        render(i); drawRows(0);
        await fly(CK.ys.map((y) => ["vec", [CK.x + CK.w / 2 + 10, y + CK.h / 2], [DBC, DB.y + 40]]), 900);
        if (!live(i)) return render(i);
        for (let n = 1; n <= 5; n++) { drawRows(n); await sleep(70); }
      } else if (k === 3) { // 검색
        render(i); show(dropLine, false, 0); pC.forEach((c) => show(c, false, 0)); drawRows(5);
        await fly([["q", [Q.x + Q.w - 10, Q.y + 12], [V.x + 24, V.y + 5]]], 500);
        if (!live(i)) return render(i);
        await fly([["qvec", [V.x + 24, V.y + 5], [DB.x + 14, DB.y + DB.h - 14]]], 700);
        drawRows(5, [1, 3]); await sleep(350);
        show(dropLine, true, 200);
        await fly([0, 1].map((t) => ["hit", [DBC, DB.y + DB.h + 10], [P.x + P.w / 2, P.y + 63 + t * 22]]), 700);
      } else if (k === 4) { // 생성
        render(i); show(pQ, false, 0); show(qToP, false, 0); show(ans, false, 0); show(llmToA, false, 0); show(s5, false, 0);
        show(qToP, true, 200);
        await fly([["q", [LY.QTOP[0], LY.QTOP[1]], [P.x + 60, P.y + 39]]], 600);
        if (!live(i)) return render(i);
        show(pQ, true, 150); show(s5, true, 200); await sleep(250);
        const from5 = [LY.S5.a[0], LY.S5.a[1]], to5 = mid(LLM);
        await fly([["q", from5, to5], ["hit", [from5[0] + 6, from5[1] + 8], [to5[0] + 4, to5[1] + 8]]], 650);
        show(llmToA, true, 200); show(ans, true, 300);
      } else if (k === 5) { // 새 노트 → 색인만
        render(i); show(newDoc, true, 200); drawRows(5);
        await fly([["new", [DX + DW / 2, LY.NEWY + DH / 2], mid(PAGE)]], 650);
        if (!live(i)) return render(i);
        await fly([["chunk", mid(PAGE), [CK.x + CK.w / 2, CK.ys[1] + CK.h / 2]]], 500);
        await fly([["vec", [CK.x + CK.w / 2 + 10, CK.ys[1] + CK.h / 2], [DBC, DB.y + 60]]], 650);
        drawRows(6, [5], C.c);
      }
      if (alive) render(i);
    }
    render(0);
    return { go, destroy() { alive = false; } };
  },
};
