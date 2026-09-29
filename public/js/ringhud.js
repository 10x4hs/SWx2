// 홈 링 차트 — 내가 세운 계획 모양 그대로 그려요.
//   올해 · 이번 달 · 이번 주: 목표 하나 = 칸 하나. 이룬 목표는 색으로 채워지고(앞쪽부터), 남은 목표는 옅은 칸.
//   오늘: 24시간 시계. 시간표의 할 일이 실제 시각 자리에 호로 놓여요(끝낸 건 채움).
//   이미 지난 시간은 링 색을 옅게 칠하고(진한 색 = 이룬 목표), 흰 눈금 = 지금.
// 넓은 화면에선 링 꼭대기 높이에 맞춰 오른쪽에 숫자 행을, 좁은 화면에선 링만 그리고 행은 HTML로.
import { esc, pct } from "./util.js";

export const RINGS = [
  { key: "year", label: "올해", en: "YEAR", color: "var(--r-year)" },
  { key: "month", label: "이번 달", en: "MONTH", color: "var(--r-month)" },
  { key: "week", label: "이번 주", en: "WEEK", color: "var(--r-week)" },
  { key: "day", label: "오늘", en: "TODAY", color: "var(--r-day)" },
];

const SW = 24, GAP = 15, R0 = 244, C = 260;
const radius = (i) => R0 - SW / 2 - i * (SW + GAP);
const polar = (r, v) => { const a = v * 2 * Math.PI - Math.PI / 2; return [C + r * Math.cos(a), C + r * Math.sin(a)]; };
const f2 = (x) => x.toFixed(2);

export function gapText(it) {
  if (!it.total) return it.key === "day" ? "시간표에 할 일을 넣으면 시계에 놓여요" : "목표를 세우면 칸이 생겨요";
  const d = pct(it.value) - pct(it.time);
  return d >= 0 ? `${d}%p 앞섬` : `${-d}%p 밀림`;
}

// 링 위의 호 하나 (0~1 사이 시작·길이). pathLength=100 인 원의 점선으로 그려요.
// 위치는 인라인 style로 (CSS 규칙보다 우선하게)
const arc = (r, start, len, cls, sw, k = 0, title = "") =>
  `<circle class="${cls}" cx="${C}" cy="${C}" r="${r}" pathLength="100" stroke-width="${sw}" style="stroke-dasharray:${f2(len * 100)} ${f2(100 - len * 100)};stroke-dashoffset:${f2(-start * 100)};--k:${k}">${title ? `<title>${esc(title)}</title>` : ""}</circle>`;

// 진하기로 읽어요: 진한 색 = 이룬 목표 · 옅은 같은 색 = 이미 지난 시간 · 회색 = 남은 목표/앞으로의 시간
function pieces(it, r, t) {
  const past = (a0, a1) => (t > a0 ? arc(r, a0, Math.min(a1, t) - a0, "rh-past", SW) : "");
  // 오늘: 지난 시간은 이어진 띠, 시간표 블록은 시계 위 제자리에
  if (it.key === "day") {
    return past(0, 1) + (it.blocks || []).map((b, k) => arc(r, b.a0, Math.max(0.004, b.a1 - b.a0 - 0.002), `rh-seg${b.done ? " done" : ""}`, SW, k, `${b.time} ${b.title}${b.done ? " · 끝냄" : ""}`)).join("");
  }
  // 올해·달·주: 목표 수만큼 칸. 칸마다 지난 부분만 옅게 칠해서 칸 경계가 남아요
  const segs = it.segs || [], n = segs.length;
  if (!n) return past(0, 1);
  const gap = n === 1 ? 0 : Math.min(0.012, 0.3 / n), len = 1 / n - gap;
  return segs.map((sg, k) => {
    const a0 = k / n + gap / 2, a1 = a0 + len, title = `${sg.title}${sg.done ? " · 이룸" : ""}`;
    return sg.done ? arc(r, a0, len, "rh-seg done", SW, k, title) : arc(r, a0, len, "rh-seg", SW, k, title) + past(a0, a1);
  }).join("");
}

function ringSvg(it, i) {
  const r = radius(i), t = Math.max(0, Math.min(1, it.time));
  const [tx1, ty1] = polar(r - SW / 2 - 2, t), [tx2, ty2] = polar(r + SW / 2 + 8, t);
  const hours = it.key === "day" ? [0, 6, 12, 18].map((h) => { const [x, y] = polar(r - SW / 2 - 12, h / 24); return `<text class="rh-hour" x="${f2(x)}" y="${f2(y + 4)}" text-anchor="middle">${h}</text>`; }).join("") : "";
  return `<g class="rh-ring" data-ring="${it.key}" style="--c:${it.color};--i:${i}" tabindex="0" role="link" aria-label="${esc(it.label)} ${it.total ? `${pct(it.value)}% 달성, ` : ""}${pct(t)}% 지남">
    <circle class="rh-track" cx="${C}" cy="${C}" r="${r}" stroke-width="${SW}"/>
    ${pieces(it, r, t)}
    <line class="rh-now" x1="${f2(tx1)}" y1="${f2(ty1)}" x2="${f2(tx2)}" y2="${f2(ty2)}"/>
    ${hours}
    <circle class="rh-hit" cx="${C}" cy="${C}" r="${r}" stroke-width="${SW + GAP}"/>
  </g>`;
}

// 넓은 화면용 숫자 행 (링 꼭대기와 같은 높이)
function rowSvg(it, i, x0) {
  const y = C - radius(i);
  // 점선은 가장 바깥 링 밖에서 시작해요 (가운데서 시작하면 바깥 링 띠를 가로질러 비쳐 보여요)
  const dy = radius(i), xs = C + Math.sqrt(Math.max(0, (R0 + 6) ** 2 - dy * dy)) + 8;
  return `<g class="rh-row" data-ring="${it.key}" style="--c:${it.color};--i:${i}">
    ${xs < x0 - 30 ? `<line class="rh-lead" x1="${f2(xs)}" y1="${y}" x2="${x0 - 18}" y2="${y}"/>` : ""}
    <circle class="rh-dot" cx="${x0 - 18}" cy="${y}" r="4"/>
    <text class="rh-name" x="${x0}" y="${y + 6}">${esc(it.label)}</text>
    <text class="rh-big${it.total ? "" : " none"}" x="${x0 + 92}" y="${y + 10}">${it.total ? pct(it.value) + "%" : "—"}</text>
    <text class="rh-sub" x="${x0 + 190}" y="${y + 5}">${esc(it.detail || "")}</text>
    <text class="rh-gap${!it.total ? " none" : it.value < it.time ? " behind" : ""}" x="${x0 + 190}" y="${y + 24}">${esc(gapText(it))}</text>
  </g>`;
}

export function ringHud(items, { wide = true, center = "", caption = "" } = {}) {
  const x0 = 2 * C + 64, W = wide ? x0 + 380 : 2 * C;
  return `<svg class="rh${wide ? " wide" : ""}" viewBox="0 0 ${W} ${2 * C}" role="group" aria-label="기간별 계획과 흘러간 시간">
    ${wide ? items.map((it, i) => rowSvg(it, i, x0)).join("") : ""}
    ${items.map(ringSvg).join("")}
    <text class="rh-center" x="${C}" y="${C + 22}" text-anchor="middle">${esc(center)}</text>
    <text class="rh-cap" x="${C}" y="${C + 50}" text-anchor="middle">${esc(caption)}</text>
  </svg>`;
}

// 좁은 화면용 HTML 행
export function ringRows(items, href) {
  return items.map((it, i) => `<a class="rh-li" href="${href(it.key)}" data-ring="${it.key}" style="--c:${it.color};--i:${i}">
    <i></i><span class="n">${esc(it.label)}</span><b${it.total ? "" : ' class="none"'}>${it.total ? pct(it.value) + "%" : "—"}</b>
    <span class="s">${esc(it.detail || "")} · ${esc(gapText(it))}</span></a>`).join("");
}
