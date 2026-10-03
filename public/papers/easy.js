// 쉽게 읽기 — content/<id>.easy.json 을 스크롤형 설명 페이지로 그려요 (규격: scripts/papers/EASY_SPEC.md)
//   /papers/easy            → 16편 목록 (쉽게 읽기가 준비된 것만 열려요)
//   /papers/easy?p=<id>     → 그 논문
// 그림은 화면에 보일 때 움직여요. "애니메이션 멈추기" · 밝게/어둡게는 이 브라우저에만 기억해요.

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const store = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };
const TONE = { a: "var(--a)", b: "var(--b)", c: "var(--c)", d: "var(--d)", n: "var(--n)" };
const tc = (t) => (TONE[t] ? `--tc:${TONE[t]};` : "");

// 글 안의 표시: **굵게** · {a:파랑} · {b:주황} · {c:초록}
function inline(s) {
  return esc(s)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\{([abc]):([^{}]+)\}/g, (_, k, t) => `<span class="ez-hl-${k}">${t}</span>`)
    .replace(/\n/g, "<br>");
}

const ICON = {
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  heat: '<path d="M12 3c2 3 5 5 5 9a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5 0 2 1 3 2 3 0-3 0-5 1-7.5z"/>',
  box: '<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M4 9h16"/>',
  grid: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 12h16M12 4v16"/>',
  brain: '<path d="M9 4a3 3 0 0 0-3 3v1a3 3 0 0 0-2 5 3 3 0 0 0 3 4 3 3 0 0 0 5 1V5a3 3 0 0 0-3-1zM15 4a3 3 0 0 1 3 3v1a3 3 0 0 1 2 5 3 3 0 0 1-3 4 3 3 0 0 1-5 1"/>',
  clock: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>',
  chip: '<rect x="7" y="7" width="10" height="10" rx="1.5"/><path d="M10 3v4M14 3v4M10 17v4M14 17v4M3 10h4M3 14h4M17 10h4M17 14h4"/>',
  film: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 5v14M17 5v14M3 9h4M3 15h4M17 9h4M17 15h4"/>',
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1"/>',
  layers: '<path d="M12 4l9 5-9 5-9-5 9-5z"/><path d="M3 14l9 5 9-5"/>',
  spark: '<path d="M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z"/>',
  warn: '<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17v.5"/>',
};
const icon = (k) => (ICON[k] ? `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[k]}</svg>` : "");

const capOf = (b) => `${b.caption ? `<p class="ez-cap">${inline(b.caption)}</p>` : ""}${b.note ? `<p class="ez-note">${inline(b.note)}</p>` : ""}`;
let FIG_BASE = "";

const BLOCK = {
  p: (b) => `<p>${inline(b.text)}</p>`,
  figure: (b) => `<div class="ez-fig${b.wide === false ? "" : " wide"}"><figure class="ez-img" data-st><img src="${FIG_BASE}${esc(b.src)}" alt="${esc(b.caption || "")}" loading="lazy" decoding="async"></figure>${capOf(b)}</div>`,
  compare: (b) => `<div class="ez-fig"><div class="cmp" style="--n:${Math.min(3, b.items.length)}">${b.items.map((x, i) => `<div class="cmp-i" data-st style="--i:${i};${tc(x.tone)}"><div class="cmp-h">${icon(x.icon)}${inline(x.label)}</div><p>${inline(x.text)}</p></div>`).join("")}</div>${capOf(b)}</div>`,
  flow: (b) => {
    const row = (steps, r = 0) => `<div class="flw flw-row">${steps.map((s, i) => `${i ? `<span class="flw-ar" aria-hidden="true">→</span>` : ""}<div class="flw-s${s.empty ? " empty" : ""}" data-st data-flow="${r * 20 + i}" style="--i:${r * 3 + i};${tc(s.tone)}"><b>${inline(s.label || "")}</b>${s.sub ? `<span>${inline(s.sub)}</span>` : ""}</div>`).join("")}</div>`;
    const body = b.rows ? `<div class="flw-rows">${b.rows.map((r, i) => row(r, i)).join("")}</div>` : row(b.steps);
    return `<div class="ez-fig${(b.rows?.[0] || b.steps).length > 4 ? " wide" : ""}" data-flowfig>${body}${capOf(b)}</div>`;
  },
  grids: (b) => {
    const hi = b.hi ?? 0.5;
    const g = (x, k) => {
      const rows = x.values.slice(0, 6).map((r) => r.slice(0, 6)), cols = Math.max(...rows.map((r) => r.length));
      return `<div class="gr" data-st style="--i:${k * 2};${tc(x.tone)}"><span class="gr-l">${inline(x.label)}</span><div class="gr-t" style="--c:${cols}">${rows.flat().map((v) => `<i class="${+v >= hi ? "h" : ""}" style="--v:${Math.max(0, Math.min(1, +v))}">${esc(typeof v === "number" ? v.toFixed(1) : v)}</i>`).join("")}</div></div>`;
    };
    return `<div class="ez-fig wide"><div class="grs">${b.items.map((x, k) => `${k ? `<span class="gr-op" data-st style="--i:${k * 2 - 1}">${esc(b.ops?.[k - 1] || "→")}</span>` : ""}${g(x, k)}`).join("")}</div>${capOf(b)}</div>`;
  },
  bars: (b) => {
    const max = b.max || Math.max(...b.items.map((x) => +x.value)) * 1.08;
    return `<div class="ez-fig"><p class="brs-u">${esc(b.unit || "")}${b.lower_better ? " · 낮을수록 좋아요" : b.unit ? " · 높을수록 좋아요" : ""}</p><div class="brs">${b.items.map((x, i) => `<div class="bar" data-st style="--i:${i};${tc(x.tone)}--w:${Math.max(2, Math.min(100, (+x.value / max) * 100))}%"><span class="bar-l">${inline(x.label)}</span><span class="bar-t"><i></i></span><span class="bar-v">${esc(x.display ?? x.value)}</span></div>`).join("")}</div>${capOf(b)}</div>`;
  },
  scale: (b) => `<div class="ez-fig"><div class="scl">${b.items.map((x, i) => `<div class="scl-row" data-st style="--i:${i};${tc(x.tone)}"><span>${inline(x.label)}</span><span class="scl-t" style="--x:${(+x.value * 100).toFixed(1)}%"><i style="--x:${(+x.value * 100).toFixed(1)}%"></i>${(b.marks || []).map((m) => `<s style="--x:${m.at * 100}%"></s>`).join("")}</span><span class="scl-v">${esc(x.display ?? (+x.value).toFixed(2))}</span></div>`).join("")}
    ${b.marks?.length ? `<div class="scl-m"><span></span><span>${b.marks.map((m) => `<em style="--x:${m.at * 100}%">${esc(m.label)}</em>`).join("")}</span><span></span></div>` : ""}</div>${capOf(b)}</div>`,
  steps: (b) => `<div class="ez-fig"><ol class="stp">${b.items.map((x, i) => `<li data-st style="--i:${i}"><div><b>${inline(x.title)}</b><p>${inline(x.text)}</p></div></li>`).join("")}</ol>${capOf(b)}</div>`,
  analogy: (b) => `<aside class="ez-box"><span class="k">비유로 보면</span>${b.title ? `<h3>${inline(b.title)}</h3>` : ""}<p>${inline(b.text)}</p>${b.limit ? `<p class="lim">${inline(b.limit)}</p>` : ""}</aside>`,
  callout: (b) => `<aside class="ez-box ${["warn", "tip", "key"].includes(b.kind) ? b.kind : "tip"}"><span class="k">${{ warn: "주의", tip: "알아 두면 좋아요", key: "꼭 기억" }[b.kind] || "알아 두면 좋아요"}</span><p>${inline(b.text)}</p></aside>`,
  quiz: (b, id) => `<div class="qz" data-quiz="${id}" data-a="${+b.answer}"><p class="qz-k">잠깐 확인</p><p class="qz-q">${inline(b.q)}</p><div class="qz-c">${b.choices.map((c, i) => `<button type="button" data-c="${i}">${inline(c)}</button>`).join("")}</div><p class="qz-w" hidden>${inline(b.why || "")}</p></div>`,
};

function block(b, id) {
  const f = BLOCK[b?.t];
  if (!f) { console.warn("모르는 블록", b); return ""; }
  try { return f(b, id); } catch (e) { console.warn("블록 그리기 실패", b, e); return ""; }
}

// ---------- 움직임 ----------
let motion = store.get("ez-motion") !== "off" && !matchMedia("(prefers-reduced-motion: reduce)").matches;
function setMotion(on) {
  motion = on; store.set("ez-motion", on ? "on" : "off");
  document.body.classList.toggle("anim", on);
  const b = $("#ez-motion"); b.textContent = on ? "애니메이션 멈추기" : "애니메이션 켜기"; b.setAttribute("aria-pressed", on ? "false" : "true");
  if (!on) $$(".ez-fig").forEach((f) => f.classList.add("in"));
}
// flow: 보이는 동안 단계에 차례로 불이 켜져요
const flowTimers = new Map();
function runFlow(fig, on) {
  clearInterval(flowTimers.get(fig)); flowTimers.delete(fig);
  const steps = $$(".flw-s:not(.empty)", fig).sort((a, b) => a.dataset.flow - b.dataset.flow);
  if (!on || !motion || !steps.length) { steps.forEach((s) => s.classList.remove("on")); return; }
  let k = 0;
  const tick = () => { steps.forEach((s, i) => s.classList.toggle("on", i === k % (steps.length + 1))); k++; };
  tick(); flowTimers.set(fig, setInterval(tick, 1100));
}
function observe() {
  const io = new IntersectionObserver((ents) => ents.forEach((e) => {
    if (e.isIntersecting) e.target.classList.add("in");
    if (e.target.hasAttribute("data-flowfig")) runFlow(e.target, e.isIntersecting);
  }), { threshold: 0.25 });
  $$(".ez-fig").forEach((f) => io.observe(f));
}

// ---------- 테마 ----------
function setTheme(t) {
  if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme;
  store.set("ez-theme", t || "");
  const dark = t ? t === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  $("#ez-theme").textContent = dark ? "밝게" : "어둡게";
}

// ---------- 페이지 ----------
async function getJSON(u) { const r = await fetch(u, { cache: "no-cache" }); if (!r.ok) throw new Error(r.status); return r.json(); }

async function listPage(root, idx) {
  document.title = "쉽게 읽기 · 논문 16편";
  const have = await Promise.all(idx.papers.map((p) => fetch(`/papers/content/${p.id}.easy.json`, { method: "HEAD", cache: "no-cache" }).then((r) => r.ok).catch(() => false)));
  const heads = await Promise.all(idx.papers.map((p, i) => (have[i] ? getJSON(`/papers/content/${p.id}.easy.json`).then((d) => d.headline.replace(/\n/g, " ")).catch(() => "") : Promise.resolve(""))));
  const byStage = {};
  idx.papers.forEach((p, i) => { (byStage[p.stage] ||= []).push({ ...p, ok: have[i], head: heads[i] }); });
  let n = 0; Object.keys(byStage).sort((a, b) => a - b).forEach((s) => byStage[s].forEach((p) => { p.n = ++n; })); // 보이는 순서대로 번호
  const stageName = (s) => { const x = idx.stages?.find?.((t) => t.n === s); return x ? `${s}단계 · ${x.label}` : `${s}단계`; };
  root.innerHTML = `<section class="ez-hero"><p class="ez-kicker">엣지 비전 논문 16편</p><h1>어려운 논문을,\n중학생도 따라올 수 있게.</h1><p class="ez-lead">처음 보는 말은 그 자리에서 풀고, 그림이 움직이면서 원리를 보여 줘요. 한 편에 15분쯤이면 큰 흐름이 잡혀요.</p>
    <p class="ez-meta"><span><b>${have.filter(Boolean).length}</b> / ${idx.papers.length}편 준비됨</span><span>전문가용 해설은 앱의 "자세히 읽기"에 있어요</span></p></section>
    ${Object.keys(byStage).sort((a, b) => a - b).map((s) => `<p class="ez-stage">${esc(stageName(+s))}</p><ul class="ez-list">${byStage[s].map((p) => `<li class="${p.ok ? "" : "soon"}"><a href="?p=${esc(p.id)}"><span class="n">${String(p.n).padStart(2, "0")}</span><span><b>${esc(p.title)}</b><span class="h">${esc(p.ok ? p.head : "준비 중이에요")}</span></span><span class="tag">${esc(p.field || "")}</span></a></li>`).join("")}</ul>`).join("")}`;
  $(".ez-hero h1", root).innerHTML = inline($(".ez-hero h1", root).textContent);
}

async function paperPage(root, id, idx) {
  const d = await getJSON(`/papers/content/${encodeURIComponent(id)}.easy.json`);
  FIG_BASE = `/papers/fig/${encodeURIComponent(id)}/`;
  document.title = `${d.title} · 쉽게 읽기`;
  $("#ez-brand-t").textContent = d.title;
  let qn = 0;
  const order = idx.papers.map((p) => p.id), i = order.indexOf(id);
  const prev = i > 0 ? idx.papers[i - 1] : null, next = i >= 0 && i < order.length - 1 ? idx.papers[i + 1] : null;
  root.innerHTML = `
    <section class="ez-hero"><p class="ez-kicker">${esc(d.kicker || d.title)}</p><h1>${inline(d.headline)}</h1><p class="ez-lead">${inline(d.lead || "")}</p>
      <p class="ez-meta"><span>읽는 데 <b>${esc(d.minutes || 15)}분</b></span><span>중3 ~ 고1 눈높이</span><span>아래로 읽어 내려가세요. 그림은 보이는 곳에서 자동으로 움직여요.</span></p></section>
    ${d.sections.map((s, k) => `<section class="ez-sec" id="s${k + 1}"><p class="ez-n">${String(k + 1).padStart(2, "0")}</p><h2>${inline(s.title)}</h2>${s.body.map((b) => block(b, b.t === "quiz" ? qn++ : 0)).join("")}</section>`).join("")}
    ${d.recap ? `<section class="ez-sec"><div class="ez-recap"><p class="ez-n">정리</p><h2>${inline(d.recap.title)}</h2><p>${inline(d.recap.text)}</p>${d.recap.points?.length ? `<ul>${d.recap.points.map((x) => `<li><span>${inline(x)}</span></li>`).join("")}</ul>` : ""}</div>
      ${d.words?.length ? `<div class="ez-words"><h3>이 페이지에 나온 말</h3><dl>${d.words.map((w) => `<dt>${esc(w.term)}</dt><dd>${inline(w.easy)}</dd>`).join("")}</dl></div>` : ""}
      <nav class="ez-next" aria-label="다음으로"><h3>다음으로</h3><div class="ez-next-row">
        <a class="ez-btn primary" href="/#/papers/${esc(id)}">앱에서 이어 공부하기 <small>퀴즈 · 3분 설명 · 자세히 읽기</small></a>
        ${next ? `<a class="ez-btn" href="?p=${esc(next.id)}">다음 논문 <small>${esc(next.title)}</small> →</a>` : ""}
        ${prev ? `<a class="ez-btn" href="?p=${esc(prev.id)}">← 이전 <small>${esc(prev.title)}</small></a>` : ""}
        <a class="ez-btn" href="/papers/easy">16편 목록</a></div></nav></section>` : ""}`;
  // 퀴즈
  $$(".qz", root).forEach((q) => q.addEventListener("click", (e) => {
    const b = e.target.closest("[data-c]"); if (!b || b.disabled) return;
    const a = +q.dataset.a, c = +b.dataset.c;
    $$("[data-c]", q).forEach((x) => { x.disabled = true; if (+x.dataset.c === a) x.classList.add("ok"); });
    if (c !== a) b.classList.add("no");
    const w = $(".qz-w", q); w.hidden = false; w.innerHTML = `<b>${c === a ? "맞아요." : "아쉬워요."}</b> ${w.innerHTML}`;
  }));
  // 원문 그림 크게 보기
  root.addEventListener("click", (e) => {
    const img = e.target.closest(".ez-img img"); if (!img) return;
    const z = document.createElement("div"); z.className = "ez-zoom"; z.innerHTML = `<img src="${img.src}" alt="">`;
    const close = () => { z.remove(); removeEventListener("keydown", onK); };
    const onK = (ev) => { if (ev.key === "Escape") close(); };
    z.addEventListener("click", close); addEventListener("keydown", onK); document.body.append(z);
  });
  if (location.hash) $(location.hash)?.scrollIntoView();
}

async function main() {
  setTheme(store.get("ez-theme") || "");
  $("#ez-theme").addEventListener("click", () => { const dark = document.documentElement.dataset.theme ? document.documentElement.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches; setTheme(dark ? "light" : "dark"); });
  $("#ez-motion").addEventListener("click", () => { setMotion(!motion); $$("[data-flowfig]").forEach((f) => runFlow(f, motion && f.classList.contains("in"))); });
  const root = $("#ez"), id = new URLSearchParams(location.search).get("p");
  try {
    const idx = await getJSON("/papers/index.json");
    if (id && idx.papers.some((p) => p.id === id)) await paperPage(root, id, idx); else await listPage(root, idx);
  } catch (e) {
    root.innerHTML = `<p class="ez-err">${id ? "이 논문의 쉽게 읽기는 아직 준비 중이에요." : "목록을 불러오지 못했어요."} <a href="/papers/easy">목록으로</a></p>`;
    console.warn(e);
  }
  setMotion(motion);
  observe();
  const bar = $("#ez-progress");
  const onScroll = () => { const h = document.documentElement.scrollHeight - innerHeight; bar.style.width = (h > 0 ? (scrollY / h) * 100 : 0) + "%"; };
  addEventListener("scroll", onScroll, { passive: true }); onScroll();
}
main();
