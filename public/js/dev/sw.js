// SW 공간 홈 (#/sw) — 검정 바탕 · 얇은 큰 제목 · 과정 줄 목록. 배경은 천천히 떠도는 점과 가까운 점끼리 잇는 선 하나뿐(움직임 줄이기면 멈춰요).
import { esc } from "../util.js";
import { api } from "../api.js";
import { COURSES, getJSON, progressOf } from "./data.js";

const LIST = [
  { c: COURSES.vg, no: "01", line: "임베딩 · 유사도 · HNSW · 벡터DB · 하이브리드 검색 · 지식그래프 · GraphRAG", tag: "NEW" },
  { c: COURSES.dev, no: "02", line: "회사에서 개발 프로젝트가 흐르는 방식 — 12주 · 가상 회사 두런", tag: "" },
];

export function mountSw(host) {
  let alive = true, stopField = null;
  host.innerHTML = `<section class="sw-hero"><canvas class="sw-field" aria-hidden="true"></canvas>
      <div class="sw-in"><div class="m">SWx2 · Software space</div>
        <h1 class="sw-h">Software,<br>one idea at a time.</h1>
        <p class="sw-lead kr">하나의 카드에 한 가지 생각. 과정을 골라 오늘 몫만 읽어요.</p></div></section>
    <section class="sw-in sw-list" aria-label="과정">${LIST.map(({ c, no, line, tag }) => `
      <a class="sw-row" href="${c.base}"><span class="m">${no}</span>
        <span class="sw-t">${esc(c.name)}${tag ? ` <span class="m acc">${tag}</span>` : ""}</span>
        <span class="sw-d kr">${esc(line)}</span>
        <span class="m sw-p" data-k="${c.key}">—</span></a>`).join("")}</section>`;
  stopField = field(host.querySelector(".sw-field"));
  // 진도: 과정마다 목록 + 내 기록
  for (const { c } of LIST) {
    Promise.all([getJSON(`${c.dir}/index.json`), api.courseState(c.key).catch(() => ({ items: [], done: [] }))]).then(([idx, st]) => {
      if (!alive) return;
      const r = idx.modules.reduce((n, m) => n + progressOf(m, st).ratio, 0) / (idx.modules.length || 1);
      const el = host.querySelector(`.sw-p[data-k="${c.key}"]`);
      if (el) el.textContent = `${idx.modules.length} modules · ${Math.round(r * 100)}%`;
    }).catch(() => {});
  }
  return () => { alive = false; stopField?.(); };
}

// 점 · 선 배경 — 2D 캔버스, 화면 밖이거나 탭이 숨으면 멈춰요
function field(cv) {
  if (!cv) return null;
  const g = cv.getContext("2d"), still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let w = 0, h = 0, raf = 0, on = true;
  const N = 70, pts = Array.from({ length: N }, () => ({ x: Math.random(), y: Math.random(), vx: (Math.random() - .5) * 2e-4, vy: (Math.random() - .5) * 2e-4 }));
  const size = () => { const r = cv.getBoundingClientRect(), d = Math.min(2, devicePixelRatio || 1); w = r.width; h = r.height; cv.width = w * d; cv.height = h * d; g.setTransform(d, 0, 0, d, 0, 0); };
  function frame() {
    g.clearRect(0, 0, w, h);
    const R = Math.min(160, w / 6);
    for (const p of pts) { if (!still) { p.x += p.vx; p.y += p.vy; if (p.x < 0 || p.x > 1) p.vx *= -1; if (p.y < 0 || p.y > 1) p.vy *= -1; } }
    g.lineWidth = 1;
    for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
      const a = pts[i], b = pts[j], dx = (a.x - b.x) * w, dy = (a.y - b.y) * h, d = Math.hypot(dx, dy);
      if (d < R) { g.strokeStyle = `rgba(230,232,236,${(1 - d / R) * .14})`; g.beginPath(); g.moveTo(a.x * w, a.y * h); g.lineTo(b.x * w, b.y * h); g.stroke(); }
    }
    g.fillStyle = "rgba(240,242,245,.55)";
    for (const p of pts) { g.beginPath(); g.arc(p.x * w, p.y * h, 1.3, 0, 7); g.fill(); }
    if (on && !still) raf = requestAnimationFrame(frame);
  }
  const io = new IntersectionObserver(([e]) => { const was = on; on = e.isIntersecting && !document.hidden; if (on && !was) frame(); });
  const vis = () => { const was = on; on = !document.hidden; if (on && !was) frame(); };
  size(); frame();
  const ro = new ResizeObserver(() => { size(); if (still) frame(); });
  ro.observe(cv); io.observe(cv); document.addEventListener("visibilitychange", vis);
  return () => { on = false; cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); document.removeEventListener("visibilitychange", vis); };
}
