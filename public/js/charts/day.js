// 하루 차트 — 큰 24시간 시계. 0시부터 지금까지는 옅게 칠하고, 시간표의 할 일은 실제 시각 자리에 놓여요.
// 끝낸 일은 진하게, 아직 안 한 일은 회색. 이름표는 링 바깥에 짧은 선으로 달아요(겹치면 위아래로 비켜 서요).
// 좁은 화면에선 이름표 대신 번호 동그라미 + 링 아래 번호 설명.
import { esc } from "../util.js";
import { f2, polar, sector, center, cut } from "./svg.js";

// 한쪽(왼쪽/오른쪽) 이름표를 위에서부터 겹치지 않게 늘어놓아요. 칸이 모자라면 짧은 일부터 빼요.
function spread(side, top, bottom, gap) {
  const cap = Math.max(1, Math.floor((bottom - top) / gap) + 1);
  let keep = side, dropped = 0;
  if (side.length > cap) { keep = [...side].sort((a, b) => (b.b.a1 - b.b.a0) - (a.b.a1 - a.b.a0)).slice(0, cap); dropped = side.length - cap; }
  keep.sort((a, b) => a.y0 - b.y0);
  keep.forEach((p, k) => { p.y = Math.max(p.y0, k ? keep[k - 1].y + gap : top); });
  for (let k = keep.length - 1; k >= 0; k--) { const lim = k === keep.length - 1 ? bottom : keep[k + 1].y - gap; if (keep[k].y > lim) keep[k].y = lim; }
  return { keep, dropped };
}

export function dayClock(d, { wide = true } = {}) {
  const W = wide ? 860 : 520, cx = W / 2, cy = wide ? 280 : 260;
  const g = { cx, cy, r: wide ? 180 : 184, sw: wide ? 38 : 40 };
  const t = Math.max(0, Math.min(1, d.time)), ro = g.r + g.sw / 2, ri = g.r - g.sw / 2;
  const blocks = d.blocks || [];

  // 바탕: 트랙 → 지난 시간(옅게) → 할 일 블록
  let s = sector(g, 0, 1, "ch-track");
  if (t > 0) s += sector(g, 0, t, "ch-past ch-seg", { tip: `0시부터 지금까지 · ${d.now}` });
  // 조각 색 = 종류(영어 · 논문 · 휴식 · 사업 · 운동 · 그 밖), 끝낸 일은 진하게 · 안 한 일은 옅게. data-plan 으로 누르면 상세
  blocks.forEach((b, k) => {
    const tip = `${b.time} ${b.title} · ${b.done ? "끝냄" : "아직"}`;
    s += sector(g, b.a0, Math.max(b.a0 + 0.004, b.a1 - 0.002), `${b.done ? "ch-done" : "ch-plan"} ch-seg ch-block cat-${b.cat || "other"}`, { k, tip, attrs: b.id ? `data-plan="${esc(b.id)}"` : "" });
  });

  // 눈금: 매시간 짧게, 3시간마다 길게 + 숫자
  let ticks = "";
  for (let h = 0; h < 24; h++) {
    const major = h % 3 === 0, [x1, y1] = polar(cx, cy, ri - 3, h / 24), [x2, y2] = polar(cx, cy, ri - (major ? 12 : 7), h / 24);
    ticks += `<line class="ch-tick${major ? " major" : ""}" x1="${f2(x1)}" y1="${f2(y1)}" x2="${f2(x2)}" y2="${f2(y2)}"/>`;
    if (major) { const [x, y] = polar(cx, cy, ri - (wide ? 27 : 32), h / 24); ticks += `<text class="ch-hour" x="${f2(x)}" y="${f2(y + (wide ? 5.5 : 7))}" text-anchor="middle" font-size="${wide ? 16 : 21}">${h}</text>`; }
  }

  // 지금 바늘: 가운데 글자를 피해서 안쪽에서 링 바깥까지
  const [hx1, hy1] = polar(cx, cy, wide ? 104 : 108, t), [hx2, hy2] = polar(cx, cy, ro + 8, t);
  const hand = `<line class="ch-hand" x1="${f2(hx1)}" y1="${f2(hy1)}" x2="${f2(hx2)}" y2="${f2(hy2)}"/><circle class="ch-knob" cx="${f2(hx1)}" cy="${f2(hy1)}" r="4"/>`;

  // 이름표
  let labels = "", H = 2 * cy, legend = "";
  if (wide && blocks.length) {
    const rL = ro + 34, colR = cx + ro + 64, colL = cx - ro - 64, top = 22, bottom = H - 16, gap = 24;
    const L = [], R = [];
    blocks.forEach((b, i) => { const m = (b.a0 + b.a1) / 2, [x, y] = polar(cx, cy, rL, m); (x >= cx ? R : L).push({ b, i, m, y0: y }); });
    let dropped = 0;
    for (const [side, right] of [[R, true], [L, false]]) {
      const { keep, dropped: dr } = spread(side, top, bottom, gap);
      dropped += dr;
      for (const p of keep) {
        const [ax, ay] = polar(cx, cy, ro + 3, p.m), [ex, ey] = polar(cx, cy, ro + 20, p.m);
        const col = right ? colR : colL, lx = right ? col - 10 : col + 10;
        labels += `<g class="ch-lbl${p.b.done ? " done" : ""} cat-${p.b.cat || "other"}"${p.b.id ? ` data-plan="${esc(p.b.id)}"` : ""}><polyline class="ch-lead" points="${f2(ax)},${f2(ay)} ${f2(ex)},${f2(ey)} ${f2(lx)},${f2(p.y)}"/>
          <circle class="ch-sw${p.b.priority ? " pr" : ""}" data-p="${esc(p.b.priority || "")}" cx="${f2(right ? col - 2 : col + 2)}" cy="${f2(p.y)}" r="4.5"/>
          <text x="${f2(right ? col + 8 : col - 8)}" y="${f2(p.y + 5)}" text-anchor="${right ? "start" : "end"}" font-size="15"><tspan class="tm">${esc(p.b.time)}</tspan> ${esc(cut(p.b.title, 13))}</text></g>`;
      }
    }
    if (dropped) labels += `<text class="ch-fs" x="${W - 8}" y="${H - 2}" text-anchor="end" font-size="13.5">이름표 ${dropped}개는 칸이 모자라 뺐어요 · 링에 올리면 보여요</text>`;
  } else if (blocks.length) {
    // 좁은 화면: 링 위에 번호, 아래에 두 줄씩 번호 설명
    blocks.forEach((b, i) => {
      const [x, y] = polar(cx, cy, ro + 20, (b.a0 + b.a1) / 2);
      labels += `<g class="ch-badge${b.done ? " done" : ""} cat-${b.cat || "other"}"${b.id ? ` data-plan="${esc(b.id)}"` : ""}><circle cx="${f2(x)}" cy="${f2(y)}" r="15"/><text x="${f2(x)}" y="${f2(y + 6.5)}" text-anchor="middle" font-size="18">${i + 1}</text></g>`;
    });
    const rows = Math.ceil(blocks.length / 2), y0 = 2 * cy + 36;
    blocks.forEach((b, i) => {
      const col = i < rows ? 0 : 1, row = i < rows ? i : i - rows, x = 22 + col * 252, y = y0 + row * 36;
      legend += `<g class="ch-leg${b.done ? " done" : ""} cat-${b.cat || "other"}"${b.id ? ` data-plan="${esc(b.id)}"` : ""}><circle class="ch-sw${b.priority ? " pr" : ""}" data-p="${esc(b.priority || "")}" cx="${x + 8}" cy="${y - 6}" r="12"/><text class="n" x="${x + 8}" y="${y}" text-anchor="middle" font-size="15">${i + 1}</text>
        <text x="${x + 28}" y="${y}" font-size="19"><tspan class="tm">${esc(b.time)}</tspan> ${esc(cut(b.title, 8))}</text></g>`;
    });
    H = y0 + rows * 36;
  }
  const empty = blocks.length ? "" : `<text class="ch-fs" x="${cx}" y="${cy + ro + 44}" text-anchor="middle" font-size="${wide ? 15 : 19}">시간표에 할 일을 넣으면 시계에 놓여요</text>`;
  if (!blocks.length) H = cy + ro + 60;

  return `<svg class="ch ch-day-clock${wide ? " wide" : ""}" viewBox="0 0 ${W} ${H}" role="group" aria-label="${esc(`오늘 시간표: ${blocks.length}개 중 ${blocks.filter((b) => b.done).length}개 끝냄`)}" style="--c:${d.color}">
    <g class="ch-ring" data-ring="day" tabindex="0" role="link" aria-label="오늘 시간표 보기">
      <circle class="ch-hit" cx="${cx}" cy="${cy}" r="${g.r}" stroke-width="${g.sw + 8}"/>
      ${s}
    </g>
    ${ticks}${labels}${legend}${empty}${hand}
    ${center(cx, cy - (wide ? 12 : 24), { big: d.score == null ? "–" : String(d.score), cap: d.mine ? "오늘 점수" : "오늘", sub: d.count ? `실행 ${d.doneCount}/${d.count} · ${d.now}` : d.now, size: 88, k: wide ? 1 : 1.3 })}
  </svg>`;
}
