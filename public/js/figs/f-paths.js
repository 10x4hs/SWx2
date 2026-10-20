// 그림: 최단경로 — BFS 는 칸 수, Dijkstra 는 무게 (Vector & Graph 07 — 카드 12)
//   무게 있는 그래프 하나(노드 8개). BFS 는 큐(넣은 순서)로 1칸 · 2칸씩 퍼지고, Dijkstra 는 우선순위 큐(가까운 순)로 하나씩 확정해요.
//   opts.mode = "bfs" | "dijkstra" | "both"(기본). 탐색 기록 · 거리 · 경로는 모두 코드에서 계산해요.
import { svg, g, text, line, circle, rect, el, anim, show, readout, C, lerp } from "./kit.js";

// 판 두 가지: 넓은 칸(왼쪽 → 오른쪽으로 흘러요) / 좁은 칸(폰 · 튜터 — 위 → 아래로 흘러서 글씨가 커 보여요)
const WIDE = { W: 600, H: 430, QY: 372, LINE: 334, CMP: [356, 394], NODES: { 나: [52, 170], 서윤: [180, 90], 지수: [180, 252], 민재: [322, 44], 노트: [458, 54], m12: [318, 290], 회고: [452, 290], Orion: [554, 170] } };
const NARROW = { W: 380, H: 590, QY: 532, LINE: 496, CMP: [522, 560], NODES: { 나: [193, 62], 서윤: [115, 160], 지수: [273, 160], 민재: [70, 268], 노트: [80, 370], m12: [310, 266], 회고: [310, 368], Orion: [193, 446] } };
const NODES = WIDE.NODES; // 이름 목록 · 계산용
const EDGES = [["나", "서윤", 2], ["나", "지수", 1], ["서윤", "민재", 3], ["서윤", "Orion", 9], ["민재", "노트", 3], ["노트", "Orion", 4], ["지수", "m12", 2], ["m12", "회고", 1], ["회고", "Orion", 3], ["서윤", "지수", 3]];
const S = "나", T = "Orion", R = 26;
const ADJ = new Map(Object.keys(NODES).map((v) => [v, []]));
for (const [a, b, w] of EDGES) { ADJ.get(a).push([b, w]); ADJ.get(b).push([a, w]); }
const ek = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
const wOf = (a, b) => EDGES.find((e) => ek(e[0], e[1]) === ek(a, b))[2];

// BFS 기록: 꺼낼 때마다 새로 찾은 이웃 (도착점을 찾으면 멈춰요)
function bfsRun() {
  const layer = new Map([[S, 0]]), prev = new Map(), q = [S], ev = [];
  while (q.length) {
    const u = q.shift(), found = [];
    for (const [v] of ADJ.get(u)) if (!layer.has(v)) { layer.set(v, layer.get(u) + 1); prev.set(v, u); q.push(v); found.push(v); }
    ev.push({ u, found, queue: q.slice() });
    if (layer.has(T)) break;
  }
  const path = [T]; while (path[0] !== S) path.unshift(prev.get(path[0]));
  return { ev, layer, prev, path };
}
// Dijkstra 기록: 꺼내서 확정할 때마다 이웃 거리 고치기 (도착점을 확정하면 멈춰요)
function dijRun() {
  const dist = new Map([[S, 0]]), prev = new Map(), done = new Set(), ev = [];
  for (;;) {
    let u = null, best = Infinity;
    for (const [v, d] of dist) if (!done.has(v) && d < best) { best = d; u = v; }
    if (u === null) break;
    done.add(u);
    const relax = [];
    for (const [v, w] of ADJ.get(u)) {
      if (done.has(v)) continue;
      const nd = best + w, old = dist.has(v) ? dist.get(v) : null;
      if (old === null || nd < old) { dist.set(v, nd); prev.set(v, u); relax.push({ v, old, nd, w }); }
    }
    ev.push({ u, d: best, relax });
    if (u === T) break;
  }
  const path = [T]; while (path[0] !== S) path.unshift(prev.get(path[0]));
  return { ev, dist, prev, path };
}
const B = bfsRun(), D = dijRun();
const pathW = (p) => p.slice(1).reduce((s, v, i) => s + wOf(p[i], v), 0);
const BW = pathW(B.path), DW = pathW(D.path), BH = B.path.length - 1, DH = D.path.length - 1;
const arrow = (p) => p.join(" → ");
// 숫자는 계산한 기록에서 꺼내 써요
const popsTo = (k) => D.ev.slice(0, k).map((e) => `${e.u} ${e.d}`).join(" → ");
const decEv = D.ev.findIndex((e) => e.relax.some((r) => r.v === T && r.old != null)); // 도착점 거리를 고친 때
const dec = D.ev[decEv]?.relax.find((r) => r.v === T);
const l1 = B.ev[0].found, l2 = B.ev[1]?.found || [];

const ST = {
  b1: { cap: `BFS 는 출발점 '나'에서 한 칸씩 퍼져요. 먼저 1칸 이웃 ${l1.join(" · ")}(파란 노드)를 찾아 큐에 넣어요.`, view: "bfs", b: 1 },
  b2: { cap: `큐 맨 앞의 ${B.ev[1].u}을 꺼내면 ${l2.join(" · ")}이 2칸이에요. 도착점 ${T}을 찾았으니 멈추고, 이전 노드를 거꾸로 따라가요: ${arrow(B.path)} (${BH}칸).`, view: "bfs", b: B.ev.length, path: "b" },
  bw: { cap: `BFS 는 칸 수만 세요. 파란 길의 무게를 더하면 ${B.path.slice(1).map((v, i) => wOf(B.path[i], v)).join(" + ")} = ${BW} 예요. 무게가 있는 그래프라면 더 가벼운 길이 있을 수 있어요 — 그땐 Dijkstra 를 써요.`, view: "bfs", b: B.ev.length, path: "b", wt: 1 },
  d1: { cap: `Dijkstra 는 엣지 무게를 더한 거리로 봐요. 우선순위 큐에서 가장 가까운 노드를 꺼내 확정해요(주황 노드): ${popsTo(4)}.`, view: "dij", d: 4 },
  d2: { cap: `${D.ev[decEv].u}(${D.ev[decEv].d})를 확정하면 ${T}까지 ${D.ev[decEv].d} + ${dec.w} = ${dec.nd} 이에요. 앞에서 적어 둔 ${dec.old} 보다 작아서 ${dec.nd}로 고쳐 써요.`, view: "dij", d: decEv + 1 },
  d3: { cap: `${T}이 큐에서 꺼내지면(확정) 끝이에요. 이전 노드를 거꾸로 따라가면: ${arrow(D.path)} (${DH}칸, 무게 ${DW}).`, view: "dij", d: D.ev.length, path: "d" },
  cmp: { cap: `파란 길(BFS)은 칸 수가 적은 길(${BH}칸, 무게 ${BW}), 주황 길(Dijkstra)은 무게가 작은 길(${DH}칸, 무게 ${DW})이에요. 무게가 있으면 BFS 는 틀릴 수 있어요.`, view: "cmp", path: "bd" },
};
const MODES = { both: ["b1", "b2", "d1", "d2", "d3", "cmp"], bfs: ["b1", "b2", "bw"], dijkstra: ["d1", "d2", "d3"] };
const steps = (o) => (MODES[o.mode] || MODES.both).map((k) => ST[k]);

const tw = (str, size) => [...String(str)].reduce((w, ch) => w + (/[ㄱ-힝]/.test(ch) ? 0.96 : ch === " " ? 0.3 : 0.6) * size, 0);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default {
  aspect: WIDE.H / WIDE.W,
  aspectNarrow: NARROW.H / NARROW.W,
  steps: (o) => steps(o).map((s) => s.cap),
  mount(stage, f) {
    const list = steps(f.opts), LY = f.narrow ? NARROW : WIDE, { W, H, QY } = LY, POS = LY.NODES;
    const s = svg(stage, W, H, "노드 8개짜리 무게 있는 그래프에서 '나'부터 'Orion'까지 최단경로를 찾는 그림");
    let alive = true;
    const live = (i) => alive && f.step() === i;

    const edgeG = g(s), pathG = g(s), nodeG = g(s), badgeG = g(s), stripG = g(s);
    // 엣지 + 무게
    const edges = new Map(EDGES.map(([a, b, w]) => {
      const [x1, y1] = POS[a], [x2, y2] = POS[b];
      const l = line(edgeG, x1, y1, x2, y2, { color: C.line, width: 2 });
      const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
      const wt = text(edgeG, mx, my, String(w), { size: 16, anchor: "middle", weight: 700, fill: C.sub, cls: "halo tab" });
      return [ek(a, b), { l, wt }];
    }));
    // 노드
    const nodes = new Map(Object.entries(POS).map(([n, [x, y]]) => {
      circle(nodeG, x, y, R, { fill: C.bg }); // 밤 모드의 반투명 색 아래로 선이 비치지 않게
      const c = circle(nodeG, x, y, R, { fill: C.bg, stroke: C.line, sw: 2 });
      const t = text(nodeG, x, y + 1, n, { size: n.length > 3 ? 15 : 16, anchor: "middle", weight: 700, fill: C.ink });
      return [n, { c, t, x, y }];
    }));
    text(nodeG, POS[S][0] + (f.narrow ? -R - 30 : 0), POS[S][1] + (f.narrow ? 1 : R + 16), "출발", { size: 14, anchor: "middle", weight: 600, fill: C.mute });
    text(nodeG, POS[T][0], POS[T][1] + R + 16, "도착", { size: 14, anchor: "middle", weight: 600, fill: C.mute });
    // 노드 옆 작은 표 (BFS: n칸 · Dijkstra: 거리)
    const badges = new Map([...nodes].map(([n, { x, y }]) => {
      const bx = x + (n === T ? -2 : 18), by = y - R - 8;
      const gg = g(badgeG);
      const old = text(gg, bx, by, "", { size: 14, anchor: "start", weight: 600, fill: C.mute, cls: "halo tab" });
      const strike = line(gg, 0, 0, 0, 0, { color: C.mute, width: 1.6 });
      const val = text(gg, bx, by, "", { size: 17, anchor: "start", weight: 700, fill: C.b, cls: "halo tab" });
      return [n, { gg, old, strike, val, bx, by, x, left: f.narrow && ["서윤", "민재", "노트"].includes(n) }]; // 좁은 칸 왼쪽 줄은 바깥(왼쪽)에
    }));
    // 아래: 큐 칸
    el(stripG, "line", { x1: 12, y1: LY.LINE, x2: W - 12, y2: LY.LINE, stroke: C.grid, "stroke-width": 1 });
    const qLab = text(stripG, 16, QY - 22, "", { size: 15, weight: 600, fill: C.sub });
    const chipG = g(stripG);
    const cmpG = g(stripG);

    const ctlRo = readout(f.controls());
    // 지금 상태
    let st = null;
    function stateFor(k) {
      const sp = list[k], o = { view: sp.view, layer: new Map(), btree: new Set(), queue: [], found: false, dist: new Map(), old: new Map(), done: new Set(), dtree: new Set(), pq: [], cur: null, path: sp.path || "", wt: !!sp.wt };
      if (sp.view === "bfs") {
        o.layer.set(S, 0);
        for (const e of B.ev.slice(0, sp.b)) { for (const v of e.found) { o.layer.set(v, B.layer.get(v)); o.btree.add(ek(B.prev.get(v), v)); } o.queue = e.queue; o.cur = e.u; }
        o.found = o.layer.has(T);
      }
      if (sp.view === "dij") {
        o.dist.set(S, 0);
        D.ev.slice(0, sp.d).forEach((e) => {
          o.done.add(e.u); o.cur = e.u;
          for (const r of e.relax) { if (r.old != null) o.old.set(r.v, r.old); o.dist.set(r.v, r.nd); }
        });
        // 이전 노드(지금까지 기록 기준) → 나무 엣지
        const pv = new Map(); D.ev.slice(0, sp.d).forEach((e) => e.relax.forEach((r) => pv.set(r.v, e.u)));
        for (const [v, u] of pv) o.dtree.add(ek(u, v));
        o.pq = [...o.dist].filter(([v]) => !o.done.has(v)).sort((a, b) => a[1] - b[1]);
      }
      return o;
    }
    const BC = C.a, BS = C.aSoft, DC = C.b, DS = C.bSoft;
    function draw(o, prog = {}) {
      // 엣지
      for (const [k, { l, wt }] of edges) {
        const bt = o.btree.has(k), dt = o.dtree.has(k);
        l.style.stroke = bt ? BC : dt ? DC : "var(--fg-line)"; l.setAttribute("stroke-width", bt || dt ? 2.6 : 2);
        l.style.opacity = o.view === "cmp" ? "0.55" : "1";
        const onPath = o.wt && B.path.some((n, i) => i && ek(B.path[i - 1], n) === k); // bw 단계: BFS 길의 무게만 진하게
        wt.style.fill = onPath ? "var(--fg-a)" : o.view === "bfs" ? "var(--fg-mute)" : "var(--fg-sub)";
        wt.setAttribute("font-size", onPath ? 19 : 16);
      }
      // 노드
      for (const [n, nd] of nodes) {
        let fill = "var(--fg-bg)", stroke = "var(--fg-line)", sw = 2;
        if (o.view === "bfs" && o.layer.has(n)) { fill = n === S ? "var(--fg-soft)" : BS; stroke = n === S ? "var(--fg-ink)" : BC; sw = o.cur === n && prog.pop ? 4 : 2.4; }
        if (o.view === "dij") {
          if (o.done.has(n)) { fill = DS; stroke = DC; sw = 3; }
          else if (o.dist.has(n)) { stroke = DC; sw = 2; }
        }
        if (o.view === "cmp" && (B.path.includes(n) || D.path.includes(n))) { stroke = "var(--fg-ink)"; sw = 2.2; }
        nd.c.style.fill = fill; nd.c.style.stroke = stroke; nd.c.setAttribute("stroke-width", sw);
      }
      // 작은 표
      for (const [n, b] of badges) {
        let val = "", old = "", col = BC;
        if (o.view === "bfs" && o.layer.has(n) && n !== S) { val = `${o.layer.get(n)}칸`; col = BC; }
        if (o.view === "dij" && o.dist.has(n)) { val = String(o.dist.get(n)); col = DC; if (o.old.has(n)) old = String(o.old.get(n)); }
        b.val.textContent = val; b.val.style.fill = col; b.old.textContent = old;
        const ow = old ? tw(old, 14) : 0, bx = b.left ? b.x - 20 - ((old ? ow + 6 : 0) + tw(val, 17)) : b.bx;
        b.old.setAttribute("x", bx); b.val.setAttribute("x", bx + (old ? ow + 6 : 0));
        if (old) { b.strike.setAttribute("x1", bx - 1); b.strike.setAttribute("x2", bx + ow + 1); b.strike.setAttribute("y1", b.by); b.strike.setAttribute("y2", b.by); }
        b.strike.style.opacity = old ? "1" : "0";
      }
      // 경로 (굵은 선)
      pathG.replaceChildren();
      const pth = (p, col, off, frac = 1) => {
        const pts = p.map((n) => POS[n]);
        const segs = pts.length - 1, upto = frac * segs;
        let d = `M${pts[0][0] + off},${pts[0][1] + off}`;
        for (let k = 0; k < segs; k++) {
          if (upto <= k) break;
          const t = Math.min(1, upto - k), [x1, y1] = pts[k], [x2, y2] = pts[k + 1];
          d += ` L${lerp(x1, x2, t) + off},${lerp(y1, y2, t) + off}`;
        }
        el(pathG, "path", { d, fill: "none", stroke: col, "stroke-width": 7, "stroke-linecap": "round", "stroke-linejoin": "round", opacity: 0.45 });
      };
      // 경로 복원은 도착점에서 '이전 노드'를 거꾸로 따라가며 그려요
      const dir = (p) => (prog.rev ? [...p].reverse() : p);
      if (o.path.includes("b")) pth(dir(B.path), BC, 0, prog.b ?? 1);
      if (o.path.includes("d")) pth(dir(D.path), DC, 0, prog.d ?? 1);
      // 큐
      chipG.replaceChildren(); cmpG.replaceChildren();
      if (o.view === "bfs" || o.view === "dij") {
        qLab.textContent = o.view === "bfs" ? "큐 — 넣은 순서대로 꺼내요" : "우선순위 큐 — 거리가 가장 작은 것부터 꺼내요";
        const items = o.view === "bfs" ? o.queue.map((n) => [n, ""]) : o.pq.map(([n, d]) => [n, String(d)]);
        let x = 16;
        items.forEach(([n, d], k) => {
          const label = d ? `${n} ${d}` : n, w = tw(label, 16) + 22, front = k === 0;
          const col = o.view === "bfs" ? BC : DC, soft = o.view === "bfs" ? BS : DS;
          rect(chipG, x, QY - 4, w, 32, { r: 8, fill: front ? soft : "var(--fg-bg)", stroke: col, sw: front ? 2.4 : 1.4 });
          text(chipG, x + w / 2, QY + 12, label, { size: 16, anchor: "middle", weight: 700, fill: "var(--fg-ink)" });
          if (front) text(chipG, x + w / 2, QY + 44, "다음", { size: 14, anchor: "middle", weight: 600, fill: col });
          x += w + 8;
        });
        if (!items.length) text(chipG, 16, QY + 12, "(비었어요)", { size: 15, fill: "var(--fg-mute)" });
      } else {
        qLab.textContent = "";
        const nx = f.narrow ? [150, 210] : [200, 270]; // 좁은 칸은 칸을 당기고 '← …길' 설명은 빼요 (아래 계산 칸에 있어요)
        const row = (y, col, name, hops, w) => {
          el(cmpG, "line", { x1: 18, y1: y, x2: 52, y2: y, stroke: col, "stroke-width": 7, opacity: 0.45, "stroke-linecap": "round" });
          text(cmpG, 64, y, name, { size: 16, weight: 700, fill: col });
          text(cmpG, nx[0], y, `${hops}칸`, { size: 16, weight: 700, fill: "var(--fg-ink)", cls: "fg-t tab" });
          text(cmpG, nx[1], y, `무게 ${w}`, { size: 16, weight: 700, fill: "var(--fg-ink)", cls: "fg-t tab" });
        };
        row(LY.CMP[0], BC, "BFS", BH, BW); row(LY.CMP[1], DC, "Dijkstra", DH, DW);
        if (!f.narrow) { text(cmpG, 380, LY.CMP[0], "← 칸 수가 적은 길", { size: 15, weight: 600, fill: BC }); text(cmpG, 380, LY.CMP[1], "← 무게가 작은 길", { size: 15, weight: 600, fill: DC }); }
      }
      // 아래 계산 칸
      ctlRo.set(readHtml(o));
    }
    function readHtml(o) {
      if (o.view === "bfs") {
        const by = [1, 2].map((L) => [...o.layer].filter(([, l]) => l === L).map(([n]) => n)).filter((x) => x.length);
        const rows = by.map((ns, k) => `<div><span class="a">${k + 1}칸</span>: ${ns.join(", ")}</div>`);
        if (o.found) rows.push(`<div><span class="a">BFS 경로</span> ${arrow(B.path)} · <b>${BH}칸</b> <span class="dim">(무게 ${B.path.slice(1).map((v, i) => wOf(B.path[i], v)).join(" + ")} = ${BW} — BFS 는 무게를 안 봐요)</span></div>`);
        return rows.join("");
      }
      if (o.view === "dij") {
        const done = D.ev.filter((e) => o.done.has(e.u)).map((e) => `${e.u} ${e.d}`);
        const rows = [`<div><span class="b">확정한 순서</span>: ${done.join(" → ")}</div>`];
        const last = D.ev.find((e) => e.u === o.cur);
        if (last?.relax.length) rows.push(`<div class="dim">${last.u} 확정 → ${last.relax.map((r) => r.old != null ? `${r.v} = min(${r.old}, ${last.d} + ${r.w}) = <b>${r.nd}</b>` : `${r.v} = ${last.d} + ${r.w} = ${r.nd}`).join(" · ")}</div>`);
        if (o.path.includes("d")) rows.push(`<div><span class="b">Dijkstra 경로</span> ${arrow(D.path)} · <b>무게 ${D.path.slice(1).map((v, i) => wOf(D.path[i], v)).join(" + ")} = ${DW}</b> (${DH}칸)</div>`);
        else rows.push(`<div class="dim">무게는 0 이상이어야 해요 (음수면 안 돼요)</div>`);
        return rows.join("");
      }
      return `<div><span class="a">BFS</span> ${arrow(B.path)} · ${BH}칸 · 무게 ${BW}</div><div><span class="b">Dijkstra</span> ${arrow(D.path)} · ${DH}칸 · 무게 <b>${DW}</b></div>`;
    }

    let shown = -1;
    async function go(i, animate) {
      const from = shown; shown = i;
      const target = stateFor(i);
      if (!animate || from !== i - 1 || list[i].view === "cmp" && from < 0) { st = target; draw(st); return; }
      const sp = list[i], prev = list[i - 1];
      if (sp.wt) { st = target; draw(st); return; } // 무게 더하기 단계: 그대로 보여 줘요 (길은 앞 단계에서 이미 그렸어요)
      if (sp.view === "bfs") {
        // 꺼낸 노드에서 새 이웃으로 퍼져요
        const startB = prev?.view === "bfs" ? prev.b : 0;
        let o = stateFor(i); o = { ...o, layer: new Map([[S, 0]]), btree: new Set(), queue: [S], path: "" };
        if (startB) { const p0 = stateFor(i - 1); o = { ...p0, path: "" }; }
        draw(o);
        for (const e of B.ev.slice(startB, sp.b)) {
          if (!live(i)) break;
          o.cur = e.u; o.queue = o.queue.filter((n) => n !== e.u); draw(o, { pop: true }); await sleep(450);
          for (const v of e.found) { if (!live(i)) break; o.layer.set(v, B.layer.get(v)); o.btree.add(ek(B.prev.get(v), v)); o.queue = [...o.queue, v]; draw(o, { pop: true }); await sleep(380); }
        }
        if (sp.path && live(i)) { o.path = "b"; o.found = true; await sleep(300); await anim(900, (t) => draw(o, { b: t, rev: true })); }
      } else if (sp.view === "dij") {
        const startD = prev?.view === "dij" ? prev.d : 0;
        const base = startD ? stateFor(i - 1) : (() => { const z = stateFor(i); return { ...z, dist: new Map([[S, 0]]), old: new Map(), done: new Set(), dtree: new Set(), pq: [[S, 0]], cur: null, path: "" }; })();
        let o = { ...base, path: "" };
        draw(o); await sleep(250);
        const pv = new Map(); D.ev.slice(0, startD).forEach((e) => e.relax.forEach((r) => pv.set(r.v, e.u)));
        for (const e of D.ev.slice(startD, sp.d)) {
          if (!live(i)) break;
          o.done = new Set([...o.done, e.u]); o.cur = e.u; o.pq = o.pq.filter(([n]) => n !== e.u); draw(o); await sleep(420);
          for (const r of e.relax) {
            if (!live(i)) break;
            if (r.old != null) o.old = new Map([...o.old, [r.v, r.old]]);
            o.dist = new Map([...o.dist, [r.v, r.nd]]); pv.set(r.v, e.u);
            o.dtree = new Set([...pv].map(([v, u]) => ek(u, v)));
            o.pq = [...o.dist].filter(([v]) => !o.done.has(v)).sort((a, b) => a[1] - b[1]);
            draw(o); await sleep(r.old != null ? 700 : 360);
          }
        }
        if (sp.path && live(i)) { o.path = "d"; await sleep(300); await anim(1100, (t) => draw(o, { d: t, rev: true })); }
      } else {
        const o = { ...target };
        await anim(900, (t) => draw(o, { b: t, d: t }));
      }
      if (alive) { st = stateFor(i); draw(st); }
    }
    return { go, destroy() { alive = false; } };
  },
};
