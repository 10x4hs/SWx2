// 차트 공용 도구 — 링 위의 칸(부채꼴)·눈금·숫자 판을 SVG 문자열로 만들어요.
// 읽는 법은 어디서나 같아요: 진한 색 = 이룬 목표/끝낸 일 · 옅은 같은 색(52%) = 이미 지난 시간 · 회색 = 남은 것/앞으로 · 흰 눈금 = 지금.
import { esc, pct } from "../util.js";

export const f2 = (x) => String(Math.round(x * 100) / 100);
// 0~1 (12시 방향에서 시계 방향) → 좌표
export const polar = (cx, cy, r, v) => { const a = v * 2 * Math.PI - Math.PI / 2; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; };

// 링 위의 칸 하나 (가운데 반지름 r, 두께 sw, a0 → a1). 한 바퀴면 도넛 모양으로.
export function sectorPath(cx, cy, r, sw, a0, a1) {
  const ro = r + sw / 2, ri = r - sw / 2, len = a1 - a0;
  if (len >= 0.9999) {
    return `M${f2(cx + ro)} ${cy}A${ro} ${ro} 0 1 1 ${f2(cx - ro)} ${cy}A${ro} ${ro} 0 1 1 ${f2(cx + ro)} ${cy}Z`
      + `M${f2(cx + ri)} ${cy}A${ri} ${ri} 0 1 0 ${f2(cx - ri)} ${cy}A${ri} ${ri} 0 1 0 ${f2(cx + ri)} ${cy}Z`;
  }
  const lg = len > 0.5 ? 1 : 0;
  const [x0, y0] = polar(cx, cy, ro, a0), [x1, y1] = polar(cx, cy, ro, a1), [x2, y2] = polar(cx, cy, ri, a1), [x3, y3] = polar(cx, cy, ri, a0);
  return `M${f2(x0)} ${f2(y0)}A${ro} ${ro} 0 ${lg} 1 ${f2(x1)} ${f2(y1)}L${f2(x2)} ${f2(y2)}A${ri} ${ri} 0 ${lg} 0 ${f2(x3)} ${f2(y3)}Z`;
}

// g = { cx, cy, r, sw }. tip 은 마우스를 올리면 뜨는 설명 (아래 범례 줄에도 보여요)
export function sector(g, a0, a1, cls, { k = 0, tip = "", style = "", attrs = "" } = {}) {
  const t = tip ? ` data-tip="${esc(tip)}"` : "";
  return `<path class="${cls}" d="${sectorPath(g.cx, g.cy, g.r, g.sw, a0, a1)}" style="--k:${k};${style}"${t} ${attrs}>${tip ? `<title>${esc(tip)}</title>` : ""}</path>`;
}

// 목표 링: 목표 하나 = 칸 하나. 이룬 목표는 앞쪽부터 진하게, 남은 목표는 회색 + 지난 부분만 옅게
export function goalRing(g, segs, t) {
  const n = segs.length;
  let s = sector(g, 0, 1, "ch-track");
  if (!n) return s + (t > 0 ? sector(g, 0, t, "ch-past ch-seg", { tip: "목표를 세우면 칸이 생겨요" }) : "");
  const gap = n === 1 ? 0 : Math.min(0.012, 0.3 / n), len = 1 / n - gap;
  segs.forEach((sg, k) => {
    const a0 = k / n + gap / 2, a1 = a0 + len, tip = `${sg.title}${sg.done ? " · 이룸" : " · 아직"}`, attrs = sg.id ? `data-plan="${esc(sg.id)}"` : "";
    if (sg.done) { s += sector(g, a0, a1, "ch-done ch-seg", { k, tip, attrs }); return; }
    s += sector(g, a0, a1, "ch-todo ch-seg", { k, tip, attrs });
    if (t > a0) s += sector(g, a0, Math.min(a1, t), "ch-past ch-seg", { k, tip, attrs });
  });
  return s;
}

// 지금 눈금 (r0 → r1)
export function nowTick(cx, cy, r0, r1, t) {
  const [x1, y1] = polar(cx, cy, r0, t), [x2, y2] = polar(cx, cy, r1, t);
  return `<line class="ch-now" x1="${f2(x1)}" y1="${f2(y1)}" x2="${f2(x2)}" y2="${f2(y2)}"/>`;
}

// 하루 실행률 → 링 색의 진하기 (0% 도 옅게 보이게 18%부터)
export const mix = (p) => `fill:color-mix(in srgb, var(--c) ${Math.round(18 + 82 * Math.max(0, Math.min(1, p)))}%, transparent)`;

// 가운데 큰 숫자 + 설명 두 줄
export function center(cx, cy, { big, unit = "", cap = "", sub = "", size = 84, k = 1 }) {
  const y = cy + size * 0.26;
  return `<text class="ch-big" x="${cx}" y="${y}" text-anchor="middle" font-size="${size}">${esc(big)}${unit ? `<tspan class="ch-unit" font-size="${Math.round(size * 0.42)}">${esc(unit)}</tspan>` : ""}</text>
    ${cap ? `<text class="ch-cap" x="${cx}" y="${f2(y + 34 * k)}" text-anchor="middle" font-size="${f2(16 * k)}">${esc(cap)}</text>` : ""}
    ${sub ? `<text class="ch-csub" x="${cx}" y="${f2(y + 60 * k)}" text-anchor="middle" font-size="${f2(15 * k)}">${esc(sub)}</text>` : ""}`;
}

// 숫자 판 — 넓은 화면: 링 오른쪽에 세로로. rows = [{ label, value, sub }]
export function figsSide(x, y, { title, note, rows, key }) {
  let s = `<text class="ch-title" x="${x}" y="${y}" font-size="26">${esc(title)}</text>`;
  if (note) s += `<text class="ch-note" x="${x}" y="${y + 28}" font-size="14.5">${esc(note)}</text>`;
  let yy = y + (note ? 76 : 50);
  // 한 줄: 이름 · 설명 / 아래 줄: 큰 숫자
  for (const r of rows) {
    s += `<text class="ch-fl" x="${x}" y="${yy}" font-size="15">${esc(r.label)}<tspan class="ch-fs" font-size="14" dx="8">${esc(r.sub || "")}</tspan></text>
      <text class="ch-fv${r.none ? " none" : ""}" x="${x}" y="${yy + 40}" font-size="${r.none ? 28 : 40}">${esc(r.value)}</text>`;
    yy += 76;
  }
  if (key) s += intensityKey(x, yy - 14, 1);
  return s;
}

// 숫자 판 — 좁은 화면: 링 아래에 세 칸으로 (글자는 화면에서 줄어드니 조금 크게)
export function figsBelow(y, W, { rows, key }) {
  const n = rows.length, cw = (W - 40) / n;
  let s = "";
  rows.forEach((r, i) => {
    const x = 20 + i * cw + 6;
    s += `<text class="ch-fl" x="${x}" y="${y}" font-size="20">${esc(r.label)}</text>
      <text class="ch-fv${r.none ? " none" : ""}" x="${x}" y="${y + 46}" font-size="${r.none ? 32 : 42}">${esc(r.value)}</text>
      <text class="ch-fs" x="${x}" y="${y + 76}" font-size="19">${esc(r.short || r.sub || "")}</text>`;
  });
  if (key) s += intensityKey(26, y + 118, 1.35);
  return s;
}

// 진하기 범례: 하루 실행률 0% → 100%
export function intensityKey(x, y, k = 1) {
  const w = 26 * k, h = 12 * k, g = 4 * k;
  const cells = [0, 0.25, 0.5, 0.75, 1].map((p, i) => `<rect x="${f2(x + i * (w + g))}" y="${f2(y)}" width="${f2(w)}" height="${f2(h)}" rx="${f2(3 * k)}" style="${mix(p)}"/>`).join("");
  const x2 = x + 5 * (w + g) + 6 * k;
  return `<g class="ch-key">${cells}<text class="ch-fs" x="${f2(x2)}" y="${f2(y + h - 1)}" font-size="${f2(14 * k)}">하루 실행률 0 → 100%</text></g>`;
}

// 글자 폭 어림 (한글은 1em, 숫자·영문은 0.6em)
export const fw = (s, size) => [...String(s)].reduce((w, c) => w + (/[ㄱ-힣]/.test(c) ? 1 : c === " " ? 0.3 : 0.6), 0) * size;
export const cut = (s, n) => { const a = [...String(s)]; return a.length > n ? a.slice(0, n - 1).join("") + "…" : a.join(""); };
export { pct };
