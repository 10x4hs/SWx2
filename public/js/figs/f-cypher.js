// 그림: Cypher 패턴이 그래프에서 모양을 찾는 과정 (Vector & Graph 06 — 카드 9 · 10)
//   작은 속성 그래프: 사람(●) 4 · 회의(■) 2 · 노트(N12) · 프로젝트(X). 선마다 타입이 있어요 — ATTENDED(실선) · ABOUT(긴 점선) · MENTIONS(짧은 점선).
//   opts.mode = "match"(카드 9, 기본): 카드의 MATCH (a)-[:ATTENDED]->(m)<-[:ATTENDED]-(b) 를 한 조각씩 맞춰 보고, 찾은 줄(a, m, b) → WHERE → RETURN DISTINCT.
//   opts.mode = "path"(카드 10): N12 에서 *1 → *2 → *1..3 으로 고리(링)가 한 겹씩 넓어지고, 카드의 shortestPath(N12 → X) 를 찾아요. 링 · 경로는 코드에서 계산해요.
import { svg, g, text, line, circle, rect, path, arrowHead, readout, anim, set, C } from "./kit.js";

const W = 600, H = 380;
// 노드: [x, y, 종류, 라벨] — 종류 p 사람 · m 회의 · n 노트 · j 프로젝트
const NODES = {
  N12: [64, 192, "n", "Note"], 서윤: [160, 192, "p", "Person"], 회의A: [236, 112, "m", "Meeting"], 회의B: [236, 272, "m", "Meeting"],
  지호: [306, 44, "p", "Person"], X: [344, 142, "j", "Project"], 민재: [344, 242, "p", "Person"], 하린: [306, 340, "p", "Person"],
};
// 관계: [출발, 타입, 도착] (방향 있음)
const RELS = [["N12", "MENTIONS", "서윤"], ["서윤", "ATTENDED", "회의A"], ["서윤", "ATTENDED", "회의B"], ["지호", "ATTENDED", "회의A"], ["회의A", "ABOUT", "X"], ["민재", "ATTENDED", "회의A"], ["민재", "ATTENDED", "회의B"], ["하린", "ATTENDED", "회의B"]];
const DASH = { ATTENDED: null, ABOUT: "7 4", MENTIONS: "2 4" };
const RING = [C.ink, C.a, C.b, C.c];
const NONE = "var(--fg-none, transparent)"; // 칠했다 지울 때 (kit.set 은 var() 색을 style 로 넣어요)
const esc = (t) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const sleep = (ms) => anim(ms, () => {});

// 패턴 맞추기 (카드 9) — 같은 관계는 한 줄에 두 번 쓰지 않아요 (Cypher 규칙)
function matchRows() {
  const a = "민재", rows = [];
  RELS.forEach((r1, i) => {
    if (r1[0] !== a || r1[1] !== "ATTENDED" || NODES[r1[2]][2] !== "m") return;
    const m = r1[2];
    RELS.forEach((r2, j) => { if (j !== i && r2[2] === m && r2[1] === "ATTENDED" && NODES[r2[0]][2] === "p") rows.push({ a, m, b: r2[0], r1: i, r2: j }); });
  });
  return rows;
}
// 방향 없이 너비 우선: 노드마다 몇 단계에서 처음 닿았나 + 그때 지난 관계
function rings(start) {
  const dist = { [start]: 0 }, via = {}, order = [[start]];
  for (let k = 1; ; k++) {
    const next = [];
    for (const u of order[k - 1]) RELS.forEach((r, i) => {
      const v = r[0] === u ? r[2] : r[2] === u ? r[0] : null;
      if (v && dist[v] == null) { dist[v] = k; via[v] = i; next.push(v); }
    });
    if (!next.length) break;
    order.push(next);
  }
  return { dist, via, order };
}
// 같은 관계를 두 번 쓰지 않는 길(Cypher 규칙)을 길이별로 세요 — 상한 없는 * 가 돌려주는 줄 수
function trails(start) {
  const cnt = [0], used = new Set();
  (function walk(u, len) {
    RELS.forEach((r, i) => {
      const v = r[0] === u ? r[2] : r[2] === u ? r[0] : null;
      if (!v || used.has(i)) return;
      used.add(i); cnt[len + 1] = (cnt[len + 1] || 0) + 1; walk(v, len + 1); used.delete(i);
    });
  })(start, 0);
  return cnt;
}
function shortest(R, to) { const p = [to]; while (R.via[p[0]] != null) { const r = RELS[R.via[p[0]]]; p.unshift(r[0] === p[0] ? r[2] : r[0]); } return p; }

const STEPS = {
  match: [
    { cap: "작은 속성 그래프예요. 노드에는 라벨(Person · Meeting · Note · Project), 선에는 타입(ATTENDED · ABOUT · MENTIONS)과 방향이 있어요.", k: 0 },
    { cap: "괄호 () 는 노드예요. (a:Person {name:'민재'}) — 라벨이 Person 이고 이름이 민재인 노드를 찾아 a 라고 불러요(파랑).", k: 1 },
    { cap: "대괄호 [] 는 관계, 화살표는 방향이에요. 민재에서 나가는 ATTENDED 선을 따라가 회의 m 두 개를 찾아요(주황).", k: 2 },
    { cap: "<-[:ATTENDED]-(b) 는 회의로 들어오는 선을 거꾸로 따라가요(초록). 모양이 맞을 때마다 찾은 줄(a, m, b)이 하나씩 생겨요.", k: 3 },
    { cap: "WHERE 는 찾은 줄마다 조건을 봐요. a <> b 는 '민재 자신은 빼라'는 뜻 — 여기선 네 줄 모두 통과해요.", k: 4 },
    { cap: "RETURN 으로 돌려받을 것만 골라요. 서윤이 두 줄에 나와서 DISTINCT 가 하나로 줄여요 → 서윤, 지호, 하린.", k: 5 },
  ],
  path: [
    { cap: "1홉 · 직접 연결: -[*1]- 은 선 하나만큼 떨어진 곳이에요. 노트 N12 에서 한 걸음이면 서윤(파랑)이에요.", r: 1, only: 1 },
    { cap: "2홉 · 이웃의 이웃: -[*2]- 는 꼭 두 걸음이에요. 서윤을 거쳐 회의A · 회의B(주황)에 닿아요.", r: 2, only: 1 },
    { cap: "범위 · -[*1..3]- 은 1~3단계 안에 닿는 모든 곳이에요. 고리가 한 겹씩 넓어지며 닿는 곳이 늘어요(초록이 3단계).", r: 3 },
    { cap: "최단 · shortestPath 는 둘 사이 가장 짧은 길 하나예요(보라). N12 → 서윤 → 회의A → X, 3단계 — '왜 이 노트가 프로젝트 X 와 관련 있나'의 설명이 돼요.", r: 3, sp: 1 },
    { cap: "범위를 안 쓰면(*) 갈 수 있는 길을 끝까지 다 세요. 노드 8개짜리 그래프에서도 길이 여러 개로 불어나요 — 큰 그래프에선 폭발하니 상한을 꼭 둬요.", r: 3, open: 1 },
  ],
};

export default {
  aspect: H / W,
  aspectNarrow: 600 / 380, // 폰: 그래프 아래에 표 · 막대

  steps: (o) => (STEPS[o.mode] || STEPS.match).map((s) => s.cap),
  hint: "한 조각씩 넘겨 보세요",
  mount(stage, f) {
    const mode = STEPS[f.opts.mode] ? f.opts.mode : "match", steps = STEPS[mode];
    const s = svg(stage, f.narrow ? 380 : W, f.narrow ? 600 : H, mode === "path" ? "노트 N12 에서 고리처럼 넓어지는 가변 길이 경로와 최단 경로" : "Cypher MATCH 패턴이 속성 그래프에서 맞는 모양을 찾는 그림");
    const ROWS = matchRows(), R = rings("N12"), SP = shortest(R, "X"), TR = trails("N12");
    const TRN = TR.reduce((a, b) => a + b, 0), TRL = TR.length - 1;
    const mono = (e) => { e.style.fontFamily = "var(--pp-mono)"; return e; };

    // 고리 (path 모드)
    const ringG = g(s), [cx, cy] = NODES.N12;
    const ringE = [[96, 0.72], [190, 0.56], [284, 0.62]].map(([rr, a]) => path(ringG, `M${cx + rr * Math.cos(-a)},${cy + rr * Math.sin(-a)} A${rr},${rr} 0 0 1 ${cx + rr * Math.cos(a)},${cy + rr * Math.sin(a)}`, { stroke: C.line, width: 1.4, dash: "5 5" }));
    // 선
    const geo = (k) => { const [x, y, t] = NODES[k]; return { x, y, hw: t === "m" ? 30 : t === "n" ? 24 : t === "j" ? 19 : 19, hh: t === "m" ? 16 : t === "n" ? 17 : 19, round: t === "p" || t === "j" }; };
    function ends(u, v, pad = 3) {
      const A = geo(u), B = geo(v), dx = B.x - A.x, dy = B.y - A.y, L = Math.hypot(dx, dy);
      const cut = (q) => (q.round ? q.hw + pad : Math.min(q.hw / Math.abs(dx || 1e-6), q.hh / Math.abs(dy || 1e-6)) * L + pad);
      const ta = cut(A) / L, tb = cut(B) / L;
      return [A.x + dx * ta, A.y + dy * ta, B.x - dx * tb, B.y - dy * tb];
    }
    const edgeG = g(s);
    const relE = RELS.map(([u, t, v]) => {
      const [x1, y1, x2, y2] = ends(u, v);
      const l = line(edgeG, x1, y1, x2, y2, { color: C.line, width: 1.8, dash: DASH[t] });
      l.setAttribute("marker-end", arrowHead(s, C.line));
      return { l, x1, y1, x2, y2 };
    });
    function paintRel(i, color, w = 1.8) { const e = relE[i].l; set(e, { stroke: color, "stroke-width": w }); e.setAttribute("marker-end", arrowHead(s, color)); }
    // 노드 (모양으로 라벨 구분, 색은 '찾았다'를 표시할 때만)
    const nodeG = g(s), nodeE = {};
    for (const [k, [x, y, t]] of Object.entries(NODES)) {
      const gg = g(nodeG);
      const mk = (o) => t === "p" ? circle(gg, x, y, 19, o)
        : t === "m" ? rect(gg, x - 30, y - 16, 60, 32, { ...o, r: 6 })
        : t === "n" ? path(gg, `M${x - 22},${y - 17} H${x + 12} L${x + 22},${y - 7} V${y + 17} H${x - 22} Z`, { fill: o.fill, stroke: o.stroke || "none", width: o.sw || 0 })
        : path(gg, Array.from({ length: 6 }, (_, i) => { const a = Math.PI / 6 + (i * Math.PI) / 3; return `${i ? "L" : "M"}${x + 21 * Math.cos(a)},${y + 21 * Math.sin(a)}`; }).join("") + "Z", { fill: o.fill, stroke: o.stroke || "none", width: o.sw || 0 });
      mk({ fill: C.bg }); // 밑칠 (밤 모드의 반투명 색 아래)
      const shape = mk({ fill: C.bg, stroke: C.line, sw: 1.6 });
      const tt = text(gg, x, y + 0.5, k, { size: k.length > 2 ? 14 : 15, anchor: "middle", weight: 700 });
      nodeE[k] = { shape, tt, t };
    }
    function paintNode(k, color, soft) { const n = nodeE[k]; set(n.shape, n.t === "n" || n.t === "j" ? { fill: soft || C.bg, stroke: color || C.line, "stroke-width": color ? 2.6 : 1.6 } : { fill: soft || C.bg, stroke: color || C.line, "stroke-width": color ? 2.6 : 1.6 }); }
    // 범례 (선 타입)
    const lg = g(s);
    [["ATTENDED", null], ["ABOUT", "7 4"], ["MENTIONS", "2 4"]].forEach(([t, d], i) => { const y = 314 + i * 24; line(lg, 20, y, 44, y, { color: C.sub, width: 1.8, dash: d }); mono(text(lg, 52, y, t, { size: 14, fill: C.sub })); });
    const flyG = g(s);

    // 오른쪽 칸
    const side = g(s);
    // 오른쪽 칸(좁으면 그래프 아래 칸) 배치
    const Q = f.narrow ? {
      sep: [16, 378, 364, 378], title: [16, 402], tpl: { y: 402, xs: [228, 292, 356] }, tblT: [16, 438],
      cols: [44, 112, 180], ok: 218, headY: 462, headL: [16, 474, 236, 474], rowY: (i) => 494 + i * 24,
      res: { col: 1, head: [306, 462], x: 306 }, bar: { y: (k) => 436 + (k - 1) * 30, lab: 16, x: 76, unit: 20, unitOpen: 16, below: 0 },
      sp: (i) => [40 + i * 96, 440], spDir: "h", spN: [16, 478], trT: [16, 588],
    } : {
      sep: [392, 14, 392, 362], title: [404, 24], tpl: { y: 58, xs: [420, 496, 572] }, tblT: [404, 102],
      cols: [424, 488, 552], ok: 584, headY: 128, headL: [404, 140, 590, 140], rowY: (i) => 158 + i * 28,
      res: { col: 0, t: [404, 290], v: [404, 322] }, bar: { y: (k) => 60 + (k - 1) * 46, lab: 404, x: 452, unit: 28, unitOpen: 22, below: 1 },
      sp: (i) => [470, 64 + i * 56], spDir: "v", spN: [404, 300], trT: [404, 300],
    };
    line(side, ...Q.sep, { color: C.grid });
    const sideT = text(side, ...Q.title, "", { size: 15, weight: 700 });
    // match: 찾을 모양 · 찾은 줄 · 결과
    const tpl = g(side), tplN = {}, tplA = [], TY = Q.tpl.y, TX = Q.tpl.xs;
    ["a", "m", "b"].forEach((v, i) => { const x = TX[i], gg = g(tpl); circle(gg, x, TY, 14, { fill: C.bg }); const c = circle(gg, x, TY, 14, { fill: C.bg, stroke: C.line, sw: 1.8 }); const t = text(gg, x, TY + 0.5, v, { size: 16, anchor: "middle", weight: 700, fill: C.sub }); tplN[v] = { c, t }; });
    tplA.push(line(tpl, TX[0] + 16, TY, TX[1] - 18, TY, { color: C.line, width: 1.8 }), line(tpl, TX[2] - 16, TY, TX[1] + 18, TY, { color: C.line, width: 1.8 }));
    tplA.forEach((l) => l.setAttribute("marker-end", arrowHead(s, C.line)));
    const tblT = text(side, ...Q.tblT, "찾은 줄", { size: 14, fill: C.sub, weight: 600 });
    const COLX = Q.cols;
    const head = ["a", "m", "b"].map((v, i) => text(side, COLX[i], Q.headY, v, { size: 14, anchor: "middle", weight: 700, fill: C.mute }));
    const headL = line(side, ...Q.headL, { color: C.line });
    const rowE = ROWS.map((r, i) => {
      const y = Q.rowY(i);
      const gg = g(side);
      const cells = [r.a, r.m, r.b].map((v, j) => text(gg, COLX[j], y, v, { size: 14, anchor: "middle", weight: 600, fill: [C.a, C.b, C.c][j] }));
      const ok = text(gg, Q.ok, y, "✓", { size: 15, anchor: "middle", weight: 700, fill: C.ok });
      const strike = line(gg, COLX[2] - 22, y, COLX[2] + 22, y, { color: C.ink, width: 2 });
      return { gg, cells, ok, strike };
    });
    // 결과: 넓으면 RETURN 글 + 한 줄, 좁으면 표 오른쪽에 세로로
    const resT = Q.res.col ? text(side, ...Q.res.head, "돌려받음", { size: 14, weight: 700, fill: C.mute }) : mono(text(side, ...Q.res.t, "RETURN DISTINCT b.name", { size: 14, fill: C.sub }));
    const resV = Q.res.col ? null : text(side, ...Q.res.v, "", { size: 17, weight: 700, fill: C.c });
    const resCol = Q.res.col ? [0, 1, 2].map((i) => text(side, Q.res.x, Q.rowY(i), "", { size: 15, weight: 700, fill: C.c })) : [];
    const setRes = (names) => { if (resV) resV.textContent = names.join(" · "); else resCol.forEach((t, i) => (t.textContent = names[i] || "")); };
    // path: 링마다 닿은 곳 수 (막대) · 최단 경로 목록
    const B = Q.bar;
    const bars = [1, 2, 3, 4, 5].map((k) => {
      const y = B.y(k), gg = g(side);
      const lab = text(gg, B.lab, y, `${k}단계`, { size: 14, weight: 700, fill: RING[Math.min(3, k)] });
      const bar = rect(gg, B.x, y - 9, 10, 18, { r: 3, fill: RING[Math.min(3, k)] });
      const num = text(gg, B.x + 8, y, "", { size: 14, weight: 700, cls: "fg-t tab" });
      const names = text(gg, B.lab, y + 22, "", { size: 14, fill: C.sub });
      return { gg, lab, bar, num, names, y };
    });
    const spG = g(side);
    const spE = SP.map((k, i) => {
      const [x, y] = Q.sp(i), t = text(spG, x, y, k, { size: 16, anchor: "middle", weight: 700 });
      let ar = null;
      if (i < SP.length - 1) { const [x2, y2] = Q.sp(i + 1); ar = Q.spDir === "v" ? line(spG, x, y + 14, x, y + 40, { color: C.ink, width: 2 }) : line(spG, x + 26, y, x2 - 28, y2, { color: C.ink, width: 2 }); ar.setAttribute("marker-end", arrowHead(s, C.ink)); }
      return { t, ar };
    });
    const spN = text(spG, ...Q.spN, `${SP.length - 1}단계 = 가장 짧은 길`, { size: 14, fill: C.sub, weight: 600 });
    const trT = text(side, ...Q.trT, "", { size: 14, weight: 700 });

    const ro = readout(f.controls());
    const code = (html) => `<div style="font:500 13px/1.65 var(--pp-mono);white-space:pre;overflow-x:auto;padding:8px 10px;background:var(--pp-code);border-radius:6px">${html}</div>`;
    const hl = (t, cls, on) => `<span class="${cls}"${on ? ' style="background:var(--fg-hi);border-radius:3px"' : ""}>${esc(t)}</span>`;

    function readMatch(k) {
      const part = (t, i, cls) => (k >= i ? hl(t, cls, k === i) : `<span class="dim">${esc(t)}</span>`);
      const body = [
        `MATCH ${part("(a:Person {name:'민재'})", 1, "a")}`,
        `      ${part("-[:ATTENDED]->(m:Meeting)", 2, "b")}`,
        `      ${part("<-[:ATTENDED]-(b:Person)", 3, "c")}`,
        k >= 4 ? hl("WHERE a <> b", "", k === 4) : `<span class="dim">WHERE a &lt;&gt; b</span>`,
        (k >= 5 ? hl("RETURN DISTINCT b.name", "", true) : `<span class="dim">RETURN DISTINCT b.name</span>`) + ";",
      ].join("\n");
      const rows = [code(body)];
      if (k === 0) rows.push(`<div class="dim">() = 노드 · [] = 관계 · -&gt; = 방향 · 변수(a, m, b)를 붙이면 찾은 것을 돌려받아요</div>`);
      if (k >= 3) rows.push(`<div>찾은 줄 <b>${ROWS.length}</b>개 = 모양이 맞은 횟수${k >= 4 ? ` · WHERE 통과 <b>${ROWS.filter((r) => r.a !== r.b).length}</b>개` : ""}${k >= 5 ? ` · DISTINCT 후 <b class="c">${[...new Set(ROWS.map((r) => r.b))].length}</b>명` : ""}</div>`);
      return rows.join("");
    }
    function readPath(st) {
      const src = st.sp ? (f.narrow ? "MATCH p = shortestPath(\n  (n:Note {id:'N12'})\n  -[*..4]-\n  (x:Project {name:'X'}))\nRETURN [v IN nodes(p) |\n  coalesce(v.name, v.id)];" : "MATCH p = shortestPath(\n  (n:Note {id:'N12'})-[*..4]-(x:Project {name:'X'}))\nRETURN [v IN nodes(p) | coalesce(v.name, v.id)];")
        : `MATCH (n:Note {id:'N12'})-[${st.open ? "*" : st.only ? `*${st.r}` : `*1..${st.r}`}]-(x)\nRETURN ${st.open ? "x" : "DISTINCT x"}`;
      const rng = st.sp ? "" : st.open ? "*" : st.only ? `*${st.r}` : `*1..${st.r}`;
      const body = rng ? esc(src).replace(esc(`[${rng}]`), `[${hl(rng, st.open ? "b" : "a", true)}]`) : esc(src).replace("shortestPath", hl("shortestPath", "", true));
      const got = st.sp ? `<div>돌려받는 것: <b>[${SP.map((k) => `'${k}'`).join(", ")}]</b> <span class="dim">(N12 는 name 이 없어 id 로)</span></div>`
        : `<div>닿은 곳: ${(st.only ? R.order[st.r] : R.order.slice(1, st.r + 1).flat()).map((k) => `<span class="${["", "a", "b", "c"][Math.min(3, R.dist[k])]}">${k}</span>`).join(" · ")}</div>`;
      if (st.open) return code(body) + `<div>돌려받는 줄 <b class="b">${TRN}</b>개 — 길 하나에 한 줄이에요. 닿은 곳은 ${R.order.slice(1).flat().length}곳뿐인데 길은 ${TRN}개예요.</div><div class="dim">*1..3 = 1~3단계 · *..4 = 4단계까지 · * = 끝없이</div>`;
      return code(body) + got;
    }

    // 한 단계의 완성된 모습
    function paint(st) {
      flyG.replaceChildren();
      for (const k of Object.keys(NODES)) paintNode(k, null);
      RELS.forEach((_, i) => paintRel(i, C.line));
      if (mode === "match") {
        const k = st.k;
        sideT.textContent = "찾을 모양";
        ringE.forEach((r) => (r.style.display = "none"));
        bars.forEach((b) => (b.gg.style.display = "none")); spG.style.display = "none"; trT.textContent = "";
        tpl.style.display = ""; tblT.style.display = k >= 3 ? "" : "none"; head.forEach((t) => (t.style.display = k >= 3 ? "" : "none")); headL.style.display = k >= 3 ? "" : "none";
        // 패턴 조각
        const tc = { a: k >= 1 ? C.a : null, m: k >= 2 ? C.b : null, b: k >= 3 ? C.c : null };
        for (const [v, n] of Object.entries(tplN)) { set(n.c, { stroke: tc[v] || C.line }); set(n.t, { fill: tc[v] || C.sub }); }
        [[tplA[0], k >= 2 ? C.b : null], [tplA[1], k >= 3 ? C.c : null]].forEach(([l, c]) => { set(l, { stroke: c || C.line }); l.setAttribute("marker-end", arrowHead(s, c || C.line)); });
        // 데이터에서 맞은 것
        if (k >= 1) paintNode("민재", C.a, C.aSoft);
        if (k >= 2) ROWS.forEach((r) => { paintRel(r.r1, C.b, 3); paintNode(r.m, C.b, C.bSoft); });
        if (k >= 3) ROWS.forEach((r) => { paintRel(r.r2, C.c, 3); paintNode(r.b, C.c, C.cSoft); });
        const seenB = new Set();
        rowE.forEach((r, i) => {
          r.gg.style.display = k >= 3 ? "" : "none";
          r.ok.style.display = k >= 4 ? "" : "none";
          const dup = seenB.has(ROWS[i].b); seenB.add(ROWS[i].b);
          r.strike.style.display = k >= 5 && dup ? "" : "none";
          r.cells.forEach((c, j) => set(c, { fill: k >= 5 && j < 2 ? C.mute : [C.a, C.b, C.c][j] }));
        });
        resT.style.display = k >= 5 ? "" : "none";
        setRes(k >= 5 ? [...new Set(ROWS.map((r) => r.b))] : []);
        ro.set(readMatch(k));
        return;
      }
      // path 모드
      tpl.style.display = "none"; tblT.style.display = "none"; head.forEach((t) => (t.style.display = "none")); headL.style.display = "none";
      rowE.forEach((r) => (r.gg.style.display = "none")); resT.style.display = "none"; setRes([]);
      sideT.textContent = st.sp ? "돌려받는 길" : st.open ? "길이별 길 수" : "단계마다 닿은 곳";
      ringE.forEach((r, i) => (r.style.display = !st.sp && i < st.r ? "" : "none"));
      paintNode("N12", C.ink, null);
      const reach = (k) => k !== "N12" && (st.only ? R.dist[k] === st.r : R.dist[k] >= 1 && R.dist[k] <= st.r);
      if (st.sp) {
        // 최단 경로: 길 위의 노드만 진하게 (pre = 움직이기 전)
        for (const k of Object.keys(NODES)) set(nodeE[k].tt, { fill: SP.includes(k) ? C.ink : C.mute });
        if (!st.pre) for (let i = 1; i < SP.length; i++) { paintRel(R.via[SP[i]], C.d, 3.4); paintNode(SP[i], C.d, C.dSoft); }
      } else {
        for (const k of Object.keys(NODES)) {
          const d = R.dist[k];
          if (reach(k)) paintNode(k, RING[Math.min(3, d)], [null, C.aSoft, C.bSoft, C.cSoft][Math.min(3, d)]);
          else if (k !== "N12" && d < st.r) paintNode(k, C.sub, null); // 지나가기만 한 곳 (*2 의 서윤)
          set(nodeE[k].tt, { fill: k === "N12" || d <= st.r ? C.ink : C.mute });
        }
        // 선: (k−1 단계 → k 단계)를 잇는 선은 k 단계 색 — 민재처럼 두 길로 닿는 곳은 두 선 다
        RELS.forEach(([u, , v], i) => { const k = Math.max(R.dist[u], R.dist[v]); if (Math.abs(R.dist[u] - R.dist[v]) === 1 && k <= st.r) paintRel(i, RING[Math.min(3, k)], 2.6); });
      }
      bars.forEach((b, i) => {
        const k = i + 1, n = st.open ? TR[k] || 0 : R.order[k]?.length || 0, on = !st.sp && (st.open ? k <= TRL : st.only ? k === st.r : k <= st.r);
        const col = st.open ? C.b : RING[Math.min(3, k)];
        b.gg.style.display = on ? "" : "none";
        const u = st.open ? B.unitOpen : B.unit, nx = B.x + n * u + 8;
        b.lab.textContent = st.open ? `길이 ${k}` : `${k}단계`; set(b.lab, { fill: col }); set(b.bar, { fill: col, width: n * u });
        b.num.setAttribute("x", nx); b.num.textContent = st.open ? `${n}개` : `${n}곳`;
        b.names.textContent = st.open ? "" : (R.order[k] || []).join(" · ");
        if (!B.below) { b.names.setAttribute("x", nx + 40); b.names.setAttribute("y", b.y); }
      });
      trT.textContent = st.open ? `길 ${TRN}개 · 닿은 곳 ${R.order.slice(1).flat().length}곳` : "";
      spG.style.display = st.sp ? "" : "none";
      ro.set(readPath(st));
    }

    // 움직임: 점이 선을 따라 흘러가요
    async function fly(list, color, ms = 520) {
      const dots = list.map(([from, i]) => { const e = relE[i], fwd = RELS[i][0] === from; return { a: fwd ? [e.x1, e.y1] : [e.x2, e.y2], b: fwd ? [e.x2, e.y2] : [e.x1, e.y1], d: circle(flyG, 0, 0, 5, { fill: color }) }; });
      await anim(ms, (t) => dots.forEach((x) => set(x.d, { cx: x.a[0] + (x.b[0] - x.a[0]) * t, cy: x.a[1] + (x.b[1] - x.a[1]) * t })));
      dots.forEach((x) => x.d.remove());
    }
    async function playMatch(k) {
      if (k === 2) { await fly(ROWS.filter((r, i, a) => a.findIndex((q) => q.r1 === r.r1) === i).map((r) => ["민재", r.r1]), C.b); }
      if (k === 3) {
        rowE.forEach((r) => (r.gg.style.display = "none"));
        for (let i = 0; i < ROWS.length; i++) { await fly([[ROWS[i].m, ROWS[i].r2]], C.c, 380); paintRel(ROWS[i].r2, C.c, 3); paintNode(ROWS[i].b, C.c, C.cSoft); rowE[i].gg.style.display = ""; await sleep(120); }
      }
      if (k === 5) { await sleep(150); }
    }
    async function playPath(st) {
      if (st.sp) { for (let i = 1; i < SP.length; i++) { await fly([[SP[i - 1], R.via[SP[i]]]], C.d, 420); paintRel(R.via[SP[i]], C.d, 3.4); paintNode(SP[i], C.d, C.dSoft); } return; }
      const d = st.r;
      ringE[d - 1].style.display = "";
      const list = []; RELS.forEach(([u, , v], i) => { if (R.dist[u] === d - 1 && R.dist[v] === d) list.push([u, i]); else if (R.dist[v] === d - 1 && R.dist[u] === d) list.push([v, i]); });
      await fly(list, RING[Math.min(3, d)]);
    }

    return {
      async go(i, animate) {
        const st = steps[i], prev = steps[i - 1];
        // 앞 단계에서 한 조각(한 겹) 더 갈 때만 움직여요. 나머지는 바로 완성된 모습
        if (animate && prev) {
          if (mode === "match" && (st.k === 2 || st.k === 3)) { paint({ ...st, k: st.k - 1 }); ro.set(readMatch(st.k)); await playMatch(st.k); }
          else if (mode === "path" && st.sp) { paint({ ...st, pre: 1 }); await playPath(st); }
          else if (mode === "path" && !st.open && st.r > 1) { paint({ r: st.r - 1 }); ro.set(readPath(st)); await playPath(st); }
        }
        paint(st);
      },
    };
  },
};
