// SW 공간 홈 (#/sw) — activetheory.net/work 처럼: 가운데 입자 이중나선, 둘레를 나선으로 도는 유리 패널(모듈 20개). 스크롤하면 카메라가 내려가요 (gallery3d.js).
//   왼쪽 메뉴 · 오른쪽 위 알약 = 그 과정 첫 패널로 · 아래 << 지금 모듈 >> · 패널 · 이름을 누르면 카메라가 다가가며 어두워진 뒤 그 모듈로. ↑ ↓ 키로도 넘겨요.
import { esc } from "../util.js";
import { api } from "../api.js";
import { COURSES, getJSON } from "./data.js";
import { createGallery } from "./gallery3d.js";

const LIST = [
  { c: COURSES.vg, accent: "vg", line: "글을 숫자(벡터)로 바꾸고, 가까운 것을 빨리 찾고, 관계(그래프)로 엮어 AI가 답하게 해요. 임베딩에서 GraphRAG까지 8주.", sub: "임베딩 · HNSW · 벡터DB · 하이브리드 검색 · RAG · 지식그래프 · GraphRAG" },
  { c: COURSES.dev, accent: "dev", line: "아이디어가 문서가 되고, 화면과 서버가 되고, 고객에게 닿고, 고장 나고, 다시 좋아지는 흐름을 12주 동안 따라가요.", sub: "회사 지도 · 요구사항 · 설계 · 보안 · 출시 · 운영 — 가상 회사 두런" },
];

const TINT = { vg: ["#46e0d0", "#7b6bff"], dev: ["#ff5fa8", "#ffb24b"] };
const enTitle = (id) => id.replace(/^vg-/, "").replace(/-/g, " ").toUpperCase();

export function mountSw(host, ctx) {
  let alive = true, gal = null, busy = false, items = [], cur = 0;
  ctx.scene?.pause?.(true); // 뒤 장면은 쉬고, 이 화면은 자기 3D 갤러리를 그려요
  const scroller = host.closest(".main") || document.scrollingElement;
  host.innerHTML = `<section class="sg" id="sw-full" aria-label="SW 과정 모듈">
      <div class="sg-stage" id="sg-stage">
        <a class="sg-mark" href="#/sw">SWX2</a>
        <nav class="sg-pill" aria-label="과정">${LIST.map(({ c }, k) => `${k ? '<i aria-hidden="true"></i>' : ""}<a href="${c.base}" data-jump="${c.key}">${esc(c.name)}</a>`).join("")}</nav>
        <aside class="sg-menu">
          <p>What are you learning?</p>
          ${LIST.map(({ c }) => `<a href="${c.base}" data-jump="${c.key}">-> ${esc(c.name)}</a>`).join("")}
          <a href="#/sw/vg/today">-> Today</a>
          <a class="sg-ask" href="#/sw/vg/ask">Ask me anything ...</a>
        </aside>
        <div class="sg-cap"><button type="button" class="sg-arrow" id="sw-prev" aria-label="이전 모듈">&lt;&lt;</button><a class="sg-now" id="sg-now" href="#"></a><button type="button" class="sg-arrow" id="sw-next" aria-label="다음 모듈">&gt;&gt;</button></div>
        <span class="sg-scroll" aria-hidden="true">Scroll</span>
        <p class="sg-wait" id="sg-wait">Loading …</p>
      </div>
      <div class="sg-track" id="sg-track"></div>
      <nav class="sr">${LIST.map(({ c }) => `<a class="sx-row" href="${c.base}">${esc(c.name)}</a>`).join("")}</nav>
    </section>`;
  const stage = host.querySelector("#sg-stage"), track = host.querySelector("#sg-track"), nowEl = host.querySelector("#sg-now");
  const setNow = (it, i) => {
    cur = i; nowEl.classList.remove("in"); void nowEl.offsetWidth;
    nowEl.setAttribute("href", it.href);
    nowEl.innerHTML = `<span>${String(it.no).padStart(2, "0")}</span>${esc(it.course)} — ${esc(it.ko)}`;
    nowEl.classList.add("in");
    host.querySelectorAll("[data-jump]").forEach((x) => x.classList.toggle("on", x.dataset.jump === it.key));
  };
  const enter = async (href) => { if (busy) return; busy = true; host.classList.add("sg-leave"); await (gal?.leave() || Promise.resolve()); if (alive) location.hash = href; };

  Promise.all(LIST.map(({ c }) => getJSON(`${c.dir}/index.json`).then((idx) => ({ c, idx })))).then(async (all) => {
    if (!alive) return;
    items = all.flatMap(({ c, idx }) => idx.modules.map((m, k) => ({ key: c.key, course: c.name, no: k + 1, of: idx.modules.length, title: enTitle(m.id), ko: m.title, sub: m.sub || "", tint: TINT[c.key] || TINT.vg, href: `${c.base}/${m.id}` })));
    track.style.height = `calc(var(--sw-h, 100vh) + ${(items.length - 1) * 46}vh)`;
    gal = await createGallery(stage, { items, scroller, track, onPick: (it) => enter(it.href), onActive: setNow });
    if (!alive) { gal?.destroy(); return; }
    host.querySelector("#sg-wait").remove();
    if (!gal) { host.classList.add("sg-flat"); stage.insertAdjacentHTML("beforeend", `<ol class="sg-flatlist">${items.map((it) => `<li><a href="${it.href}"><span>${esc(it.course)} ${String(it.no).padStart(2, "0")}</span>${esc(it.ko)}</a></li>`).join("")}</ol>`); }
    else setNow(items[0], 0);
  }).catch(() => { const w = host.querySelector("#sg-wait"); if (w) w.textContent = "불러오지 못했어요."; });

  const firstOf = (key) => items.findIndex((it) => it.key === key);
  host.addEventListener("click", (e) => {
    const j = e.target.closest("[data-jump]");
    if (j && gal && !e.metaKey && !e.ctrlKey) { e.preventDefault(); gal.goTo(firstOf(j.dataset.jump)); return; }
    if (e.target.closest("#sg-now") && !e.metaKey && !e.ctrlKey) { e.preventDefault(); if (items[cur]) enter(items[cur].href); }
  });
  host.querySelector("#sw-prev").addEventListener("click", () => gal?.goTo(cur - 1));
  host.querySelector("#sw-next").addEventListener("click", () => gal?.goTo(cur + 1));
  const onKey = (e) => { if (e.target.closest?.("input,textarea,[contenteditable]")) return; if (e.key === "ArrowDown" || e.key === "ArrowRight") { e.preventDefault(); gal?.goTo(cur + 1); } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") { e.preventDefault(); gal?.goTo(cur - 1); } else if (e.key === "Enter" && document.activeElement === document.body && items[cur]) enter(items[cur].href); };
  document.addEventListener("keydown", onKey);
  return () => { alive = false; gal?.destroy(); document.removeEventListener("keydown", onKey); ctx.scene?.pause?.(false); };
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
