// 무채색 링 차트 — 바깥부터 올해 · 이번 달 · 이번 주 · 오늘.
// 링 = 완료율. 링을 끊는 홈(notch) = 그 기간이 흘러간 지점. 올해 링은 목표마다 고른 톤으로 칸이 나뉘어요.
import { esc, clamp } from "./util.js";

export const RING = {
  year:  { label: "올해",    tone: "var(--r-year)" },
  month: { label: "이번 달", tone: "var(--r-month)" },
  week:  { label: "이번 주", tone: "var(--r-week)" },
  day:   { label: "오늘",    tone: "var(--r-day)" },
};

// 올해 목표에 고를 수 있는 무채색 톤 (값은 CSS 변수라 테마에 맞춰 바뀌어요)
export const TONES = [
  { key: "ink", name: "먹" }, { key: "graphite", name: "흑연" }, { key: "slate", name: "슬레이트" }, { key: "steel", name: "스틸" },
  { key: "silver", name: "실버" }, { key: "sand", name: "모래" }, { key: "ivory", name: "상아" }, { key: "champagne", name: "샴페인" },
];
export const toneVar = (key, i = 0) => `var(--t-${TONES.some((t) => t.key === key) ? key : TONES[i % TONES.length].key})`;

const P = (c, r, deg) => { const a = (deg - 90) * Math.PI / 180; return [c + r * Math.cos(a), c + r * Math.sin(a)]; };
const f = (n) => n.toFixed(2);

/**
 * items: [{ key, value, time, href?, title?, segments?: [{tone, done, title}], mark?: "D-94" }]  바깥 → 안쪽
 */
export function rings(items, { size = 300, stroke = 20, gap = 8, big = "", small = "", animate = true, label = "", marks = false } = {}) {
  const c = size / 2, pad = marks ? 26 : 6;
  let body = "", labels = "";
  items.forEach((it, i) => {
    const conf = RING[it.key];
    const r = c - pad - stroke / 2 - i * (stroke + gap);
    if (r < stroke) return;
    const C = 2 * Math.PI * r, delay = `animation-delay:${i * 90}ms`;
    let arcs = "";
    if (it.segments && it.segments.length) {
      // 목표마다 한 칸: 이룬 목표는 그 톤으로 채우고, 남은 목표는 옅게
      const n = it.segments.length, capDeg = (stroke / r) * (180 / Math.PI), gapDeg = Math.min(8, 360 / n / 3) + capDeg;
      it.segments.forEach((sg, k) => {
        const span = 360 / n, from = k * span + gapDeg / 2, len = Math.max(0.5, ((span - gapDeg) / 360) * C);
        arcs += `<circle class="rg-seg${sg.done ? " on" : ""}${animate ? " anim" : ""}" cx="${c}" cy="${c}" r="${f(r)}" fill="none" stroke="${sg.tone}" stroke-width="${stroke}" stroke-linecap="round"
          stroke-dasharray="${f(len)} ${f(C)}" transform="rotate(${f(from - 90)} ${c} ${c})" style="--from:${f(len)};${delay}"><title>${esc(sg.title || "")}${sg.done ? " · 이룸" : ""}</title></circle>`;
      });
    } else {
      const v = clamp(it.value || 0);
      arcs += `<circle class="rg-trk" cx="${c}" cy="${c}" r="${f(r)}" fill="none" stroke="${conf.tone}" stroke-width="${stroke}"/>`;
      if (v > 0.001) arcs += `<circle class="rg-arc${animate ? " anim" : ""}" cx="${c}" cy="${c}" r="${f(r)}" fill="none" stroke="${conf.tone}" stroke-width="${stroke}" stroke-linecap="round"
          stroke-dasharray="${f(C)} ${f(C)}" stroke-dashoffset="${f(C - C * v)}" transform="rotate(-90 ${c} ${c})" style="--from:${f(C)};${delay}"/>`;
    }
    let notch = "";
    if (it.time != null) {
      const deg = clamp(it.time) * 360;
      const [x1, y1] = P(c, r - stroke / 2 - 3, deg), [x2, y2] = P(c, r + stroke / 2 + 3, deg);
      notch = `<line class="rg-notch" x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}"/>`;
      if (it.mark && marks) {
        const [lx, ly] = P(c, r + stroke / 2 + 13, deg);
        const anchor = deg < 20 || deg > 340 || (deg > 160 && deg < 200) ? "middle" : deg < 180 ? "start" : "end";
        labels += `<text class="rg-mark" x="${f(lx)}" y="${f(ly + 4)}" text-anchor="${anchor}">${esc(it.mark)}</text>`;
      }
    }
    body += `<g class="rg${it.href ? " link" : ""}" data-key="${it.key}" ${it.href ? `data-href="${esc(it.href)}" tabindex="0" role="link"` : ""} aria-label="${esc(it.title || conf.label)}">
      <title>${esc(it.title || conf.label)}</title>
      ${it.segments?.length ? `<circle class="rg-hit" cx="${c}" cy="${c}" r="${f(r)}" fill="none" stroke-width="${stroke + gap}"/>` : ""}
      ${arcs}${notch}
    </g>`;
  });
  return `<svg class="rings" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="${esc(label)}">
    ${body}${labels}
    ${big !== "" ? `<text class="rg-big" x="${c}" y="${c + (small ? size * 0.025 : size * 0.045)}" text-anchor="middle" style="font-size:${Math.round(size * 0.16)}px">${esc(big)}</text>` : ""}
    ${small ? `<text class="rg-small" x="${c}" y="${c + size * 0.1}" text-anchor="middle" style="font-size:${Math.max(8.5, Math.round(size * 0.034))}px">${esc(small)}</text>` : ""}
  </svg>`;
}

export function bindRings(root, go) {
  root.addEventListener("click", (e) => { const g = e.target.closest(".rg.link"); if (g) go(g.dataset.href); });
  root.addEventListener("keydown", (e) => { const g = e.target.closest?.(".rg.link"); if (g && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); go(g.dataset.href); } });
}

export const swatch = (key) => `<span class="sw" style="background:${RING[key].tone}"></span>`;

// 가로 시간 막대: 오늘/올해가 얼마나 지났는지
export function timebar(label, value, right) {
  return `<div class="timebar"><span class="tb-l">${label}</span><span class="tb-track"><i style="width:${(clamp(value) * 100).toFixed(1)}%"></i></span><span class="tb-r">${right}</span></div>`;
}
