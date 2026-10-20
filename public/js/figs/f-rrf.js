// 그림: 두 줄을 한 줄로 — 그냥 더하기 vs RRF (Vector & Graph 04 — 카드 7 · 8 · 9) · opts.mode = "alpha" 면 가중 합 α (카드 10)
//   왼쪽 위 = 키워드(BM25) 순위, 왼쪽 아래 = 벡터(cosine) 순위, 오른쪽 = 합친 순위. 노트 칩이 두 목록에서 합친 목록으로 날아가요.
//   카드의 숫자: BM25 [A 12.0, C 8.0, D 4.0] · cosine [B 0.82, E 0.80, A 0.78] (카드 9 코드의 두 목록과 같은 순서) — 4 · 5위는 그림용으로 덧붙였어요.
//   RRF 점수 = Σ 1/(k + 순위), k 다이얼(기본 60). α 모드: A(벡터 0.9, 키워드 0.2) · B(0.4, 1.0) 는 카드 10 의 예, C · D 는 그림용.
import { svg, el, g, text, rect, line, slider, readout, anim, C, fmt } from "./kit.js";

const W = 600, H = 440, WN = 360, HN = 530; // 넓은 칸 · 좁은 칸(폰) 판 크기
const KW = [["A", 12.0], ["C", 8.0], ["D", 4.0], ["F", 3.1], ["G", 2.5]];
const VEC = [["B", 0.82], ["E", 0.8], ["A", 0.78], ["F", 0.77], ["H", 0.75]];
const AL = { A: [0.9, 0.2], B: [0.4, 1.0], C: [0.7, 0.5], D: [0.2, 0.7] }; // α 모드: [벡터, 키워드] (0~1)
const f4 = (x) => x.toFixed(4), f2 = (x) => fmt(x, 2);
const s1 = (x) => x.toFixed(x >= 1 ? 1 : 2); // 12.0 · 0.82 처럼 카드와 같은 자릿수

// 합치기: 노트마다 { id, total, parts:[{ list: 0|1, txt, val }] } → 큰 순 (같으면 같은 등수)
function fuse(method, p) {
  const ids = method === "alpha" ? Object.keys(AL) : [...new Set([...KW, ...VEC].map((r) => r[0]))];
  const rows = ids.map((id) => {
    const parts = [];
    if (method === "alpha") { const [d, k] = AL[id]; parts.push({ list: 1, val: p * d, txt: `${f2(p)}×${s1(d)}` }, { list: 0, val: (1 - p) * k, txt: `${f2(1 - p)}×${s1(k)}` }); }
    else [KW, VEC].forEach((L, li) => { const r = L.findIndex((x) => x[0] === id); if (r < 0) return; parts.push(method === "rrf" ? { list: li, val: 1 / (p + r + 1), txt: `1/${p + r + 1}` } : { list: li, val: L[r][1], txt: s1(L[r][1]) }); });
    return { id, parts, total: parts.reduce((a, b) => a + b.val, 0) };
  });
  rows.sort((a, b) => b.total - a.total || a.id.localeCompare(b.id));
  rows.forEach((r) => (r.rank = 1 + rows.filter((o) => o.total > r.total + 1e-12).length));
  return rows;
}
const rankOf = (rows, id) => rows.find((r) => r.id === id).rank;

function stepsFor(mode) {
  if (mode === "alpha") {
    const a5 = fuse("alpha", 0.5), a8 = fuse("alpha", 0.8), v = (rows, id) => rows.find((r) => r.id === id).total.toFixed(2); // 카드처럼 0.70
    return [
      { cap: "가중 합은 두 점수를 먼저 0 ~ 1 로 맞춘(정규화) 뒤 섞어요: α × 벡터 + (1 − α) × 키워드.", lists: 1 },
      { cap: `α = 0.5 면 A = ${v(a5, "A")}, B = ${v(a5, "B")} 이라서 B 가 이겨요. 막대의 파란 몫이 벡터, 주황 몫이 키워드예요.`, lists: 1, fused: "alpha", p: 0.5 },
      { cap: `α = 0.8 로 올리면 A = ${v(a8, "A")}, B = ${v(a8, "B")} 로 뒤집혀요. 벡터 점수의 몫이 커졌기 때문이에요.`, lists: 1, fused: "alpha", p: 0.8 },
      { cap: "α = 1 이면 순수 벡터 검색, 0 이면 순수 키워드 검색이에요(Weaviate 의 alpha). 이제 직접 α 를 바꿔 보세요.", lists: 1, fused: "alpha", p: "user", free: 1 },
    ];
  }
  const raw = fuse("raw"), rrf = fuse("rrf", 60);
  return [
    { cap: "같은 질문으로 키워드 검색(BM25, 주황)과 벡터 검색(cosine, 파랑)을 따로 해서 두 줄을 받아요. 이 둘을 한 줄로 합치는 규칙이 핵심이에요.", lists: 1 },
    { cap: "그런데 두 점수는 단위가 달라요. 같은 자로 재면 BM25 는 12.0 · 8.0 처럼 길고, cosine 은 0.75 ~ 0.82 에 몰려 거의 안 보여요.", lists: 1, bars: 1 },
    { cap: `그냥 더하면 BM25 가 다 이겨요. A = 12.0 + 0.78 = 12.78 이고, 벡터 1위 B 는 0.82 라서 ${rankOf(raw, "B")}등으로 밀려요.`, lists: 1, bars: 1, fused: "raw" },
    { cap: `RRF 는 점수를 버리고 순위만 써요. 목록마다 1/(60 + 순위)를 주고 노트별로 더해서, A = 1/61 + 1/63 ≈ ${f4(rrf[0].total)} 이 1등이에요.`, lists: 1, contrib: 1, fused: "rrf", p: 60 },
    { cap: `이제 직접 k 를 바꿔 보세요. k 가 작으면 1위 몫이 훨씬 커져서, 벡터 1위 B 가 양쪽 4위 F 를 앞질러요.`, lists: 1, contrib: 1, fused: "rrf", p: "user", free: 1 },
  ];
}

export default {
  aspect: H / W,
  aspectNarrow: HN / WN, // 좁은 칸: 두 목록을 위에 나란히, 합친 순위는 아래에
  steps: (o) => stepsFor(o.mode).map((s) => s.cap),
  hint: "아래 다이얼을 움직여 보세요",
  mount(stage, f) {
    const mode = f.opts.mode === "alpha" ? "alpha" : "rrf", STEPS = stepsFor(mode), LAST = STEPS.length - 1, AM = mode === "alpha";
    // 판 배치: 넓으면 왼쪽 두 목록 · 오른쪽 합친 순위, 좁으면(폰) 위에 두 목록 나란히 · 아래 합친 순위 — 글씨가 커져요
    const NAR = !!f.narrow;
    const Lo = NAR
      ? { W: WN, H: HN, list: [{ x: 4, y0: 46, ty: 18 }, { x: 184, y0: 46, ty: 18 }], RH: AM ? 40 : 32, rank: 8, chip: 18, chipW: 32, score: 56, bar: 92, contrib: 172, barK: AM ? 72 : 6.5,
        note: [96, 204], FX: 4, FY: AM ? 236 : 254, FH: AM ? 60 : 36, fTitleY: AM ? 206 : 228, fRank: 8, fChip: 18, exprX: 62, aBarK: 200, title: 15 }
      : { W, H, list: [{ x: 14, y0: 46, ty: 20 }, { x: 14, y0: AM ? 222 : 254, ty: (AM ? 222 : 254) - 26 }], RH: 34, rank: 10, chip: 26, chipW: 36, score: 72, bar: 120, contrib: 248, barK: AM ? 100 : 10,
        note: [134, 254 + 5 * 34 - 6], FX: 300, FY: 46, FH: AM ? 50 : 44, fTitleY: 20, fRank: 10, fChip: 24, exprX: 70, aBarK: 150, title: 16 };
    const s = svg(stage, Lo.W, Lo.H, AM ? "정규화한 두 점수를 α 로 섞어 순위를 정하는 그림" : "키워드 순위와 벡터 순위를 그냥 더하기와 RRF 로 합치는 그림");
    const LCOL = [C.b, C.a]; // 0 = 키워드(주황) · 1 = 벡터(파랑)
    // 왼쪽: 두 목록
    const lists = AM
      ? [{ name: NAR ? "키워드 (0~1)" : "키워드", sub: "0 ~ 1 로 맞춘 점수", rows: Object.entries(AL).sort((a, b) => b[1][1] - a[1][1]).map(([id, v]) => [id, v[1]]) },
        { name: NAR ? "벡터 (0~1)" : "벡터", sub: "0 ~ 1 로 맞춘 점수", rows: Object.entries(AL).sort((a, b) => b[1][0] - a[1][0]).map(([id, v]) => [id, v[0]]) }]
      : [{ name: "키워드 · BM25", sub: "순위 · 점수", rows: KW }, { name: "벡터 · cosine", sub: "순위 · 점수", rows: VEC }];
    const RH = Lo.RH, CW = Lo.chipW;
    const chip = (parent, x, y, id, o = {}) => { const G = g(parent); rect(G, x, y - 13, CW, 26, { r: 6, fill: o.fill || C.soft, stroke: o.stroke || C.line, sw: 1.4 }); text(G, x + CW / 2, y + 0.5, id, { size: 16, weight: 700, anchor: "middle", fill: C.ink }); return G; };
    const src = {}; // 노트 → 목록 안 칩 자리들 (날아가는 출발점)
    const barG = g(s), contribG = g(s);
    lists.forEach((L, li) => {
      const { x: lx, y0, ty } = Lo.list[li], col = LCOL[li];
      const t = text(s, lx, ty, L.name, { size: Lo.title, weight: 700, fill: col });
      if (!NAR) el(t, "tspan", { "font-weight": 500, fill: C.sub, dx: 8, "font-size": 14 }, L.sub);
      L.rows.forEach(([id, sc], r) => {
        const y = y0 + r * RH;
        text(s, lx + Lo.rank, y, String(r + 1), { size: 14, fill: C.mute, anchor: "middle", cls: "tab" });
        chip(s, lx + Lo.chip, y, id);
        text(s, lx + Lo.score, y, s1(sc), { size: 15, fill: C.ink, cls: "tab" });
        (src[id] = src[id] || []).push({ x: lx + Lo.chip, y, li });
        // 같은 자로 잰 막대 (넓은 칸: 1점 = 10칸) · α 모드는 0~1
        const w = sc * Lo.barK;
        el(barG, "rect", { x: lx + Lo.bar, y: y - 5, width: Math.max(1.5, w), height: 10, rx: 2, fill: col }).style.opacity = "0.75";
        if (!AM) text(contribG, lx + Lo.contrib, y, "", { size: 14, weight: 700, fill: col, anchor: "end", cls: "tab" }).dataset.k = `${li}:${r}`;
      });
    });
    if (!AM) text(barG, Lo.note[0], Lo.note[1], `같은 자로 잰 점수 (1점 = 막대 ${fmt(Lo.barK, 1)}칸)`, { size: 14, fill: C.sub });
    // 합친 순위 (넓으면 오른쪽 · 좁으면 아래)
    const FX = Lo.FX, FY = Lo.FY, FH = Lo.FH, FR = Lo.W - (NAR ? 8 : 14);
    text(s, FX, Lo.fTitleY, "합친 순위", { size: Lo.title, weight: 700, fill: C.ink });
    const methodT = text(s, FR, Lo.fTitleY, "", { size: 14, weight: 600, fill: C.sub, anchor: "end" });
    // 아직 안 합쳤을 때 자리 표시 (점선 칸)
    const nRows = AM ? Object.keys(AL).length : new Set([...KW, ...VEC].map((r) => r[0])).size, phG = g(s);
    el(phG, "rect", { x: FX, y: FY - 18, width: FR - FX, height: nRows * FH - FH + 36, rx: 8, fill: "none", stroke: C.line, "stroke-width": 1.2, "stroke-dasharray": "5 5" });
    text(phG, (FX + FR) / 2, FY - 18 + (nRows * FH - FH + 36) / 2, "여기에 한 줄로 합쳐요", { size: 14, fill: C.mute, anchor: "middle", weight: 600 });
    const fusedG = g(s), flyG = g(s);
    const ids = AM ? Object.keys(AL) : [...new Set([...KW, ...VEC].map((r) => r[0]))];
    const rowsE = {};
    ids.forEach((id) => {
      const G = g(fusedG), rankT = text(G, FX + Lo.fRank, 0, "", { size: 14, fill: C.mute, anchor: "middle", cls: "tab" });
      chip(G, FX + Lo.fChip, 0, id, { fill: C.bg, stroke: C.ink });
      const exprT = text(G, FX + Lo.exprX, 0, "", { size: 14, fill: C.sub, cls: "tab" });
      const totT = text(G, FR, 0, "", { size: 15, weight: 700, fill: C.ink, anchor: "end", cls: "tab" });
      const bA = el(G, "rect", { x: FX + Lo.exprX, y: -7, width: 0, height: 14, fill: C.a }), bK = el(G, "rect", { x: FX + Lo.exprX, y: -7, width: 0, height: 14, fill: C.b });
      rowsE[id] = { G, rankT, exprT, totT, bA, bK, y: null };
    });

    const ctl = f.controls(), ro = readout(ctl);
    let userP = AM ? 0.5 : 60, step = 0, gen = 0, shownFused = false;
    const sl = AM
      ? slider(ctl, { label: "α (벡터 비중)", min: 0, max: 1, step: 0.05, value: 0.5, fmt: (v) => fmt(v, 2) }, (v) => { userP = v; toLast(); })
      : slider(ctl, { label: "k", min: 1, max: 100, value: 60 }, (v) => { userP = v; toLast(); });
    function toLast() { if (step !== LAST) f.goto(LAST); else { gen++; render(STEPS[LAST], true); } }

    const pOf = (st) => (st.p === "user" ? userP : st.p);
    // 합친 목록의 한 줄 내용 (식 · 막대 · 합)
    function fillRow(R, method) {
      const E = rowsE[R.id];
      E.rankT.textContent = String(R.rank);
      E.exprT.replaceChildren();
      if (method === "alpha") {
        const K = Lo.aBarK;
        E.bA.setAttribute("width", R.parts[0].val * K); E.bK.setAttribute("x", FX + Lo.exprX + R.parts[0].val * K); E.bK.setAttribute("width", R.parts[1].val * K);
        E.totT.textContent = R.total.toFixed(2);
      } else {
        E.bA.setAttribute("width", 0); E.bK.setAttribute("width", 0);
        R.parts.forEach((p, k) => { if (k) el(E.exprT, "tspan", { fill: C.sub }, " + "); el(E.exprT, "tspan", { fill: LCOL[p.list], "font-weight": 700 }, p.txt); });
        E.totT.textContent = method === "rrf" ? f4(R.total) : R.total.toFixed(2);
      }
    }
    // 줄 자리 옮기기 (animate 면 부드럽게 — 순위가 바뀌는 게 보여요)
    async function place(rows, animate, my) {
      const from = {}, to = {};
      rows.forEach((R, k) => { from[R.id] = rowsE[R.id].y ?? FY + k * FH; to[R.id] = FY + k * FH; });
      const set = (t) => rows.forEach((R) => { const y = from[R.id] + (to[R.id] - from[R.id]) * t; rowsE[R.id].y = y; rowsE[R.id].G.setAttribute("transform", `translate(0,${y.toFixed(1)})`); });
      if (!animate) { set(1); return; }
      await anim(380, (t) => { if (my === gen) set(t); });
    }
    // 칩이 목록에서 합친 줄로 날아가요 (두 목록에 다 있으면 두 칩이 한 줄로 모여요)
    async function fly(rows, my) {
      flyG.replaceChildren();
      const trips = [];
      for (const R of rows) for (const sp of src[R.id] || []) trips.push({ G: chip(flyG, sp.x, sp.y, R.id, { stroke: LCOL[sp.li] }), sx: sp.x, sy: sp.y, tx: FX + Lo.fChip, ty: FY + rows.indexOf(R) * FH, d: sp.li * 0.12 + (sp.y % 170) / 1700 });
      fusedG.style.opacity = "0";
      await anim(900, (t) => {
        if (my !== gen) return;
        trips.forEach((tr) => { const u = Math.min(1, Math.max(0, (t - tr.d) / (1 - tr.d))), e = u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2; tr.G.setAttribute("transform", `translate(${(tr.tx - tr.sx) * e},${(tr.ty - tr.sy) * e})`); });
      }, (t) => t);
      if (my !== gen) return;
      fusedG.style.opacity = "1"; flyG.replaceChildren();
    }

    function render(st, animate) {
      const my = gen, method = st.fused, p = pOf(st), rows = method ? fuse(method, p) : null;
      barG.style.display = st.bars || AM ? "" : "none";
      barG.style.opacity = ""; fusedG.style.opacity = ""; flyG.replaceChildren(); // 멈춘 움직임이 남긴 것 지우기
      contribG.style.display = st.contrib ? "" : "none";
      if (st.contrib) [...contribG.children].forEach((t) => { const [li, r] = t.dataset.k.split(":").map(Number); t.textContent = `1/${p + r + 1}`; });
      fusedG.style.display = rows ? "" : "none"; phG.style.display = rows ? "none" : "";
      methodT.textContent = method === "raw" ? "그냥 더하기" : method === "rrf" ? `RRF · k = ${p}` : method === "alpha" ? `α = ${f2(p)}` : "";
      if (rows) { rows.forEach((R) => fillRow(R, method)); place(rows, animate, my); }
      const live = method === "rrf" || method === "alpha";
      sl.set(live ? p : AM ? 0.5 : 60); sl.input.disabled = !live; sl.el.style.opacity = live ? "" : "0.45"; // 다이얼은 쓰는 단계에서만
      ro.set(readoutFor(st, rows, p).map((x) => `<div>${x}</div>`).join(""));
      return rows;
    }
    function readoutFor(st, rows, p) {
      const T = (id) => rows.find((r) => r.id === id);
      if (AM) {
        if (!rows) return [`키워드 1위 <b class="b">B</b> (1.0) · 벡터 1위 <b class="a">A</b> (0.9)`, `<span class="dim">점수를 같은 범위(0 ~ 1)로 맞춰야 섞을 수 있어요</span>`];
        const A = T("A"), B = T("B");
        return [`A = ${f2(p)}×0.9 + ${f2(1 - p)}×0.2 = <b>${A.total.toFixed(2)}</b> · B = ${f2(p)}×0.4 + ${f2(1 - p)}×1.0 = <b>${B.total.toFixed(2)}</b>`, `1등 <b>${rows[0].id}</b>${rows[1].rank === 1 ? ` · ${rows[1].id} 와 같은 점수` : ""} <span class="dim">· α = 1 순수 벡터 · α = 0 순수 키워드</span>`];
      }
      if (!rows && !st.bars) return [`키워드 1위 <b class="b">A</b> (12.0) · 벡터 1위 <b class="a">B</b> (0.82)`, `<span class="dim">두 목록에 다 있는 노트: A, F</span>`];
      if (!rows) return [`BM25: 2.5 ~ 12.0 · cosine: 0.75 ~ 0.82 <span class="dim">(같은 자로 재면 cosine 막대는 1칸도 안 돼요)</span>`, `<span class="dim">BM25 점수 크기는 질문마다도 달라져요</span>`];
      if (st.fused === "raw") return [`그냥 더하기: A = 12.0 + 0.78 = <b>12.78</b> · F = 3.1 + 0.77 = <b>3.87</b> · B = <b>0.82</b>`, `<span class="dim">순서가 키워드 순서와 똑같아요 — 벡터 1위 B 는 ${T("B").rank}등</span>`];
      const A = T("A"), F = T("F"), B = T("B");
      return [`A = <b>${f4(A.total)}</b> · F = 1/${p + 4} + 1/${p + 4} = <b>${f4(F.total)}</b> · B = 1/${p + 1} = <b>${f4(B.total)}</b>`,
        `<span class="dim">${B.total > F.total ? `k = ${p}: 1위 몫이 커서 B 가 F 를 앞질러요` : B.total === F.total ? `k = ${p}: B 와 F 가 같은 점수` : `k = ${p}: 양쪽에 다 나온 F 가 B 보다 위`} · C 와 E 는 둘 다 한 목록 2위라 늘 같은 점수</span>`];
    }

    return {
      async go(i, animate) {
        const my = ++gen, st = STEPS[i], had = shownFused;
        step = i; shownFused = !!st.fused;
        if (!animate) { render(st, false); return; }
        // 값이 바뀌는 단계(α 0.5 → 0.8)는 다이얼이 움직이듯 천천히
        if (AM && st.p === 0.8 && had) {
          await anim(900, (t) => { if (my === gen) { const pp = Math.round((0.5 + 0.3 * t) * 100) / 100; const rows = fuse("alpha", pp); rows.forEach((R) => fillRow(R, "alpha")); methodT.textContent = `α = ${f2(pp)}`; place(rows, false, my); sl.set(pp); } });
          if (my === gen) render(st, false);
          return;
        }
        const rows = render(st, had);
        if (rows && (!had || (st.fused === "rrf" && STEPS[i - 1]?.fused === "raw"))) { await fly(rows, my); if (my === gen) place(rows, false, my); }
        else if (st.bars && !STEPS[i - 1]?.bars) { barG.style.opacity = "0"; await anim(450, (t) => { if (my === gen) barG.style.opacity = String(t); }); }
      },
      destroy() { gen++; },
    };
  },
};
