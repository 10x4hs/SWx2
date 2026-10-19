// SW 공간 홈 (#/sw) — 화면 전체가 장면(유리 고리 + 입자). 아래 << 과정 >> 로 넘기면 고리 · 입자 색이 그 과정 색으로 바뀌어요.
//   ← → 키 · 옆으로 밀기로도 넘겨요. 아래로 내리면 과정 줄 목록(읽기용).
import { esc } from "../util.js";
import { api } from "../api.js";
import { COURSES, getJSON, progressOf } from "./data.js";

const LIST = [
  { c: COURSES.vg, accent: "vg", line: "글을 숫자(벡터)로 바꾸고, 가까운 것을 빨리 찾고, 관계(그래프)로 엮어 AI가 답하게 해요. 임베딩에서 GraphRAG까지 8주.", sub: "임베딩 · HNSW · 벡터DB · 하이브리드 검색 · RAG · 지식그래프 · GraphRAG" },
  { c: COURSES.dev, accent: "dev", line: "아이디어가 문서가 되고, 화면과 서버가 되고, 고객에게 닿고, 고장 나고, 다시 좋아지는 흐름을 12주 동안 따라가요.", sub: "회사 지도 · 요구사항 · 설계 · 보안 · 출시 · 운영 — 가상 회사 두런" },
];

export function mountSw(host, ctx) {
  let alive = true, i = 0;
  const prog = {};
  const pad = (n) => String(n + 1).padStart(2, "0");
  host.innerHTML = `<section class="sw-full" id="sw-full" aria-roledescription="carousel" aria-label="과정">
      <header class="sw-bar"><span class="sw-mark m">SWx2 / Software</span>
        <div class="sw-right"><nav class="sw-pill" aria-label="과정">${LIST.map(({ c }, k) => `${k ? "<i aria-hidden=\"true\"></i>" : ""}<a href="${c.base}">${esc(c.name)}</a>`).join("")}</nav><div class="sw-tick"><button class="sw-arrow" id="sw-prev" aria-label="이전 과정">&lt;&lt;</button><div class="sw-tick-win"><span class="sw-tick-run"><span id="sw-car-t"></span><span class="sw-tick-dup" aria-hidden="true"></span></span></div><button class="sw-arrow" id="sw-next" aria-label="다음 과정">&gt;&gt;</button></div></div></header>
      <div class="sw-cap" id="sw-cap" aria-live="polite"></div>
      <span class="sw-hint m" aria-hidden="true">scroll</span>
    </section>
    <section class="sw-in sw-list" aria-label="과정 목록">${LIST.map(({ c, sub }, k) => `
      <a class="sw-row" href="${c.base}"><span class="m">${pad(k)}</span><span class="sw-t">${esc(c.name)}</span><span class="sw-d kr">${esc(sub)}</span><span class="m sw-p" data-k="${c.key}">—</span></a>`).join("")}</section>`;

  function draw() {
    const { c, line, accent } = LIST[i];
    host.querySelector("#sw-cap").innerHTML = `<div class="m">Course ${pad(i)} / ${pad(LIST.length - 1)}</div>
      <h1 class="sw-h">${big(c.name)}</h1>
      <p class="sw-lead kr">${esc(line)}</p>
      <div class="sw-acts"><a class="dv-btn" href="${c.base}">열기 →</a><span class="m">${prog[c.key] || ""}</span></div>`;
    tickText(host, `${pad(i)} · ${c.name}`, `${c.name.toUpperCase()} — ${line.split(".")[0]}`);
    host.dataset.course = accent;
    ctx.scene?.mode("sw", { accent });
  }
  const step = (d) => { i = (i + d + LIST.length) % LIST.length; draw(); };
  host.querySelector("#sw-prev").addEventListener("click", () => step(-1));
  host.querySelector("#sw-next").addEventListener("click", () => step(1));
  const onKey = (e) => { if (e.target.closest?.("input,textarea,[contenteditable]")) return; if (e.key === "ArrowRight") step(1); else if (e.key === "ArrowLeft") step(-1); };
  document.addEventListener("keydown", onKey);
  swipe(host.querySelector("#sw-full"), step);
  draw();

  for (const { c } of LIST) {
    Promise.all([getJSON(`${c.dir}/index.json`), api.courseState(c.key).catch(() => ({ items: [], done: [] }))]).then(([idx, st]) => {
      if (!alive) return;
      const r = idx.modules.reduce((n, m) => n + progressOf(m, st).ratio, 0) / (idx.modules.length || 1);
      prog[c.key] = `${idx.modules.length} modules · ${idx.modules.reduce((n, m) => n + m.cards.length, 0)} cards · ${Math.round(r * 100)}%`;
      const el = host.querySelector(`.sw-p[data-k="${c.key}"]`); if (el) el.textContent = prog[c.key];
      if (LIST[i].c === c) { const a = host.querySelector(".sw-acts .m"); if (a) a.textContent = prog[c.key]; }
    }).catch(() => {});
  }
  return () => { alive = false; document.removeEventListener("keydown", onKey); };
}

// 티커: 앞 글자(번호 · 이름)는 #sw-car-t 에, 뒤로 흐르는 설명은 같은 줄에 이어 붙여 두 번 (끊김 없이 돌게)
export function tickText(host, head, tail = "") {
  const a = host.querySelector("#sw-car-t"), b = host.querySelector(".sw-tick-dup"), run = `${head}${tail ? "   ·   " + tail : ""}   ·   `;
  if (a) a.textContent = run; if (b) b.textContent = run;
}

// 큰 제목 두 줄: "Vector & Graph" → Vector / & Graph, "Dev Flow" → Dev / Flow
export const big = (t) => { const k = t.indexOf(" & "); return k > 0 ? `${esc(t.slice(0, k))}<br>${esc(t.slice(k + 1))}` : esc(t).replace(" ", "<br>"); };

// 옆으로 밀기 (터치) — 가로로 50px 넘게, 세로보다 많이 밀었을 때만
export function swipe(el, step) {
  let x0 = null, y0 = 0;
  el.addEventListener("touchstart", (e) => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
  el.addEventListener("touchend", (e) => {
    if (x0 == null) return; const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0; x0 = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) step(dx < 0 ? 1 : -1);
  }, { passive: true });
}
