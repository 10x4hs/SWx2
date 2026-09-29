// 영어 차트 — 홈 링과 같은 문법: 진한 색 = 한 것 · 같은 색 52% = 흐른 시간(재는 중) · 회색 = 남은 것 · 흰 눈금 = 지금.
// 모두 화면 폭(px)을 받아 1:1 로 그려서 글자가 작아지지 않아요.
import { esc } from "../util.js";
import { sector, nowTick, polar, f2, center } from "../charts/svg.js";
import { mins, hours1 } from "./data.js";

// ---------- 오늘 블록 링: 블록 하나 = 칸 하나 (칸 길이 = 목표 분) ----------
// blocks = [{ key, n, short, name, color, target, actual, live }]  live = 스톱워치로 재는 중인 분
export function blockRing(blocks, W) {
  const wide = W >= 500;
  const D = wide ? Math.min(300, W - 250) : Math.max(240, Math.min(W - 8, 340));
  const sw = wide ? 30 : Math.round(D * 0.105), r = D / 2 - sw / 2 - 4;
  const H = wide ? D + 40 : D + 8, cx = W / 2, cy = H / 2;
  const g = { cx, cy, r, sw };
  const T = blocks.reduce((s, b) => s + b.target, 0) || 1;
  const done = blocks.reduce((s, b) => s + (b.actual || 0), 0);
  const live = blocks.reduce((s, b) => s + (b.live || 0), 0);
  const n = blocks.length, gap = n > 1 ? 0.012 : 0;
  let segs = sector(g, 0, 1, "ch-track"), labels = "";
  let a = 0;
  blocks.forEach((b, k) => {
    const len = b.target / T, a0 = a + gap / 2, a1 = a + len - gap / 2, span = a1 - a0;
    a += len;
    const fd = Math.min(1, (b.actual || 0) / b.target), fl = Math.min(1 - fd, (b.live || 0) / b.target);
    const tip = `${b.name} · ${b.actual || 0}분 / ${b.target}분`;
    const st = `--c:${b.color}`;
    segs += sector(g, a0, a1, "ch-todo ch-seg", { k, tip, style: st });
    if (fd > 0) segs += sector(g, a0, a0 + span * fd, "ch-done ch-seg", { k, tip, style: st });
    if (fl > 0) segs += sector(g, a0 + span * fd, a0 + span * (fd + fl), "ch-past ch-seg", { k, tip: `${b.name} · 재는 중 ${b.live}분`, style: st });
    const mid = (a0 + a1) / 2;
    if (wide) {
      const [x, y] = polar(cx, cy, r + sw / 2 + 18, mid);
      const side = x > cx + 12 ? "start" : x < cx - 12 ? "end" : "middle";
      const dy = side === "middle" ? (y < cy ? -22 : 14) : -4;
      const over = (b.actual || 0) > b.target ? " +" : "";
      labels += `<g class="en-lbl${fd >= 1 ? " done" : ""}"><text x="${f2(x)}" y="${f2(y + dy)}" text-anchor="${side}" font-size="14.5">${esc(b.n)} ${esc(b.short)}</text>
        <text class="v" x="${f2(x)}" y="${f2(y + dy + 19)}" text-anchor="${side}" font-size="13.5">${b.actual || 0} / ${b.target}분${over}</text></g>`;
    } else {
      const [x, y] = polar(cx, cy, r, mid);
      labels += `<text class="en-badge${fd >= 1 ? " done" : ""}" x="${f2(x)}" y="${f2(y + 6)}" text-anchor="middle" font-size="${Math.round(sw * 0.52)}">${esc(b.n)}</text>`;
    }
  });
  const k = wide ? 0.9 : Math.max(0.8, D / 340);
  const left = Math.max(0, T - done);
  return `<svg class="ch en-ring" viewBox="0 0 ${f2(W)} ${f2(H)}" width="${f2(W)}" height="${f2(H)}" role="img" aria-label="오늘 블록 ${done}분 / 목표 ${T}분">
    ${segs}${labels}
    ${center(cx, cy - 14 * k, { big: String(done), unit: "분", cap: `목표 ${T}분`, sub: live ? `재는 중 +${live}분` : left ? `${left}분 남음` : "오늘 목표 다 채움", size: Math.round(64 * k), k })}
  </svg>`;
}

// ---------- 누적 시간 링: 진한 색 = 쌓은 시간 · 옅은 색 = 지난 날만큼 · 회색 = 남은 시간 ----------
// rings = [{ label, done, goal, elapsed, color }] 바깥부터 (전체 650시간 → 이번 단계)
export function progressRing(rings, W) {
  const D = Math.max(240, Math.min(W - 8, 330)), sw = Math.round(D * 0.085), gap = Math.round(sw * 0.45);
  const cx = W / 2, cy = D / 2 + 4;
  let s = "";
  rings.forEach((it, i) => {
    const r = D / 2 - sw / 2 - 6 - i * (sw + gap), g = { cx, cy, r, sw }, st = `--c:${it.color}`;
    const d = Math.min(1, it.done / (it.goal || 1)), e = Math.max(0, Math.min(1, it.elapsed));
    s += sector(g, 0, 1, "ch-track");
    s += sector(g, 0, 1, "ch-todo", { style: st, tip: `${it.label} · 남은 시간 ${hours1(Math.max(0, it.goal - it.done))}시간` });
    if (e > d) s += sector(g, d, e, "ch-past", { style: st, tip: `${it.label} · 지난 날만큼의 몫 ${Math.round(e * 100)}%` });
    if (d > 0) s += sector(g, 0, Math.max(d, 0.004), "ch-done", { style: st, tip: `${it.label} · 쌓은 시간 ${hours1(it.done)}시간` });
    if (e > 0 && e < 1) s += nowTick(cx, cy, r - sw / 2 - 3, r + sw / 2 + 3, e);
  });
  const o = rings[0], k = D / 330, d0 = Math.min(1, o.done / (o.goal || 1));
  const inner = rings[1];
  return `<svg class="ch en-ring" viewBox="0 0 ${f2(W)} ${f2(D + 8)}" width="${f2(W)}" height="${f2(D + 8)}" role="img" aria-label="${esc(rings.map((x) => `${x.label} ${hours1(x.done)}시간 / ${Math.round(x.goal / 60)}시간`).join(", "))}">
    ${s}
    ${center(cx, cy - 16 * k, { big: hours1(o.done), unit: "시간", cap: `${Math.round(o.goal / 60)}시간 중 ${d0 > 0 && d0 < 0.1 ? (Math.round(d0 * 1000) / 10).toFixed(1) : Math.round(d0 * 100)}%`, sub: inner ? `${inner.label} ${hours1(inner.done)} / ${Math.round(inner.goal / 60)}시간` : "", size: Math.round(56 * k), k: k * 0.95 })}
  </svg>`;
}

// ---------- 최근 14일 막대: 입 연 시간(청록) + 나머지(파랑), 점선 = 하루 목표 ----------
// days = [{ day, label, spoken, other, today }]
export function bars14(days, goal, W) {
  const H = 230, top = 26, bottom = 46, left = 8, right = 8;
  const max = Math.max(goal || 0, ...days.map((d) => d.spoken + d.other), 30) * 1.12;
  const cw = (W - left - right) / days.length, bw = Math.max(8, Math.min(34, cw * 0.58));
  const y = (v) => top + (H - top - bottom) * (1 - v / max);
  const base = y(0);
  const narrow = cw < 30;
  let s = `<line class="en-axis" x1="${left}" x2="${f2(W - right)}" y1="${f2(base)}" y2="${f2(base)}"/>`;
  days.forEach((d, i) => {
    const x = left + i * cw + (cw - bw) / 2, tot = d.spoken + d.other;
    const tip = `${d.day} · 입 연 시간 ${mins(d.spoken)} · 나머지 ${mins(d.other)}`;
    if (d.spoken) s += `<rect class="en-bar sp" x="${f2(x)}" y="${f2(y(d.spoken))}" width="${f2(bw)}" height="${f2(base - y(d.spoken))}" rx="3"><title>${esc(tip)}</title></rect>`;
    if (d.other) s += `<rect class="en-bar ot" x="${f2(x)}" y="${f2(y(tot))}" width="${f2(bw)}" height="${f2(y(d.spoken) - y(tot))}" rx="3"><title>${esc(tip)}</title></rect>`;
    if (!tot) s += `<rect class="en-bar none" x="${f2(x)}" y="${f2(base - 3)}" width="${f2(bw)}" height="3" rx="1.5"/>`;
    if (tot && !narrow) s += `<text class="en-bv" x="${f2(x + bw / 2)}" y="${f2(y(tot) - 6)}" text-anchor="middle" font-size="12.5">${tot}</text>`;
    const show = !narrow || i % 2 === (days.length - 1) % 2;
    if (show) s += `<text class="en-bx${d.today ? " today" : ""}" x="${f2(x + bw / 2)}" y="${f2(base + 20)}" text-anchor="middle" font-size="13">${esc(d.label)}</text>`;
    if (d.today) s += `<text class="en-bx today" x="${f2(x + bw / 2)}" y="${f2(base + 38)}" text-anchor="middle" font-size="12.5">오늘</text>`;
  });
  if (goal) s += `<line class="en-goal" x1="${left}" x2="${f2(W - right)}" y1="${f2(y(goal))}" y2="${f2(y(goal))}"/><text class="en-gl" x="${f2(W - right)}" y="${f2(y(goal) - 6)}" text-anchor="end" font-size="12.5">하루 목표 ${goal}분</text>`;
  return `<svg class="ch en-bars" viewBox="0 0 ${f2(W)} ${H}" width="${f2(W)}" height="${H}" role="img" aria-label="최근 14일 공부 시간">${s}</svg>`;
}

// 분 → 잔디 단계 (1~4)
export const level = (m) => (m >= 180 ? 4 : m >= 120 ? 3 : m >= 60 ? 2 : 1);
