// 그림: 사람을 더하면 — 소통 길 n(n−1)/2 와 적응 기간 (Dev Flow 01 회사 c17 · 12 리드 c15)
//   왼쪽: 사람(점)과 모든 짝을 잇는 선(소통 길). 오른쪽 위: 길의 수, 아래: 새 사람(주황)이 제 몫을 하기까지의 막대.
//   opts.mode = "company"(c17 · 온보딩 2주, 기본) | "lead"(c15 · 적응 한 달). 마지막 단계에서 인원 슬라이더 · 소통 구조(모두와 모두 | 팀으로 나눔)
//   '논쟁 중'이라는 카드의 결론을 그대로 — 사람을 더하면 늘 늦어진다고 그리지 않아요. 보이는 건 길의 수(셈)와 적응 막대(단순화)뿐이에요.
import { svg, g, text, line, circle, rect, el, slider, choice, readout, anim, show, C, lerp, clamp } from "./kit.js";

const MAXN = 12, BASE = 4; // 원래 팀 4명 + 새 사람
const pairs = (n) => (n * (n - 1)) / 2;

const TXT = {
  company: {
    ramp: 2, rampL: "온보딩 2주", learn: "① 배우는 시간",
    steps: [
      "4명이 함께 일하면 서로 맞춰야 할 소통 길은 6개예요. n명이면 n(n−1)/2 개예요.",
      "두 명(주황)을 더 넣어 6명이 되면 소통 길은 15개예요. 사람은 1.5배인데 길은 2.5배가 돼요.",
      "새 사람은 일을 배우는 동안 제 몫을 다 못 해요. “새로 온 분 온보딩에 2주는 걸려요.”",
      "배우는 시간과 소통 비용 때문에 브룩스(1975)는 ‘아주 단순화하면’ 늦은 프로젝트에 사람을 더하면 더 늦어진다고 했어요.",
      "반론도 있어요. Reinertsen(2000)은 일찍 넣고, 핵심 경로 밖에서 교육하고, 일을 잘 나누면 괜찮다고 했어요.",
      "그래서 논쟁 중이에요. 늦게 넣으면 비용은 반드시 늘고, 지연은 때때로 더 늘어요. 이제 직접 바꿔 보세요.",
    ],
    other: "McConnell(1999)은 더는 이 법칙이 참이라고 생각하지 않는다고 했어요.",
  },
  lead: {
    ramp: 4, rampL: "적응 한 달", learn: "① 적응 시간",
    steps: [
      "4명이 함께 일하면 서로 맞춰야 할 소통 길은 6개예요. n명이면 n(n−1)/2 개예요.",
      "두 명(주황)을 더 붙여 6명이 되면 소통 길은 15개예요. 사람은 1.5배인데 길은 2.5배가 돼요.",
      "새 사람은 적응하는 동안 제 몫을 다 못 해요. “적응에 한 달은 걸려요.”",
      "적응 시간과 소통 비용 때문에 브룩스는 “지나치게 단순화하면” 늦은 프로젝트에 인력을 더하면 더 늦어진다고 했어요.",
      "반론도 있어요. 라이너트슨(2000)은 일찍 더하고, 핵심 경로 밖에서 교육하고, 일을 잘 나누면 늘 나쁜 건 아니라고 했어요.",
      "그래서 보편 법칙이 아니라 ‘경고’로 배워요. 이제 직접 인원과 소통 구조를 바꿔 보세요.",
    ],
    other: "블랙번 등(2006)은 팀이 클수록 생산성이 떨어진다는 근거를, 맥코넬(1999)은 일이 얼마나 순차적인지에 달렸다고 했어요. 근거끼리 충돌해요.",
  },
};
// 단계마다: 인원 · 소통 구조 · 막대 보이기 · 이름표(① ②)
const PLAN = [
  { n: 4 },
  { n: 6, grow: 1 },
  { n: 6, bars: 1, rampIn: 1 },
  { n: 6, bars: 1, tags: 1 },
  { n: 6, bars: 1, tags: 1, teams: 1 },
  { user: 1, bars: 1 },
];
const LAST = PLAN.length - 1;

// 팀으로 나누기: 4명씩까지, 차례로 돌려 담아요 (원래 팀과 새 사람이 섞이게). 팀마다 첫 사람이 대표.
function split(n) {
  const t = n <= BASE ? 1 : Math.ceil(n / BASE);
  const members = Array.from({ length: t }, (_, c) => [...Array(n).keys()].filter((i) => i % t === c));
  return { t, members, team: (i) => i % t, lead: (i) => members[i % t][0] === i };
}
function lineCount(n, teams) {
  if (!teams) return { total: pairs(n), parts: null };
  const s = split(n);
  if (s.t === 1) return { total: pairs(n), parts: null };
  const inner = s.members.map((m) => pairs(m.length));
  return { total: inner.reduce((a, b) => a + b, 0) + pairs(s.t), parts: { inner, cross: pairs(s.t), sizes: s.members.map((m) => m.length) } };
}

export default {
  aspect: 330 / 580,
  aspectNarrow: 452 / 380,
  steps: (o) => (TXT[o.mode] || TXT.company).steps,
  hint: "마지막 단계에서 인원을 바꿔 보세요",
  mount(stage, f) {
    const T = TXT[f.opts.mode] || TXT.company;
    const nar = !!f.narrow;
    // 판 배치 — 넓으면 왼쪽 그림 · 오른쪽 숫자와 막대, 좁으면 위아래로
    const L = nar
      ? { W: 380, H: 452, cx: 190, cy: 128, R: 102, nr: 12, cnt: { x: 190, y: 272, anchor: "middle" }, bx: 20, by: 338, bw: 340, lab: 78 }
      : { W: 580, H: 330, cx: 158, cy: 166, R: 118, nr: 11, cnt: { x: 330, y: 64, anchor: "start" }, bx: 330, by: 168, bw: 232, lab: 76 };
    const s = svg(stage, L.W, L.H, "사람 수에 따라 늘어나는 소통 길과 새 사람의 적응 기간");

    // ---- 사람과 소통 길 ----
    const linesG = g(s), nodesG = g(s);
    const E = [];
    for (let i = 0; i < MAXN; i++) for (let j = i + 1; j < MAXN; j++) {
      const isNew = i >= BASE || j >= BASE;
      const e = line(linesG, 0, 0, 0, 0, { color: isNew ? C.b : C.sub, width: isNew ? 1.7 : 1.6 });
      e.style.opacity = "0";
      E.push({ i, j, el: e, o: 0, isNew });
    }
    const N = [...Array(MAXN).keys()].map((i) => {
      const c = circle(nodesG, L.cx, L.cy, L.nr, { fill: i < BASE ? C.a : C.b, stroke: C.bg, sw: 2.5 });
      c.style.opacity = "0";
      return { el: c, x: L.cx, y: L.cy, o: 0 };
    });
    // 이름표 ② (소통 비용) — 그림 왼쪽 위
    const tag2 = text(s, nar ? 16 : 14, nar ? 18 : 22, "② 소통 비용", { size: 15, weight: 700, fill: C.ink, cls: "halo" });

    // ---- 길의 수 ----
    const cntG = g(s);
    const cntLab = text(cntG, L.cnt.x, nar ? L.cnt.y : 26, "소통 길", { size: 15, weight: 600, fill: C.sub, anchor: L.cnt.anchor });
    const cntNum = text(cntG, nar ? L.cnt.x : L.cnt.x, nar ? L.cnt.y : L.cnt.y, "", { size: nar ? 28 : 44, weight: 700, fill: C.ink, anchor: L.cnt.anchor, cls: "tab" });
    const cntF = text(cntG, L.cnt.x, nar ? L.cnt.y + 27 : 102, "", { size: 15, weight: 500, fill: C.sub, anchor: L.cnt.anchor, cls: "tab" });
    if (nar) cntLab.style.display = "none"; // 좁은 판: "소통 길 15개" 한 줄로

    // ---- 적응 막대 ----
    const barG = g(s);
    const WK = 8, x0 = L.bx + L.lab, x1 = L.bx + L.bw, wx = (w) => x0 + ((x1 - x0) * w) / WK;
    const rowH = 22, r1 = L.by + 10, r2 = r1 + rowH + 22, axY = r2 + rowH + 8;
    text(barG, L.bx, L.by - 8, "합류한 뒤 낼 수 있는 일", { size: 14, weight: 600, fill: C.sub });
    const tag1 = nar ? text(barG, x1, L.by - 8, T.learn, { size: 15, weight: 700, fill: C.ink, anchor: "end", cls: "halo" })
      : text(barG, L.bx, L.by - 32, T.learn, { size: 15, weight: 700, fill: C.ink, cls: "halo" });
    const vLab = text(barG, L.bx, r1 + rowH / 2, "", { size: 15, weight: 600, fill: C.a });
    rect(barG, x0, r1, x1 - x0, rowH, { r: 4, fill: C.a });
    const nLab = text(barG, L.bx, r2 + rowH / 2, "", { size: 15, weight: 600, fill: C.b });
    rect(barG, x0, r2, x1 - x0, rowH, { r: 4, fill: C.soft, stroke: C.grid, sw: 1 });
    const wedge = el(barG, "polygon", { points: "", fill: C.b });
    const none = text(barG, (x0 + x1) / 2, r2 + rowH / 2, "새 사람 없음", { size: 14, fill: C.mute, anchor: "middle" });
    line(barG, x0, axY, x1, axY, { color: C.line, width: 1.2 });
    for (let w = 0; w <= WK; w += 2) {
      line(barG, wx(w), axY, wx(w), axY + 4, { color: C.line, width: 1.2 });
      text(barG, wx(w), axY + 15, w === 0 ? "0" : `${w}주`, { size: 14, fill: C.mute, anchor: "middle" });
    }
    const rampX = wx(T.ramp);
    line(barG, rampX, r1 - 4, rampX, axY, { color: C.ink, width: 1.4, dash: "4 4" });
    const rampT = text(barG, rampX + 6, r1 + rowH + 11, T.rampL, { size: 14, weight: 600, fill: C.ink, cls: "halo" });
    function wedgeAt(p) { // p: 0→1 (왼쪽에서 오른쪽으로 자라요)
      const xe = lerp(x0, x1, p), yb = r2 + rowH, yt = r2;
      if (p <= 0) return "";
      if (xe <= rampX) return `${x0},${yb} ${xe},${yb - (rowH * (xe - x0)) / (rampX - x0)} ${xe},${yb}`;
      return `${x0},${yb} ${rampX},${yt} ${xe},${yt} ${xe},${yb}`;
    }

    const ro = readout(f.controls());
    const user = { n: 6, teams: false };
    const dial = slider(f.controls(), { label: "인원", min: 2, max: MAXN, value: 4, fmt: (v) => `${v}명` }, (v) => { user.n = v; toLast(); });
    const seg = choice(f.controls(), [["all", "모두와 모두"], ["teams", "팀으로 나눔"]], "all", (k) => { user.teams = k === "teams"; toLast(); }, "소통 구조");
    let stepNow = 0;
    function toLast() { if (f.step() !== LAST) f.goto(LAST); else render(LAST, true, 260); }

    // 목표 모습: 점 자리 · 보이기, 선 보이기
    function target(n, teams) {
      const pos = [], sp = split(n), useTeams = teams && sp.t > 1, k = L.R / 118;
      if (!useTeams) for (let i = 0; i < n; i++) { const a = -Math.PI / 2 + (i * 2 * Math.PI) / n; pos.push([L.cx + L.R * Math.cos(a), L.cy + L.R * Math.sin(a)]); }
      else {
        const Rc = L.R * 0.62;
        sp.members.forEach((m, c) => {
          const ac = Math.PI + (c * 2 * Math.PI) / sp.t, ccx = L.cx + Rc * Math.cos(ac), ccy = L.cy + Rc * Math.sin(ac);
          const rc = (m.length <= 1 ? 0 : m.length === 2 ? 30 : m.length === 3 ? 44 : 50) * k;
          m.forEach((i, q) => { const a = ac + Math.PI + (q * 2 * Math.PI) / m.length; pos[i] = [ccx + rc * Math.cos(a), ccy + rc * Math.sin(a)]; });
        });
      }
      const act = (i, j) => i < n && j < n && (!useTeams || sp.team(i) === sp.team(j) || (sp.lead(i) && sp.lead(j)));
      return { n, teams: useTeams, nodes: N.map((_, i) => (i < n ? { x: pos[i][0], y: pos[i][1], o: 1 } : null)), lines: E.map((e) => (act(e.i, e.j) ? 1 : 0)) };
    }
    function draw() {
      N.forEach((nd) => { nd.el.setAttribute("cx", nd.x); nd.el.setAttribute("cy", nd.y); nd.el.style.opacity = String(nd.o); });
      E.forEach((e) => {
        const a = N[e.i], b = N[e.j];
        e.el.setAttribute("x1", a.x); e.el.setAttribute("y1", a.y); e.el.setAttribute("x2", b.x); e.el.setAttribute("y2", b.y);
        e.el.style.opacity = String(e.o * Math.min(a.o, b.o) * (e.isNew ? 0.9 : 0.7));
      });
    }
    function countText(n, teams, shown) {
      const lc = lineCount(n, teams), num = shown ?? lc.total;
      cntNum.textContent = nar ? `소통 길 ${num}개` : `${num}개`;
      cntF.textContent = lc.parts ? `팀 안 ${lc.parts.inner.join(" + ")} + 팀 사이 ${lc.parts.cross}` : `${n} × ${n - 1} ÷ 2`;
    }
    function bars(n, p) {
      const v = Math.min(n, BASE), k = Math.max(0, n - BASE);
      vLab.textContent = `기존 ${v}명`; nLab.textContent = k ? `새 ${k}명` : "새 사람";
      wedge.setAttribute("points", k ? wedgeAt(p) : "");
      show(none, !k, 150); show(rampT, !!k, 150);
    }
    function readoutFor(i, n, teams) {
      const lc = lineCount(n, teams), v = Math.min(n, BASE), k = Math.max(0, n - BASE);
      const who = `<span class="a">기존 ${v}명</span>${k ? ` + <span class="b">새 ${k}명</span>` : ""} = <b>${n}명</b>`;
      const rows = [];
      if (lc.parts) rows.push(`${who} → 팀 ${lc.parts.sizes.length}개(${lc.parts.sizes.join(" + ")}명)로 나누면 소통 길 = 팀 안 ${lc.parts.inner.join(" + ")} + 팀 사이 ${lc.parts.cross} = <b>${lc.total}개</b> <span class="dim">(모두와 모두면 ${pairs(n)}개)</span>`);
      else rows.push(`${who} → 소통 길 ${n} × ${n - 1} ÷ 2 = <b>${lc.total}개</b>${n !== BASE ? ` <span class="dim">(4명일 때 6개의 ${+(lc.total / 6).toFixed(2)}배)</span>` : ""}`);
      if (PLAN[i].bars && k) rows.push(`<span class="b">새 사람</span>이 제 몫을 다 하기까지 약 ${T.ramp === 2 ? "2주" : "한 달"} <span class="dim">(막대는 단순화한 그림이에요)</span>`);
      if (i === 4) rows.push(`<span class="dim">${T.other}</span>`);
      ro.set(rows.map((r) => `<div>${r}</div>`).join(""));
    }

    let gen = 0;
    function render(i, animate, ms = 750) {
      const P = PLAN[i], my = ++gen;
      const n = P.user ? user.n : P.n, teams = P.user ? user.teams : !!P.teams;
      stepNow = i;
      dial.set(n); seg.set(teams ? "teams" : "all");
      show(barG, !!P.bars, animate ? 300 : 0); show(tag1, !!P.tags, animate ? 300 : 0); show(tag2, !!P.tags, animate ? 300 : 0);
      readoutFor(i, n, teams);
      const tg = target(n, teams);
      const from = N.map((nd) => ({ x: nd.x, y: nd.y, o: nd.o })), lf = E.map((e) => e.o);
      // 새로 나타나는 점은 제자리에서 나타나요
      N.forEach((nd, k) => { const to = tg.nodes[k]; if (to && from[k].o < 0.05) { from[k].x = to.x; from[k].y = to.y; } });
      // 2단계: 새로 생기는 길을 하나씩 (세는 숫자도 같이 올라가요)
      const seq = P.grow && animate ? E.map((e, k) => (tg.lines[k] && lf[k] < 0.5 ? k : -1)).filter((k) => k >= 0) : [];
      const seqAt = new Map(seq.map((k, q) => [k, q]));
      const before = E.filter((e, k) => lf[k] >= 0.5 && tg.lines[k]).length;
      const rampFrom = P.rampIn && animate ? 0 : 1;
      if (!animate) ms = 0;
      return anim(seq.length ? Math.max(ms, 1100) : ms, (t) => {
        if (my !== gen) return;
        const tp = seq.length ? clamp(t / 0.45, 0, 1) : t; // 점은 먼저 자리를 잡고, 길은 뒤이어 하나씩
        N.forEach((nd, k) => {
          const a = from[k], b = tg.nodes[k] || { x: a.x, y: a.y, o: 0 };
          nd.x = lerp(a.x, b.x, tp); nd.y = lerp(a.y, b.y, tp); nd.o = lerp(a.o, b.o, tp);
        });
        let shown = 0;
        E.forEach((e, k) => {
          if (seqAt.has(k)) { const q = seqAt.get(k); e.o = clamp((t - 0.4) / 0.6 * (seq.length + 1) - q, 0, 1); }
          else e.o = lerp(lf[k], tg.lines[k], tp);
          if (tg.lines[k] && e.o >= 0.5) shown++;
        });
        draw();
        countText(n, teams, t < 1 ? Math.max(shown, seq.length ? before : 0) : undefined);
        bars(n, P.rampIn && animate ? lerp(rampFrom, 1, t) : 1);
      });
    }
    render(0, false);
    return {
      go(i, animate) { return render(i, animate); },
    };
  },
};
