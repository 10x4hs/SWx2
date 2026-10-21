// CIM 화면 조각 — 진행 링 · 스파크라인 · 불러오는 중 · 섞기 (그림은 SVG 한 장, 장식 없이)
export { esc } from "../util.js";

export const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
export const pad2 = (n) => String(n).padStart(2, "0");
export const pctTxt = (x) => (x == null ? "—" : Math.round(x * 100) + "%");

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

export const loading = (t = "불러오는 중") => `<div class="cim-loading" role="status"><span class="cim-pulse" aria-hidden="true"></span>${t}</div>`;
export const errorBox = (t) => `<div class="cim-panel cim-err" role="alert"><b>불러오지 못했어요</b><p>${t}</p><button type="button" class="cim-btn line" data-reload>다시 시도</button></div>`;
