// SW 공간 홈 (#/sw) — 화면 전체가 장면(크롬 로고 + 흐르는 입자). 과정을 넘기면 입자가 터졌다 그 과정 모양으로 모이고, 제목은 글자마다 올라와요.
//   ← → 키 · 옆으로 밀기 · 아래 막대로 넘겨요. [열기] = 카메라가 로고로 돌진하며 빛으로 번진 뒤 과정 화면. 아래로 내리면 카메라가 장면 속으로 날아가고 과정 목록이 떠올라요.
import { esc } from "../util.js";
import { api } from "../api.js";
import { COURSES, getJSON, progressOf } from "./data.js";

const LIST = [
  { c: COURSES.vg, accent: "vg", line: "글을 숫자(벡터)로 바꾸고, 가까운 것을 빨리 찾고, 관계(그래프)로 엮어 AI가 답하게 해요. 임베딩에서 GraphRAG까지 8주.", sub: "임베딩 · HNSW · 벡터DB · 하이브리드 검색 · RAG · 지식그래프 · GraphRAG" },
  { c: COURSES.dev, accent: "dev", line: "아이디어가 문서가 되고, 화면과 서버가 되고, 고객에게 닿고, 고장 나고, 다시 좋아지는 흐름을 12주 동안 따라가요.", sub: "회사 지도 · 요구사항 · 설계 · 보안 · 출시 · 운영 — 가상 회사 두런" },
];

export function mountSw(host, ctx) {
  let alive = true, i = 0, busy = false;
  const prog = {};
  const pad = (n) => String(n + 1).padStart(2, "0");
  const fine = matchMedia("(hover: hover) and (pointer: fine)").matches, REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;
  host.innerHTML = `<section class="sw-full sx" id="sw-full" aria-roledescription="carousel" aria-label="과정">
      <header class="sx-bar">
        <a class="sx-mark m" href="#/sw">SWx2<span>/</span>Software</a>
        <nav class="sx-nav" aria-label="과정">${LIST.map(({ c }, k) => `<a href="${c.base}" data-k="${k}"><span class="m">${pad(k)}</span>${esc(c.name)}</a>`).join("")}</nav>
      </header>
      <div class="sx-cap" id="sw-cap" aria-live="polite"></div>
      <footer class="sx-foot">
        <div class="sx-count m"><b id="sx-n">01</b><i></i><span>${pad(LIST.length - 1)}</span></div>
        <div class="sx-prog" role="tablist" aria-label="과정 고르기">${LIST.map((_, k) => `<button type="button" role="tab" data-go="${k}" aria-label="${esc(LIST[k].c.name)}"><i></i></button>`).join("")}</div>
        <div class="sx-arrows"><button type="button" class="sx-arrow" id="sw-prev" aria-label="이전 과정">←</button><button type="button" class="sx-arrow" id="sw-next" aria-label="다음 과정">→</button></div>
        <span class="sx-hint m" aria-hidden="true">Scroll</span>
      </footer>
      ${fine && !REDUCED ? '<div class="sx-cursor" aria-hidden="true"><i></i></div>' : ""}
    </section>
    <section class="sw-in sx-list" aria-label="과정 목록">
      <p class="m sx-list-h">Courses</p>
      ${LIST.map(({ c, sub, line }, k) => `
      <a class="sx-row" href="${c.base}" data-k="${k}"><span class="m">${pad(k)}</span><span class="sx-t">${esc(c.name)}</span><span class="sx-d kr">${esc(sub)}</span><span class="m sw-p" data-k="${c.key}">—</span></a>`).join("")}
    </section>`;
  const cap = host.querySelector("#sw-cap");
  // 큰 제목을 글자마다 감싸서 아래에서 차례로 올라오게
  const split = (t) => t.split(" ").map((w) => `<span class="sx-w">${[...w].map((ch, n) => `<span class="sx-c" style="--d:${n * 28}ms">${esc(ch)}</span>`).join("")}</span>`).join(" ");
  function draw() {
    const { c, line, accent } = LIST[i];
    cap.classList.remove("in"); void cap.offsetWidth;
    cap.innerHTML = `<div class="m sx-kicker">Course ${pad(i)} — ${esc(c.brand || "Software")}</div>
      <h1 class="sx-h" aria-label="${esc(c.name)}">${split(c.name)}</h1>
      <p class="sx-lead kr">${esc(line)}</p>
      <div class="sx-acts"><a class="sx-btn" href="${c.base}" data-enter><span>열기</span><i aria-hidden="true">→</i></a><span class="m sx-meta">${prog[c.key] || ""}</span></div>`;
    cap.classList.add("in");
    host.querySelector("#sx-n").textContent = pad(i);
    host.querySelectorAll("[data-go]").forEach((b, k) => b.setAttribute("aria-selected", String(k === i)));
    host.querySelectorAll(".sx-nav a").forEach((a, k) => a.classList.toggle("on", k === i));
    host.dataset.course = accent;
    ctx.scene?.mode("sw", { accent });
  }
  const step = (d) => { i = (i + d + LIST.length) % LIST.length; ctx.scene?.kick?.(); draw(); };
  host.querySelector("#sw-prev").addEventListener("click", () => step(-1));
  host.querySelector("#sw-next").addEventListener("click", () => step(1));
  host.addEventListener("click", async (e) => {
    const g = e.target.closest("[data-go]"); if (g) { const k = +g.dataset.go; if (k !== i) { i = k; ctx.scene?.kick?.(); draw(); } return; }
    // 들어가기: 카메라가 로고로 돌진 → 빛 → 과정 화면
    const a = e.target.closest("[data-enter], .sx-nav a, .sx-row"); if (!a || e.metaKey || e.ctrlKey || busy) return;
    e.preventDefault(); busy = true;
    host.classList.add("sx-leave");
    await (ctx.scene?.dive?.() || Promise.resolve());
    if (alive) location.hash = a.getAttribute("href");
  });
  const onKey = (e) => { if (e.target.closest?.("input,textarea,[contenteditable]")) return; if (e.key === "ArrowRight") step(1); else if (e.key === "ArrowLeft") step(-1); };
  document.addEventListener("keydown", onKey);
  swipe(host.querySelector("#sw-full"), step);
  // 커서: 따라오는 고리 · 링크 위에선 커져요 · 버튼은 살짝 끌려와요(자석)
  let raf = 0;
  const cur = host.querySelector(".sx-cursor");
  if (cur) {
    const p = { x: innerWidth / 2, y: innerHeight / 2, tx: innerWidth / 2, ty: innerHeight / 2 };
    const move = (e) => { p.tx = e.clientX; p.ty = e.clientY; const t = e.target.closest?.("a, button"); cur.classList.toggle("big", !!t); const m = e.target.closest?.(".sx-btn, .sx-arrow"); host.querySelectorAll(".sx-btn, .sx-arrow").forEach((b) => { if (b !== m) b.style.transform = ""; }); if (m) { const r = m.getBoundingClientRect(); m.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * 0.25}px, ${(e.clientY - r.top - r.height / 2) * 0.35}px)`; } };
    const loop = () => { p.x += (p.tx - p.x) * 0.18; p.y += (p.ty - p.y) * 0.18; cur.style.transform = `translate(${p.x}px, ${p.y}px)`; if (alive) raf = requestAnimationFrame(loop); };
    host.addEventListener("pointermove", move); raf = requestAnimationFrame(loop);
  }
  // 목록: 화면에 들어오면 한 줄씩 떠올라요
  const io = new IntersectionObserver((es) => es.forEach((x) => { if (x.isIntersecting) { x.target.classList.add("in"); io.unobserve(x.target); } }), { threshold: 0.2 });
  host.querySelectorAll(".sx-row, .sx-list-h").forEach((el, n) => { el.style.setProperty("--d", n * 70 + "ms"); io.observe(el); });
  draw();

  for (const { c } of LIST) {
    Promise.all([getJSON(`${c.dir}/index.json`), api.courseState(c.key).catch(() => ({ items: [], done: [] }))]).then(([idx, st]) => {
      if (!alive) return;
      const r = idx.modules.reduce((n, m) => n + progressOf(m, st).ratio, 0) / (idx.modules.length || 1);
      prog[c.key] = `${idx.modules.length} modules · ${idx.modules.reduce((n, m) => n + m.cards.length, 0)} cards · ${Math.round(r * 100)}%`;
      const el = host.querySelector(`.sw-p[data-k="${c.key}"]`); if (el) el.textContent = prog[c.key];
      if (LIST[i].c === c) { const a = host.querySelector(".sx-meta"); if (a) a.textContent = prog[c.key]; }
    }).catch(() => {});
  }
  return () => { alive = false; cancelAnimationFrame(raf); io.disconnect(); document.removeEventListener("keydown", onKey); };
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
