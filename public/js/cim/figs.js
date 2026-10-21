// CIM 설명 그림 — 정적 SVG(장식 없음), 금융 앱처럼: 둥근 틀 · 굵은 숫자 · 단계 버튼 · 슬라이더 · 읽기 줄.
// 그림 9개 + 부동산 계산기. 사용자가 ‹ › / 슬라이더로 직접 바꿔요 (저절로 움직이지 않아요).
const NS = "http://www.w3.org/2000/svg";
const f2 = (v, d = 2) => Number(v).toFixed(d);
const won = (v) => Math.round(v).toLocaleString("ko-KR");

// 좌표계 하나: 바깥 여백 + x/y 범위
function plot(W, H, xr, yr, pad = { l: 40, r: 12, t: 12, b: 28 }) {
  const sx = (x) => pad.l + ((x - xr[0]) / (xr[1] - xr[0])) * (W - pad.l - pad.r);
  const sy = (y) => H - pad.b - ((y - yr[0]) / (yr[1] - yr[0])) * (H - pad.t - pad.b);
  const path = (pts) => pts.map((p, i) => (i ? "L" : "M") + f2(sx(p[0]), 1) + " " + f2(sy(p[1]), 1)).join("");
  return { W, H, sx, sy, path, pad, xr, yr };
}
function axes(P, xl, yl, xt, yt) {
  let s = "";
  (yt || []).forEach((v) => (s += `<line class="grid" x1="${P.pad.l}" x2="${P.W - P.pad.r}" y1="${P.sy(v)}" y2="${P.sy(v)}"/><text x="${P.pad.l - 4}" y="${P.sy(v) + 4}" text-anchor="end">${v}</text>`));
  (xt || []).forEach((v) => (s += `<text x="${P.sx(v)}" y="${P.H - P.pad.b + 14}" text-anchor="middle">${v}</text>`));
  s += `<line class="ax" x1="${P.pad.l}" x2="${P.W - P.pad.r}" y1="${P.H - P.pad.b}" y2="${P.H - P.pad.b}"/><line class="ax" x1="${P.pad.l}" x2="${P.pad.l}" y1="${P.pad.t}" y2="${P.H - P.pad.b}"/>`;
  s += `<text x="${P.W - P.pad.r}" y="${P.H - 2}" text-anchor="end">${xl}</text><text x="${P.pad.l + 4}" y="${P.pad.t + 10}">${yl}</text>`;
  return s;
}
const svg = (P, inner) => `<svg class="cf-svg" viewBox="0 0 ${P.W} ${P.H}" role="img">${inner}</svg>`;
const range = (a, b, n) => Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n);

// 공통 틀: 그림 + 단계 버튼 + 슬라이더 + 읽기 줄 + 설명
function frame(el, o) {
  const n = o.steps ? o.steps.length : 0;
  el.innerHTML = `<figure class="cf"><div class="cf-pic"></div><div class="cf-ctl">${n ? `<div class="cf-steps" role="group" aria-label="단계"><button type="button" data-s="-1" aria-label="이전 단계">‹</button><span class="cf-sn" aria-live="polite"></span><button type="button" data-s="1" aria-label="다음 단계">›</button><span class="cf-dots" aria-hidden="true">${o.steps.map(() => "<i></i>").join("")}</span></div>` : ""}${(o.sliders || []).map((s) => `<label class="cf-sl"><span class="cf-k">${s.label}</span><input type="range" data-k="${s.k}" min="${s.min}" max="${s.max}" step="${s.step}" value="${s.v}"><output data-o="${s.k}"></output></label>`).join("")}${o.extra || ""}</div><div class="cf-read" aria-live="polite"></div><figcaption class="cf-cap"></figcaption></figure>`;
  const st = { step: 0 };
  (o.sliders || []).forEach((s) => (st[s.k] = +s.v));
  const draw = () => {
    (o.sliders || []).forEach((s) => {
      el.querySelector(`[data-o="${s.k}"]`).textContent = s.fmt ? s.fmt(st[s.k]) : st[s.k];
      el.querySelector(`[data-k="${s.k}"]`).style.setProperty("--p", ((st[s.k] - s.min) / (s.max - s.min)) * 100 + "%");
    });
    if (n) {
      el.querySelector(".cf-sn").textContent = `${st.step + 1} / ${n}`;
      el.querySelectorAll(".cf-dots i").forEach((d, i) => d.classList.toggle("on", i <= st.step));
      el.querySelector('[data-s="-1"]').disabled = st.step === 0;
      el.querySelector('[data-s="1"]').disabled = st.step === n - 1;
    }
    const r = o.draw(st);
    el.querySelector(".cf-pic").innerHTML = r.svg;
    el.querySelector(".cf-read").innerHTML = r.read || "";
    el.querySelector(".cf-cap").innerHTML = n ? o.steps[st.step] : o.cap || "";
  };
  el.addEventListener("input", (e) => { const k = e.target.dataset.k; if (k) { st[k] = +e.target.value; draw(); } });
  el.addEventListener("click", (e) => {
    const b = e.target.closest("[data-s]");
    if (b && n) { st.step = Math.max(0, Math.min(n - 1, st.step + +b.dataset.s)); draw(); }
    if (o.click) { if (o.click(e, st)) draw(); }
  });
  draw();
}

const FIG = {};
FIG.bond = {
  t: "채권 가격-금리 곡선 · 듀레이션 접선 · 볼록성", ch: "s3c6",
  mount(el) {
    // 10년 만기, 표면 5% 연 1회 이표, 액면 10,000
    const price = (y) => { let p = 0; for (let t = 1; t <= 10; t++) p += 500 / Math.pow(1 + y, t); return p + 10000 / Math.pow(1 + y, 10); };
    frame(el, {
      steps: ["<b>1단계</b> 금리가 오르면 가격은 내려가요. 직선이 아니라 아래로 볼록하게 휘어 있어요.",
        "<b>2단계</b> 파란 접선 = 듀레이션. 지금 금리에서의 기울기라서 작은 변화엔 잘 맞지만, 멀어질수록 실제 가격(검은 곡선)보다 아래에 있어요.",
        "<b>3단계</b> 빨간 점선 = 듀레이션 + 볼록성. 휨을 보정하니 실제 곡선에 거의 붙어요. 금리가 오르든 내리든 볼록성은 가격에 '+' 예요."],
      sliders: [{ k: "y", label: "현재 금리", min: 2, max: 9, step: 0.5, v: 5, fmt: (v) => v + "%" }, { k: "d", label: "금리 변화", min: -3, max: 3, step: 0.5, v: 2, fmt: (v) => (v > 0 ? "+" : "") + v + "%p" }],
      draw(st) {
        const P = plot(560, 300, [0, 12], [4000, 20000]);
        const y0 = st.y / 100, p0 = price(y0), h = 1e-4;
        const dP = (price(y0 + h) - price(y0 - h)) / (2 * h), d2P = (price(y0 + h) - 2 * p0 + price(y0 - h)) / (h * h);
        const MD = -dP / p0, C = d2P / p0;
        let s = axes(P, "금리 %", "가격", [0, 2, 4, 6, 8, 10, 12], [5000, 10000, 15000, 20000]);
        s += `<path class="main" d="${P.path(range(0.3, 12, 80).map((x) => [x, price(x / 100)]))}"/>`;
        const xs = range(Math.max(0.3, st.y - 5), Math.min(12, st.y + 5), 40);
        if (st.step >= 1) s += `<path class="acc" d="${P.path(xs.map((x) => [x, p0 * (1 - MD * (x - st.y) / 100)]))}"/>`;
        if (st.step >= 2) s += `<path class="acc2 dash" d="${P.path(xs.map((x) => { const dy = (x - st.y) / 100; return [x, p0 * (1 - MD * dy + 0.5 * C * dy * dy)]; }))}"/>`;
        const y1 = st.y + st.d, dy = st.d / 100;
        s += `<line class="grid dash" x1="${P.sx(y1)}" x2="${P.sx(y1)}" y1="${P.pad.t}" y2="${P.H - P.pad.b}"/>`;
        s += `<circle class="dot" cx="${P.sx(st.y)}" cy="${P.sy(p0)}" r="5"/><circle cx="${P.sx(y1)}" cy="${P.sy(price(y1 / 100))}" r="4" fill="var(--c-ink)"/>`;
        const real = (price(y1 / 100) / p0 - 1) * 100, dur = -MD * dy * 100, cvx = (-MD * dy + 0.5 * C * dy * dy) * 100;
        return { svg: svg(P, s), read: `가격 ${won(p0)}원 · 수정듀레이션 ${f2(MD)} · 볼록성 ${f2(C, 1)}<br>금리 ${st.d > 0 ? "+" : ""}${st.d}%p → 실제 ${f2(real)}% · 듀레이션만 ${f2(dur)}% · 듀레이션+볼록성 ${f2(cvx)}%` };
      }
    });
  }
};

FIG.port = {
  t: "상관계수와 분산효과 · 효율적 투자선 · CML", ch: "s3c10",
  mount(el) {
    const A = { m: 6, s: 10 }, B = { m: 12, s: 22 }, rf = 3;
    frame(el, {
      steps: ["<b>1단계</b> 두 자산 A(6%, σ10%) · B(12%, σ22%)를 섞은 모든 조합이에요. 상관계수를 낮춰 보세요. 같은 수익에서 위험이 줄어 곡선이 왼쪽으로 휘어요.",
        "<b>2단계</b> ρ = −1 이면 위험 0 인 조합이 생기고, ρ = +1 이면 직선(분산효과 없음)이에요. 곡선의 윗부분이 효율적 투자선이에요.",
        "<b>3단계</b> 무위험자산(3%)에서 곡선에 접하는 직선 = 자본시장선(CML). 접점이 시장포트폴리오 M 이에요. CML 위의 점이 어떤 위험자산 조합보다 나아요."],
      sliders: [{ k: "r", label: "상관계수 ρ", min: -1, max: 1, step: 0.1, v: 0.2, fmt: (v) => f2(v, 1) }],
      draw(st) {
        const P = plot(560, 300, [0, 26], [0, 14]);
        const pts = range(0, 1, 100).map((w) => { const m = w * B.m + (1 - w) * A.m; const v = (1 - w) ** 2 * A.s ** 2 + w ** 2 * B.s ** 2 + 2 * w * (1 - w) * st.r * A.s * B.s; return [Math.sqrt(Math.max(v, 0)), m, w]; });
        let s = axes(P, "위험 σ %", "기대수익 %", [0, 5, 10, 15, 20, 25], [0, 4, 8, 12]);
        s += `<path class="main" d="${P.path(pts)}"/>`;
        const mv = pts.reduce((a, b) => (b[0] < a[0] ? b : a));
        s += `<circle class="dot" cx="${P.sx(A.s)}" cy="${P.sy(A.m)}" r="4"/><text x="${P.sx(A.s) + 6}" y="${P.sy(A.m) + 4}">A</text><circle class="dot" cx="${P.sx(B.s)}" cy="${P.sy(B.m)}" r="4"/><text x="${P.sx(B.s) + 6}" y="${P.sy(B.m) + 4}">B</text>`;
        s += `<circle cx="${P.sx(mv[0])}" cy="${P.sy(mv[1])}" r="4" fill="var(--c-ink)"/><text x="${P.sx(mv[0]) - 6}" y="${P.sy(mv[1]) + 16}" text-anchor="end">최소분산</text>`;
        let read = `최소분산 조합: B 비중 ${Math.round(mv[2] * 100)}% · σ ${f2(mv[0], 1)}% · 수익 ${f2(mv[1], 1)}%`;
        if (st.step >= 2) {
          const m = pts.filter((p) => p[0] > 0.01).reduce((a, b) => ((b[1] - rf) / b[0] > (a[1] - rf) / a[0] ? b : a));
          const sl = (m[1] - rf) / m[0];
          s += `<path class="acc" d="${P.path([[0, rf], [26, rf + sl * 26]])}"/><circle cx="${P.sx(0)}" cy="${P.sy(rf)}" r="4" fill="var(--c-blue)"/><circle class="dotbad" cx="${P.sx(m[0])}" cy="${P.sy(m[1])}" r="5"/><text x="${P.sx(m[0]) + 7}" y="${P.sy(m[1]) - 6}">M</text>`;
          read += `<br>CML 기울기(샤프비율) ${f2(sl)} · M: B 비중 ${Math.round(m[2] * 100)}%`;
        }
        return { svg: svg(P, s), read };
      }
    });
  }
};

FIG.sml = {
  t: "CAPM 증권시장선(SML) · 과소/과대평가", ch: "s3c10",
  mount(el) {
    const S = [{ n: "가", b: 0.8, e: 10 }, { n: "나", b: 1.5, e: 9 }, { n: "다", b: 1.2, e: 9.6 }];
    frame(el, {
      cap: "선 = 베타만큼 받아야 할 <b>요구수익률</b>. 점 = 내가 예상하는 수익률. <b>선 위 → 과소평가(사기)</b>, 선 아래 → 과대평가(팔기). Rf · Rm 을 바꾸면 판정이 바뀌어요.",
      sliders: [{ k: "rf", label: "Rf", min: 1, max: 6, step: 0.5, v: 3, fmt: (v) => v + "%" }, { k: "rm", label: "E(Rm)", min: 5, max: 12, step: 0.5, v: 8, fmt: (v) => v + "%" }],
      draw(st) {
        const P = plot(560, 280, [0, 2], [0, 16]);
        const req = (b) => st.rf + b * (st.rm - st.rf);
        let s = axes(P, "베타 β", "수익률 %", [0, 0.5, 1, 1.5, 2], [0, 4, 8, 12, 16]);
        s += `<path class="main" d="${P.path([[0, st.rf], [2, req(2)]])}"/><circle cx="${P.sx(1)}" cy="${P.sy(st.rm)}" r="3" fill="var(--c-ink)"/><text x="${P.sx(1) + 6}" y="${P.sy(st.rm) + 14}">M (β=1)</text>`;
        const rows = S.map((p) => { const r = req(p.b), a = p.e - r, cls = Math.abs(a) < 0.05 ? "" : a > 0 ? "dotok" : "dotbad"; s += `<line class="grid" x1="${P.sx(p.b)}" x2="${P.sx(p.b)}" y1="${P.sy(r)}" y2="${P.sy(p.e)}" stroke-width="2"/><circle class="${cls || "dot"}" cx="${P.sx(p.b)}" cy="${P.sy(p.e)}" r="5"/><text x="${P.sx(p.b) + 7}" y="${P.sy(p.e) - 6}">${p.n}</text>`; return `${p.n}: β ${p.b} · 요구 ${f2(r, 1)}% · 예상 ${p.e}% → <b>${Math.abs(a) < 0.05 ? "적정" : a > 0 ? "과소평가(매수)" : "과대평가(매도)"}</b> (α ${a > 0 ? "+" : ""}${f2(a, 1)}%p)`; });
        return { svg: svg(P, s), read: rows.join("<br>") };
      }
    });
  }
};

// 옵션 손익 빌더 (K = 100, 콜 6 · 풋 4)
const K = 100, CP = 6, PP = 4;
const LEG = { stock: (S) => S - K, lc: (S) => Math.max(S - K, 0) - CP, sc: (S) => CP - Math.max(S - K, 0), lp: (S) => Math.max(K - S, 0) - PP, sp: (S) => PP - Math.max(K - S, 0) };
const LEGN = { stock: "주식 매수", lc: "콜 매수", sc: "콜 매도", lp: "풋 매수", sp: "풋 매도" };
const PRE = { "콜 매수": ["lc"], "풋 매수": ["lp"], "보호적 풋": ["stock", "lp"], "커버드 콜": ["stock", "sc"], "스트래들 매수": ["lc", "lp"], "스트래들 매도": ["sc", "sp"] };
FIG.opt = {
  t: "옵션 손익 빌더 (콜 · 풋 · 보호적풋 · 커버드콜 · 스트래들)", ch: "s3c7",
  mount(el) {
    const on = new Set(["stock", "lp"]);
    frame(el, {
      extra: `<div class="cf-chips" role="group" aria-label="전략">${Object.keys(PRE).map((k) => `<button type="button" class="cf-chip" data-pre="${k}" aria-pressed="false">${k}</button>`).join("")}</div><div class="cf-chips" role="group" aria-label="다리">${Object.keys(LEGN).map((k) => `<label class="cf-chk"><input type="checkbox" data-leg="${k}"><span>${LEGN[k]}</span></label>`).join("")}</div>`,
      cap: "행사가 100 · 콜 프리미엄 6 · 풋 프리미엄 4 (가정). 검은 선 = 합친 만기 손익, 흐린 선 = 각 다리. 이름 버튼을 누르거나 다리를 직접 골라 보세요.",
      click(e) {
        const p = e.target.closest("[data-pre]");
        if (p) { on.clear(); PRE[p.dataset.pre].forEach((k) => on.add(k)); return true; }
        const c = e.target.closest("[data-leg]");
        if (c) { c.checked ? on.add(c.dataset.leg) : on.delete(c.dataset.leg); return true; }
      },
      draw() {
        el.querySelectorAll("[data-leg]").forEach((c) => (c.checked = on.has(c.dataset.leg)));
        el.querySelectorAll("[data-pre]").forEach((b) => { const ks = PRE[b.dataset.pre]; b.setAttribute("aria-pressed", String(ks.length === on.size && ks.every((k) => on.has(k)))); });
        const P = plot(560, 280, [60, 140], [-40, 40]);
        const xs = range(60, 140, 160);
        const tot = (S) => [...on].reduce((a, k) => a + LEG[k](S), 0);
        let s = axes(P, "만기 주가", "손익", [60, 80, 100, 120, 140], [-40, -20, 0, 20, 40]);
        s += `<line class="ax" x1="${P.pad.l}" x2="${P.W - P.pad.r}" y1="${P.sy(0)}" y2="${P.sy(0)}"/>`;
        on.forEach((k) => (s += `<path class="acc" opacity=".35" d="${P.path(xs.map((x) => [x, Math.max(-40, Math.min(40, LEG[k](x)))]))}"/>`));
        if (on.size) s += `<path class="main" stroke-width="3" d="${P.path(xs.map((x) => [x, Math.max(-40, Math.min(40, tot(x)))]))}"/>`;
        const be = []; for (let i = 1; i < xs.length; i++) { const a = tot(xs[i - 1]), b = tot(xs[i]); if ((a < 0 && b >= 0) || (a > 0 && b <= 0)) be.push(xs[i - 1] + (xs[i] - xs[i - 1]) * (a / (a - b))); }
        be.forEach((x) => (s += `<circle class="dotbad" cx="${P.sx(x)}" cy="${P.sy(0)}" r="4"/>`));
        const vals = xs.map(tot), mx = Math.max(...vals), mn = Math.min(...vals);
        const sL = tot(61) - tot(60), sR = tot(140) - tot(139);
        const maxP = sR > 0.5 ? "무한" : sL < -0.5 ? `${f2(tot(0), 0)} (주가 0일 때)` : f2(mx, 0);
        const maxL = sR < -0.5 ? "무한" : sL > 0.5 ? `${f2(tot(0), 0)} (주가 0일 때)` : f2(mn, 0);
        return { svg: svg(P, s), read: on.size ? `손익분기 ${be.map((x) => f2(x, 0)).join(", ") || "없음"} · 최대이익 ${maxP} · 최대손실 ${maxL}` : "다리를 하나 이상 골라 주세요." };
      }
    });
  }
};

FIG.parity = {
  t: "풋-콜 패리티 — 두 포트폴리오가 같은 이유", ch: "s3c7",
  mount(el) {
    frame(el, {
      steps: ["<b>1단계</b> 왼쪽 포트폴리오: 콜 1개 + 만기에 K(=100)를 주는 채권. 만기 가치 = max(S, 100).",
        "<b>2단계</b> 오른쪽 포트폴리오: 풋 1개 + 주식 1주. 만기 가치도 max(S, 100) 이에요. 주가가 떨어지면 풋이 100 을 지켜 줘요.",
        "<b>3단계</b> 두 선이 완전히 겹쳐요. 만기 가치가 같으니 지금 가격도 같아야 해요 → C + PV(K) = P + S. 다르면 차익거래가 생겨요."],
      draw(st) {
        const P = plot(560, 260, [40, 160], [0, 170]);
        const xs = range(40, 160, 120);
        let s = axes(P, "만기 주가 S", "만기 가치", [40, 70, 100, 130, 160], [0, 50, 100, 150]);
        const L = (S) => Math.max(S - K, 0) + K, R = (S) => Math.max(K - S, 0) + S;
        if (st.step === 0 || st.step === 2) { s += `<path class="acc" opacity=".35" d="${P.path(xs.map((x) => [x, Math.max(x - K, 0)]))}"/><path class="acc" opacity=".35" d="${P.path([[40, K], [160, K]])}"/><path class="acc" stroke-width="4" d="${P.path(xs.map((x) => [x, L(x)]))}"/>`; }
        if (st.step >= 1) { s += `<path class="acc2" opacity=".35" d="${P.path(xs.map((x) => [x, Math.max(K - x, 0)]))}"/><path class="acc2" opacity=".35" d="${P.path(xs.map((x) => [x, x]))}"/><path class="acc2 dash" stroke-width="2" d="${P.path(xs.map((x) => [x, R(x)]))}"/>`; }
        return { svg: svg(P, s), read: st.step === 0 ? "파랑: 콜(흐림) + 채권 100(흐림) = 합(굵게)" : st.step === 1 ? "빨강: 풋(흐림) + 주식(흐림) = 합(점선)" : "파랑 = 빨강 → <b>C + K/(1+r)ᵀ = P + S</b>" };
      }
    });
  }
};

FIG.var = {
  t: "VaR — 정규분포 꼬리 · z · √t", ch: "s2c6",
  mount(el) {
    const zs = { 90: 1.28, 95: 1.65, 99: 2.33 };
    frame(el, {
      cap: "포지션 10억 · 일간 변동성 1% 가정. 빨간 꼬리 = '이보다 더 잃을 확률'. 신뢰수준을 올리면 z 가 커지고, 기간을 늘리면 √t 배로 넓어져요.",
      sliders: [{ k: "c", label: "신뢰수준", min: 0, max: 2, step: 1, v: 2, fmt: (v) => [90, 95, 99][v] + "%" }, { k: "t", label: "보유기간", min: 1, max: 25, step: 1, v: 1, fmt: (v) => v + "일" }],
      draw(st) {
        const c = [90, 95, 99][st.c], z = zs[c], sd = 1 * Math.sqrt(st.t);
        const P = plot(560, 240, [-12, 12], [0, 0.42], { l: 16, r: 12, t: 12, b: 28 });
        const pdf = (x) => Math.exp(-0.5 * (x / sd) ** 2) / (sd * Math.sqrt(2 * Math.PI));
        const xs = range(-12, 12, 200), cut = -z * sd;
        let s = axes(P, "수익률 %", "", [-12, -8, -4, 0, 4, 8, 12], []);
        const tail = xs.filter((x) => x <= cut); tail.push(cut);
        s += `<path fill="var(--c-red)" opacity=".3" d="${P.path([[-12, 0], ...tail.map((x) => [x, pdf(x)]), [cut, 0]])}Z"/>`;
        s += `<path class="main" d="${P.path(xs.map((x) => [x, pdf(x)]))}"/><line class="acc2" x1="${P.sx(cut)}" x2="${P.sx(cut)}" y1="${P.sy(0)}" y2="${P.sy(pdf(cut)) - 20}"/><text x="${P.sx(cut) - 4}" y="${P.sy(pdf(cut)) - 24}" text-anchor="end">−${f2(z * sd, 2)}%</text>`;
        return { svg: svg(P, s), read: `VaR = z ${z} × σ 1% × √${st.t} (${f2(Math.sqrt(st.t), 2)}) × 10억 = <b>${won(z * 0.01 * Math.sqrt(st.t) * 1e9 / 1e4)}만원</b>` };
      }
    });
  }
};

FIG.basis = {
  t: "선물 베이시스 수렴", ch: "s3c7",
  mount(el) {
    // 현물 경로(고정 예시) · 보유비용 r = 4%/년
    const spot = (d) => 100 + 6 * Math.sin(d / 14) - d * 0.03;
    frame(el, {
      cap: "선물이론가 F = S × (1 + r × 남은기간). 남은 기간이 줄수록 보유비용이 줄어 <b>베이시스(F − S)가 0 으로 수렴</b>해요. 만기일엔 선물 = 현물.",
      sliders: [{ k: "d", label: "지난 날", min: 0, max: 90, step: 1, v: 30, fmt: (v) => v + "일 (만기까지 " + (90 - v) + "일)" }],
      draw(st) {
        const P = plot(560, 260, [0, 90], [90, 110]);
        const F = (d) => spot(d) * (1 + 0.04 * (90 - d) / 365);
        const xs = range(0, st.d, Math.max(1, st.d));
        let s = axes(P, "날짜", "가격", [0, 30, 60, 90], [90, 95, 100, 105, 110]);
        s += `<line class="grid dash" x1="${P.sx(90)}" x2="${P.sx(90)}" y1="${P.pad.t}" y2="${P.H - P.pad.b}"/><text x="${P.sx(90) - 4}" y="${P.pad.t + 10}" text-anchor="end">만기</text>`;
        s += `<path class="main" d="${P.path(xs.map((x) => [x, spot(x)]))}"/><path class="acc" d="${P.path(xs.map((x) => [x, F(x)]))}"/>`;
        s += `<line class="acc2" x1="${P.sx(st.d)}" x2="${P.sx(st.d)}" y1="${P.sy(spot(st.d))}" y2="${P.sy(F(st.d))}" stroke-width="3"/>`;
        return { svg: svg(P, s), read: `현물(검정) ${f2(spot(st.d))} · 선물(파랑) ${f2(F(st.d))} · <b>베이시스 ${f2(F(st.d) - spot(st.d))}</b> (빨간 막대)` };
      }
    });
  }
};

FIG.twr = {
  t: "시간가중 vs 금액가중 수익률 타임라인", ch: "s3c8",
  mount(el) {
    const box = (x, y, w, h, t, sub, cls) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="var(--c-card)" stroke="var(--c-${cls || "line"})" stroke-width="1.5"/><text x="${x + w / 2}" y="${y + 20}" text-anchor="middle" style="font-size:13px;fill:var(--c-ink)">${t}</text><text x="${x + w / 2}" y="${y + 38}" text-anchor="middle">${sub}</text>`;
    frame(el, {
      steps: ["<b>1년차</b> 100 을 넣었더니 +50% → 150.",
        "<b>추가 입금</b> 성적이 좋아 보여서 투자자가 150 을 더 넣어요 → 300. 이 결정은 운용자가 아니라 투자자의 것이에요.",
        "<b>2년차</b> −20% → 240. 넣은 돈은 모두 250 인데 240 만 남았어요.",
        "<b>비교</b> 시간가중 = 1.5 × 0.8 − 1 = <b>+20%</b> (운용자 실력). 금액가중(IRR) ≈ <b>연 −2.9%</b> (투자자 실제 경험). GIPS 등 운용자 평가에는 시간가중을 써요."],
      draw(st) {
        const P = { W: 560, H: 170 };
        let s = `<line class="ax" x1="20" x2="540" y1="140" y2="140"/>`;
        ["0년", "1년", "2년"].forEach((t, i) => (s += `<text x="${40 + i * 230}" y="160" text-anchor="middle">${t}</text>`));
        s += box(10, 70, 90, 50, "100", "입금");
        if (st.step >= 0) s += `<path class="acc" d="M100 95 L230 95"/><text x="165" y="88" text-anchor="middle">+50%</text>`;
        s += box(230, 70, 80, 50, st.step >= 1 ? "300" : "150", st.step >= 1 ? "150 + 입금 150" : "");
        if (st.step >= 1) s += `<path class="acc2" d="M270 20 L270 68"/><text x="276" y="34">+150 입금</text>`;
        if (st.step >= 2) { s += `<path class="acc2" d="M310 95 L460 95"/><text x="385" y="88" text-anchor="middle">−20%</text>` + box(460, 70, 80, 50, "240", "남은 돈"); }
        return { svg: `<svg class="cf-svg" viewBox="0 0 560 170" role="img">${s}</svg>`, read: st.step >= 3 ? "시간가중 +20% (2년) · 금액가중 −2.9%/년" : "" };
      }
    });
  }
};

FIG.ddm = {
  t: "DDM 사슬: ROE · 유보율 → 성장률 → 주가 · PER", ch: "s2c3",
  mount(el) {
    frame(el, {
      cap: "EPS₁ = 1,000원. 유보율 b 를 올리면 배당은 줄지만 성장률은 커져요. <b>ROE > k</b> 일 때만 유보가 주가를 올려요 — ROE 를 k 아래로 내리고 b 를 올려 보세요.",
      sliders: [{ k: "roe", label: "ROE", min: 4, max: 20, step: 1, v: 10, fmt: (v) => v + "%" }, { k: "b", label: "유보율 b", min: 0, max: 80, step: 5, v: 40, fmt: (v) => v + "%" }, { k: "k", label: "요구수익률 k", min: 6, max: 15, step: 0.5, v: 10, fmt: (v) => v + "%" }],
      draw(st) {
        const g = st.roe * st.b / 100, D1 = 1000 * (1 - st.b / 100), ok = g < st.k;
        const P0 = ok ? D1 / ((st.k - g) / 100) : NaN;
        const box = (x, t, v) => `<rect x="${x}" y="30" width="100" height="56" rx="10" fill="var(--c-card)" stroke="var(--c-line)"/><text x="${x + 50}" y="52" text-anchor="middle">${t}</text><text x="${x + 50}" y="74" text-anchor="middle" style="font-size:14px;fill:var(--c-ink);font-weight:700">${v}</text>`;
        const ar = (x) => `<path class="acc" d="M${x} 58 L${x + 14} 58"/>`;
        const s = box(4, "g = ROE×b", f2(g, 1) + "%") + ar(106) + box(122, "D₁ = EPS×(1−b)", won(D1) + "원") + ar(224) + box(240, "P₀ = D₁÷(k−g)", ok ? won(P0) + "원" : "계산 불가") + ar(342) + box(358, "PER = P₀÷EPS", ok ? f2(P0 / 1000, 1) + "배" : "—") + box(460, "b = 0 일 때", won(1000 / (st.k / 100)) + "원");
        return { svg: `<svg class="cf-svg" viewBox="0 0 564 110" role="img">${s}</svg>`, read: ok ? (st.roe > st.k ? "ROE > k → 이익을 남겨 재투자할수록 주가가 올라가요." : st.roe < st.k ? "ROE < k → 재투자가 오히려 가치를 깎아요 (b = 0 일 때보다 낮음)." : "ROE = k → 유보율과 상관없이 주가가 같아요.") : "g ≥ k 라서 모형을 쓸 수 없어요." };
      }
    });
  }
};

FIG.re = {
  t: "부동산 계산기: Cap rate · LTV · DSCR", ch: "s1c3",
  mount(el) {
    el.innerHTML = `<figure class="cf"><div class="cf-calc"><label><span>매입가 (만원)</span><input data-r="v" type="number" inputmode="numeric" value="100000"></label><label><span>순영업소득 NOI (만원/년)</span><input data-r="noi" type="number" inputmode="numeric" value="5000"></label><label><span>대출 (만원)</span><input data-r="l" type="number" inputmode="numeric" value="60000"></label><label><span>연 원리금상환액 (만원)</span><input data-r="ds" type="number" inputmode="numeric" value="4000"></label></div><div class="cf-read cf-out" aria-live="polite"></div><figcaption class="cf-cap">Cap rate = NOI ÷ 가치 · LTV = 대출 ÷ 가치 · DSCR = NOI ÷ 원리금. DSCR 이 1 보다 작으면 임대수입으로 이자 · 원금을 못 갚아요.</figcaption></figure>`;
    const calc = () => { const g = (k) => +el.querySelector(`[data-r="${k}"]`).value || 0; const v = g("v"), noi = g("noi"), l = g("l"), ds = g("ds"); el.querySelector(".cf-read").innerHTML = `Cap rate <b>${v ? f2(noi / v * 100) : "—"}%</b> · LTV <b>${v ? f2(l / v * 100, 1) : "—"}%</b> · DSCR <b>${ds ? f2(noi / ds) : "—"}</b>${ds && noi / ds < 1 ? ` <span class="cf-warn">상환 부족</span>` : ""}`; };
    el.addEventListener("input", calc); calc();
  }
};

export const FIGS = FIG;

