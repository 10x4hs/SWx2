// CIM 화면 조각 — 진행 링 · 스파크라인 · 불러오는 중 · 섞기 · 숫자 세기 · 막대 채우기 · 화면 전환 (장식 없이)
export { esc } from "../util.js";

export const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
export const pad2 = (n) => String(n).padStart(2, "0");
export const pctTxt = (x) => (x == null ? "—" : Math.round(x * 100) + "%");
export const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
export const chev = `<svg class="chev" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>`;

// 진행 링: v = 0~1, 가운데 글자는 HTML 로 겹쳐요
export function ring(v, { size = 64, stroke = 5, cls = "" } = {}) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, f = Math.max(0, Math.min(1, v || 0));
  return `<svg class="cim-ring ${cls}" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true"><circle class="trk" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="${stroke}" fill="none"/><circle class="val" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="${stroke}" fill="none" stroke-dasharray="${(f * c).toFixed(2)} ${c.toFixed(2)}" transform="rotate(-90 ${size / 2} ${size / 2})" stroke-linecap="round"/></svg>`;
}

// 스파크라인: 값 0~1 (null = 그날 안 풂). 기준선(예: 과락 40%)은 점선
export function spark(vals, { w = 112, h = 28, ref = 0.4, label = "" } = {}) {
  const n = vals.length, x = (i) => 2 + (i * (w - 4)) / Math.max(1, n - 1), y = (v) => h - 3 - v * (h - 6);
  let segs = [], cur = [];
  vals.forEach((v, i) => { if (v == null) { if (cur.length) segs.push(cur); cur = []; } else cur.push([x(i), y(v)]); });
  if (cur.length) segs.push(cur);
  const lines = segs.filter((s) => s.length > 1).map((s) => `<polyline points="${s.map((p) => p.map((k) => k.toFixed(1)).join(",")).join(" ")}"/>`).join("");
  const last = [...vals.keys()].reverse().find((i) => vals[i] != null);
  const dots = segs.filter((s) => s.length === 1).map((s) => `<circle cx="${s[0][0].toFixed(1)}" cy="${s[0][1].toFixed(1)}" r="1.8"/>`).join("");
  const end = last != null ? `<circle class="end" cx="${x(last).toFixed(1)}" cy="${y(vals[last]).toFixed(1)}" r="2.6"/>` : "";
  return `<svg class="cim-spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${label}"><line class="ref" x1="0" x2="${w}" y1="${y(ref).toFixed(1)}" y2="${y(ref).toFixed(1)}"/>${lines}${dots}${end}</svg>`;
}

// 숫자는 0 에서 세어 올라가고(data-count), 막대는 0 에서 차올라요(data-w = %) — 동작 줄이기면 바로 끝값
export function fill(scope) {
  const red = reduced();
  scope.querySelectorAll("[data-count]").forEach((el) => {
    const to = +el.dataset.count, fmt = (v) => v.toLocaleString("ko-KR");
    if (red || !to) { el.textContent = fmt(to); return; }
    const t0 = performance.now();
    const f = (t) => { const k = Math.min(1, (t - t0) / 900); el.textContent = fmt(Math.round(to * (1 - Math.pow(1 - k, 3)))); if (k < 1 && el.isConnected) requestAnimationFrame(f); };
    el.textContent = "0"; requestAnimationFrame(f);
  });
  scope.querySelectorAll("[data-w]").forEach((i) => {
    if (red) { i.style.width = i.dataset.w + "%"; return; }
    i.style.width = "0";
    requestAnimationFrame(() => requestAnimationFrame(() => (i.style.width = i.dataset.w + "%")));
  });
}

// 화면 전환: 누른 줄(from)이 새 화면의 머리(toSel)로 그 자리에서 커져요. 안 되면 그냥 바꿔요.
// change() 는 화면을 바꾸는 함수, ready() 는 새 머리가 생겼는지 (주소 이동은 비동기라 잠깐 기다려요)
export function liftTo(from, change, toSel, root = document) {
  if (!document.startViewTransition || reduced() || !from) { change(); return; }
  from.style.viewTransitionName = "cim-lift";
  const t = document.startViewTransition(() => new Promise((res) => {
    from.style.viewTransitionName = "";
    change();
    const t0 = performance.now();
    const look = () => { const el = root.querySelector(toSel); if (el) { el.style.viewTransitionName = "cim-lift"; res(); } else if (performance.now() - t0 > 1200) res(); else setTimeout(look, 16); }; // 전환 중에는 rAF 가 멈춰요
    look();
  }));
  t.ready.catch(() => {}); t.updateCallbackDone.catch(() => {});
  t.finished.finally(() => { const el = root.querySelector(toSel); if (el) el.style.viewTransitionName = ""; }).catch(() => {});
}

export const loading = (t = "불러오는 중") => `<div class="cim-loading" role="status"><span class="cim-pulse" aria-hidden="true"></span>${t}</div>`;
export const errorBox = (t) => `<div class="cim-panel cim-err" role="alert"><b>불러오지 못했어요</b><p>${t}</p><button type="button" class="cim-btn line" data-reload>다시 시도</button></div>`;
