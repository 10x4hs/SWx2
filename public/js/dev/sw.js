// SW 공간 홈 (#/sw) — 과정마다 큰 유리 판 하나(안에 추상 3D 엠블럼). 과정이 늘어나도 판만 늘어나요 (world3d.js 의 courses 모드).
//   글자는 판 밖에 또렷하게: 과정 이름 · 한 줄 · 진도 · [이어서 하기](다음 카드) · 과정 보기. 스크롤 · << >> · ↑↓ 로 과정을 넘기고,
//   판을 누르거나 '과정 보기'를 누르면 카메라가 판 속으로 들어가며 과정 화면(모듈 유리 패널)이 그 안에서 시작해요.
import { esc } from "../util.js";
import { api } from "../api.js";
import { COURSES, getJSON, progressOf, nextCards } from "./data.js";
import { PALETTE } from "./world3d.js";

const LIST = [
  { c: COURSES.vg, emblem: "cloud", line: "글을 숫자(벡터)로 바꾸고, 가까운 것을 빨리 찾고, 관계(그래프)로 엮어 AI가 답하게 해요.", span: "8주 · 임베딩에서 GraphRAG까지" },
  { c: COURSES.dev, emblem: "loop", line: "아이디어가 문서가 되고, 화면과 서버가 되고, 고객에게 닿고, 고장 나고, 다시 좋아지는 흐름을 따라가요.", span: "12주 · 가상 회사 두런과 함께" },
];
const pad = (n) => String(n).padStart(2, "0");

export function mountSw(host, ctx) {
  let alive = true, busy = false, cur = 0;
  const info = LIST.map(() => null);
  host.innerHTML = `<div class="sw-scene" id="sh-scene"><section class="sw-layer sh" aria-label="SW 과정">
      <header class="sh-top sw-ui"><a class="sh-mark" href="#/sw">SWX2<span> / Software</span></a>
        <nav class="sh-pill" aria-label="과정">${LIST.map(({ c }, k) => `${k ? '<i aria-hidden="true"></i>' : ""}<a href="${c.base}" data-jump="${k}">${esc(c.name)}</a>`).join("")}</nav></header>
      <div class="sh-cap sw-ui" id="sh-cap" aria-live="polite"></div>
      <div class="sh-foot sw-ui"><button type="button" class="sh-arrow" id="sw-prev" aria-label="이전 과정">&lt;&lt;</button><span class="sh-count" id="sh-count">01 / ${pad(LIST.length)}</span><button type="button" class="sh-arrow" id="sw-next" aria-label="다음 과정">&gt;&gt;</button></div>
      <span class="sh-scroll" aria-hidden="true">Scroll</span>
    </section>
    <div class="sw-track" style="height:${(LIST.length - 1) * 70}vh"></div></div>
    <nav class="sr">${LIST.map(({ c }) => `<a class="sx-row" href="${c.base}">${esc(c.name)}</a>`).join("")}</nav>`;
  const cap = host.querySelector("#sh-cap"), track = host.querySelector("#sh-scene");

  function draw() {
    const { c, line, span } = LIST[cur], x = info[cur];
    cap.classList.remove("in"); void cap.offsetWidth;
    cap.innerHTML = `<p class="sh-kicker">Course ${pad(cur + 1)} / ${pad(LIST.length)}<span>${esc(span)}</span></p>
      <h1 class="sh-title">${esc(c.name)}</h1>
      <p class="sh-desc">${esc(line)}</p>
      <div class="sh-prog"><div class="sh-bar"><i style="width:${x ? Math.round(x.ratio * 100) : 0}%"></i></div><span>${x ? `모듈 ${x.doneMods} / ${x.mods} · ${Math.round(x.ratio * 100)}%` : "진도 불러오는 중"}</span></div>
      <div class="sh-acts"><a class="sh-btn" href="${x?.next?.href || c.base}" data-enter><span>${x && x.started ? "이어서 하기" : "시작하기"}</span><small>${esc(x?.next?.label || "첫 모듈부터")}</small></a><a class="sh-link" href="${c.base}" data-enter>과정 보기 →</a></div>`;
    cap.classList.add("in");
    host.querySelector("#sh-count").textContent = `${pad(cur + 1)} / ${pad(LIST.length)}`;
    host.querySelectorAll("[data-jump]").forEach((a, k) => a.classList.toggle("on", k === cur));
    host.dataset.course = LIST[cur].c.key;
  }
  // 판 속으로 들어가며 이동
  const enter = async (href) => { if (busy) return; busy = true; host.classList.add("sw-leave"); await ctx.scene?.dive(); if (alive) location.hash = href; };
  host.addEventListener("click", (e) => {
    const j = e.target.closest("[data-jump]"); if (j && !e.metaKey && !e.ctrlKey) { e.preventDefault(); ctx.scene?.goTo(Number(j.dataset.jump)); return; }
    const g = e.target.closest("[data-enter]"); if (g && !e.metaKey && !e.ctrlKey) { e.preventDefault(); enter(g.getAttribute("href")); }
  });
  host.querySelector("#sw-prev").addEventListener("click", () => ctx.scene?.goTo(cur - 1));
  host.querySelector("#sw-next").addEventListener("click", () => ctx.scene?.goTo(cur + 1));
  const onKey = (e) => {
    if (e.target.closest?.("input,textarea,[contenteditable]")) return;
    if (e.key === "ArrowDown" || e.key === "ArrowRight") { e.preventDefault(); ctx.scene?.goTo(cur + 1); }
    else if (e.key === "ArrowUp" || e.key === "ArrowLeft") { e.preventDefault(); ctx.scene?.goTo(cur - 1); }
    else if (e.key === "Enter" && document.activeElement === document.body) enter(LIST[cur].c.base);
  };
  document.addEventListener("keydown", onKey);
  swipe(host.querySelector(".sh"), (d) => ctx.scene?.goTo(cur + d));

  ctx.scene?.show("courses", LIST.map(({ c, emblem }, k) => ({ key: c.key, no: k + 1, title: c.name, href: c.base, emblem, tint: PALETTE[c.key] })), {
    track, tint: "home", onPick: (it) => enter(it.href), onActive: (it, i) => { cur = i; draw(); },
  });
  draw();
  // 과정마다 진도 · 다음 카드
  LIST.forEach(({ c }, k) => {
    Promise.all([getJSON(`${c.dir}/index.json`), api.courseState(c.key).catch(() => ({ items: [], done: [] }))]).then(([idx, st]) => {
      if (!alive) return;
      const per = idx.modules.map((m) => progressOf(m, st)), nx = nextCards(idx, st, 1)[0];
      info[k] = { mods: idx.modules.length, doneMods: per.filter((p) => p.ratio >= 0.999).length, ratio: per.reduce((n, p) => n + p.ratio, 0) / (idx.modules.length || 1), started: (st.items || []).length > 0,
        next: nx ? { href: `${c.base}/${nx.module.id}/${nx.card.id}`, label: `${nx.module.no} ${nx.module.title} · 카드 ${nx.module.cards.indexOf(nx.card) + 1}` } : { href: c.base, label: "모든 카드를 읽었어요" } };
      if (k === cur) draw();
    }).catch(() => {});
  });
  return () => { alive = false; document.removeEventListener("keydown", onKey); };
}

// 옆으로 밀기 (터치) — 가로로 50px 넘게, 세로보다 많이 밀었을 때만
export function swipe(el, step) {
  let x0 = null, y0 = 0;
  el.addEventListener("touchstart", (e) => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
  el.addEventListener("touchend", (e) => {
    if (x0 == null) return; const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0; x0 = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) step(dx < 0 ? 1 : -1);
  }, { passive: true });
}
