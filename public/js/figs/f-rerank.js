// 그림: 재순위 — bi-encoder 와 cross-encoder · 넓게 뽑고 좁게 고르기 (Vector & Graph 04 — 카드 13 ~ 14)
//   opts.mode = "encoders"(기본, 카드 13) | "pipeline"(카드 14). 질문 · 노트는 카드의 예("오로라 지연 원인")를 써요.
//   시간 숫자는 4장 카드 20 의 지연 예산 예(벡터 검색 30ms · BM25 20ms 와 동시 · 융합 5ms · 리랭커 후보 100개에 200ms)에서만 가져와 '예시'로 표시해요.
//   점수 막대(1단계 · cross-encoder)는 모양을 보여 주는 예시 값이에요 — 같은 씨앗이라 늘 같게 그려져요.
//   좁은 칸(폰 · 튜터)에선 380 너비 판에 다시 배치해서 글씨가 커 보여요 (f.narrow).
import { svg, g, text, line, rect, el, arrow, tween, show, slider, readout, rng, C, lerp, fix } from "./kit.js";

const QUERY = "오로라 지연 원인", D1 = "오로라 배포가 DB 락 때문에 늦어짐", D2 = "점심 메뉴 투표";
// 예시 벡터 6칸 (bi-encoder: 따로 만든 벡터를 cosine 으로)
const VQ = [0.9, 0.6, 0.1, 0, 0.3, 0.1], V1 = [0.8, 0.5, 0.2, 0.1, 0.4, 0], V2 = [0, 0.1, 0.9, 0.7, 0.1, 0.5];
const cos = (a, b) => { const d = a.reduce((s, x, i) => s + x * b[i], 0); return d / (Math.hypot(...a) * Math.hypot(...b)); };
const C1 = cos(VQ, V1), C2 = cos(VQ, V2);
// 카드 20 의 예: 1단계 = max(BM25 20, 벡터 30) + 융합 5 = 35ms · 리랭커 = 후보 100개에 200ms (후보 수에 비례)
const MS = { bm25: 20, vec: 30, fuse: 5, rerank100: 200, budget: 300 };
const STAGE1 = Math.max(MS.bm25, MS.vec) + MS.fuse, PER = MS.rerank100 / 100;
const ALL = 1e6; // 노트 100만 개
const human = (ms) => (ms < 1000 ? `${Math.round(ms)}ms` : ms < 60000 ? `${fix(ms / 1000, 1)}초` : ms < 3600000 ? `${Math.round(ms / 60000)}분` : `${fix(ms / 3600000, 1)}시간`);

// ---------- 재순위 예시 데이터: 후보 500개 (1단계 순서) ----------
const M = 500, ANS = 63; // 정답은 1단계에서 64등 (예시)
const DATA = (() => {
  const r = rng(7), s1 = [], cx = [];
  for (let k = 0; k < M; k++) s1.push(0.93 - 0.6 * Math.pow(k / (M - 1), 0.55) + (r() - 0.5) * 0.02);
  s1.sort((a, b) => b - a);
  for (let k = 0; k < M; k++) cx.push(0.06 + 0.55 * Math.pow(r(), 1.6) + 0.18 * (1 - k / M));
  cx[ANS] = 0.97; // cross-encoder 는 정답을 알아봐요 (예시)
  [4, 11, 30, 85].forEach((k, t) => (cx[k] = 0.86 - t * 0.03)); // 관련 있는 노트 몇 개도 위로
  return { s1, cx };
})();
function lists(n) {
  const B = [...Array(n).keys()], Cs = B.slice().sort((a, b) => DATA.cx[b] - DATA.cx[a]);
  return { B, C: Cs, hasAns: n > ANS, ansAfter: Cs.indexOf(ANS) };
}

const STEPS = {
  encoders: [
    { cap: "bi-encoder 는 노트를 하나씩 따로 인코더에 넣어 벡터로 만들어 둬요. 질문이 오기 전에, 100만 개 전부 미리요.", v: "bi1" },
    { cap: "질문이 오면 질문만 같은 인코더로 벡터로 만들고, 저장된 노트 벡터와 cosine 을 한 번씩 재요. 질문과 노트는 서로를 못 본 채 벡터만 비교돼요.", v: "bi2" },
    { cap: "cross-encoder 는 (질문, 노트) 쌍을 한 번에 같이 읽어요. 단어끼리 서로 보면서 '얼마나 맞나' 점수 하나를 바로 내요.", v: "cross" },
    { cap: "대신 미리 계산할 수 없어서 노트마다 모델을 돌려야 해요. 100만 개면 100만 번 — 그래서 bi-encoder 로 뽑은 후보 100개에만 써요.", v: "cost" },
  ],
  pipeline: [
    { cap: "1단계 · 넓게: 빠른 검색(BM25 + dense)으로 노트 100만 개에서 후보 100개를 뽑아요. 목표는 정답이 후보 안에 드는 것(recall)이에요. 초록 막대가 정답이에요.", n: 100, v: "s1" },
    { cap: "2단계 · 재순위: cross-encoder 가 후보 100개를 (질문, 노트) 쌍으로 하나씩 읽고 점수를 다시 매겨요. 막대 길이가 새 점수예요.", n: 100, v: "rescore" },
    { cap: "새 점수로 다시 줄을 세우면 정답이 맨 위로 올라와요.", n: 100, v: "sort" },
    { cap: "3 · 4단계: 위 10개만 남겨 화면이나 LLM 에 넘겨요. 2단계의 목표는 정답이 맨 위에 오는 것(정밀도 · nDCG)이에요.", n: 100, v: "cut" },
    { cap: "후보를 20개만 뽑으면 빠르지만 정답이 애초에 빠져요. 리랭커는 받은 후보 안에서만 순서를 바꿔서 고칠 수 없어요.", n: 20, v: "cut" },
    { cap: "이제 직접 후보 수를 바꿔 보세요. 많을수록 정답이 들어올 가능성은 커지지만, 리랭커 시간이 후보 수만큼 늘어요.", n: 100, v: "cut", free: 1 },
  ],
};
const modeOf = (o) => (STEPS[o.mode] ? o.mode : "encoders");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const WW = 600, WN = 380, HH = 400; // 넓은 판 · 좁은 판 너비, 높이는 같아요

export default {
  aspect: HH / WW,
  aspectNarrow: HH / WN,
  steps: (o) => STEPS[modeOf(o)].map((s) => s.cap),
  mount(stage, f) {
    const mode = modeOf(f.opts), steps = STEPS[mode], NW = !!f.narrow, W = NW ? WN : WW;
    const s = svg(stage, W, HH, mode === "encoders" ? "bi-encoder 와 cross-encoder 가 질문과 노트를 다루는 방식 비교" : "노트 100만 개 → 후보 100개 → 재순위 → 위 10개로 좁히는 재순위 파이프라인");
    let alive = true;
    const live = (i) => alive && f.step() === i;
    const T = (p, x, y, str, o = {}) => text(p, x, y, str, { size: o.size || 15, anchor: o.anchor || "start", weight: o.weight || 600, fill: o.fill || C.ink, cls: o.cls || "fg-t" });
    const strip = (p, x, y, vals, col, cw = 10) => { const gg = g(p); vals.forEach((v, k) => { const e = rect(gg, x + k * cw, y, cw - 1.5, 14, { r: 2, fill: col }); e.style.opacity = String(0.18 + 0.82 * v); }); return gg; };
    const ro = readout(f.controls());
    const B_ = (c, s2) => `<span class="${c}">${s2}</span>`;

    // ================= 카드 13: 두 인코더 =================
    if (mode === "encoders") {
      // 자리: 넓은 판 / 좁은 판
      const E = NW
        ? { tx: 12, nx: 12, nw: 220, nh: 30, ny: [36, 74], nfs: 14, more: [22, 122], ex: 254, ew: 50, sx: 320, sw: 56, sy: 28, sh: 84, vx: 325, cw: 7, qlab: [12, 160], qy: 172, qh: 32 }
        : { tx: 16, nx: 16, nw: 250, nh: 34, ny: [46, 90], nfs: 15, more: [28, 144], ex: 296, ew: 70, sx: 386, sw: 82, sy: 36, sh: 120, vx: 397, cw: 10, qlab: [16, 214], qy: 226, qh: 36 };
      // --- bi-encoder ---
      const bi = g(s);
      T(bi, E.tx, 22, "bi-encoder — 따로 만들고, 벡터로 비교", { fill: C.a, weight: 700 });
      E.ny.forEach((y, k) => { rect(bi, E.nx, y, E.nw, E.nh, { r: 8, fill: C.bg, stroke: C.line, sw: 1.4 }); T(bi, E.nx + (NW ? 10 : 12), y + E.nh / 2 + 1, k ? D2 : D1, { size: E.nfs, weight: 500 }); });
      T(bi, ...E.more, "… 노트 100만 개", { size: 14, weight: 600, fill: C.mute });
      const eTop = E.ny[0], eH = E.ny[1] + E.nh - E.ny[0];
      rect(bi, E.ex, eTop, E.ew, eH, { r: 8, fill: C.soft, stroke: C.ink, sw: 1.5 }); T(bi, E.ex + E.ew / 2, eTop + eH / 2 + 1, "인코더", { size: 14, anchor: "middle", weight: 700 });
      const rowY = E.ny.map((y) => y + E.nh / 2);
      rowY.forEach((y) => { arrow(bi, E.nx + E.nw + 4, y, E.ex - 4, y, { color: C.sub }); arrow(bi, E.ex + E.ew + 4, y, E.vx - 5, y, { color: C.sub }); });
      const sBox = rect(bi, E.sx, E.sy, E.sw, E.sh, { r: 8, fill: "none", stroke: C.sub, sw: 1.3 }); sBox.setAttribute("stroke-dasharray", "5 4");
      T(bi, E.sx + E.sw / 2, E.sy + E.sh + 14, "미리 저장", { size: 14, anchor: "middle", weight: 700, fill: C.sub });
      strip(bi, E.vx, rowY[0] - 7, V1, C.sub, E.cw); strip(bi, E.vx, rowY[1] - 7, V2, C.sub, E.cw);
      // 질문 줄 (질문이 올 때)
      const qrow = g(bi), qMid = E.qy + E.qh / 2;
      T(qrow, ...E.qlab, "질문이 오면", { size: 14, weight: 700, fill: C.sub });
      rect(qrow, E.nx, E.qy, E.nw, E.qh, { r: 10, fill: C.aSoft, stroke: C.a, sw: 1.6 }); T(qrow, E.nx + 12, qMid + 1, QUERY, { size: 15, weight: 700, fill: C.a });
      rect(qrow, E.ex, E.qy, E.ew, E.qh, { r: 8, fill: C.soft, stroke: C.ink, sw: 1.5 }); T(qrow, E.ex + E.ew / 2, qMid + 1, "인코더", { size: 14, anchor: "middle", weight: 700 });
      T(qrow, E.ex + E.ew / 2, E.qy + E.qh + 18, "같은 모델", { size: 14, anchor: "middle", weight: 600, fill: C.mute });
      arrow(qrow, E.nx + E.nw + 4, qMid, E.ex - 4, qMid, { color: C.a }); arrow(qrow, E.ex + E.ew + 4, qMid, E.vx - 5, qMid, { color: C.a });
      strip(qrow, E.vx, qMid - 7, VQ, C.a, E.cw);
      // cosine 비교: 넓은 판 = 곡선 + 점수 / 좁은 판 = 'q · d = cos' 두 줄
      const cmp = g(bi);
      if (!NW) {
        el(cmp, "path", { d: `M457,${qMid} C500,${qMid} 490,${rowY[0]} 461,${rowY[0]}`, fill: "none", stroke: C.a, "stroke-width": 1.6, "stroke-dasharray": "4 4" });
        el(cmp, "path", { d: `M457,${qMid} C484,${qMid} 478,${rowY[1]} 461,${rowY[1]}`, fill: "none", stroke: C.a, "stroke-width": 1.6, "stroke-dasharray": "4 4" });
        T(cmp, 500, rowY[0] + 3, `cos ${fix(C1, 2)}`, { size: 16, weight: 700, fill: C.a });
        T(cmp, 500, rowY[1] + 3, `cos ${fix(C2, 2)}`, { size: 16, weight: 700, fill: C.a });
        T(cmp, 500, 140, "곱해서 더하기", { size: 14, weight: 600, fill: C.mute });
        T(cmp, 500, 158, "한 번씩", { size: 14, weight: 600, fill: C.mute });
      } else {
        [[V1, C1, "노트 1"], [V2, C2, "노트 2"]].forEach(([v, c, n], k) => {
          const y = 262 + k * 36;
          T(cmp, 12, y, n, { size: 14, weight: 700, fill: C.sub });
          strip(cmp, 64, y - 7, VQ, C.a, 7); T(cmp, 114, y, "·", { size: 18, anchor: "middle", weight: 700 });
          strip(cmp, 122, y - 7, v, C.sub, 7); T(cmp, 176, y, "=", { size: 16, anchor: "middle", weight: 700 });
          T(cmp, 190, y + 1, `cos ${fix(c, 2)}`, { size: 16, weight: 700, fill: C.a });
        });
        T(cmp, 12, 340, "곱해서 더하기 한 번씩 — 100만 개도 빨라요", { size: 14, weight: 600, fill: C.mute });
      }

      // --- cross-encoder ---
      const cr = g(s);
      T(cr, E.tx, 22, "cross-encoder — 쌍을 같이 읽고, 점수 하나", { fill: C.b, weight: 700 });
      const QT = ["오로라", "지연", "원인"], NT = ["오로라", "배포가", "DB", "락", "때문에", "늦어짐"];
      const STRONG = [[0, 0], [1, 5], [2, 4]]; // 관계가 큰 짝 (그림은 예시)
      const box = NW ? { x: 12, y: 32, w: 356, h: 176 } : { x: 16, y: 40, w: 452, h: 196 };
      rect(cr, box.x, box.y, box.w, box.h, { r: 12, fill: C.soft, stroke: C.ink, sw: 1.6 });
      T(cr, box.x + 14, box.y + 20, "모델 한 번 = (질문, 노트) 한 쌍", { size: 14, weight: 700, fill: C.sub });
      const tfs = NW ? 14 : 15, tw = (str) => Math.max(NW ? 34 : 44, [...str].reduce((a, ch) => a + (/[ㄱ-힝]/.test(ch) ? tfs : tfs * 0.62), 0) + (NW ? 12 : 16));
      const rowOf = (words, y, gap) => { const ws = words.map(tw), total = ws.reduce((a, b) => a + b, 0) + gap * (words.length - 1); let x = box.x + (box.w - total) / 2; return words.map((w, k) => { const r = { x, w: ws[k], y }; x += ws[k] + gap; return r; }); };
      const qPos = rowOf(QT, box.y + (NW ? 36 : 44), NW ? 50 : 66), nPos = rowOf(NT, box.y + box.h - (NW ? 42 : 46), NW ? 8 : 14);
      const linksG = g(cr);
      const chip = (p, str, col, soft) => { rect(cr, p.x, p.y, p.w, 28, { r: 7, fill: soft, stroke: col, sw: 1.4 }); T(cr, p.x + p.w / 2, p.y + 14, str, { size: tfs, anchor: "middle", weight: 700, fill: col }); };
      QT.forEach((w, k) => chip(qPos[k], w, C.a, C.aSoft)); NT.forEach((w, k) => chip(nPos[k], w, C.ink, C.bg));
      for (let a = 0; a < QT.length; a++) for (let b = 0; b < NT.length; b++) {
        const strong = STRONG.some(([x, y]) => x === a && y === b);
        el(linksG, "line", { x1: qPos[a].x + qPos[a].w / 2, y1: qPos[a].y + 28, x2: nPos[b].x + nPos[b].w / 2, y2: nPos[b].y, stroke: strong ? C.b : C.line, "stroke-width": strong ? 2.6 : 1, opacity: strong ? 1 : 0.8 });
      }
      if (!NW) { // 점수 = 세로 막대 (오른쪽)
        const scoreBar = (x, y, h, val, col, lab) => { rect(cr, x, y, 30, h, { r: 3, fill: C.grid }); rect(cr, x, y + h * (1 - val), 30, h * val, { r: 3, fill: col }); T(cr, x + 15, y + h + 18, lab, { size: 14, anchor: "middle", weight: 700, fill: col }); };
        arrow(cr, 472, 138, 500, 138, { color: C.sub });
        T(cr, 512, 52, "관련도", { size: 14, weight: 700, fill: C.sub });
        scoreBar(512, 62, 150, 0.9, C.b, "큼");
        rect(cr, 16, 264, 452, 46, { r: 10, fill: C.soft, stroke: C.line, sw: 1.4 });
        T(cr, 30, 287, `(${QUERY}, ${D2})`, { size: 15, weight: 600 });
        T(cr, 452, 287, "모델 한 번 더", { size: 14, anchor: "end", weight: 700, fill: C.sub });
        arrow(cr, 472, 287, 500, 287, { color: C.sub });
        scoreBar(512, 262, 50, 0.12, C.sub, "작음");
      } else { // 점수 = 가로 막대 (아래)
        const hbar = (y, val, col, lab) => { T(cr, 12, y + 8, "관련도", { size: 14, weight: 700, fill: C.sub }); rect(cr, 76, y, 230, 16, { r: 3, fill: C.grid }); rect(cr, 76, y, 230 * val, 16, { r: 3, fill: col }); T(cr, 316, y + 8, lab, { size: 14, weight: 700, fill: col }); };
        hbar(224, 0.9, C.b, "큼");
        rect(cr, 12, 262, 356, 32, { r: 10, fill: C.soft, stroke: C.line, sw: 1.4 });
        T(cr, 24, 279, `(${QUERY}, ${D2})`, { size: 14, weight: 600 });
        T(cr, 358, 279, "모델 한 번 더", { size: 14, anchor: "end", weight: 700, fill: C.sub });
        hbar(306, 0.12, C.sub, "작음");
      }

      // --- 비용 (로그 눈금: 10ms ~ 1시간) ---
      const cost = g(s);
      T(cost, E.tx, 22, NW ? "질문 하나에 걸리는 시간 (예시: 카드 20)" : "질문 하나에 걸리는 시간 (예시: 카드 20 의 숫자)", { weight: 700, fill: C.ink });
      const AX = NW ? { x0: 12, x1: 352, lo: 1, hi: Math.log10(3.6e6), top: 54, bot: 288, lab: 306 } : { x0: 150, x1: 560, lo: 1, hi: Math.log10(3.6e6), top: 62, bot: 300, lab: 318 };
      const ax = (ms) => lerp(AX.x0, AX.x1, (Math.log10(ms) - AX.lo) / (AX.hi - AX.lo));
      for (const [ms, lab] of [[10, "10ms"], [1000, "1초"], [60000, "1분"], [3.6e6, "1시간"]]) { line(cost, ax(ms), AX.top, ax(ms), AX.bot, { color: C.grid }); T(cost, ax(ms), AX.lab, lab, { size: 14, anchor: NW && ms === 10 ? "start" : NW && ms === 3.6e6 ? "end" : "middle", weight: 600, fill: C.mute }); }
      T(cost, AX.x0, AX.lab + 22, "눈금은 몇십 배씩 커져요", { size: 14, weight: 500, fill: C.mute });
      const costRows = [
        { y: NW ? 92 : 90, name: "bi-encoder", sub: "모델 1번 + 벡터 비교", ms: MS.vec, col: C.a, ok: true },
        { y: NW ? 172 : 170, name: "cross · 100만 개", sub: "모델 100만 번", ms: ALL * PER, col: C.no, ok: false },
        { y: NW ? 252 : 250, name: "cross · 후보 100개", sub: "모델 100번", ms: 100 * PER, col: C.b, ok: true },
      ];
      const bars = costRows.map((r) => {
        if (NW) { T(cost, 12, r.y - 26, r.name, { size: 15, weight: 700, fill: r.col }); T(cost, 368, r.y - 26, r.sub, { size: 14, anchor: "end", weight: 600, fill: C.sub }); }
        else { T(cost, 16, r.y - 8, r.name, { size: 15, weight: 700, fill: r.col }); T(cost, 16, r.y + 12, r.sub, { size: 14, weight: 600, fill: C.sub }); }
        const w = Math.max(3, ax(r.ms) - AX.x0), b = rect(cost, AX.x0, r.y - 10, w, 22, { r: 4, fill: r.col });
        const lim = NW ? W - 70 : 520, inside = ax(r.ms) + 8 > lim;
        const t = T(cost, inside ? ax(r.ms) - 8 : ax(r.ms) + 8, r.y + 1, `≈ ${human(r.ms)} ${r.ok ? "✓" : "✕"}`, { size: 15, anchor: inside ? "end" : "start", weight: 700, fill: r.ok ? C.ink : C.no, cls: inside ? "fg-t" : "halo" });
        if (inside) t.style.fill = "var(--fg-bg)";
        return { b, w };
      });

      function render(i, o = {}) {
        const v = steps[i].v;
        show(bi, v === "bi1" || v === "bi2", 250); show(cr, v === "cross", 250); show(cost, v === "cost", 250);
        show(qrow, v === "bi2", 250); show(cmp, v === "bi2", 250);
        if (v === "cost") bars.forEach((b, k) => b.b.setAttribute("width", Math.max(0, b.w * (o.grow?.[k] ?? 1)))); // kit.anim 첫 프레임의 t 가 아주 작은 음수일 수 있어요
        ro.set(v === "bi1" ? `<div>노트 → 인코더 → 벡터 (따로 하나씩) · 100만 개를 <b>미리</b> 만들어 저장해요</div><div class="dim">벡터 6칸은 예시예요 (진할수록 큰 값)</div>`
          : v === "bi2" ? `<div>${B_("a", "질문 벡터")} · 노트 1 → cos <b>${fix(C1, 2)}</b> · 노트 2 → cos <b>${fix(C2, 2)}</b></div><div class="dim">질문이 올 때 모델은 질문에 한 번만 · 나머지는 곱하고 더하기라 100만 개도 빨라요</div>`
          : v === "cross" ? `<div>입력 = ${B_("a", QUERY)} + 노트 → 출력 = 관련도 하나 · 진한 ${B_("b", "주황 선")} = 관계가 큰 단어 짝 <span class="dim">(그림은 예시)</span></div><div class="dim">카드 코드: m.predict([(q, d) for d in docs]) — 첫 번째 점수가 커요</div>`
          : `<div>${B_("a", "bi-encoder")} 벡터 검색 ≈ ${human(MS.vec)} · ${B_("b", "리랭커")} 후보 100개 ≈ ${human(100 * PER)} → 1개에 ${PER}ms</div><div>그대로 100만 개면 ${PER}ms × 100만 = <b>≈ ${human(ALL * PER)}</b> ✕ → 그래서 후보 100개에만 써요</div>`);
      }
      let shown = -1;
      return {
        async go(i, animate) {
          const from = shown; shown = i;
          render(i);
          if (!animate || from !== i - 1) return;
          const v = steps[i].v;
          if (v === "bi2") { show(cmp, false, 0); await sleep(500); if (live(i)) show(cmp, true, 400); }
          if (v === "cost") { const o = { t: 0 }; await tween(o, { t: 1 }, 1200, () => render(i, { grow: [Math.min(1, o.t * 3), o.t, Math.min(1, o.t * 2)] })); }
        },
        destroy() { alive = false; },
      };
    }

    // ================= 카드 14: 넓게 → 좁게 =================
    // 자리: 막대 칸 두 개(1단계 · 재순위) · 왼쪽 점 무늬 = 노트 100만 개 · 아래 = 지연 막대
    const P = NW
      ? { COL: { top: 76, h: 222 }, FX: 12, FW: 44, BX: 104, CX: 240, BW: 84, aAB: [60, 82], aBC: [214, 234], out: { x: 334, y: 66, w: 42, h: 46 }, LX: 92, LW: 270, LY: 344 }
      : { COL: { top: 92, h: 214 }, FX: 16, FW: 80, BX: 158, CX: 368, BW: 100, aAB: [101, 128], aBC: [308, 358], out: { x: 500, y: 22, w: 90, h: 40 }, LX: 112, LW: 420, LY: 352 };
    const { COL, BX, CX, BW } = P, MID = COL.top + COL.h / 2;
    const field = g(s);
    const defs = el(s, "defs");
    const pat = el(defs, "pattern", { id: "rrDots" + Math.random().toString(36).slice(2, 7), width: 7, height: 7, patternUnits: "userSpaceOnUse" });
    el(pat, "circle", { cx: 3.5, cy: 3.5, r: 1.2, fill: C.mute });
    rect(field, P.FX, COL.top, P.FW, COL.h, { r: 8, fill: `url(#${pat.id})`, stroke: C.line, sw: 1.4 });
    el(field, "circle", { cx: P.FX + P.FW * 0.62, cy: COL.top + COL.h * 0.64, r: 5, fill: C.c, stroke: C.bg, "stroke-width": 1.5 });
    const fc = P.FX + P.FW / 2;
    if (NW) { T(field, fc, 22, "노트", { size: 15, anchor: "middle", weight: 700 }); T(field, fc, 40, "100만", { size: 15, anchor: "middle", weight: 700 }); }
    else { T(field, fc, COL.top - 30, "노트", { size: 15, anchor: "middle", weight: 700 }); T(field, fc, COL.top - 12, "100만 개", { size: 15, anchor: "middle", weight: 700 }); }
    // 칸 머리 (좁은 판은 두세 줄로)
    const hB1 = T(s, BX, NW ? 22 : COL.top - 30, "", { size: 15, weight: 700 }), hB1b = NW ? T(s, BX, 40, "", { size: 15, weight: 700 }) : null;
    T(s, BX, NW ? 58 : COL.top - 12, "BM25 + dense", { size: 14, weight: 600, fill: C.sub });
    const hC1 = T(s, CX, NW ? 22 : COL.top - 30, "2단계 · 재순위", { size: 15, weight: 700, fill: C.b }), hC2 = T(s, CX, NW ? 40 : COL.top - 12, "cross-encoder", { size: 14, weight: 600, fill: C.sub });
    arrow(s, P.aAB[0], MID, P.aAB[1], MID, { color: C.sub });
    const aBC = arrow(s, P.aBC[0], MID, P.aBC[1], MID, { color: C.sub });
    const barsB = g(s), barsC = g(s), markG = g(s);
    const out = g(s); // 4단계: 위 10개를 받는 곳
    rect(out, P.out.x, P.out.y, P.out.w, P.out.h, { r: 8, fill: C.bg, stroke: C.ink, sw: 1.5 });
    if (NW) { T(out, P.out.x + P.out.w / 2, P.out.y + 15, "화면", { size: 14, anchor: "middle", weight: 700 }); T(out, P.out.x + P.out.w / 2, P.out.y + 32, "LLM", { size: 14, anchor: "middle", weight: 700 }); }
    else T(out, P.out.x + P.out.w / 2, P.out.y + 21, "화면 · LLM", { size: 15, anchor: "middle", weight: 700 });
    // 아래: 지연 막대 (예시)
    const lat = g(s), LMAX = 1100, lx = (ms) => P.LX + (Math.min(ms, LMAX) / LMAX) * P.LW, LY = P.LY;
    T(lat, NW ? 12 : 16, LY + 9, "지연 (예시)", { size: 14, weight: 700, fill: C.sub });
    const lat1 = rect(lat, P.LX, LY, 0, 18, { r: 3, fill: C.sub }), lat2 = rect(lat, P.LX, LY, 0, 18, { r: 3, fill: C.b });
    const latT = T(lat, P.LX, LY + 36, "", { size: 14, weight: 700, cls: "fg-t tab" });
    line(lat, lx(MS.budget), LY - 6, lx(MS.budget), LY + 24, { color: C.no, width: 1.6, dash: "4 3" });
    T(lat, lx(MS.budget) + 6, LY - 8, `예산 ${MS.budget}ms`, { size: 14, weight: 700, fill: C.no });

    let N = 100, stepNow = 0;
    const dial = slider(f.controls(), { label: "후보 수", min: 10, max: 500, step: 10, value: 100, fmt: (v) => `${v}개` }, (v) => { N = v; if (stepNow !== steps.length - 1) f.goto(steps.length - 1); else draw(steps.length - 1); });
    f.controls().appendChild(ro.el); // 다이얼 아래에 계산 칸

    const yOf = (pos, n) => COL.top + (pos + 0.5) * (COL.h / n);
    const thick = (n) => Math.max(0.6, Math.min(10, (COL.h / n) * 0.72));
    // 막대 그리기: B = 1단계 순서 · C = 재순위 칸 (t: 0 = 1단계 자리, 1 = 새 자리)
    function draw(i, o = {}) {
      stepNow = i; const st = steps[i], n = st.free ? N : st.n, L = lists(n);
      if (!st.free) dial.set(n);
      const v = o.v || st.v, phase = ["s1", "rescore", "sort", "cut"].indexOf(v);
      barsB.replaceChildren(); barsC.replaceChildren(); markG.replaceChildren();
      if (NW) { hB1.textContent = "1단계"; hB1b.textContent = `후보 ${n}개`; } else hB1.textContent = `1단계 · 후보 ${n}개`;
      const th = thick(n), fillB = o.fill ?? 1;
      L.B.forEach((id, pos) => { if (pos / n > fillB) return; const isA = id === ANS; const e = rect(barsB, BX, yOf(pos, n) - (isA ? Math.max(th, 3) : th) / 2, DATA.s1[id] * BW, isA ? Math.max(th, 3) : th, { r: th > 3 ? 2 : 0, fill: isA ? C.c : C.sub }); e.style.opacity = isA ? "1" : "0.75"; });
      T(markG, BX - 8, yOf(0, n), "1", { size: 14, anchor: "end", weight: 600, fill: C.mute });
      T(markG, BX - 8, yOf(n - 1, n), String(n), { size: 14, anchor: "end", weight: 600, fill: C.mute });
      if (L.hasAns) T(markG, BX + DATA.s1[ANS] * BW + 8, yOf(ANS, n), NW ? `${ANS + 1}등` : `정답 ${ANS + 1}등`, { size: 14, weight: 700, fill: C.c, cls: "halo" });
      else T(markG, BX, COL.top + COL.h + 18, NW ? "정답은 후보 밖 ✕" : `정답(${ANS + 1}등)은 후보 밖 ✕`, { size: 14, weight: 700, fill: C.no });
      show(hC1, phase >= 1, 0); show(hC2, phase >= 1, 0); show(aBC, phase >= 1, 0); show(barsC, phase >= 1, 0);
      if (phase >= 1) {
        const t = o.t ?? (phase >= 2 ? 1 : 0), grow = o.grow ?? 1;
        L.C.forEach((id, newPos) => {
          const y = lerp(yOf(id, n), yOf(newPos, n), t), isA = id === ANS;
          const len = lerp(DATA.s1[id], DATA.cx[id], grow) * BW, cut = phase >= 3 && newPos >= 10;
          const e = rect(barsC, CX, y - (isA ? Math.max(th, 3) : th) / 2, len, isA ? Math.max(th, 3) : th, { r: th > 3 ? 2 : 0, fill: isA ? C.c : cut ? C.line : C.b });
          e.style.opacity = isA ? "1" : cut ? "0.5" : "0.85";
        });
        if (phase >= 2 && L.hasAns) {
          const ya = lerp(yOf(ANS, n), yOf(L.ansAfter, n), o.t ?? 1);
          if (NW) T(markG, CX - 6, ya, `${L.ansAfter + 1}등`, { size: 14, anchor: "end", weight: 700, fill: C.c, cls: "halo" }); // 좁은 판: 칸 왼쪽에
          else T(markG, CX + DATA.cx[ANS] * BW + 8, ya, `정답 ${L.ansAfter + 1}등`, { size: 14, weight: 700, fill: C.c, cls: "halo" });
        }
      }
      // 위 10개 자르기
      const cutOn = phase >= 3;
      show(out, cutOn, 0);
      if (cutOn) {
        const yb = COL.top + 10 * (COL.h / n);
        if (NW) {
          const bx = CX + BW + 6;
          line(markG, CX - 4, yb, bx, yb, { color: C.ink, width: 1.6, dash: "5 4" });
          el(markG, "path", { d: `M${bx - 4},${COL.top} h4 V${yb} h-4`, fill: "none", stroke: C.ink, "stroke-width": 1.6 });
          arrow(markG, bx + 2, Math.min(yb, COL.top + 14), P.out.x - 3, P.out.y + P.out.h / 2, { color: C.ink });
          T(markG, CX, yb + 15, "top-10", { size: 14, weight: 700, cls: "halo" });
        } else {
          const bx = 540;
          line(markG, CX - 6, yb, bx, yb, { color: C.ink, width: 1.6, dash: "5 4" });
          el(markG, "path", { d: `M${bx - 6},${COL.top - 2} h6 V${yb} h-6`, fill: "none", stroke: C.ink, "stroke-width": 1.6 });
          T(markG, bx + 6, Math.max(COL.top + 8, (COL.top + yb) / 2), "top-10", { size: 14, weight: 700 });
          arrow(markG, bx - 2, COL.top - 4, bx - 2, 66, { color: C.ink });
        }
        if (!L.hasAns) T(markG, CX, COL.top + COL.h + 18, NW ? "정답 없음 ✕" : "위 10개에도 정답 없음 ✕", { size: 14, weight: 700, fill: C.no });
      }
      // 지연 (예시): 1단계 35ms + 리랭커 2ms × 후보 수 (2단계부터)
      const r2 = phase >= 1 ? n * PER : 0;
      lat1.setAttribute("width", lx(STAGE1) - P.LX); lat2.setAttribute("x", lx(STAGE1)); lat2.setAttribute("width", Math.max(0, lx(STAGE1 + r2) - lx(STAGE1)));
      latT.textContent = `1단계 ${STAGE1}ms${phase >= 1 ? ` + 리랭커 ${PER}ms × ${n} = ${STAGE1 + r2}ms${STAGE1 + r2 > MS.budget ? (NW ? " ✕" : " (예산 넘음)") : ""}` : ""}`;
      // 계산 칸
      const top10 = L.C.slice(0, 10).includes(ANS);
      ro.set(`<div>후보 <b>${n}</b>개 · 정답(1단계 ${ANS + 1}등) ${L.hasAns ? `<span style="color:var(--fg-c);font-weight:700">후보 안 ✓</span>` : `<span style="color:var(--fg-no);font-weight:700">후보 밖 ✕</span>`}${phase >= 2 && L.hasAns ? ` → 재순위 뒤 <b>${L.ansAfter + 1}등</b>${top10 ? " (top-10 안)" : ""}` : ""}${STAGE1 + r2 > MS.budget ? ` · <span style="color:var(--fg-no);font-weight:700">지연 예산 ${MS.budget}ms 넘음</span>` : ""}</div>
        <div class="dim">1단계 목표 = 정답을 후보에 넣기(recall) · 2단계 목표 = 정답을 맨 위로(정밀도) · 점수 막대와 정답 순위는 예시, 시간은 카드 20 의 예</div>`);
    }

    let shown = -1;
    async function go(i, animate) {
      const from = shown; shown = i;
      if (!animate || from !== i - 1) { draw(i); return; }
      const v = steps[i].v;
      if (v === "s1") { const o = { t: 0 }; await tween(o, { t: 1 }, 900, () => draw(i, { fill: o.t })); }
      else if (v === "rescore") { const o = { t: 0 }; await tween(o, { t: 1 }, 900, () => draw(i, { grow: o.t, t: 0 })); }
      else if (v === "sort") { const o = { t: 0 }; await tween(o, { t: 1 }, 1300, () => draw(i, { t: o.t })); }
      if (alive) draw(i);
    }
    return { go, destroy() { alive = false; } };
  },
};
