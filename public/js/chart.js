// Clay-glass ring chart — 바깥부터 올해 · 이번 달 · 이번 주 · 오늘.
// 링은 칸(블록)으로 나뉘어요. 채운 칸 = 완료(점토처럼 볼록), 빈 칸 = 유리 테두리만.
// 검은 구슬 = 그 기간이 흘러간 지점. 올해 링은 목표 하나가 한 칸이고, 목표마다 고른 톤으로 채워져요.
import { esc, clamp } from "./util.js";

export const RING = {
  year:  { label: "올해",    tone: "var(--clay-year)",  segs: 12 },
  month: { label: "이번 달", tone: "var(--clay-month)", segs: 10 },
  week:  { label: "이번 주", tone: "var(--clay-week)",  segs: 7 },
  day:   { label: "오늘",    tone: "var(--clay-day)",   segs: 8 },
};

export const TONES = [
  { key: "ink", name: "먹" }, { key: "graphite", name: "흑연" }, { key: "slate", name: "슬레이트" }, { key: "steel", name: "스틸" },
  { key: "silver", name: "실버" }, { key: "sand", name: "모래" }, { key: "ivory", name: "상아" }, { key: "champagne", name: "샴페인" },
];
export const toneVar = (key, i = 0) => `var(--t-${TONES.some((t) => t.key === key) ? key : TONES[i % TONES.length].key})`;

let seq = 0;
const P = (c, r, deg) => { const a = (deg - 90) * Math.PI / 180; return [c + r * Math.cos(a), c + r * Math.sin(a)]; };
const f = (n) => n.toFixed(2);

// 점토 블록: 위쪽 빛(스페큘러) + 아래 그림자
const defs = (id, soft) => `<defs>
  <filter id="${id}-clay" x="-25%" y="-25%" width="150%" height="150%" color-interpolation-filters="sRGB">
    <feGaussianBlur in="SourceAlpha" stdDeviation="${soft ? 1.4 : 2.4}" result="b"/>
    <feSpecularLighting in="b" surfaceScale="${soft ? 2.2 : 3.4}" specularConstant=".75" specularExponent="16" lighting-color="#fff" result="s">
      <feDistantLight azimuth="235" elevation="52"/>
    </feSpecularLighting>
    <feComposite in="s" in2="SourceAlpha" operator="in" result="s2"/>
    <feComposite in="SourceGraphic" in2="s2" operator="arithmetic" k1="0" k2="1" k3=".55" k4="0" result="lit"/>
    <feDropShadow in="lit" dx="0" dy="${soft ? 2 : 4}" stdDeviation="${soft ? 2 : 4}" flood-color="#000" flood-opacity=".22"/>
  </filter>
  <radialGradient id="${id}-lens" cx="38%" cy="30%" r="75%">
    <stop offset="0" stop-color="var(--lens-hi)"/><stop offset="1" stop-color="var(--lens-lo)"/>
  </radialGradient>
</defs>`;

/**
 * items: [{ key, value, time, href?, title?, segments?: [{tone, done, title}], mark? }]  바깥 → 안쪽
 */
export function rings(items, { size = 300, stroke = 20, gap = 9, big = "", small = "", animate = true, label = "", marks = false, soft = false } = {}) {
  const id = "cg" + ++seq, c = size / 2, pad = marks ? 26 : 8;
  let body = "", labels = "", innerR = c;
  items.forEach((it, i) => {
    const conf = RING[it.key];
    const r = c - pad - stroke / 2 - i * (stroke + gap);
    if (r < stroke) return;
    innerR = r - stroke / 2;
    const C = 2 * Math.PI * r;
    const segs = it.segments?.length ? it.segments : null;
    const n = segs ? segs.length : conf.segs;
    const span = C / n, gapLen = Math.max(stroke * 0.55, span * 0.1) + stroke; // 둥근 끝을 빼고 남는 길이
    const base = Math.max(0.6, span - gapLen);
    const filled = segs ? null : clamp(it.value || 0) * n;
    let ghost = "", clay = "";
    for (let k = 0; k < n; k++) {
      const rot = (k * span + gapLen / 2) / C * 360 - 90;
      const tr = `transform="rotate(${f(rot)} ${c} ${c})"`;
      ghost += `<circle class="cg-ghost" cx="${c}" cy="${c}" r="${f(r)}" stroke-width="${stroke}" stroke-dasharray="${f(base)} ${f(C)}" ${tr}/>`;
      ghost += `<circle class="cg-rim" cx="${c}" cy="${c}" r="${f(r + stroke / 2 - 0.8)}" stroke-dasharray="${f(base * (r + stroke / 2) / r)} ${f(C * 2)}" ${tr}/>`;
      let len = 0, tone = conf.tone, tip = "";
      if (segs) { if (segs[k].done) len = base; tone = segs[k].tone; tip = segs[k].title || ""; }
      else len = k + 1 <= filled ? base : k < filled ? Math.max(0.6, base * (filled - k)) : 0;
      if (len > 0) clay += `<circle class="cg-clay${animate ? " anim" : ""}" cx="${c}" cy="${c}" r="${f(r)}" stroke="${tone}" stroke-width="${stroke}" stroke-dasharray="${f(len)} ${f(C)}" ${tr} style="animation-delay:${i * 110 + k * 28}ms">${tip ? `<title>${esc(tip)} · 이룸</title>` : ""}</circle>`;
      else if (tip) ghost += `<circle class="cg-hit" cx="${c}" cy="${c}" r="${f(r)}" stroke-width="${stroke}" stroke-dasharray="${f(base)} ${f(C)}" ${tr}><title>${esc(tip)}</title></circle>`;
    }
    let bead = "";
    if (it.time != null) {
      const deg = clamp(it.time) * 360, [bx, by] = P(c, r, deg), br = Math.max(3, stroke * 0.27);
      bead = `<circle class="cg-bead" cx="${f(bx)}" cy="${f(by)}" r="${f(br)}"/><circle class="cg-bead-hi" cx="${f(bx - br * 0.3)}" cy="${f(by - br * 0.35)}" r="${f(br * 0.32)}"/>`;
      if (it.mark && marks) {
        const [lx, ly] = P(c, r + stroke / 2 + 14, deg);
        const anchor = deg < 20 || deg > 340 || (deg > 160 && deg < 200) ? "middle" : deg < 180 ? "start" : "end";
        labels += `<text class="cg-mark" x="${f(lx)}" y="${f(ly + 4)}" text-anchor="${anchor}">${esc(it.mark)}</text>`;
      }
    }
    body += `<g class="rg${it.href ? " link" : ""}" data-key="${it.key}" ${it.href ? `data-href="${esc(it.href)}" tabindex="0" role="link"` : ""} aria-label="${esc(it.title || conf.label)}">
      <title>${esc(it.title || conf.label)}</title>
      <circle class="cg-hit" cx="${c}" cy="${c}" r="${f(r)}" stroke-width="${stroke + gap}"/>
      <g class="cg-ghosts">${ghost}</g><g filter="url(#${id}-clay)">${clay}</g>${bead}
    </g>`;
  });
  const lensR = Math.max(0, innerR - Math.max(6, size * 0.03));
  // 가운데 숫자는 렌즈 안에 들어가는 크기로
  const bigPx = Math.round(Math.min(size * 0.155, Math.max(14, lensR * 0.78))), smallPx = Math.max(8, Math.round(Math.min(size * 0.033, bigPx * 0.2)));
  const lens = lensR > 20 ? `<circle class="cg-lens" cx="${c}" cy="${c}" r="${f(lensR)}" fill="url(#${id}-lens)"/><circle class="cg-lens-rim" cx="${c}" cy="${c}" r="${f(lensR - 0.5)}"/>` : "";
  return `<svg class="rings clay" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="${esc(label)}">
    ${defs(id, soft)}${lens}${body}${labels}
    ${big !== "" ? `<text class="rg-big" x="${c}" y="${c + (small ? bigPx * 0.22 : bigPx * 0.35)}" text-anchor="middle" style="font-size:${bigPx}px">${esc(big)}</text>` : ""}
    ${small ? `<text class="rg-small" x="${c}" y="${c + bigPx * 0.22 + smallPx * 1.9}" text-anchor="middle" style="font-size:${smallPx}px">${esc(small)}</text>` : ""}
  </svg>`;
}

export function bindRings(root, go) {
  root.addEventListener("click", (e) => { const g = e.target.closest(".rg.link"); if (g) go(g.dataset.href); });
  root.addEventListener("keydown", (e) => { const g = e.target.closest?.(".rg.link"); if (g && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); go(g.dataset.href); } });
}

export const swatch = (key) => `<span class="sw" style="background:${RING[key].tone}"></span>`;

export function timebar(label, value, right) {
  return `<div class="timebar"><span class="tb-l">${label}</span><span class="tb-track"><i style="width:${(clamp(value) * 100).toFixed(1)}%"></i></span><span class="tb-r">${right}</span></div>`;
}

// 유리 카드 모서리 HUD 눈금 + 네 귀퉁이 수치
export function hud({ tl = "", tr = "", bl = "", br = "" } = {}) {
  return `<span class="hud" aria-hidden="true"><i class="tl"></i><i class="tr"></i><i class="bl"></i><i class="br"></i>
    <b class="tl">${tl}</b><b class="tr">${tr}</b><b class="bl">${bl}</b><b class="br">${br}</b></span>`;
}
