// 체크리스트 차트 — 우선순위 색 유리 도넛. 단계마다 호 하나(할 일 수만큼 길이), 끝낸 몫은 진하게 · 남은 몫은 옅게.
// 가운데: 끝낸 수 / 전체 · 비율. 범례: 단계마다 끝낸 수/전체 막대.
import { esc } from "../util.js";

export const PRIO_ORDER = ["max", "xhigh", "high", "medium", "low", "none"];
export const PRIO_LABEL = { max: "Max", xhigh: "XHigh", high: "High", medium: "Medium", low: "Low", none: "없음" };
export const PRIO_COLOR = { max: "var(--p-max)", xhigh: "var(--p-xhigh)", high: "var(--p-high)", medium: "var(--p-medium)", low: "var(--p-low)", none: "var(--ink-3)" };

export function prioStats(items) {
  return PRIO_ORDER.map((k) => { const list = items.filter((p) => (p.priority || "none") === k); return { k, n: list.length, d: list.filter((p) => p.done).length }; }).filter((r) => r.n);
}

// items = [{ priority, done }] · size = 지름(px)
export function prioDonut(items, { size = 200, label = "끝냄" } = {}) {
  const rows = prioStats(items), total = items.length, done = items.filter((p) => p.done).length;
  const C = 100, R = 78, SW = 16, L = 2 * Math.PI * R, gap = rows.length > 1 ? 2.2 : 0;
  let at = 0, arcs = "";
  for (const r of rows) {
    const len = (r.n / total) * L - gap, dl = (r.d / r.n) * len, off = -at;
    const dash = (a, b) => `stroke-dasharray="${Math.max(0, a).toFixed(2)} ${(L - Math.max(0, a)).toFixed(2)}" stroke-dashoffset="${(off - b).toFixed(2)}"`;
    arcs += `<circle cx="${C}" cy="${C}" r="${R}" class="pd-rest" stroke="${PRIO_COLOR[r.k]}" stroke-width="${SW}" ${dash(len, 0)}><title>${PRIO_LABEL[r.k]} ${r.d}/${r.n}</title></circle>`;
    if (dl > 0) arcs += `<circle cx="${C}" cy="${C}" r="${R}" class="pd-done" stroke="${PRIO_COLOR[r.k]}" stroke-width="${SW}" ${dash(dl, 0)}><title>${PRIO_LABEL[r.k]} 끝냄 ${r.d}</title></circle>`;
    at += len + gap;
  }
  const pctv = total ? Math.round((done / total) * 100) : 0;
  return `<svg class="pd" viewBox="0 0 200 200" width="${size}" height="${size}" role="img" aria-label="체크리스트 ${done}/${total} ${label}">
    <defs><linearGradient id="pd-sheen" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".30"/><stop offset=".45" stop-color="#fff" stop-opacity=".03"/><stop offset="1" stop-color="#fff" stop-opacity=".08"/></linearGradient>
      <radialGradient id="pd-disc" cx="50%" cy="30%" r="75%"><stop offset="0" stop-color="#fff" stop-opacity=".10"/><stop offset=".7" stop-color="#fff" stop-opacity=".02"/><stop offset="1" stop-color="#fff" stop-opacity=".06"/></radialGradient></defs>
    <circle cx="${C}" cy="${C}" r="${R - SW / 2 - 8}" class="pd-disc" fill="url(#pd-disc)"/>
    <circle cx="${C}" cy="${C}" r="${R}" class="pd-track" stroke-width="${SW}"/>
    <g transform="rotate(-90 ${C} ${C})">${arcs}</g>
    <circle cx="${C}" cy="${C}" r="${R}" class="pd-sheen" stroke="url(#pd-sheen)" stroke-width="${SW}"/>
    <text x="${C}" y="${C + 4}" text-anchor="middle" class="pd-big">${total ? `${done}<tspan class="pd-of">/${total}</tspan>` : "–"}</text>
    <text x="${C}" y="${C + 26}" text-anchor="middle" class="pd-cap">${total ? `${pctv}% ${esc(label)}` : "할 일 없음"}</text>
  </svg>`;
}

export function prioLegend(items) {
  const rows = prioStats(items), max = Math.max(1, ...rows.map((r) => r.n));
  return rows.map((r) => `<div class="pb" style="--pc:${PRIO_COLOR[r.k]}"><span class="pb-l">${PRIO_LABEL[r.k]}</span><span class="pb-t" style="--w:${(r.n / max) * 100}%"><i style="--f:${(r.d / r.n) * 100}%"></i></span><span class="pb-n">${r.d}/${r.n}</span></div>`).join("");
}
