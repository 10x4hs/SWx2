// 그림: 칸반 — 진행 중인 일(WIP)을 줄이면 한 건이 빨리 끝나요 (Dev Flow 08 일하는 방식 c07)
//   보드: 할 일 → 진행 중 → 리뷰 → 완료. 사람 3명 · 일 15건(만들기 3일 + 리뷰 1일 — 예시 숫자). 정해진 규칙으로 도는 시뮬레이션이라 늘 같은 결과예요.
//   상한은 카드처럼 칸마다: 진행 중 ≤ L(슬라이더) · 리뷰 ≤ 2. 진행 중 칸에 자리가 나면 할 일에서 하나 꺼내 시작하고, 만들기를 끝낸 일은 리뷰 칸에 자리가 나야 넘어가요.
//   사람: 리뷰를 먼저 하고(한 건에 한 명까지), 남은 시간은 만드는 중인 일에 고르게 나눠요. 상한 15 = 상한 없음(리뷰도).
//   아래 줄: 일이 끝난 날(주황 = 상한 없음, 파란 = 상한 있음). 읽기 칸의 평균 WIP · 처리량 · 사이클 타임은 모두 이 시뮬레이션에서 재요 — 리틀의 법칙(사이클 타임 = WIP ÷ 처리량)이 맞는지 같이 보여 줘요.
import { svg, g, text, line, circle, rect, loop, slider, readout, show, reduced, lerp, clamp, C } from "./kit.js";

const P = 3, N = 15, DEV = 3, REV = 1, DT = 0.01, SNAP = 0.1;
const NOLIM = N; // 상한 15 = 상한 없음 (일이 15건뿐이라)
const LR = 2; // 리뷰 칸 상한 (카드의 예)
const cache = new Map();
// 시뮬레이션: 진행 중 상한 L → { frames(0.1일마다 카드 상태), 시작 · 끝난 날, 지표 }
function sim(L) {
  if (cache.has(L)) return cache.get(L);
  const Lr = L >= NOLIM ? N : LR;
  const it = Array.from({ length: N }, (_, k) => ({ k, st: 0, dev: 0, rev: 0, start: null, done: null })); // st: 0 할 일 · 1 진행 중 · 2 리뷰 · 3 완료
  const frames = [];
  let t = 0, wipArea = 0, busy = 0, step = 0;
  const snap = () => frames.push(it.map((i) => [i.st, i.dev / DEV, i.rev / REV]));
  snap();
  while (it.some((i) => i.st !== 3) && t < 300) {
    // 만들기를 끝낸 일 → 리뷰 칸에 자리가 있으면 넘어가요 (먼저 끝낸 순서대로)
    for (const i of it) if (i.st === 1 && i.dev >= DEV - 1e-9 && it.filter((x) => x.st === 2).length < Lr) i.st = 2;
    let doing = it.filter((i) => i.st === 1).length;
    for (const i of it) { if (doing >= L) break; if (i.st === 0) { i.st = 1; i.start = t; doing++; } }
    let cap = P;
    for (const i of it) if (i.st === 2 && cap > 0) { const gv = Math.min(1, cap); i.rev += gv * DT; cap -= gv; }
    const dv = it.filter((i) => i.st === 1 && i.dev < DEV - 1e-9), per = dv.length ? Math.min(1, cap / dv.length) : 0;
    for (const i of dv) i.dev = Math.min(DEV, i.dev + per * DT);
    busy += (P - cap + per * dv.length) * DT; wipArea += it.filter((i) => i.st === 1 || i.st === 2).length * DT;
    t += DT; step++;
    for (const i of it) if (i.st === 2 && i.rev >= REV - 1e-9) { i.st = 3; i.rev = REV; i.done = t; }
    if (step % Math.round(SNAP / DT) === 0) snap();
  }
  snap();
  const T = Math.max(...it.map((i) => i.done)), cyc = it.map((i) => i.done - i.start);
  const out = {
    L, Lr, frames, T, start: it.map((i) => i.start), done: it.map((i) => i.done), cyc,
    thr: N / T, wip: wipArea / T, cycle: cyc.reduce((a, b) => a + b, 0) / N, first: Math.min(...it.map((i) => i.done)), util: busy / (P * T),
  };
  cache.set(L, out);
  return out;
}
const r1 = (v) => +v.toFixed(1), r2 = (v) => +v.toFixed(2);
const days = (v) => `${r1(v)}일`;
const limName = (L) => (L >= NOLIM ? "상한 없음" : `상한 ${L}`);
const limFull = (L) => (L >= NOLIM ? "상한 없음" : `진행 중 ≤ ${L} · 리뷰 ≤ ${LR}`);

function stepsFor() {
  const A = sim(NOLIM), B = sim(3);
  return [
    { cap: `할 일 ${N}건, 팀은 ${P}명이에요. 한 건은 만드는 데 ${DEV}일, 리뷰에 ${REV}일이 걸려요(예시 숫자). 먼저 상한 없이 해 볼게요.`, L: NOLIM, day: 0 },
    { cap: `상한이 없으면 ${N}건을 한꺼번에 시작해서 세 사람이 ${N / P}개씩 들고 있어요. 시간이 쪼개져서 모든 카드가 조금씩만 자라요.`, L: NOLIM, day: 10 },
    { cap: `그래서 ${r1(A.first)}일째에야 처음 끝나고, 거의 한꺼번에 끝나요. 한 건이 시작해서 끝나기까지(사이클 타임) 평균 ${days(A.cycle)}이에요.`, L: NOLIM, day: A.T },
    { cap: `카드처럼 진행 중 3 · 리뷰 2 로 상한을 두면, 칸이 찼을 때 새 일 대신 끝내는 일부터 해요. 첫 결과가 ${r1(B.first)}일째, 사이클 타임은 평균 ${days(B.cycle)}이에요.`, L: 3, day: B.T },
    { cap: `리틀의 법칙: 사이클 타임 = WIP ÷ 처리량. 처리량은 거의 그대로인데(하루 ${r2(A.thr)} → ${r2(B.thr)}건) WIP 가 ${r1(A.wip)} → ${r1(B.wip)}건으로 줄어서 빨라졌어요.`, L: 3, day: B.T, both: 1 },
    { cap: "이제 직접 진행 중 상한을 바꿔 보세요. 아래 숫자는 모두 이 시뮬레이션에서 재요.", user: 1, both: 1 },
  ];
}

export default {
  aspect: 372 / 580,
  aspectNarrow: 404 / 380,
  steps: () => stepsFor().map((s) => s.cap),
  hint: "마지막 단계에서 진행 중 상한을 바꿔 보세요",
  mount(stage, f) {
    const STEPS = stepsFor(), LAST = STEPS.length - 1;
    const nar = !!f.narrow, W = nar ? 380 : 580, H = nar ? 404 : 372;
    const s = svg(stage, W, H, "칸반 보드: 할 일, 진행 중, 리뷰, 완료 칸과 일이 끝난 날");
    const K = nar
      ? { cx: [6, 98, 190, 282], cw: 88, top: 48, cardW: 38, cardH: 18, rowH: 22, gapX: 4, tl: { y0: 268, r1: 296, r2: 338, ax: 372, x0: 82, x1: 360 } }
      : { cx: [10, 150, 290, 430], cw: 130, top: 48, cardW: 56, cardH: 20, rowH: 24, gapX: 6, tl: { y0: 268, r1: 294, r2: 330, ax: 354, x0: 104, x1: 566 } };
    const NAMES = ["할 일", "진행 중", "리뷰", "완료"];
    const colBot = K.top + 8 + 8 * K.rowH + 4;
    const boardG = g(s), cardG = g(s), tlG = g(s), topG = g(s);
    // 칸
    const heads = NAMES.map((nm, c) => {
      rect(boardG, K.cx[c], K.top, K.cw, colBot - K.top, { r: 6, fill: C.soft });
      return text(boardG, K.cx[c] + K.cw / 2, K.top - 10, nm, { size: nar ? 14 : 15, weight: 700, anchor: "middle", fill: C.ink });
    });
    // WIP 묶음 (진행 중 + 리뷰) · 날짜
    const wx0 = K.cx[1], wx1 = K.cx[2] + K.cw;
    line(topG, wx0 + 2, 22, wx1 - 2, 22, { color: C.ink, width: 1.4 });
    line(topG, wx0 + 2, 22, wx0 + 2, 28, { color: C.ink, width: 1.4 }); line(topG, wx1 - 2, 22, wx1 - 2, 28, { color: C.ink, width: 1.4 });
    const wipT = text(topG, (wx0 + wx1) / 2, 11, "", { size: 14, weight: 700, anchor: "middle", fill: C.ink, cls: "halo tab" });
    const dayT = text(topG, W - 8, 11, "", { size: 14, weight: 700, anchor: "end", fill: C.sub, cls: "tab" });
    // 카드 15장
    const cards = Array.from({ length: N }, (_, k) => {
      const gg = g(cardG);
      const r = rect(gg, 0, 0, K.cardW, K.cardH, { r: 4, fill: C.bg, stroke: C.line, sw: 1.2 });
      const t = text(gg, 5, K.cardH / 2 - 1, String(k + 1), { size: nar ? 13 : 14, weight: 700, fill: C.sub, cls: "tab" });
      const barBg = rect(gg, 4, K.cardH - 5, K.cardW - 8, 3, { r: 1.5, fill: C.soft });
      const bar = rect(gg, 4, K.cardH - 5, 0, 3, { r: 1.5, fill: C.a });
      const cy = text(gg, K.cardW - 4, K.cardH / 2 - 1, "", { size: nar ? 12 : 13, weight: 700, anchor: "end", fill: C.a, cls: "tab" });
      return { gg, r, t, barBg, bar, cy, x: K.cx[0] + 4, y: K.top + 8, tx: 0, ty: 0 };
    });
    const slot = (c, q) => [K.cx[c] + K.gapX + (q % 2) * (K.cardW + K.gapX), K.top + 8 + Math.floor(q / 2) * K.rowH];
    // 끝난 날 줄 (두 줄)
    const T0 = K.tl;
    text(tlG, nar ? 6 : 10, T0.y0, "끝난 날", { size: 14, weight: 700, fill: C.ink });
    const rowLab = [text(tlG, nar ? 6 : 10, T0.r1, "상한 없음", { size: 14, weight: 700, fill: C.b }), text(tlG, nar ? 6 : 10, T0.r2, "", { size: 14, weight: 700, fill: C.a })];
    const axisG = g(tlG);
    const dotsA = Array.from({ length: N }, () => circle(tlG, 0, 0, 4, { fill: C.b })), dotsB = Array.from({ length: N }, () => circle(tlG, 0, 0, 4, { fill: C.a }));
    const meanA = line(tlG, 0, 0, 0, 0, { color: C.b, width: 1.6, dash: "3 3" }), meanB = line(tlG, 0, 0, 0, 0, { color: C.a, width: 1.6, dash: "3 3" });
    const nowL = line(tlG, 0, T0.r1 - 16, 0, T0.ax - 6, { color: C.ink, width: 1.2 });

    // ---------- 그리기 ----------
    const ro = readout(f.controls());
    let userL = 3;
    const dial = slider(f.controls(), { label: "진행 중 상한", min: 1, max: NOLIM, value: 3, fmt: (v) => (v >= NOLIM ? "없음" : `${v}건`) }, (v) => { userL = v; if (f.step() !== LAST) f.goto(LAST); else start(LAST, true); });
    let axMax = 20;
    const AX = (d) => T0.x0 + ((T0.x1 - T0.x0) * d) / axMax;
    function axis(max) {
      axMax = max; axisG.replaceChildren();
      line(axisG, T0.x0, T0.ax, T0.x1, T0.ax, { color: C.line, width: 1.2 });
      const stepD = max <= 24 ? 5 : max <= 40 ? 10 : 20;
      for (let d = 0; d <= max + 0.01; d += stepD) { line(axisG, AX(d), T0.ax, AX(d), T0.ax + 4, { color: C.line }); text(axisG, AX(d), T0.ax + 14, `${d}일`, { size: 14, fill: C.mute, anchor: "middle", cls: "tab" }); }
    }
    // 한 줄: 끝난 날마다 점 (같은 날이면 위로 쌓아요) · 평균 사이클 타임이 아니라 '끝난 날' 이에요
    function dotsRow(dots, mean, S, y, upto, on) {
      const seen = new Map();
      dots.forEach((d, k) => {
        const dd = S ? S.done[k] : 0, vis = on && S && dd <= upto + 1e-6;
        d.style.display = vis ? "" : "none"; if (!vis) return;
        const key = Math.round(dd * 2), n = seen.get(key) || 0; seen.set(key, n + 1);
        d.setAttribute("cx", AX(dd)); d.setAttribute("cy", y - n * 8.5 + 6);
      });
      mean.style.display = "none";
    }
    function frameAt(S, day) {
      if (day >= S.T - 1e-9) return S.frames[S.frames.length - 1];
      const k = clamp(day / SNAP + 1e-9, 0, S.frames.length - 1), a = Math.floor(k), b = Math.min(S.frames.length - 1, a + 1), t = k - a;
      return S.frames[a].map((A, i) => { const B = S.frames[b][i]; return A[0] === B[0] ? [A[0], lerp(A[1], B[1], t), lerp(A[2], B[2], t)] : A; });
    }
    function board(S, day, glide) {
      const fr = frameAt(S, day), cnt = [0, 0, 0, 0], col = S.L >= NOLIM ? C.b : C.a, soft = S.L >= NOLIM ? C.bSoft : C.aSoft;
      fr.forEach((st, k) => {
        const c = st[0], q = cnt[c]++, [x, y] = slot(c, q), Cd = cards[k];
        Cd.tx = x; Cd.ty = y;
        if (!glide) { Cd.x = x; Cd.y = y; }
        const prog = c === 1 ? st[1] : c === 2 ? st[2] : c === 3 ? 1 : 0;
        Cd.bar.setAttribute("width", (K.cardW - 8) * prog);
        Cd.bar.style.fill = c === 2 ? C.d : c === 1 && prog >= 1 ? C.mute : col; // 다 만들었는데 리뷰 칸이 차서 기다리면 회색
        Cd.barBg.style.display = Cd.bar.style.display = c === 1 || c === 2 ? "" : "none";
        Cd.r.style.fill = c === 3 ? soft : C.bg; Cd.r.style.stroke = c === 0 ? C.line : c === 3 ? col : C.sub;
        Cd.t.style.fill = c === 0 ? C.mute : C.ink;
        Cd.cy.textContent = c === 3 && !nar ? `${Math.round(S.done[k] - S.start[k])}일` : ""; // 카드에는 반올림한 날수 (정확한 평균은 읽기 칸에)
        Cd.cy.style.fill = col;
      });
      const lim = [null, S.L >= NOLIM ? null : S.L, S.L >= NOLIM ? null : S.Lr, null];
      heads.forEach((h, c) => (h.textContent = lim[c] ? `${NAMES[c]} ${cnt[c]}/${lim[c]}` : `${NAMES[c]} ${cnt[c]}`));
      const wip = cnt[1] + cnt[2];
      wipT.textContent = `WIP(진행 중 + 리뷰) ${wip}건${S.L >= NOLIM ? " · 상한 없음" : ""}`;
      dayT.textContent = `${Math.floor(day + 1e-6)}일째`;
    }
    function glideCards(dt) {
      const k = reduced() ? 1 : clamp(dt / 55, 0, 1);
      cards.forEach((Cd) => { Cd.x = lerp(Cd.x, Cd.tx, k); Cd.y = lerp(Cd.y, Cd.ty, k); Cd.gg.setAttribute("transform", `translate(${Cd.x},${Cd.y})`); });
    }
    // 읽기 칸: 다 끝난 시뮬레이션만 지표를 보여 줘요 (중간에는 지금까지 상황만)
    function readoutFor(Sa, Sb, day, intro) {
      if (intro) { ro.set(`<div>사람 <b>${P}명</b> · 일 <b>${N}건</b> · 한 건 = 만들기 ${DEV}일 + 리뷰 ${REV}일 <span class="dim">(예시 숫자)</span></div><div><span class="dim">규칙: 리뷰를 먼저 하고, 남은 시간은 진행 중인 일에 고르게 나눠요</span></div>`); return; }
      const line1 = (S, cls) => `<span class="${cls}">${limFull(S.L)}</span>: 평균 WIP <b>${r1(S.wip)}건</b> · 처리량 <b>${r2(S.thr)}건/일</b> · 사이클 타임 <b>${days(S.cycle)}</b> <span class="dim">(첫 완료 ${r1(S.first)}일째 · 다 끝남 ${r1(S.T)}일째)</span>`;
      const now = (S, cls) => { const fr = frameAt(S, day), done = fr.filter((x) => x[0] === 3).length, wip = fr.filter((x) => x[0] === 1 || x[0] === 2).length; return `<span class="${cls}">${limFull(S.L)}</span>: ${Math.floor(day)}일째 · 끝난 일 <b>${done}건</b> / ${N} · 지금 WIP <b>${wip}건</b>`; };
      const rows = [], main = Sb || Sa, fin = (S) => S === main ? day >= S.T - 1e-6 : true;
      if (Sa) rows.push(fin(Sa) ? line1(Sa, "b") : now(Sa, "b"));
      if (Sb) rows.push(fin(Sb) ? line1(Sb, "a") : now(Sb, "a"));
      if (fin(main)) {
        rows.push(`리틀의 법칙: 평균 WIP ÷ 처리량 = ${r2(main.wip)} ÷ ${r2(main.thr)} = <b>${days(main.wip / main.thr)}</b> = 평균 사이클 타임 ${days(main.cycle)} ✓`);
        if (main.util < 0.9) rows.push(`<span class="dim">상한이 너무 작으면 노는 사람이 생겨요 — ${P}명이 일한 시간 ${Math.round(main.util * 100)}%</span>`);
      }
      ro.set(rows.map((r) => `<div>${r}</div>`).join(""));
    }
    // ---------- 시간 흐르기 ----------
    let cur = { S: sim(NOLIM), day: 0, to: 0, speed: 0 }, both = false, roKey = "";
    function paintRows() {
      const A = both ? sim(NOLIM) : cur.S.L >= NOLIM ? cur.S : null, B = cur.S.L < NOLIM ? cur.S : null;
      rowLab[1].textContent = B ? limName(B.L) : "";
      const dayA = A === cur.S ? cur.day : A ? A.T : 0;
      dotsRow(dotsA, meanA, A, T0.r1, dayA, !!A);
      dotsRow(dotsB, meanB, B, T0.r2, cur.day, !!B);
      rowLab[0].style.opacity = A ? "1" : "0.35";
      nowL.setAttribute("x1", AX(cur.day)); nowL.setAttribute("x2", AX(cur.day));
      nowL.style.display = cur.day > 0 && cur.day < cur.S.T - 1e-6 ? "" : "none"; // 지금 날짜 (다 끝나면 숨겨요)
    }
    loop(stage, (dt) => {
      if (cur.speed && cur.day < cur.to) {
        cur.day = Math.min(cur.to, cur.day + (dt / 1000) * cur.speed);
        board(cur.S, cur.day, true); paintRows();
        const key = cur.day >= cur.to ? "end" : frameAt(cur.S, cur.day).map((x) => x[0]).join(""); // 카드가 칸을 옮길 때만 읽기 칸을 고쳐요
        if (key !== roKey) { roKey = key; readoutFor(...pair(), cur.day); }
        if (cur.day >= cur.to) cur.speed = 0;
      }
      glideCards(dt);
    });
    function pair() { const A = both || cur.S.L >= NOLIM ? sim(NOLIM) : null, B = cur.S.L < NOLIM ? cur.S : null; return [A, B]; }
    function start(i, animate) {
      const St = STEPS[i], L = St.user ? userL : St.L, S = sim(L);
      both = !!St.both;
      dial.set(L);
      const to = St.user ? S.T : St.day;
      // 같은 시뮬레이션을 이어서 보면 그 자리에서, 아니면 0일부터
      const from = animate && !reduced() && cur.S === S && cur.day <= to ? cur.day : 0;
      axis(Math.max(20, Math.ceil(Math.max(S.T, both ? sim(NOLIM).T : 0) / 5 - 1e-6) * 5));
      cur = { S, day: animate && !reduced() ? from : to, to, speed: 0 };
      board(S, cur.day, false); glideCards(1e9); paintRows();
      const intro = St.day === 0 && !St.user;
      readoutFor(...pair(), cur.day, intro);
      roKey = "";
      if (animate && !reduced() && to > from) cur.speed = Math.max(4, (to - from) / (to - from > 30 ? 4.5 : 3.2)); // 길어도 3~4초쯤
    }
    start(0, false);
    return { go: (i, animate) => start(i, animate) };
  },
};
