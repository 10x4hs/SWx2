// 경영 마이크로디그리 — 카드 그림. 전부 멈춰 있는 2D 예요 (3D · 회전 · 저절로 움직이는 그림 없음).
// renderVisual(v) → { html, wire(el) → stop?, context() → "지금 값 한 줄" (AI 튜터에게 넘겨요) }
// 움직이는 건 병목(bottleneck) 하나 — 버튼을 누를 때만 1초 동안 흘러요.
import { esc } from "../util.js";

const won = (n) => (n < 0 ? "−" : "") + Math.abs(Math.round(n)).toLocaleString("ko-KR");
const f1 = (n) => (Math.round(n * 10) / 10).toString();
const REDUCED = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---------- 공통: 축 ----------
// 그림 좌표: 왼쪽 64 · 오른쪽 W-24 · 위 20 · 아래 H-40
function frame(W, H) {
  const X0 = 64, X1 = W - 24, Y0 = 20, Y1 = H - 40;
  return { W, H, X0, X1, Y0, Y1 };
}
function axes(F, { xTicks = [], yTicks = [], xLabel = "", yLabel = "" }) {
  const g = [`<rect class="k-ax" x="${F.X0}" y="${F.Y0}" width="${F.X1 - F.X0}" height="${F.Y1 - F.Y0}" fill="none"/>`];
  for (const t of xTicks) g.push(`<line class="k-gd" x1="${f1(t.x)}" y1="${F.Y0}" x2="${f1(t.x)}" y2="${F.Y1}"/><text class="k-tk" x="${f1(t.x)}" y="${F.Y1 + 18}" text-anchor="middle">${esc(t.label)}</text>`);
  for (const t of yTicks) g.push(`<line class="k-gd" x1="${F.X0}" y1="${f1(t.y)}" x2="${F.X1}" y2="${f1(t.y)}"/><text class="k-tk" x="${F.X0 - 8}" y="${f1(t.y + 4)}" text-anchor="end">${esc(t.label)}</text>`);
  if (xLabel) g.push(`<text class="k-al" x="${F.X1}" y="${F.H - 4}" text-anchor="end">${esc(xLabel)} →</text>`);
  if (yLabel) g.push(`<text class="k-al" x="${F.X0}" y="12">${esc(yLabel)} ↑</text>`);
  return g.join("");
}
const svg = (F, inner, label) => `<svg class="mbc" viewBox="0 0 ${F.W} ${F.H}" role="img" aria-label="${esc(label)}">${inner}</svg>`;
const pts = (a) => a.map((p) => f1(p[0]) + "," + f1(p[1])).join(" ");
const path = (a) => (a.length ? "M" + a.map((p) => f1(p[0]) + "," + f1(p[1])).join(" L") : "");
function niceTicks(max, n = 4) {
  const raw = max / n, mag = Math.pow(10, Math.floor(Math.log10(raw || 1))), step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) || raw;
  const out = []; for (let v = 0; v <= max + 1e-9; v += step) out.push(v); return out;
}
const short = (n) => (Math.abs(n) >= 1e8 ? f1(n / 1e8) + "억" : Math.abs(n) >= 1e4 ? f1(n / 1e4) + "만" : String(Math.round(n)));

// ---------- 이익 지도: 가로 가격 · 세로 판매량 · 흰 선 = 손익분기 ----------
function profitMap(p) {
  const P = { v: 1200, fixed: 120000, price: 4500, qty: 100, pMin: 2000, pMax: 7000, qMax: 200, unit: "잔", ...p };
  const S = { price: P.price, qty: P.qty, fixed: P.fixed };
  const F = frame(760, 400);
  const xOf = (x) => F.X0 + (x - P.pMin) / (P.pMax - P.pMin) * (F.X1 - F.X0);
  const yOf = (q) => F.Y1 - Math.max(0, Math.min(P.qMax, q)) / P.qMax * (F.Y1 - F.Y0);
  const line = (target) => {
    const need = S.fixed + target, start = Math.max(P.pMin, P.v + need / P.qMax), a = [];
    if (start >= P.pMax) return { a, top: true };
    const step = (P.pMax - P.pMin) / 200;
    for (let x = start; x < P.pMax; x += step) a.push([xOf(x), yOf(need / (x - P.v))]);
    a.push([xOf(P.pMax), yOf(need / (P.pMax - P.v))]);
    return { a, top: start > P.pMin };
  };
  const xTicks = [], yTicks = [];
  const xs = (P.pMax - P.pMin) / 5;
  for (let i = 0; i <= 5; i++) xTicks.push({ x: xOf(P.pMin + xs * i), label: won(P.pMin + xs * i) });
  for (const q of niceTicks(P.qMax)) yTicks.push({ y: yOf(q), label: String(q) });
  const fig = () => {
    const be = line(0), l1 = line(200000), l2 = line(400000);
    const unit = S.price - P.v, profit = unit * S.qty - S.fixed;
    const dx = xOf(S.price), dy = yOf(S.qty), right = dx > F.X1 - 180, low = dy < F.Y0 + 36;
    const lab = (l, t, cls) => (l.a.length ? `<text class="${cls}" x="${F.X1 - 8}" y="${f1(l.a[l.a.length - 1][1] - 10)}" text-anchor="end">${t}</text>` : "");
    return svg(F, `
      <polygon class="k-rg-loss" points="${pts([[F.X0, F.Y1], [F.X1, F.Y1]].concat(be.a.slice().reverse(), be.top ? [[F.X0, F.Y0]] : []))}"/>
      <polygon class="k-rg-gain" points="${pts(be.a.concat([[F.X1, F.Y0]], be.top ? [] : [[F.X0, F.Y0]]))}"/>
      ${axes(F, { xTicks, yTicks, xLabel: "가격 (원)", yLabel: `하루 판매량 (${P.unit})` })}
      <path class="k-iso" d="${path(l2.a)}"/><path class="k-iso" d="${path(l1.a)}"/><path class="k-be" d="${path(be.a)}"/>
      ${lab(l2, "이익 40만 원", "k-lb acc")}${lab(l1, "이익 20만 원", "k-lb acc")}${lab(be, "손익분기 (이익 0)", "k-lb")}
      <text class="k-rl gain" x="${F.X1 - 14}" y="${F.Y0 + 26}" text-anchor="end">이익</text>
      <text class="k-rl loss" x="${F.X0 + 14}" y="${F.Y1 - 14}">손실</text>
      <line class="k-cross" x1="${f1(dx)}" y1="${f1(dy)}" x2="${f1(dx)}" y2="${F.Y1}"/><line class="k-cross" x1="${F.X0}" y1="${f1(dy)}" x2="${f1(dx)}" y2="${f1(dy)}"/>
      <circle class="k-dot ${profit < 0 ? "neg" : ""}" cx="${f1(dx)}" cy="${f1(dy)}" r="7"/>
      <text class="k-lb big" x="${f1(right ? dx - 14 : dx + 14)}" y="${f1(low ? dy + 24 : dy - 14)}" text-anchor="${right ? "end" : "start"}">지금 ${won(profit)}원</text>`,
      `가로축 가격 ${won(P.pMin)}~${won(P.pMax)}원, 세로축 하루 판매량 0~${P.qMax}${P.unit}. 흰 곡선이 손익분기선이고 위쪽이 이익, 아래쪽이 손실이에요. 지금 가격 ${won(S.price)}원, ${S.qty}${P.unit}이면 이익 ${won(profit)}원이에요.`);
  };
  const read = () => {
    const unit = S.price - P.v, profit = unit * S.qty - S.fixed, be = unit > 0 ? Math.ceil(S.fixed / unit) : null;
    let verdict;
    if (unit <= 0) verdict = "가격이 변동비보다 낮아서, 팔수록 손해가 커져요. 판매량을 아무리 늘려도 본전이 안 돼요.";
    else if (profit < 0) verdict = `지금은 하루 ${won(-profit)}원 손해예요. 본전이 되려면 하루 ${be}${P.unit}이 필요한데, 지금은 ${S.qty}${P.unit}이에요.`;
    else verdict = `하루 ${won(profit)}원 이익이에요. 본전(${be}${P.unit})보다 ${S.qty - be}${P.unit} 더 팔고 있어요.`;
    return { unit, profit, be, verdict };
  };
  const slider = (k, label, min, max, step, fmt) => `<label class="mbc-sl"><span class="mbc-sl-k">${label}</span><output data-o="${k}">${fmt(S[k])}</output><input type="range" min="${min}" max="${max}" step="${step}" value="${S[k]}" data-k="${k}" aria-label="${label}"></label>`;
  const readHtml = () => { const r = read(); return `<div><dt>한 ${esc(P.unit)}당 남는 돈</dt><dd>${won(r.unit)}원</dd></div><div><dt>하루 이익</dt><dd class="${r.profit < 0 ? "neg" : "pos"}">${won(r.profit)}원</dd></div><div><dt>손익분기 판매량</dt><dd>${r.be ? r.be + esc(P.unit) : "없음"}</dd></div>`; };
  const html = `<div class="mbc-fig" data-fig>${fig()}</div>
    <div class="mbc-sls">${slider("price", "가격", P.pMin, P.pMax, 100, (v) => won(v) + "원")}${slider("qty", "하루 판매량", 0, P.qMax, 5, (v) => v + P.unit)}${slider("fixed", "하루 고정비", Math.round(P.fixed / 2), P.fixed * 2, 10000, (v) => won(v) + "원")}</div>
    <dl class="mbc-read" data-read>${readHtml()}</dl><p class="mbc-verdict" data-verdict>${esc(read().verdict)}</p>`;
  return {
    html,
    wire(el) {
      const on = (e) => {
        const k = e.target.dataset.k; if (!k) return;
        S[k] = Number(e.target.value);
        const o = el.querySelector(`[data-o="${k}"]`); if (o) o.textContent = k === "qty" ? S[k] + P.unit : won(S[k]) + "원";
        el.querySelector("[data-fig]").innerHTML = fig();
        el.querySelector("[data-read]").innerHTML = readHtml();
        el.querySelector("[data-verdict]").textContent = read().verdict;
      };
      el.addEventListener("input", on);
      return () => el.removeEventListener("input", on);
    },
    context() { const r = read(); return `가격 ${won(S.price)}원 · 하루 ${S.qty}${P.unit} · 고정비 ${won(S.fixed)}원 · 변동비 ${won(P.v)}원 → 한 ${P.unit}당 남는 돈 ${won(r.unit)}원, 하루 이익 ${won(r.profit)}원, 손익분기 ${r.be ? r.be + P.unit : "없음"}`; },
  };
}

// ---------- 손익분기: 판매량에 따라 매출선 · 총비용선 ----------
function breakEven(p) {
  const P = { price: 4500, v: 1200, fixed: 120000, qMax: 80, unit: "잔", ...p };
  const F = frame(640, 340), maxY = Math.max(P.price * P.qMax, P.fixed + P.v * P.qMax) * 1.05;
  const xOf = (q) => F.X0 + q / P.qMax * (F.X1 - F.X0), yOf = (v) => F.Y1 - v / maxY * (F.Y1 - F.Y0);
  const qb = P.price > P.v ? P.fixed / (P.price - P.v) : null;
  const xTicks = niceTicks(P.qMax).map((q) => ({ x: xOf(q), label: q + P.unit })), yTicks = niceTicks(maxY).map((v) => ({ y: yOf(v), label: short(v) }));
  const rev = [[xOf(0), yOf(0)], [xOf(P.qMax), yOf(P.price * P.qMax)]], cost = [[xOf(0), yOf(P.fixed)], [xOf(P.qMax), yOf(P.fixed + P.v * P.qMax)]];
  const inner = `
    ${qb && qb < P.qMax ? `<polygon class="k-rg-gain" points="${pts([[xOf(qb), yOf(P.price * qb)], [xOf(P.qMax), yOf(P.price * P.qMax)], [xOf(P.qMax), yOf(P.fixed + P.v * P.qMax)]])}"/><polygon class="k-rg-loss" points="${pts([[xOf(0), yOf(0)], [xOf(qb), yOf(P.price * qb)], [xOf(0), yOf(P.fixed)]])}"/>` : ""}
    ${axes(F, { xTicks, yTicks, xLabel: "하루 판매량", yLabel: "원" })}
    <line class="k-fixed" x1="${F.X0}" y1="${f1(yOf(P.fixed))}" x2="${F.X1}" y2="${f1(yOf(P.fixed))}"/>
    <path class="k-be" d="${path(cost)}"/><path class="k-acc-line" d="${path(rev)}"/>
    <text class="k-lb acc" x="${F.X1 - 8}" y="${f1(yOf(P.price * P.qMax) - 10)}" text-anchor="end">매출</text>
    <text class="k-lb" x="${F.X1 - 8}" y="${f1(yOf(P.fixed + P.v * P.qMax) + 20)}" text-anchor="end">총비용 = 고정비 + 변동비</text>
    <text class="k-lb dim" x="${F.X0 + 8}" y="${f1(yOf(P.fixed) - 8)}">고정비 ${won(P.fixed)}원</text>
    ${qb && qb < P.qMax ? `<circle class="k-dot" cx="${f1(xOf(qb))}" cy="${f1(yOf(P.price * qb))}" r="6"/><text class="k-lb big" x="${f1(xOf(qb) + 12)}" y="${f1(yOf(P.price * qb) + 22)}">손익분기 ${Math.ceil(qb)}${P.unit}</text>` : ""}`;
  return { html: `<div class="mbc-fig">${svg(F, inner, `판매량에 따른 매출선과 총비용선. 두 선이 만나는 ${qb ? Math.ceil(qb) + P.unit : "곳"}이 손익분기점이에요.`)}</div>` };
}

// ---------- 맞바꿈 곡선 (기회비용) ----------
function ppf(p) {
  const P = { x: "X", y: "Y", points: [[0, 100], [40, 90], [70, 65], [90, 35], [100, 0]], mark: null, ...p };
  const F = frame(600, 340), mx = Math.max(...P.points.map((q) => q[0])) * 1.08, my = Math.max(...P.points.map((q) => q[1])) * 1.08;
  const xOf = (v) => F.X0 + v / mx * (F.X1 - F.X0), yOf = (v) => F.Y1 - v / my * (F.Y1 - F.Y0);
  // 점들을 부드럽게 (Catmull-Rom → 베지어)
  const a = P.points.map((q) => [xOf(q[0]), yOf(q[1])]);
  let d = `M${f1(a[0][0])},${f1(a[0][1])}`;
  for (let i = 0; i < a.length - 1; i++) {
    const p0 = a[i - 1] || a[i], p1 = a[i], p2 = a[i + 1], p3 = a[i + 2] || p2;
    d += ` C${f1(p1[0] + (p2[0] - p0[0]) / 6)},${f1(p1[1] + (p2[1] - p0[1]) / 6)} ${f1(p2[0] - (p3[0] - p1[0]) / 6)},${f1(p2[1] - (p3[1] - p1[1]) / 6)} ${f1(p2[0])},${f1(p2[1])}`;
  }
  let mark = "";
  if (Array.isArray(P.mark) && P.mark.length === 2) {
    const [m1, m2] = P.mark, A = [xOf(m1[0]), yOf(m1[1])], B = [xOf(m2[0]), yOf(m2[1])];
    mark = `<path class="k-cross" d="M${f1(A[0])},${f1(A[1])} L${f1(B[0])},${f1(A[1])} L${f1(B[0])},${f1(B[1])}"/>
      <circle class="k-dot" cx="${f1(A[0])}" cy="${f1(A[1])}" r="6"/><circle class="k-dot" cx="${f1(B[0])}" cy="${f1(B[1])}" r="6"/>
      <text class="k-lb" x="${f1((A[0] + B[0]) / 2)}" y="${f1(A[1] - 10)}" text-anchor="middle">${esc(P.x)} +${m2[0] - m1[0]}</text>
      <text class="k-lb acc" x="${f1(B[0] + 10)}" y="${f1((A[1] + B[1]) / 2 + 4)}">${esc(P.y)} −${m1[1] - m2[1]} (기회비용)</text>`;
  }
  const inner = `${axes(F, { xLabel: P.x, yLabel: P.y })}<path class="k-acc-line" d="${d}" fill="none"/>${mark}`;
  return { html: `<div class="mbc-fig">${svg(F, inner, `${P.x}를 더 만들면 ${P.y}를 덜 만들어야 하는 맞바꿈 곡선이에요.`)}</div>` };
}

// ---------- 수요 · 공급 ----------
function supplyDemand(p) {
  const P = { shift: null, x: "양", y: "가격", ...p };
  const F = frame(600, 340), W = F.X1 - F.X0, H = F.Y1 - F.Y0;
  const at = (fx, fy) => [F.X0 + fx * W, F.Y1 - fy * H];
  const D = (o = 0) => [at(0.06 + o, 0.92), at(0.94 + o, 0.12)], S = (o = 0) => [at(0.06 + o, 0.1), at(0.94 + o, 0.9)];
  const cross = (a, b) => { // 두 선분의 교점
    const [p1, p2] = a, [p3, p4] = b, d = (p1[0] - p2[0]) * (p3[1] - p4[1]) - (p1[1] - p2[1]) * (p3[0] - p4[0]);
    const t = ((p1[0] - p3[0]) * (p3[1] - p4[1]) - (p1[1] - p3[1]) * (p3[0] - p4[0])) / d;
    return [p1[0] + t * (p2[0] - p1[0]), p1[1] + t * (p2[1] - p1[1])];
  };
  const e0 = cross(D(), S());
  // 옮겨 간 선은 그림 틀 안에서 잘라요 (Liang–Barsky)
  const clip = ([a, b]) => {
    let t0 = 0, t1 = 1; const dx = b[0] - a[0], dy = b[1] - a[1];
    for (const [p, q] of [[-dx, a[0] - F.X0], [dx, F.X1 - a[0]], [-dy, a[1] - F.Y0], [dy, F.Y1 - a[1]]]) {
      if (p === 0) { if (q < 0) return null; continue; }
      const r = q / p; if (p < 0) { if (r > t1) return null; if (r > t0) t0 = r; } else { if (r < t0) return null; if (r < t1) t1 = r; }
    }
    return [[a[0] + t0 * dx, a[1] + t0 * dy], [a[0] + t1 * dx, a[1] + t1 * dy]];
  };
  let extra = "", e1 = null;
  if (P.shift === "demand-right") { const L = clip(D(0.18)); e1 = cross(D(0.18), S()); if (L) extra = `<path class="k-iso" d="${path(L)}"/><text class="k-lb dim" x="${f1(L[1][0] - 6)}" y="${f1(L[1][1] - 10)}" text-anchor="end">수요 ↑</text>`; }
  if (P.shift === "supply-left") { const L = clip(S(-0.18)); e1 = cross(D(), S(-0.18)); if (L) extra = `<path class="k-iso" d="${path(L)}"/><text class="k-lb dim" x="${f1(L[1][0] - 6)}" y="${f1(L[1][1] + 18)}" text-anchor="end">공급 ↓</text>`; }
  const inner = `${axes(F, { xLabel: P.x, yLabel: P.y })}
    <path class="k-be" d="${path(D())}"/><path class="k-acc-line" d="${path(S())}"/>${extra}
    <text class="k-lb" x="${f1(D()[1][0] - 4)}" y="${f1(D()[1][1] - 10)}" text-anchor="end">수요</text>
    <text class="k-lb acc" x="${f1(S()[1][0] - 4)}" y="${f1(S()[1][1] - 10)}" text-anchor="end">공급</text>
    <line class="k-cross" x1="${f1(e0[0])}" y1="${f1(e0[1])}" x2="${f1(e0[0])}" y2="${F.Y1}"/><line class="k-cross" x1="${F.X0}" y1="${f1(e0[1])}" x2="${f1(e0[0])}" y2="${f1(e0[1])}"/>
    <circle class="k-dot" cx="${f1(e0[0])}" cy="${f1(e0[1])}" r="6"/><text class="k-lb big" x="${f1(e0[0] + 12)}" y="${f1(e0[1] + 22)}">균형</text>
    ${e1 ? `<circle class="k-dot hollow" cx="${f1(e1[0])}" cy="${f1(e1[1])}" r="6"/><text class="k-lb big acc" x="${f1(e1[0] + 12)}" y="${f1(e1[1] - 10)}">새 균형</text>` : ""}`;
  return { html: `<div class="mbc-fig">${svg(F, inner, "수요곡선과 공급곡선이 만나는 곳이 균형 가격과 양이에요." + (e1 ? " 곡선이 옮겨 가면 균형도 옮겨 가요." : ""))}</div>` };
}

// ---------- 재무제표 세 장의 연결 (도식) ----------
function statements() {
  const box = (k, t, rows) => `<div class="mbc-st"><div class="mbc-st-k">${k}</div><div class="mbc-st-t">${t}</div><ul>${rows.map((r) => `<li>${r}</li>`).join("")}</ul></div>`;
  return { html: `<div class="mbc-flow3">
    ${box("기간 동안", "손익계산서", ["매출", "− 비용", "<b>= 순이익</b>"])}
    <div class="mbc-arw" aria-hidden="true"><span>순이익</span></div>
    ${box("기간 동안", "현금흐름표", ["순이익에서 시작", "± 현금이 안 움직인 것", "<b>= 기말 현금</b>"])}
    <div class="mbc-arw" aria-hidden="true"><span>기말 현금</span></div>
    ${box("그날 하루", "재무상태표", ["자산 = 부채 + 자본", "현금은 자산으로", "순이익은 자본(이익잉여금)으로"])}
  </div><p class="mbc-note">순이익은 현금흐름표의 출발점이 되고, 쌓여서 재무상태표의 자본이 돼요. 기말 현금은 재무상태표의 현금과 같아요.</p>` };
}

// ---------- 복리 ----------
function compound(p) {
  const P = { principal: 1000000, rate: 0.05, years: 10, unit: "원", ...p };
  const F = frame(640, 320), n = Math.min(40, Math.max(1, P.years)), vals = [];
  for (let t = 0; t <= n; t++) vals.push(P.principal * Math.pow(1 + P.rate, t));
  const max = vals[n] * 1.08, bw = (F.X1 - F.X0) / (n + 1);
  const yOf = (v) => F.Y1 - v / max * (F.Y1 - F.Y0);
  const bars = vals.map((v, t) => `<rect class="${t === n ? "k-bar acc" : "k-bar"}" x="${f1(F.X0 + t * bw + bw * 0.18)}" y="${f1(yOf(v))}" width="${f1(bw * 0.64)}" height="${f1(F.Y1 - yOf(v))}"/>`).join("");
  const simple = [[F.X0 + bw / 2, yOf(P.principal)], [F.X0 + n * bw + bw / 2, yOf(P.principal * (1 + P.rate * n))]];
  const xTicks = [0, Math.round(n / 2), n].map((t) => ({ x: F.X0 + t * bw + bw / 2, label: t + "년" }));
  const inner = `${axes(F, { xTicks, yTicks: niceTicks(max).map((v) => ({ y: yOf(v), label: short(v) })), xLabel: "기간", yLabel: P.unit })}${bars}
    <path class="k-iso" d="${path(simple)}"/>
    <text class="k-lb acc" x="${f1(F.X0 + n * bw + bw / 2)}" y="${f1(yOf(vals[n]) - 10)}" text-anchor="end">${won(vals[n])}${esc(P.unit)}</text>
    <text class="k-lb dim" x="${f1(F.X0 + n * bw)}" y="${f1(yOf(P.principal * (1 + P.rate * n)) + 18)}" text-anchor="end">단리였다면 ${won(P.principal * (1 + P.rate * n))}</text>`;
  return { html: `<div class="mbc-fig">${svg(F, inner, `${won(P.principal)}${P.unit}을 연 ${Math.round(P.rate * 1000) / 10}%로 ${n}년 두면 ${won(vals[n])}${P.unit}이 돼요.`)}</div>` };
}

// ---------- 지분 희석 ----------
function dilution(p) {
  const rounds = (p.rounds && p.rounds.length ? p.rounds : [{ name: "설립", new: 0 }, { name: "시드", new: 0.2 }, { name: "시리즈A", new: 0.2 }]).slice(0, 6);
  let holders = [{ name: "창업자", share: 1 }];
  const cols = rounds.map((r) => {
    if (r.new > 0) { holders = holders.map((h) => ({ ...h, share: h.share * (1 - r.new) })); holders.push({ name: r.name + " 투자자", share: r.new }); }
    return { name: r.name, holders: holders.map((h) => ({ ...h })) };
  });
  const F = frame(600, 320), cw = (F.X1 - F.X0) / cols.length;
  const shade = ["acc", "g1", "g2", "g3", "g4", "g5"];
  const yOf = (v) => F.Y1 - v * (F.Y1 - F.Y0);
  const bars = cols.map((c, i) => {
    let acc = 0;
    return c.holders.map((h, j) => { const y0 = yOf(acc + h.share), hgt = yOf(acc) - y0; acc += h.share;
      return `<rect class="k-stk ${shade[j] || "g5"}" x="${f1(F.X0 + i * cw + cw * 0.2)}" y="${f1(y0)}" width="${f1(cw * 0.6)}" height="${f1(Math.max(0, hgt - 2))}"/>${hgt > 18 ? `<text class="k-lb ${j ? "" : "on-acc"}" x="${f1(F.X0 + i * cw + cw / 2)}" y="${f1(y0 + hgt / 2 + 4)}" text-anchor="middle">${Math.round(h.share * 100)}%</text>` : ""}`; }).join("");
  }).join("");
  const xTicks = cols.map((c, i) => ({ x: F.X0 + i * cw + cw / 2, label: c.name }));
  const inner = `${axes(F, { xTicks, yTicks: [0, 0.5, 1].map((v) => ({ y: yOf(v), label: v * 100 + "%" })), yLabel: "지분" })}${bars}`;
  const last = cols[cols.length - 1].holders[0].share;
  return { html: `<div class="mbc-fig">${svg(F, inner, `라운드마다 새 주식이 발행되면 창업자 지분이 줄어요. 마지막에 창업자 ${Math.round(last * 100)}%.`)}</div><p class="mbc-note">새 주식이 생기면 기존 주주의 비율이 같은 비율로 줄어요(희석). 비율은 줄어도 회사 가치가 커지면 지분의 값은 늘 수 있어요.</p>` };
}

// ---------- 퍼널 ----------
function funnel(p) {
  const steps = (p.steps || []).slice(0, 7); if (!steps.length) return { html: "" };
  const top = steps[0].n || 1;
  const rows = steps.map((s, i) => {
    const w = Math.max(0.6, s.n / top * 100), conv = i ? Math.round(s.n / (steps[i - 1].n || 1) * 1000) / 10 : null;
    return `<div class="mbc-fn"><span class="mbc-fn-k">${esc(s.name)}</span><span class="mbc-fn-bar"><i class="${i === steps.length - 1 ? "acc" : ""}" style="width:${f1(w)}%"></i></span><span class="mbc-fn-n">${s.n.toLocaleString("ko-KR")}</span><span class="mbc-fn-c">${conv == null ? "" : conv + "%"}</span></div>`;
  }).join("");
  return { html: `<div class="mbc-funnel" role="img" aria-label="${esc(steps.map((s) => `${s.name} ${s.n}`).join(", "))}">${rows}</div><p class="mbc-note">오른쪽 %는 바로 앞 단계에서 넘어온 비율이에요. 가장 많이 빠지는 칸부터 고쳐요.</p>` };
}

// ---------- 막대 ----------
function bars(p) {
  const items = (p.items || []).slice(0, 8); if (!items.length) return { html: "" };
  const max = Math.max(...items.map((i) => Math.abs(i.value))) || 1;
  return { html: `<div class="mbc-bars" role="img" aria-label="${esc(items.map((i) => `${i.label} ${i.value}${p.unit || ""}`).join(", "))}">${items.map((i, k) => `<div class="mbc-br"><span class="mbc-br-k">${esc(i.label)}</span><span class="mbc-br-bar"><i class="${k === items.length - 1 ? "acc" : ""}" style="width:${f1(Math.abs(i.value) / max * 100)}%"></i></span><span class="mbc-br-v">${esc(String(i.value))}${esc(p.unit || "")}</span></div>`).join("")}</div>` };
}

// ---------- 표 · 흐름 · 2×2 ----------
function table(p) {
  const cols = p.cols || [], rows = p.rows || [];
  return { html: `<div class="mbc-tw"><table class="mbc-table"><thead><tr>${cols.map((c) => `<th scope="col">${esc(c)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c, i) => (i ? `<td>${esc(c)}</td>` : `<th scope="row">${esc(c)}</th>`)).join("")}</tr>`).join("")}</tbody></table></div>` };
}
function flow(p) {
  const steps = (p.steps || []).slice(0, 6);
  return { html: `<ol class="mbc-steps">${steps.map((s, i) => `<li><span class="n">${String(i + 1).padStart(2, "0")}</span><span>${esc(s)}</span></li>`).join("")}</ol>` };
}
function matrix(p) {
  const c = p.cells || ["", "", "", ""];
  return { html: `<div class="mbc-mx"><span class="mbc-mx-y">${esc(p.y || "")} ↑</span><div class="mbc-mx-g">${c.slice(0, 4).map((t) => `<div>${esc(t)}</div>`).join("")}</div><span class="mbc-mx-x">${esc(p.x || "")} →</span></div>` };
}

// ---------- 병목: 누를 때만 1초 동안 흘러요 ----------
function bottleneck(p) {
  const st = (p.stations || []).slice(0, 5), unit = p.unit || "건/시간";
  if (!st.length) return { html: "" };
  const slow = st.reduce((m, s, i) => (s.rate < st[m].rate ? i : m), 0), out = st[slow].rate;
  const html = `<div class="mbc-bn">${st.map((s, i) => `<div class="mbc-bn-s ${i === slow ? "slow" : ""}"><b>${esc(s.name)}</b><span>${s.rate} ${esc(unit)}</span><i class="q" data-q="${i}">대기 0</i></div>${i < st.length - 1 ? '<span class="mbc-bn-a" aria-hidden="true">→</span>' : ""}`).join("")}</div>
    <div class="mbc-bn-ctl"><button type="button" class="mb-btn ghost" data-run>1시간 돌려 보기</button><span data-out>나오는 양: 시간당 ${out} — 가장 느린 칸(${esc(st[slow].name)})이 정해요.</span></div>`;
  return {
    html,
    wire(el) {
      let raf = 0;
      const run = () => {
        cancelAnimationFrame(raf);
        // 1시간 동안 칸마다 쌓이는 대기: 앞 칸이 보낸 양 − 이 칸이 처리한 양 (앞에서 막히면 그 뒤는 덜 받아요)
        const q = st.map(() => 0); let flowIn = st[0].rate;
        st.forEach((s, i) => { if (i === 0) { flowIn = s.rate; return; } q[i] = Math.max(0, flowIn - s.rate); flowIn = Math.min(flowIn, s.rate); });
        const t0 = performance.now(), dur = REDUCED() ? 0 : 1000;
        const step = (now) => {
          const k = dur ? Math.min(1, (now - t0) / dur) : 1;
          st.forEach((_, i) => { const e = el.querySelector(`[data-q="${i}"]`); if (e) e.textContent = "대기 " + Math.round(q[i] * k); });
          if (k < 1) raf = requestAnimationFrame(step);
        };
        raf = requestAnimationFrame(step);
      };
      const b = el.querySelector("[data-run]"); b.addEventListener("click", run);
      return () => { cancelAnimationFrame(raf); b.removeEventListener("click", run); };
    },
  };
}

const KINDS = { profitMap, breakEven, ppf, supplyDemand, statements, compound, dilution, funnel, bars, table, flow, matrix, bottleneck };
export function renderVisual(v) {
  if (!v || !KINDS[v.type]) return null;
  try { return KINDS[v.type](v.params || {}); } catch (e) { console.warn("mba visual", v.type, e); return null; }
}
export const VISUAL_TYPES = Object.keys(KINDS);
