// 그림: 에러 버짓 — SLO 가 정한 '실패해도 되는 양'을 장애가 깎아 먹어요 (Dev Flow 11 운영과 장애 — 카드 5 · 6 · 7)
//   위: 가용성 눈금 — SLI(파란 점 · 잰 값) · SLO(검은 선 · 내부 목표) · SLA(보라 · 계약은 SLO 보다 느슨하게).
//   아래: 30일 동안 남은 에러 버짓(검은 선). 장애(빨강)마다 뚝 떨어지고, 0 에 닿으면 미리 서명한 정책대로 출시 동결.
//   예산 = 30 × 24 × 60 × (1 − SLO) 분 — 코드에서 계산해요 (99.5% → 216분, 99.9% → 43.2분). 2시간 장애(120분)는 카드의 예, 작은 장애 · 날짜는 예시.
import { svg, g, text, line, circle, rect, path, el, choice, readout, anim, show, lerp, clamp, C } from "./kit.js";

const MIN30 = 30 * 24 * 60; // 43,200분
const SLOS = [0.99, 0.995, 0.999, 0.9999];
const INC = [ // 가상의 한 달 (2시간 장애만 카드의 숫자)
  { day: 6, min: 120, big: 1 },
  { day: 13, min: 30 },
  { day: 19, min: 15 },
  { day: 25, min: 60 },
];
const RELEASES = [2, 5, 9, 12, 16, 20, 23, 27, 29]; // 출시 계획 (주 2번쯤)
const SECFIX = 28; // 동결 중에도 나가는 보안 수정
const budget = (slo) => MIN30 * (1 - slo);
const pct = (v, d = 2) => `${+(v * 100).toFixed(d)}%`;
const mins = (m) => `${+m.toFixed(m < 10 ? 2 : 1)}분`;
const comma = (n) => n.toLocaleString("ko-KR");

const STEPS = [
  { cap: "SLI 는 재는 값(5분 안에 성공한 요약 비율), SLO 는 지키려는 내부 목표(30일 99.5%), SLA 는 고객과의 계약이에요. SLA 는 SLO 보다 느슨하게 잡아요.", day: 0, scaleOnly: 1, sliDay: 11 },
  { cap: "에러 버짓은 1 − SLO 예요. 30일은 43,200분이라, 99.5% 면 0.5% 인 216분까지는 실패해도 돼요.", day: 0, noSli: 1 },
  { cap: "두런의 2시간 장애는 216분 중 120분을 한 번에 썼어요. 96분이 남았으니 출시는 계속해요.", day: 11 },
  { cap: "작은 장애가 쌓여 예산이 바닥나면, 미리 서명한 정책대로 P0 · 보안 수정이 아닌 출시를 멈춰요.", day: 30 },
  { cap: "이제 직접 SLO 를 골라 보세요. 목표가 높을수록 예산이 작아져서, 같은 장애에도 더 빨리 멈춰요.", day: 30, user: 1 },
];
const LAST = STEPS.length - 1;

export default {
  aspect: 380 / 580,
  aspectNarrow: 470 / 380,
  steps: STEPS.map((s) => s.cap),
  hint: "마지막 단계에서 SLO 를 골라 보세요",
  mount(stage, f) {
    const nar = !!f.narrow, W = nar ? 380 : 580, H = nar ? 470 : 380;
    const s = svg(stage, W, H, "SLI, SLO, SLA 눈금과 30일 동안 남은 에러 버짓 그래프");
    const L = nar
      ? { ax0: 26, ax1: 360, sloY: 22, axY: 58, sliY: 97, cx0: 52, cx1: 362, cy0: 160, cyZ: 354, cy1: 404, relY: 450, dayY: 420 }
      : { ax0: 64, ax1: 560, sloY: 22, axY: 56, sliY: 95, cx0: 64, cx1: 560, cy0: 136, cyZ: 286, cy1: 316, relY: 360, dayY: 332 };
    const FLOOR = -((L.cy1 - L.cyZ) / (L.cyZ - L.cy0)); // 바닥 아래로 보여 주는 만큼 (예산의 몇 배)
    const X = (d) => L.cx0 + ((L.cx1 - L.cx0) * d) / 30;
    const Y = (p) => L.cyZ - (L.cyZ - L.cy0) * Math.max(FLOOR, p);

    // ---------- 가용성 눈금 (SLI · SLO · SLA) ----------
    const scG = g(s);
    const axL = text(scG, L.ax0, L.axY + 19, "", { size: 14, fill: C.mute, cls: "tab" });
    text(scG, L.ax1, L.axY + 19, "100%", { size: 14, fill: C.mute, anchor: "end", cls: "tab" });
    const slaZ = rect(scG, 0, L.axY - 9, 0, 18, { r: 3, fill: C.dSoft });
    const slaT = text(scG, 0, L.axY - 20, "← SLA(계약)는 이쪽: 더 느슨하게", { size: 14, weight: 700, fill: C.d, cls: "halo" });
    line(scG, L.ax0, L.axY, L.ax1, L.axY, { color: C.line, width: 1.6 });
    const sloL = line(scG, 0, L.axY - 16, 0, L.axY + 16, { color: C.ink, width: 2.6 });
    const sloT = text(scG, 0, L.sloY, "", { size: 15, weight: 700, fill: C.ink, anchor: "middle" });
    const sliC = circle(scG, 0, L.axY, 7, { fill: C.a, stroke: C.bg, sw: 2.5 });
    const sliT = text(scG, 0, L.sliY, "", { size: 15, weight: 700, fill: C.a, anchor: "middle", cls: "halo tab" });

    // ---------- 남은 에러 버짓 (30일) ----------
    const chG = g(s);
    const overR = rect(chG, L.cx0, L.cyZ, L.cx1 - L.cx0, L.cy1 - L.cyZ, { r: 0, fill: C.bSoft });
    overR.style.opacity = "0.55";
    const frzR = rect(chG, 0, L.cy0 - 10, 0, L.cy1 - L.cy0 + 10, { r: 0, fill: C.no });
    frzR.style.fillOpacity = "0.09";
    const frzT = text(chG, 0, L.cy0 + 6, "출시 동결", { size: 15, weight: 700, fill: C.no, anchor: "middle", cls: "halo" });
    for (const p of [1, 0.5]) line(chG, L.cx0, Y(p), L.cx1, Y(p), { color: C.grid, dash: p === 1 ? null : "3 4" });
    line(chG, L.cx0, L.cyZ, L.cx1, L.cyZ, { color: C.sub, width: 1.8 });
    text(chG, L.cx0 - 6, Y(1), "100%", { size: 14, fill: C.mute, anchor: "end", cls: "tab" });
    text(chG, L.cx0 - 6, Y(0.5), "50%", { size: 14, fill: C.mute, anchor: "end", cls: "tab" });
    text(chG, L.cx0 - 6, L.cyZ, "0", { size: 14, weight: 700, fill: C.ink, anchor: "end", cls: "tab" });
    const bT = text(chG, L.cx0, L.cy0 - 22, "", { size: 14, weight: 700, fill: C.ink, cls: "tab" });
    for (const d of [0, 10, 20, 30]) text(chG, X(d), L.dayY, `${d}일`, { size: 14, fill: C.mute, anchor: "middle", cls: "tab" });
    const burn = path(chG, "", { stroke: C.ink, width: 3 });
    const incG = g(chG);
    const incs = INC.map((I) => {
      const gg = g(incG);
      const ln = line(gg, X(I.day), 0, X(I.day), 0, { color: C.no, width: 2.6 });
      const t = text(gg, X(I.day) + 6, 0, I.big ? "2시간 장애 120분" : `${I.min}분`, { size: 14, weight: 700, fill: C.no, cls: "halo" });
      return { gg, ln, t, I };
    });
    const nowC = circle(chG, 0, 0, 5, { fill: C.ink, stroke: C.bg, sw: 2 });
    // 출시 줄: ▲ 나감 · ✕ 동결로 못 나감 · 보안 수정은 예외
    const relG = g(s);
    text(relG, nar ? 8 : 8, L.relY, "출시", { size: 14, weight: 700, fill: C.sub });
    const rels = RELEASES.map((d) => {
      const gg = g(relG), x = X(d), y = L.relY;
      const tri = path(gg, `M${x - 6},${y + 5} L${x},${y - 6} L${x + 6},${y + 5} Z`, { stroke: C.c, width: 1.5 });
      tri.style.fill = C.c;
      const x1 = path(gg, `M${x - 5},${y - 5} L${x + 5},${y + 5} M${x + 5},${y - 5} L${x - 5},${y + 5}`, { stroke: C.mute, width: 2.2 });
      return { gg, tri, x1, d };
    });
    const sec = g(relG), sx = X(SECFIX);
    const secTri = path(sec, `M${sx - 6},${L.relY + 5} L${sx},${L.relY - 6} L${sx + 6},${L.relY + 5} Z`, { stroke: C.d, width: 1.5 });
    secTri.style.fill = C.d;
    const secT = text(sec, sx, L.relY - 16, "보안 수정", { size: 14, weight: 700, fill: C.d, anchor: "middle", cls: "halo" });

    // ---------- 계산 ----------
    const ro = readout(f.controls());
    let userSlo = 0.995;
    const seg = choice(f.controls(), SLOS.map((v) => [String(v), pct(v)]), "0.995", (k) => { userSlo = Number(k); if (f.step() !== LAST) f.goto(LAST); else render(LAST, true); }, "SLO");
    function model(slo, day) {
      const B = budget(slo), seen = INC.filter((I) => I.day <= day), used = seen.reduce((a, I) => a + I.min, 0);
      let acc = 0, freeze = null;
      for (const I of INC) { acc += I.min; if (acc >= B && freeze == null) freeze = I.day; }
      const frz = freeze != null && freeze <= day ? freeze : null;
      return { B, seen, used, left: B - used, sli: 1 - used / MIN30, freeze: frz, freezeAll: freeze };
    }
    // 그리기: day 까지 보여 줘요 (k: 0→1 로 선을 늘려 그릴 때)
    function draw(slo, day, scaleOnly, sliDay, noSli) {
      const M = model(slo, day), B = M.B, MS = sliDay != null ? model(slo, sliDay) : M;
      // 눈금: 왼쪽 끝 = SLO − 3 × (1 − SLO)
      const lo = slo - 3 * (1 - slo), ax = (v) => L.ax0 + ((L.ax1 - L.ax0) * (clamp(v, lo, 1) - lo)) / (1 - lo);
      axL.textContent = pct(lo, 2);
      const xs = ax(slo);
      sloL.setAttribute("x1", xs); sloL.setAttribute("x2", xs);
      sloT.setAttribute("x", clamp(xs, L.ax0 + 60, L.ax1 - 60)); sloT.textContent = `SLO ${pct(slo)} · 목표`;
      slaZ.setAttribute("x", L.ax0); slaZ.setAttribute("width", Math.max(0, xs - L.ax0 - 3));
      slaT.setAttribute("x", L.ax0 + 8);
      const xi = ax(MS.sli), off = MS.sli < lo;
      sliC.setAttribute("cx", xi); sliT.setAttribute("x", clamp(xi, L.ax0 + 62, L.ax1 - 62));
      sliT.textContent = `${off ? "◀ " : ""}SLI ${pct(MS.sli)} · 잰 값`;
      sliC.style.fill = MS.sli < slo ? C.no : C.a; sliT.style.fill = MS.sli < slo ? C.no : C.a;
      show(sliC, !noSli, 200); show(sliT, !noSli, 200);
      // 그래프
      chG.style.opacity = relG.style.opacity = scaleOnly ? "0.22" : "1"; // 첫 단계: 그래프는 흐리게 (곧 나올 자리)
      let d = `M${X(0)},${Y(1)}`, cur = B;
      for (const I of INC) { if (I.day > day) break; d += ` H${X(I.day)} V${Y((cur - I.min) / B)}`; cur -= I.min; }
      d += ` H${X(day)}`;
      burn.setAttribute("d", d);
      nowC.setAttribute("cx", X(day)); nowC.setAttribute("cy", Y(cur / B));
      incs.forEach((o) => {
        const on = o.I.day <= day; o.gg.style.display = on ? "" : "none"; if (!on) return;
        const before = B - INC.filter((J) => J.day < o.I.day).reduce((a, J) => a + J.min, 0);
        const y1 = Y(before / B), y2 = Y((before - o.I.min) / B);
        o.ln.setAttribute("y1", y1); o.ln.setAttribute("y2", y2);
        const ty = Math.max(L.cy0 + 24, y2 - y1 < 26 ? y1 - 12 : (y1 + y2) / 2); // 작게 떨어지면 선 위에
        o.t.setAttribute("y", ty);
        o.t.style.display = y1 >= Y(FLOOR) - 0.5 ? "none" : ""; // 이미 바닥 밑이면 이름은 읽기 칸에서
        const right = X(o.I.day) + (o.I.big ? 132 : 46) < L.cx1; o.t.setAttribute("x", right ? X(o.I.day) + 7 : X(o.I.day) - 7); o.t.setAttribute("text-anchor", right ? "start" : "end");
      });
      // 동결
      const fz = M.freeze;
      show(frzR, fz != null, 200); show(frzT, fz != null, 200);
      if (fz != null) { frzR.setAttribute("x", X(fz)); frzR.setAttribute("width", X(30) - X(fz)); frzT.setAttribute("x", Math.min((X(fz) + X(30)) / 2, L.cx1 - 36)); }
      rels.forEach((R) => {
        const on = R.d <= day, blocked = fz != null && R.d > fz;
        R.gg.style.display = on ? "" : "none";
        R.tri.style.display = blocked ? "none" : ""; R.x1.style.display = blocked ? "" : "none";
      });
      sec.style.display = fz != null && SECFIX <= day ? "" : "none";
      bT.textContent = `남은 에러 버짓 — ${mins(B)} 중 ${M.left >= 0 ? `${mins(M.left)}` : `0 (${mins(-M.left)} 초과)`}`;
      return M;
    }
    function readoutFor(slo, M, i) {
      const S = STEPS[i], B = M.B;
      if (S.scaleOnly) {
        const MS = model(slo, S.sliDay);
        ro.set(`<div><span class="a">SLI</span> 재는 값: 요약 요청 중 5분 안에 성공한 비율 <span class="dim">(예: 2시간 장애가 있던 달 = 1 − 120 ÷ ${comma(MIN30)} = ${pct(MS.sli)})</span></div><div><b>SLO</b> 내부 목표: 30일 ${pct(slo)} · <span class="d">SLA</span> 고객과의 계약: SLO 보다 느슨하게, 못 지키면 크레딧 같은 결과가 따라요</div>`);
        return;
      }
      const rows = [`<div>30일 = ${comma(MIN30)}분 · 에러 버짓 = ${comma(MIN30)} × (1 − ${pct(slo)}) = <b>${mins(B)}</b> <span class="dim">(하루로 치면 약 ${B / 30 >= 1 ? `${+(B / 30).toFixed(1)}분` : `${Math.round((B / 30) * 60)}초`})</span></div>`];
      const big = INC[0];
      if (M.seen.includes(big) && big.min > B) rows.push(`<div>2시간 장애 하나(120분)가 예산의 <b>${+(big.min / B).toFixed(1)}배</b> — 그날 바로 바닥나요</div>`);
      if (M.seen.length) rows.push(`<div>쓴 시간: ${M.seen.length > 1 ? `${M.seen.map((I) => I.min).join(" + ")} = ` : ""}${M.used}분 → 남은 예산 <b>${M.left >= 0 ? mins(M.left) : `−${mins(-M.left)}`}</b> <span class="dim">(${M.left >= 0 ? `${pct(M.left / B, 0)} 남음` : "바닥"})</span></div>`);
      if (M.seen.length) rows.push(`<div><span class="a">SLI</span> = 1 − ${M.used} ÷ ${comma(MIN30)} = <b>${pct(M.sli)}</b> ${M.sli >= slo ? `≥ SLO ${pct(slo)} → <b>출시 계속</b>` : `< SLO ${pct(slo)} → <b style="color:var(--fg-no)">출시 동결</b> <span class="dim">(P0 · 보안 수정만 나가요)</span>`}</div>`);
      else rows.push(`<div><span class="dim">아직 장애가 없어요 — 예산이 남아 있으면 위험을 감수하고 내보내요</span></div>`);
      if (i >= 3) rows.push(`<div><span class="dim">2시간 장애(120분)는 카드의 예, 작은 장애와 날짜는 예시예요</span></div>`);
      ro.set(rows.join(""));
    }
    let gen = 0, curDay = 0;
    async function render(i, animate) {
      const S = STEPS[i], my = ++gen, slo = S.user ? userSlo : 0.995;
      seg.set(String(slo));
      const from = S.user || !animate ? S.day : Math.min(curDay, S.day);
      if (!animate || from >= S.day) { curDay = S.day; const M = draw(slo, S.day, S.scaleOnly, S.sliDay, S.noSli); readoutFor(slo, M, i); return; }
      // 선을 앞으로 늘려 그려요 (시간이 흘러요)
      readoutFor(slo, model(slo, from), i);
      await anim(Math.min(2600, 90 * (S.day - from) + 400), (t) => { if (my !== gen) return; curDay = lerp(from, S.day, t); draw(slo, curDay, S.scaleOnly, S.sliDay, S.noSli); }, (t) => t);
      if (my !== gen) return;
      curDay = S.day; const M = draw(slo, S.day, S.scaleOnly, S.sliDay, S.noSli); readoutFor(slo, M, i);
    }
    render(0, false);
    return { go: (i, animate) => render(i, animate) };
  },
};
