// 한 달 · 한 주 차트 — 바깥 링 = 그 기간 목표(칸 하나 = 목표 하나), 안쪽 링 = 날마다 한 칸.
// 날 칸은 그날 할 일을 얼마나 끝냈는지만큼 진해져요. 계획 없이 지나간 날은 회색, 아직 안 온 날은 빈 트랙.
import { esc, pct, DOW } from "../util.js";
import { f2, polar, sector, goalRing, nowTick, mix, center, figsSide, figsBelow } from "./svg.js";

const C = 260;
const OUT = { cx: C, cy: C, r: 229, sw: 26 };
const IN = { cx: C, cy: C, r: 176, sw: 50 };

// 날 칸 하나의 설명
function dayTip(d) {
  const head = `${d.date.getMonth() + 1}월 ${d.date.getDate()}일 (${DOW[d.date.getDay()]})${d.today ? " · 오늘" : ""}`;
  if (d.future) return `${head} · ${d.total ? `계획 ${d.total}개` : "아직 안 온 날"}`;
  if (!d.total) return `${head} · 계획 없음`;
  return `${head} · ${d.total}개 중 ${d.done}개 끝냄 (${pct(d.done / d.total)}%)`;
}

// 날 링: 칸마다 진하기 = 그날 실행률
function dayRing(days) {
  const n = days.length, gap = n > 10 ? 0.0035 : 0.008;
  let s = sector(IN, 0, 1, "ch-track"), hi = "";
  days.forEach((d, k) => {
    const a0 = k / n + gap / 2, a1 = (k + 1) / n - gap / 2, tip = dayTip(d), attrs = `data-day="${d.ymd}" tabindex="-1"`;
    if (d.future) s += sector(IN, a0, a1, "ch-todo ch-seg ch-day", { k, tip, attrs });
    else if (!d.total) s += sector(IN, a0, a1, "ch-empty ch-seg ch-day", { k, tip, attrs });
    else s += sector(IN, a0, a1, "ch-fill ch-seg ch-day", { k, tip, attrs, style: mix(d.done / d.total) });
    if (d.today) hi = sector({ ...IN, sw: IN.sw + 4 }, a0, a1, "ch-today");
  });
  return s + hi;
}

// 안쪽 글자: 한 달은 1·5·10·15·20·25·마지막 날(+오늘), 한 주는 요일 + 실행률
function dayLabels(days, scope, big) {
  const n = days.length, rN = IN.r - IN.sw / 2 - (big ? 22 : 18);
  if (scope === "month") {
    const show = new Set([1, 5, 10, 15, 20, 25, n]);
    return days.map((d, k) => {
      const num = d.date.getDate();
      if (!show.has(num) && !d.today) return "";
      const [x, y] = polar(C, C, rN, (k + 0.5) / n);
      return `<text class="ch-num${d.today ? " today" : ""}" x="${f2(x)}" y="${f2(y + (big ? 7 : 5))}" text-anchor="middle" font-size="${big ? 21 : 15}">${num}</text>`;
    }).join("");
  }
  return days.map((d, k) => {
    const v = (k + 0.5) / n, [x, y0] = polar(C, C, rN - (big ? 8 : 6), v), y = y0 - (big ? 8 : 6), x2 = x, y2 = y + (big ? 30 : 24);
    const p = d.future || !d.total ? (d.future ? "" : "–") : pct(d.done / d.total) + "%";
    return `<text class="ch-num dow${d.today ? " today" : ""}" x="${f2(x)}" y="${f2(y + 6)}" text-anchor="middle" font-size="${big ? 23 : 18}">${DOW[d.date.getDay()]}</text>`
      + (p ? `<text class="ch-dp" x="${f2(x2)}" y="${f2(y2 + 5)}" text-anchor="middle" font-size="${big ? 18 : 13.5}">${p}</text>` : "");
  }).join("");
}

// 숫자 판에 들어갈 값들
function figures(d) {
  const lived = d.days.filter((x) => !x.future), planned = lived.filter((x) => x.total);
  const acted = lived.filter((x) => x.done > 0).length;
  const avg = planned.length ? planned.reduce((s, x) => s + x.done / x.total, 0) / planned.length : null;
  const g = d.goals, gd = g.filter((x) => x.done).length;
  return {
    avg,
    rows: [
      g.length ? { label: "목표", value: `${gd}/${g.length}`, sub: "이룸" } : { label: "목표", value: "없음", sub: "세우면 바깥 링에 칸이 생겨요", short: "아직 없어요", none: true },
      { label: "실행한 날", value: `${acted}일`, sub: `지난 ${lived.length}일 중` },
      avg == null ? { label: "평균 실행률", value: "없음", sub: "계획한 날이 없어요", short: "계획 없음", none: true } : { label: "평균 실행률", value: `${pct(avg)}%`, sub: `계획한 ${planned.length}일 기준` },
    ],
  };
}

export function periodChart(d, { wide = true } = {}) {
  const t = Math.max(0, Math.min(1, d.time)), F = figures(d), g = d.goals, gd = g.filter((x) => x.done).length;
  // 가운데: 목표가 있으면 목표 달성%, 없으면 평균 실행률
  const mid = g.length ? { big: String(pct(gd / g.length)), unit: "%", cap: d.scope === "month" ? "이번 달 달성" : "이번 주 달성" }
    : F.avg != null ? { big: String(pct(F.avg)), unit: "%", cap: "평균 실행률" } : { big: "–", cap: "아직 목표·계획이 없어요", none: true };
  const W = wide ? 2 * C + 380 : 2 * C, H = wide ? 2 * C : 2 * C + 170;
  const label = `${d.title}: 목표 ${g.length ? `${gd}/${g.length}` : "없음"}, ${F.rows[1].value} 실행`;
  return `<svg class="ch ch-${d.scope}${wide ? " wide" : ""}" viewBox="0 0 ${W} ${H}" role="group" aria-label="${esc(label)}" style="--c:${d.color}">
    <g class="ch-ring" data-ring="${d.scope}" tabindex="0" role="link" aria-label="${esc(d.title)} 목표 보기">
      <circle class="ch-hit" cx="${C}" cy="${C}" r="${OUT.r}" stroke-width="${OUT.sw + 8}"/>
      ${goalRing(OUT, g.map((x) => ({ title: x.text, done: !!x.done })), t)}
    </g>
    <g class="ch-days">${dayRing(d.days)}</g>
    ${nowTick(C, C, IN.r - IN.sw / 2 - 3, OUT.r + OUT.sw / 2 + 8, t)}
    ${dayLabels(d.days, d.scope, !wide)}
    ${center(C, C - (wide ? 10 : 22), { ...mid, sub: `D-${d.dLeft}`, size: mid.none ? 60 : d.scope === "week" ? 76 : 84, k: wide ? 1 : 1.3 })}
    ${wide ? figsSide(2 * C + 50, 58, { title: d.title, note: "바깥 링 = 목표 · 안쪽 링 = 하루하루", rows: F.rows, key: true })
      : figsBelow(2 * C + 26, W, { rows: F.rows, key: true })}
  </svg>`;
}
