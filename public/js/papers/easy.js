// 쉽게 읽기 (앱 안) — 중3~고1 눈높이 스크롤 설명. 내용: /papers/content/<id>.easy.json (규격 scripts/papers/EASY_SPEC.md)
//   #/papers/easy           16편 목록 + 오늘 복습할 차례
//   #/papers/<id>/easy      한 편
//   #/papers/easy/review    섞어서 복습 퀴즈
// 기억에 오래 남게 학습 과학 근거대로 짰어요 (EASY_SPEC.md '학습 과학'):
//   ① 읽기 전에 짐작하기(사전 시험) ② 핵심 낱말 먼저(사전 훈련) ③ 짧은 장 + 그림 + 강조(분할 · 이중 부호화 · 신호)
//   ④ 중간 퀴즈 + 바로 해설(인출 연습 + 피드백) ⑤ 끝에서 책 덮고 말해 보기 → 정리와 맞춰 보기(생성 · 자기 설명)
//   ⑥ 1 → 3 → 7일 간격 복습, 여러 논문 문제를 섞어서(간격 · 교차 연습)
import { api } from "../api.js";
import { toast } from "../util.js";
import { chatMarkup, mountChat } from "./chat.js";
import { fillFigtr } from "./figtr.js";
import { loadStudyTime, fmtMin } from "./studytime.js";

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const store = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };
const TONE = { a: "var(--a)", b: "var(--b)", c: "var(--c)", d: "var(--d)", n: "var(--n)" };
const tc = (t) => (TONE[t] ? `--tc:${TONE[t]};` : "");
const cache = new Map();
const getJSON = async (u) => { if (cache.has(u)) return cache.get(u); const r = await fetch(u, { cache: "no-cache" }); if (!r.ok) throw new Error(String(r.status)); const j = await r.json(); cache.set(u, j); return j; };
const idxP = () => getJSON("/papers/index.json");
const easyOf = (id) => getJSON(`/papers/content/${encodeURIComponent(id)}.easy.json`);
const md = (d) => { const [, m, dd] = d.split("-"); return `${+m}월 ${+dd}일`; };

// 글 안의 표시: **굵게** · {a:파랑} · {b:주황} · {c:초록}
function inline(s) {
  return esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/\{([abc]):([^{}]+)\}/g, (_, k, t) => `<span class="ez-hl-${k}">${t}</span>`).replace(/\n/g, "<br>");
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
const svg = (k) => (ICON[k] ? `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[k]}</svg>` : "");
const capOf = (b) => `${b.caption ? `<p class="ez-cap">${inline(b.caption)}</p>` : ""}${b.note ? `<p class="ez-note">${inline(b.note)}</p>` : ""}`;

function blocks(figBase) {
  return {
    p: (b) => `<p>${inline(b.text)}</p>`,
    figure: (b) => `<div class="ez-fig${b.wide === false ? "" : " wide"}"><figure class="ez-img" data-st><img src="${figBase}${esc(b.src)}" alt="${esc(b.caption || "")}" loading="lazy" decoding="async"></figure>${capOf(b)}<div class="ez-tr" data-tr="${esc(b.src)}" hidden></div></div>`,
    compare: (b) => `<div class="ez-fig"><div class="cmp" style="--n:${Math.min(3, b.items.length)}">${b.items.map((x, i) => `<div class="cmp-i" data-st style="--i:${i};${tc(x.tone)}"><div class="cmp-h">${svg(x.icon)}${inline(x.label)}</div><p>${inline(x.text)}</p></div>`).join("")}</div>${capOf(b)}</div>`,
    flow: (b) => {
      const row = (steps, r = 0) => `<div class="flw flw-row">${steps.map((s, i) => `${i ? `<span class="flw-ar" aria-hidden="true">→</span>` : ""}<div class="flw-s${s.empty ? " empty" : ""}" data-st data-flow="${r * 20 + i}" style="--i:${r * 3 + i};${tc(s.tone)}"><b>${inline(s.label || "")}</b>${s.sub ? `<span>${inline(s.sub)}</span>` : ""}</div>`).join("")}</div>`;
      const body = b.rows ? `<div class="flw-rows">${b.rows.map((r, i) => row(r, i)).join("")}</div>` : row(b.steps);
      return `<div class="ez-fig${(b.rows?.[0] || b.steps).length > 4 ? " wide" : ""}" data-flowfig>${body}${capOf(b)}</div>`;
    },
    grids: (b) => {
      const hi = b.hi ?? 0.5;
      const g = (x, k) => {
        const rows = x.values.slice(0, 6).map((r) => r.slice(0, 6)), cols = Math.max(...rows.map((r) => r.length));
        return `<div class="gr" data-st style="--i:${k * 2};${tc(x.tone)}"><span class="gr-l">${inline(x.label)}</span><div class="gr-t" style="--c:${cols}">${rows.flat().map((v, ci) => `<i data-ci="${ci}" class="${+v >= hi ? "h" : ""}" style="--v:${Math.max(0, Math.min(1, +v))}">${esc(typeof v === "number" ? v.toFixed(1) : v)}</i>`).join("")}</div></div>`;
      };
      return `<div class="ez-fig wide" data-grids="${b.items.length}"><div class="grs">${b.items.map((x, k) => `${k ? `<span class="gr-op" data-st style="--i:${k * 2 - 1}">${esc(b.ops?.[k - 1] || "→")}</span>` : ""}${g(x, k)}`).join("")}</div>${capOf(b)}</div>`;
    },
    bars: (b) => {
      const max = b.max || Math.max(...b.items.map((x) => +x.value)) * 1.08;
      return `<div class="ez-fig"><p class="brs-u">${esc(b.unit || "")}${b.lower_better ? " · 낮을수록 좋아요" : b.unit ? " · 높을수록 좋아요" : ""}</p><div class="brs">${b.items.map((x, i) => `<div class="bar" data-st style="--i:${i};${tc(x.tone)}--w:${Math.max(2, Math.min(100, (+x.value / max) * 100))}%"><span class="bar-l">${inline(x.label)}</span><span class="bar-t"><i></i></span><span class="bar-v" data-count="${esc(x.display == null ? x.value : "")}">${esc(x.display ?? x.value)}</span></div>`).join("")}</div>${capOf(b)}</div>`;
    },
    scale: (b) => `<div class="ez-fig"><div class="scl">${b.items.map((x, i) => `<div class="scl-row" data-st style="--i:${i};${tc(x.tone)}"><span>${inline(x.label)}</span><span class="scl-t" style="--x:${(+x.value * 100).toFixed(1)}%"><i style="--x:${(+x.value * 100).toFixed(1)}%"></i>${(b.marks || []).map((m) => `<s style="--x:${m.at * 100}%"></s>`).join("")}</span><span class="scl-v">${esc(x.display ?? (+x.value).toFixed(2))}</span></div>`).join("")}
      ${b.marks?.length ? `<div class="scl-m"><span></span><span>${b.marks.map((m) => `<em style="--x:${m.at * 100}%">${esc(m.label)}</em>`).join("")}</span><span></span></div>` : ""}</div>${capOf(b)}</div>`,
    steps: (b) => `<div class="ez-fig"><ol class="stp">${b.items.map((x, i) => `<li data-st style="--i:${i}"><div><b>${inline(x.title)}</b><p>${inline(x.text)}</p></div></li>`).join("")}</ol>${capOf(b)}</div>`,
    analogy: (b) => `<aside class="ez-box"><span class="k">비유로 보면</span>${b.title ? `<h3>${inline(b.title)}</h3>` : ""}<p>${inline(b.text)}</p>${b.limit ? `<p class="lim">${inline(b.limit)}</p>` : ""}</aside>`,
    callout: (b) => `<aside class="ez-box ${["warn", "tip", "key"].includes(b.kind) ? b.kind : "tip"}"><span class="k">${{ warn: "주의", tip: "알아 두면 좋아요", key: "꼭 기억" }[b.kind] || "알아 두면 좋아요"}</span><p>${inline(b.text)}</p></aside>`,
    quiz: (b, n) => quizHtml(b, `q${n}`),
    scene: (b) => sceneHtml(b),
  };
}

// ---------- scene: 장면 그림 + 단계 (자동 재생 · ◀ ▶) ----------
// things: 배경 물체 [{kind: person|car|bike|tree|house|box|dot|text, x, y, s?, tone?, dim?, label?}]
// steps: [{text, add: [{id, kind: box|mask|dot|arrow|label|tag, x, y, w?, h?, x2?, y2?, tone?, label?, dash?}], remove: [id], move: [{id, x, y}]}]
// SVG 글자: 좌표 단위가 작아서(1칸 = 1) 글자를 그대로 그리면 브라우저가 글자 간격을 반올림해 뭉개요.
// 50배 큰 글자를 그리고 0.02배로 줄여요.
const T = (x, y, cls, body, anchor = "middle", fill = "") => `<text transform="translate(${x} ${y}) scale(.02)" class="${cls}" text-anchor="${anchor}"${fill ? ` fill="${fill}"` : ""}>${body}</text>`;
const S_TONE = { a: "var(--a)", b: "var(--b)", c: "var(--c)", d: "var(--d)", n: "var(--n)", w: "var(--warn)" };
const col = (t) => S_TONE[t] || "var(--a)";
function thing(t) {
  const x = +t.x, y = +t.y, k = +(t.s || 1), c = t.tone ? col(t.tone) : "var(--ink-3)", o = t.dim ? 0.35 : 0.9, lab = t.label ? T(x, y + 1.35 * k, "sc-tl", esc(t.label)) : "";
  const g = (inner) => `<g class="sc-thing" opacity="${o}" fill="${c}">${inner}</g>${lab}`;
  switch (t.kind) {
    case "person": return g(`<circle cx="${x}" cy="${y - 0.95 * k}" r="${0.32 * k}"/><rect x="${x - 0.38 * k}" y="${y - 0.58 * k}" width="${0.76 * k}" height="${1.15 * k}" rx="${0.3 * k}"/>`);
    case "car": return g(`<rect x="${x - 1.1 * k}" y="${y - 0.55 * k}" width="${2.2 * k}" height="${0.6 * k}" rx="${0.18 * k}"/><rect x="${x - 0.65 * k}" y="${y - 0.95 * k}" width="${1.3 * k}" height="${0.5 * k}" rx="${0.2 * k}"/><circle cx="${x - 0.6 * k}" cy="${y + 0.08 * k}" r="${0.22 * k}"/><circle cx="${x + 0.6 * k}" cy="${y + 0.08 * k}" r="${0.22 * k}"/>`);
    case "bike": return g(`<circle cx="${x - 0.5 * k}" cy="${y}" r="${0.32 * k}" fill="none" stroke="${c}" stroke-width=".12"/><circle cx="${x + 0.5 * k}" cy="${y}" r="${0.32 * k}" fill="none" stroke="${c}" stroke-width=".12"/><path d="M${x - 0.5 * k} ${y}L${x} ${y - 0.45 * k}L${x + 0.5 * k} ${y}" fill="none" stroke="${c}" stroke-width=".12"/>`);
    case "tree": return g(`<circle cx="${x}" cy="${y - 1.1 * k}" r="${0.7 * k}"/><rect x="${x - 0.12 * k}" y="${y - 0.5 * k}" width="${0.24 * k}" height="${0.6 * k}"/>`);
    case "house": return g(`<path d="M${x - 1 * k} ${y - 0.9 * k}L${x} ${y - 1.7 * k}L${x + 1 * k} ${y - 0.9 * k}Z"/><rect x="${x - 0.8 * k}" y="${y - 0.9 * k}" width="${1.6 * k}" height="${1 * k}"/>`);
    case "box": return g(`<rect x="${x}" y="${y}" width="${+t.w || 1}" height="${+t.h || 1}" rx=".15"/>`);
    case "dot": return g(`<circle cx="${x}" cy="${y}" r="${0.2 * k}"/>`);
    case "text": return T(x, y, "sc-tx", esc(t.label || ""), "middle", t.tone ? c : "var(--ink-2)");
    default: return "";
  }
}
function overlay(o) {
  const c = col(o.tone), x = +o.x, y = +o.y, w = +o.w || 1, h = +o.h || 1, dash = o.dash ? ' stroke-dasharray=".3 .2"' : "";
  const tag = (tx, ty) => o.label ? `<g class="sc-tag"><rect x="${tx}" y="${ty - 0.62}" width="${Math.max(1, [...String(o.label)].reduce((n, ch) => n + (ch.charCodeAt(0) > 255 ? 0.42 : 0.24), 0) + 0.4)}" height=".62" rx=".12" fill="${c}"/>${T(tx + 0.2, ty - 0.18, "sc-lb", esc(o.label), "start")}</g>` : "";
  switch (o.kind) {
    case "mask": return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${Math.min(w, h) * 0.35}" fill="${c}" fill-opacity=".38" stroke="${c}" stroke-width=".08"/>${tag(x, y)}`;
    case "dot": return `<circle cx="${x}" cy="${y}" r=".28" fill="${c}"/><circle cx="${x}" cy="${y}" r=".55" fill="none" stroke="${c}" stroke-width=".07"/>${o.label ? tag(x + 0.4, y - 0.3) : ""}`;
    case "arrow": return `<line x1="${x}" y1="${y}" x2="${+o.x2}" y2="${+o.y2}" stroke="${c}" stroke-width=".12" marker-end="url(#sc-ar)"${dash}/>${o.label ? T((x + +o.x2) / 2, (y + +o.y2) / 2 - 0.25, "sc-tx", esc(o.label), "middle", c) : ""}`;
    case "label": case "tag": return T(x, y, "sc-tx big", esc(o.label || ""), o.anchor || "middle", c);
    default: return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx=".12" fill="${c}" fill-opacity=".08" stroke="${c}" stroke-width=".12"${dash}/>${tag(x, y)}`; // box
  }
}
function sceneHtml(b) {
  const W = +b.w || 16, H = +b.h || 9;
  const bg = { night: "sc-night", day: "sc-day", thermal: "sc-thermal" }[b.bg] || "sc-plain";
  return `<div class="ez-fig wide ez-scene" data-scene='${esc(JSON.stringify({ steps: b.steps || [] }))}'>
    <svg class="sc ${bg}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(b.caption || "장면 그림")}"><defs><marker id="sc-ar" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="context-stroke"/></marker></defs>
      <rect width="${W}" height="${H}" class="sc-bg"/>${b.ground ? `<line x1="0" y1="${b.ground}" x2="${W}" y2="${b.ground}" class="sc-ground"/>` : ""}
      <g class="sc-things">${(b.things || []).map(thing).join("")}</g><g class="sc-ov"></g></svg>
    <div class="sc-ctl"><button type="button" class="sc-b" data-sc="prev" aria-label="이전 단계">◀</button><span class="sc-dots">${(b.steps || []).map((_, i) => `<i data-dot="${i}"></i>`).join("")}</span><button type="button" class="sc-b" data-sc="next" aria-label="다음 단계">▶</button><p class="sc-text" aria-live="polite"></p></div>
    ${capOf(b)}</div>`;
}
// 단계 k 까지 쌓인 덮개를 그려요 (add · remove · move 를 차례로)
function sceneState(steps, k) {
  const m = new Map();
  for (let i = 0; i <= k && i < steps.length; i++) {
    const st = steps[i];
    (st.remove || []).forEach((id) => m.delete(id));
    (st.move || []).forEach((mv) => { const o = m.get(mv.id); if (o) m.set(mv.id, { ...o, ...mv }); });
    (st.add || []).forEach((o, j) => m.set(o.id || `s${i}-${j}`, { ...o, _new: i === k }));
  }
  return [...m.values()];
}
const quizHtml = (b, key, label = "잠깐 확인") => `<div class="qz" data-quiz="${esc(key)}" data-a="${+b.answer}"><p class="qz-k">${esc(label)}</p><p class="qz-q">${inline(b.q)}</p><div class="qz-c">${b.choices.map((c, i) => `<button type="button" data-c="${i}">${inline(c)}</button>`).join("")}</div><p class="qz-w" hidden>${inline(b.why || "")}</p></div>`;
// 퀴즈 답하기: 정답 · 고른 것 표시, 해설 보이기. 돌려주는 값 = 맞혔는지
function answer(q, c) {
  const a = +q.dataset.a, btn = $(`[data-c="${c}"]`, q);
  $$("[data-c]", q).forEach((x) => { x.disabled = true; if (+x.dataset.c === a) x.classList.add("ok"); });
  if (c !== a) btn?.classList.add("no");
  const w = $(".qz-w", q); w.hidden = false; w.innerHTML = `<b>${c === a ? "맞아요." : "아쉬워요."}</b> ${w.innerHTML}`;
  return c === a;
}

// ---------- 움직임 ----------
// 기본은 켜요. 예전엔 기기의 '동작 줄이기' 설정을 따라 꺼졌는데, 친구들 화면에서 그림이 안 움직이는 원인이었어요 (끄기는 스위치로)
let motion = store.get("ez-motion") !== "off";
function wireMotion(root) {
  const timers = new Map(); // 그림마다 돌고 있는 타이머
  const stop = (fig) => { (timers.get(fig) || []).forEach((t) => { clearInterval(t); clearTimeout(t); }); timers.delete(fig); };
  const keep = (fig, t) => { timers.set(fig, [...(timers.get(fig) || []), t]); return t; };

  // 장면: 켜짐 = 보이면 한 단계씩 자동 재생 · 꺼짐 = ◀ ▶ 로 직접 넘기기
  const scenes = new Map();
  function sceneInit(fig) {
    const { steps } = JSON.parse(fig.dataset.scene), ov = $(".sc-ov", fig), text = $(".sc-text", fig);
    const st = { k: 0, steps, user: false };
    const draw = () => {
      ov.innerHTML = sceneState(steps, st.k).map((o) => `<g class="${o._new ? "sc-new" : ""}">${overlay(o)}</g>`).join("");
      text.innerHTML = steps[st.k] ? `<b>${st.k + 1} / ${steps.length}</b> ${inline(steps[st.k].text || "")}` : "";
      $$("[data-dot]", fig).forEach((d, i) => d.classList.toggle("on", i <= st.k));
    };
    st.go = (k) => { st.k = Math.max(0, Math.min(steps.length - 1, k)); draw(); };
    fig.addEventListener("click", (e) => {
      const b = e.target.closest("[data-sc]"); const dot = e.target.closest("[data-dot]");
      if (b || dot) { st.user = true; stop(fig); }
      if (b) st.go(st.k + (b.dataset.sc === "next" ? 1 : -1));
      if (dot) st.go(+dot.dataset.dot);
    });
    scenes.set(fig, st); draw();
    return st;
  }
  function scenePlay(fig) {
    const st = scenes.get(fig) || sceneInit(fig);
    if (st.user || st.steps.length < 2) return;
    st.go(0);
    keep(fig, setInterval(() => { if (st.k >= st.steps.length - 1) { stop(fig); keep(fig, setTimeout(() => scenePlay(fig), 3500)); return; } st.go(st.k + 1); }, 2300));
  }
  // 격자: 결과 칸을 하나씩 계산하는 모습 (같은 자리 칸을 모든 격자에서 함께 비춰요)
  function gridsPlay(fig) {
    const grs = $$(".gr", fig); if (grs.length < 2) return;
    const out = $$("i", grs[grs.length - 1]); out.forEach((c) => c.classList.add("wait"));
    let j = 0;
    keep(fig, setInterval(() => {
      $$(".cur", fig).forEach((c) => c.classList.remove("cur"));
      if (j >= out.length) { stop(fig); return; }
      grs.forEach((g) => $(`[data-ci="${j}"]`, g)?.classList.add("cur"));
      out[j].classList.remove("wait"); j++;
    }, Math.max(90, Math.min(260, 4200 / out.length))));
  }
  // 막대: 0에서 숫자가 올라가요
  function barsPlay(fig) {
    $$("[data-count]", fig).forEach((el, i) => {
      const to = parseFloat(el.dataset.count); if (!Number.isFinite(to)) return;
      const dec = (String(el.dataset.count).split(".")[1] || "").length, t0 = performance.now() + i * 120 + 150;
      el.textContent = (0).toFixed(dec);
      const tick = (t) => { const k = Math.max(0, Math.min(1, (t - t0) / 1100)), e = 1 - Math.pow(1 - k, 3); el.textContent = (to * e).toFixed(dec); if (k < 1 && fig.isConnected) requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    });
  }
  // 흐름: 단계에 차례로 불이 켜지고, 화살표 위로 점이 지나가요
  function flowPlay(fig) {
    const steps = $$(".flw-s:not(.empty)", fig).sort((a, b) => a.dataset.flow - b.dataset.flow), ars = $$(".flw-ar", fig);
    let k = 0;
    const tick = () => { const n = k % (steps.length + 1); steps.forEach((s, i) => s.classList.toggle("on", i === n)); ars.forEach((a, i) => a.classList.toggle("go", i === n)); k++; };
    tick(); keep(fig, setInterval(tick, 1100));
  }
  // force: 움직임이 꺼져 있어도 이 그림만 한 번 재생 (다시 보기)
  function play(fig, force = false) {
    stop(fig);
    if (!motion && !force) return;
    fig.classList.toggle("force", force && !motion);
    // 처음 상태로 순간 이동한 뒤(전환 없이) 다음 프레임에 다시 시작 — 사라지는 효과와 나타나는 효과가 서로 지우지 않게
    fig.classList.add("reset"); fig.classList.remove("in"); void fig.offsetWidth; fig.classList.remove("reset");
    requestAnimationFrame(() => requestAnimationFrame(() => fig.classList.add("in")));
    if (fig.dataset.scene) scenePlay(fig);
    if (fig.dataset.grids) gridsPlay(fig);
    if ($("[data-count]", fig)) barsPlay(fig);
    if (fig.hasAttribute("data-flowfig")) flowPlay(fig);
  }
  function finish(fig) { // 꺼짐: 완성된 그림 그대로
    stop(fig); fig.classList.add("in");
    $$(".wait, .cur, .flw-s.on, .flw-ar.go", fig).forEach((c) => c.classList.remove("wait", "cur", "on", "go"));
    $$("[data-count]", fig).forEach((el) => { if (el.dataset.count) el.textContent = el.dataset.count; });
  }
  // 다시 보기 버튼 (움직이는 그림에만)
  $$(".ez-fig", root).forEach((fig) => {
    if (fig.dataset.scene) sceneInit(fig);
    if (fig.querySelector(".ez-img")) return;
    const b = document.createElement("button"); b.type = "button"; b.className = "ez-replay"; b.textContent = "↻ 다시 보기"; b.title = "이 그림을 처음부터 다시 움직여요";
    b.addEventListener("click", () => { const st = scenes.get(fig); if (st) st.user = false; play(fig, true); });
    fig.append(b);
  });
  const set = (on) => {
    motion = on; store.set("ez-motion", on ? "on" : "off");
    root.classList.toggle("anim", on);
    const b = $("#ez-motion", root);
    if (b) { b.innerHTML = `<span class="ez-sw ${on ? "on" : ""}" aria-hidden="true"><i></i></span><span class="ez-sw-t">${on ? "ON" : "OFF"}</span>`; b.setAttribute("aria-label", `그림 움직임 ${on ? "켜짐" : "꺼짐"}`); b.setAttribute("aria-pressed", on ? "true" : "false"); b.title = on ? "그림이 화면에 보이면 한 단계씩 저절로 움직여요. 끄면 완성된 그림이 바로 보이고, 장면 그림은 ◀ ▶ 로 넘겨요." : "켜면 그림이 화면에 보일 때 한 단계씩 저절로 움직여요."; }
    $$(".ez-fig", root).forEach((f) => (on && f.classList.contains("seen") ? play(f) : !on && finish(f)));
  };
  $("#ez-motion", root)?.addEventListener("click", () => set(!motion));
  const io = new IntersectionObserver((ents) => ents.forEach((e) => {
    const f = e.target;
    if (e.isIntersecting) { if (!f.classList.contains("seen")) { f.classList.add("seen"); motion ? play(f) : finish(f); } else if (motion && (f.dataset.scene || f.hasAttribute("data-flowfig")) && !timers.has(f)) play(f); }
    else if (f.dataset.scene || f.hasAttribute("data-flowfig")) stop(f); // 안 보이면 멈춰요
  }), { threshold: 0.3 });
  $$(".ez-fig", root).forEach((f) => io.observe(f));
  set(motion);
  return () => { io.disconnect(); [...timers.keys()].forEach(stop); };
}
function wireZoom(root) {
  root.addEventListener("click", (e) => {
    const img = e.target.closest(".ez-img img"); if (!img) return;
    const z = document.createElement("div"); z.className = "ez-zoom"; z.innerHTML = `<img src="${img.src}" alt="">`;
    const close = () => { z.remove(); removeEventListener("keydown", onK); };
    const onK = (ev) => { if (ev.key === "Escape") close(); };
    z.addEventListener("click", close); addEventListener("keydown", onK); document.body.append(z);
  });
}
const bar = (extra = "") => `<header class="ez-bar"><div class="ez-bar-in"><a class="ez-brand" href="#/papers/easy"><b>쉽게 읽기</b><span>${extra}</span></a><span class="ez-grow"></span><button type="button" class="ez-link" id="ez-motion" aria-pressed="false">애니메이션 멈추기</button></div><div class="ez-progress" aria-hidden="true"><i id="ez-progress"></i></div></header>`;
function wireProgress(root) {
  const sc = root.closest(".main") || document.scrollingElement, el = $("#ez-progress", root);
  const on = () => { const t = sc === document.scrollingElement ? scrollY : sc.scrollTop, h = (sc.scrollHeight || document.documentElement.scrollHeight) - (sc.clientHeight || innerHeight); if (el) el.style.width = (h > 0 ? Math.min(100, (t / h) * 100) : 0) + "%"; };
  const target = sc === document.scrollingElement ? window : sc;
  target.addEventListener("scroll", on, { passive: true }); on();
  return () => target.removeEventListener("scroll", on);
}

// ---------- 한 편 ----------
const EASY_QUICK = ["처음부터 아주 쉽게 3문장으로", "방금 읽은 걸 다른 비유로", "이게 왜 필요한지 예를 들어 줘", "헷갈리는 말 하나 풀어 줘", "확인 문제 하나 더 내 줘"];
export function mountEasy(host, ctx, id) {
  let stops = [], alive = true;
  host.innerHTML = `<div class="ezw">${bar()}<main class="ez"><p class="ez-loading">불러오는 중…</p></main></div>`;
  // AI 버튼 · 패널은 앱 화면 틀 밖(body)에 붙여요 — 틀 안에 있으면 잘려서 안 보여요
  const portal = document.createElement("div"); portal.className = "ezw ez-portal";
  portal.innerHTML = `<button type="button" class="ez-ai-fab" id="ez-ai-fab" aria-expanded="false" aria-controls="ez-ai"><img class="ez-ai-logo" src="/img/claude.svg" alt="" width="20" height="20">AI에게 물어보기</button>
    <aside class="ez-ai" id="ez-ai" aria-label="AI 튜터 (쉽게)" hidden><div class="ez-ai-head"><img class="ez-ai-logo" src="/img/claude.svg" alt="" width="18" height="18"><b>AI 튜터</b><span>중3 ~ 고1 눈높이로 답해요</span><button type="button" class="ez-link" id="ez-ai-x">닫기</button></div>
      ${chatMarkup("mini", { quick: EASY_QUICK, sub: "쉽게 읽기 모드", empty: "모르는 걸 바로 물어봐요. 본문 글자를 드래그하면 그 문장을 인용해서 물어볼 수 있어요. 장 제목 옆 '물어보기'를 눌러도 돼요.", ph: "예: 인코더가 정확히 뭐예요?" })}</aside>`;
  document.body.append(portal); stops.push(() => portal.remove());
  const root = $(".ezw", host), main = $(".ez", root), panel = $("#ez-ai", portal), fab = $("#ez-ai-fab", portal);
  const openAi = (on = true) => { panel.hidden = !on; fab.setAttribute("aria-expanded", on ? "true" : "false"); root.classList.toggle("ai-open", on); if (on) setTimeout(() => $(".ppc-in", panel)?.focus({ preventScroll: true }), 50); };
  // 패널 입력창에 글을 넣고 바로 보내기
  const askAi = (text) => { openAi(true); const ta = $(".ppc-in", panel); ta.value = text; $("[data-ppc-form]", panel).requestSubmit(); };
  fab.addEventListener("click", () => openAi(panel.hidden));
  $("#ez-ai-x", portal).addEventListener("click", () => openAi(false));
  stops.push(mountChat(portal, id, main, null, { level: "easy" }));
  const onSelc = () => { const t = getSelection()?.toString().trim(); fab.classList.toggle("pulse", !!(t && t.length >= 4 && main.contains(getSelection().anchorNode) && panel.hidden)); };
  document.addEventListener("selectionchange", onSelc); stops.push(() => document.removeEventListener("selectionchange", onSelc));
  (async () => {
    let d, idx, st;
    let tm = null;
    try { [d, idx, st, tm] = await Promise.all([easyOf(id), idxP(), api.easyState().catch(() => null), loadStudyTime()]); }
    catch { main.innerHTML = `<p class="ez-err">이 논문의 쉽게 읽기를 불러오지 못했어요. <a href="#/papers/easy">목록으로</a></p>`; return; }
    if (!alive) return;
    const B = blocks(`/papers/fig/${encodeURIComponent(id)}/`);
    const quizzes = d.sections.flatMap((s) => s.body.filter((b) => b.t === "quiz"));
    const pre = quizzes.slice(0, 2), mine = st?.items?.find((x) => x.paper === id);
    const guessKey = `ez-guess-${id}`, guesses = JSON.parse(store.get(guessKey) || "{}");
    const order = idx.papers.map((p) => p.id), i = order.indexOf(id), next = idx.papers[i + 1];
    let qn = 0;
    $(".ez-brand span", root).textContent = d.title;
    main.innerHTML = `
      <section class="ez-hero"><p class="ez-kicker">${esc(d.kicker || d.title)}</p><h1>${inline(d.headline)}</h1><p class="ez-lead">${inline(d.lead || "")}</p>
        <p class="ez-meta"><span title="${esc(tm?.method || "")}">예상 <b>${esc(fmtMin(tm?.papers?.[id]?.easy || d.minutes || 15))}</b> (분량을 재서 계산)</span><span>중3 ~ 고1 눈높이</span>${mine ? `<span>${mine.stage >= 4 ? "복습까지 끝냈어요" : `다음 복습 <b>${md(mine.due_day)}</b>`}</span>` : ""}</p>
        ${pre.length ? `<div class="ez-pre" id="ez-pre"><p class="ez-pre-k">읽기 전에 1분</p><p class="ez-pre-h">먼저 짐작해 보세요. 틀려도 괜찮아요.</p>
          <p class="ez-pre-s">답을 모르는 채로 먼저 골라 보면, 읽으면서 답을 만났을 때 더 오래 기억나요. 정답은 본문 속 같은 문제에서 알려 줘요.</p>
          ${pre.map((q, k) => `<div class="qz" data-pre="${k}"><p class="qz-k">짐작 ${k + 1}</p><p class="qz-q">${inline(q.q)}</p><div class="qz-c">${q.choices.map((c, j) => `<button type="button" data-g="${j}" class="${guesses[k] === j ? "pick" : ""}">${inline(c)}</button>`).join("")}</div></div>`).join("")}</div>` : ""}
        ${d.words?.length ? `<div class="ez-pre"><p class="ez-pre-k">먼저 알아 둘 말</p><p class="ez-pre-s" style="margin:0">처음 보는 말 몇 개만 미리 익혀 두면, 본문에서는 원리에만 집중할 수 있어요.</p>
          <div class="ez-words-pre">${d.words.slice(0, 4).map((w) => `<div><b>${esc(w.term)}</b><span>${inline(w.easy)}</span></div>`).join("")}</div></div>` : ""}
      </section>
      ${d.sections.map((s, k) => `<section class="ez-sec" id="ez-s${k + 1}"><p class="ez-n">${String(k + 1).padStart(2, "0")}<button type="button" class="ez-ask" data-ask="${k}" title="이 장을 AI에게 물어보기">AI에게 물어보기</button></p><h2>${inline(s.title)}</h2>${s.body.map((b) => { try { return B[b.t] ? B[b.t](b, b.t === "quiz" ? qn++ : 0) : ""; } catch { return ""; } }).join("")}</section>`).join("")}
      <section class="ez-sec" id="ez-recall-sec"><div class="ez-recall" id="ez-recall">
        <p class="ez-n">책 덮고 말해 보기</p><h2>보지 않고, 친구에게 설명하듯 3줄로 써 보세요.</h2>
        <p class="ez-recall-s">"${esc(d.title)}는 무엇을 하고, 어떻게, 얼마나 좋아졌나?" 스스로 떠올리는 순간이 다시 읽기보다 기억에 훨씬 오래 남아요. 다 쓰면 정리와 맞춰 볼게요.</p>
        <textarea id="ez-recall-t" placeholder="예: ○○는 … 하는 모델이에요. … 해서 … 가 좋아졌어요." aria-label="기억해서 설명 쓰기"></textarea>
        <div class="ez-row"><button type="button" class="ez-btn primary" id="ez-recall-go">다 썼어요 · 정리와 맞춰 보기</button><button type="button" class="ez-btn" id="ez-recall-skip">그냥 정리 보기</button></div>
        <div id="ez-recap" hidden></div></div></section>
      <section class="ez-sec">${d.words?.length ? `<div class="ez-words"><h3>이 페이지에 나온 말</h3><dl>${d.words.map((w) => `<dt>${esc(w.term)}</dt><dd>${inline(w.easy)}</dd>`).join("")}</dl></div>` : ""}
        <nav class="ez-next" aria-label="다음으로"><h3>다음으로</h3><div class="ez-next-row">
          <a class="ez-btn primary" href="#/papers/${esc(id)}">이 논문 이어 공부하기 <small>퀴즈 · 3분 설명 · 자세히 읽기</small></a>
          ${next ? `<a class="ez-btn" href="#/papers/${esc(next.id)}/easy">다음 논문 <small>${esc(next.title)}</small> →</a>` : ""}
          <a class="ez-btn" href="#/papers/easy">16편 목록</a></div></nav></section>`;
    // ① 짐작 — 고르기만 (정답은 안 알려 줘요). 본문의 같은 문제를 풀면 "처음 짐작"을 같이 보여 줘요
    $("#ez-pre", main)?.addEventListener("click", (e) => {
      const b = e.target.closest("[data-g]"); if (!b) return;
      const k = +b.closest("[data-pre]").dataset.pre; guesses[k] = +b.dataset.g; store.set(guessKey, JSON.stringify(guesses));
      $$("[data-g]", b.closest("[data-pre]")).forEach((x) => x.classList.toggle("pick", x === b));
    });
    // ④ 본문 퀴즈
    main.addEventListener("click", (e) => {
      const ak = e.target.closest("[data-ask]");
      if (ak) { const s = d.sections[+ak.dataset.ask]; askAi(`${+ak.dataset.ask + 1}장 "${s.title.replace(/\*\*|\{[abc]:|\}/g, "")}" 을 더 쉽게, 다른 예를 들어 설명해 줘.`); return; }
      const b = e.target.closest(".ez-sec [data-c]"); if (!b || b.disabled) return;
      const q = b.closest(".qz"), k = +q.dataset.quiz.slice(1);
      answer(q, +b.dataset.c);
      if (k < pre.length && guesses[k] != null) { const g = document.createElement("span"); g.className = "ez-guess"; g.textContent = `읽기 전 짐작: ${String.fromCharCode(9312 + guesses[k])} ${guesses[k] === +q.dataset.a ? "— 처음부터 맞혔어요" : "— 읽고 나서 바로잡았어요"}`; $(".qz-w", q).append(g); }
    });
    // ⑤ 떠올리기 → 정리 맞춰 보기 → 저장(간격 복습 시작)
    const points = d.recap?.points || [];
    const reveal = (wrote) => {
      const box = $("#ez-recap", main), text = $("#ez-recall-t", main).value.trim();
      $("#ez-recall-go", main).disabled = true; $("#ez-recall-skip", main).disabled = true; $("#ez-recall-t", main).readOnly = true;
      box.hidden = false;
      box.innerHTML = `${wrote && text ? `<p class="ez-my">${esc(text)}</p>` : ""}
        <h3 class="pp-h3" style="margin:22px 0 6px">${inline(d.recap?.title || "정리")}</h3><p>${inline(d.recap?.text || "")}</p>
        ${points.length ? `<p class="ez-recall-s" style="margin:16px 0 0">${wrote ? "내가 떠올린 것에 체크해 보세요. 빠진 것만 다시 보면 돼요." : "핵심이에요. 다음에는 먼저 써 보고 맞춰 보세요."}</p>
          <ul class="ez-check">${points.map((p, j) => `<li><label><input type="checkbox" data-pt="${j}" ${wrote ? "" : "disabled"}><span>${inline(p)}</span></label></li>`).join("")}</ul>` : ""}
        <div class="ez-row"><button type="button" class="ez-btn primary" id="ez-save">다 읽었어요 · 복습 예약하기</button>${wrote && text ? `<button type="button" class="ez-btn" id="ez-ai-check">AI에게 내 설명 확인받기</button>` : ""}</div><div id="ez-saved"></div>`;
      $("#ez-ai-check", box)?.addEventListener("click", () => askAi(`내가 책을 덮고 쓴 설명이에요. 맞는 점 1~2개, 틀리거나 빠진 점 1~2개를 중학생 눈높이로 짧게 알려 줘:\n"${text.slice(0, 800)}"`));
      $("#ez-save", box).addEventListener("click", async (ev) => {
        ev.currentTarget.disabled = true;
        const got = wrote ? $$("[data-pt]:checked", box).length : null;
        try {
          const s2 = await api.easyRead(id, got, wrote ? points.length : null), me2 = s2.items.find((x) => x.paper === id);
          $("#ez-saved", box).innerHTML = `<p class="ez-saved">${wrote ? `핵심 ${points.length}개 중 <b>${got}개</b>를 스스로 떠올렸어요. ` : ""}<b>${md(me2.due_day)}</b>에 섞어서 복습할 차례가 와요. 1일 → 3일 → 7일 간격으로 다시 꺼내 보면 오래 가요.</p>`;
          window.dispatchEvent(new CustomEvent("trio:changed", { detail: { kind: "papers" } }));
        } catch (x) { ev.currentTarget.disabled = false; toast(x.message || "저장하지 못했어요.", "err"); }
      });
    };
    $("#ez-recall-go", main).addEventListener("click", () => { if (!$("#ez-recall-t", main).value.trim()) { toast("한 줄이라도 먼저 써 보세요. 틀려도 괜찮아요."); $("#ez-recall-t", main).focus(); return; } reveal(true); });
    $("#ez-recall-skip", main).addEventListener("click", () => reveal(false));
    wireZoom(main);
    fillFigtr(main, id);
    stops.push(wireMotion(root), wireProgress(root), wireToc(root, main, d));
  })();
  return () => { alive = false; stops.forEach((f) => f?.()); };
}

// ---------- 목차: 넓은 화면은 왼쪽에 붙어 있고, 좁은 화면은 위 막대의 '목차' 버튼으로 ----------
function wireToc(root, main, d) {
  const plain = (t) => String(t || "").replace(/\*\*|\{[abc]:|\}/g, "");
  const items = [["ez-top", "시작 · 짐작해 보기"], ...d.sections.map((s, k) => [`ez-s${k + 1}`, `${String(k + 1).padStart(2, "0")}  ${plain(s.title)}`]), ["ez-recall-sec", "책 덮고 말해 보기"]];
  $(".ez-hero", main).id = "ez-top";
  const list = `<ol>${items.map(([id, t]) => `<li><a href="#" data-to="${id}">${esc(t)}</a></li>`).join("")}</ol>`;
  const side = document.createElement("nav"); side.className = "ez-toc"; side.setAttribute("aria-label", "목차");
  side.innerHTML = `<p class="ez-toc-h">목차</p>${list}`;
  root.classList.add("has-toc"); root.insertBefore(side, main);
  const btn = document.createElement("button"); btn.type = "button"; btn.className = "ez-link ez-toc-btn"; btn.textContent = "목차"; btn.setAttribute("aria-expanded", "false");
  const pop = document.createElement("nav"); pop.className = "ez-toc-pop"; pop.hidden = true; pop.setAttribute("aria-label", "목차"); pop.innerHTML = list;
  $(".ez-bar-in", root).insertBefore(btn, $("#ez-motion", root)); $(".ez-bar", root).append(pop);
  btn.addEventListener("click", () => { pop.hidden = !pop.hidden; btn.setAttribute("aria-expanded", String(!pop.hidden)); });
  const go = (e) => {
    const a = e.target.closest("[data-to]"); if (!a) return;
    e.preventDefault(); pop.hidden = true; btn.setAttribute("aria-expanded", "false");
    const el = document.getElementById(a.dataset.to); if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    // 지나가며 늦게 불러온 그림 때문에 페이지 길이가 바뀌면 목표가 밀려요 → 끝난 뒤 두 번 바로잡아요
    [750, 1500].forEach((ms) => setTimeout(() => { const top = el.getBoundingClientRect().top; if (Math.abs(top - 72) > 12) el.scrollIntoView({ block: "start" }); }, ms));
  };
  side.addEventListener("click", go); pop.addEventListener("click", go);
  // 지금 읽는 장을 목차에서 밝게
  const mark = (id) => [side, pop].forEach((n) => $$("[data-to]", n).forEach((a) => a.classList.toggle("on", a.dataset.to === id)));
  const seen = new Map();
  const io = new IntersectionObserver((ents) => {
    ents.forEach((e) => seen.set(e.target.id, e.isIntersecting ? e.boundingClientRect.top : null));
    const cur = [...seen.entries()].filter(([, v]) => v != null).sort((a, b) => Math.abs(a[1]) - Math.abs(b[1]))[0];
    if (cur) {
      mark(cur[0]);
      // 목차 칸만 살짝 굴려요 (scrollIntoView 를 쓰면 본문의 부드러운 이동이 끊겨요)
      const a = $(`[data-to="${cur[0]}"]`, side);
      if (a && side.scrollHeight > side.clientHeight) { const t = a.offsetTop - side.clientHeight / 2; side.scrollTo({ top: Math.max(0, t) }); }
    }
  }, { rootMargin: "-80px 0px -55% 0px" });
  items.forEach(([id]) => { const el = document.getElementById(id); if (el) io.observe(el); });
  const outside = (e) => { if (!pop.hidden && !pop.contains(e.target) && e.target !== btn) { pop.hidden = true; btn.setAttribute("aria-expanded", "false"); } };
  document.addEventListener("click", outside);
  return () => { io.disconnect(); document.removeEventListener("click", outside); };
}

// ---------- 목록 ----------
const STAGE = (r, today) => (!r ? "" : r.stage >= 4 ? `<span class="ez-stage-b s4">복습 끝</span>` : r.due_day <= today ? `<span class="ez-stage-b due">복습할 차례</span>` : `<span class="ez-stage-b s${r.stage}">${r.stage === 1 ? "읽음" : `복습 ${r.stage - 1}회`} · ${md(r.due_day)}</span>`);
export function mountEasyList(host, ctx) {
  let alive = true, stops = [];
  host.innerHTML = `<div class="ezw">${bar("중3 ~ 고1 눈높이")}<main class="ez"><p class="ez-loading">불러오는 중…</p></main></div>`;
  const root = $(".ezw", host), main = $(".ez", root);
  (async () => {
    const [idx, st, tm] = await Promise.all([idxP(), api.easyState().catch(() => ({ items: [], due: [], today: "" })), loadStudyTime()]);
    const heads = await Promise.all(idx.papers.map((p) => easyOf(p.id).then((d) => d.headline.replace(/\n/g, " ")).catch(() => null)));
    if (!alive) return;
    const rows = new Map(st.items.map((r) => [r.paper, r])), byStage = {};
    idx.papers.forEach((p, i) => (byStage[p.stage] ||= []).push({ ...p, head: heads[i] }));
    let n = 0; const stages = Object.keys(byStage).sort((a, b) => a - b);
    const done = st.items.length;
    main.innerHTML = `<section class="ez-hero"><p class="ez-kicker">엣지 비전 논문 16편</p><h1>어려운 논문을,<br>중학생도 따라올 수 있게.</h1>
      <p class="ez-lead">읽기 전에 짐작하고, 그림으로 원리를 보고, 책을 덮고 직접 말해 본 뒤, 며칠 간격을 두고 섞어서 다시 꺼내요. 기억 연구에서 오래 남는다고 확인된 순서 그대로예요.</p>
      <p class="ez-meta"><span>읽은 논문 <b>${done}</b> / ${idx.papers.length}</span>${tm ? `<span title="${esc(tm.method)}">16편 쉽게 읽기 예상 <b>${esc(fmtMin(Object.values(tm.papers).reduce((a, x) => a + x.easy, 0)))}</b></span>` : ""}<span>전문가용 해설은 각 논문의 "자세히 읽기"에 있어요</span></p>
      ${st.due.length ? `<div class="ez-due"><b>오늘 복습할 차례 ${st.due.length}편</b><span>${st.due.map((x) => esc(idx.papers.find((p) => p.id === x)?.title || x)).join(" · ")} — 문제를 섞어서 5분이면 끝나요.</span><a class="ez-btn primary" href="#/papers/easy/review">섞어서 복습하기</a></div>`
        : done ? `<div class="ez-due"><b>오늘은 복습할 차례가 없어요</b><span>다음 복습: ${esc(md(st.items.filter((r) => r.stage < 4).map((r) => r.due_day).sort()[0] || st.today || "2026-10-05"))}. 미리 해 봐도 돼요.</span><a class="ez-btn" href="#/papers/easy/review">미리 복습하기</a></div>` : ""}
    </section>
    ${stages.map((s) => { const x = idx.stages?.find((t) => t.n === +s); return `<p class="ez-stage">${s}단계${x ? ` · ${esc(x.label)}` : ""}</p><ul class="ez-list">${byStage[s].map((p) => `<li class="${p.head ? "" : "soon"}"><a href="#/papers/${esc(p.id)}/easy"><span class="n">${String(++n).padStart(2, "0")}</span><span><b>${esc(p.title)}</b><span class="h">${esc(p.head || "준비 중이에요")}</span></span><span class="tagc"><span class="tag">${esc(p.field || "")}${tm?.papers?.[p.id] ? ` · ${esc(fmtMin(tm.papers[p.id].easy))}` : ""}</span>${STAGE(rows.get(p.id), st.today)}</span></a></li>`).join("")}</ul>`; }).join("")}`;
    stops.push(wireMotion(root), wireProgress(root));
  })().catch(() => { main.innerHTML = `<p class="ez-err">목록을 불러오지 못했어요.</p>`; });
  return () => { alive = false; stops.forEach((f) => f?.()); };
}

// ---------- 섞어서 복습 (간격 + 교차 + 인출) ----------
export function mountEasyReview(host, ctx) {
  let alive = true;
  host.innerHTML = `<div class="ezw">${bar("섞어서 복습")}<main class="ez"><div class="ez-rv"><p class="ez-loading">문제 고르는 중…</p></div></main></div>`;
  const root = $(".ezw", host), box = $(".ez-rv", root);
  (async () => {
    const [idx, st] = await Promise.all([idxP(), api.easyState()]);
    let pool = st.due.length ? st.due : st.items.filter((r) => r.stage < 4).map((r) => r.paper);
    if (!pool.length) pool = st.items.map((r) => r.paper);
    if (!pool.length) { box.innerHTML = `<h2>아직 읽은 논문이 없어요.</h2><p>한 편을 끝까지 읽고 "복습 예약하기"를 누르면, 하루 뒤부터 여기서 섞어서 복습해요.</p><a class="ez-btn primary" href="#/papers/easy">16편 목록</a>`; return; }
    const papers = await Promise.all(pool.map((id) => easyOf(id).then((d) => ({ id, d })).catch(() => null)));
    // 논문마다 2문제(본문 퀴즈 중 무작위) → 전부 섞기. 같은 논문이 연달아 나오지 않게 한 번 더 흩어요
    const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
    let qs = papers.filter(Boolean).flatMap(({ id, d }) => shuffle(d.sections.flatMap((s) => s.body.filter((b) => b.t === "quiz"))).slice(0, 2).map((q) => ({ id, title: d.title, q })));
    qs = shuffle(qs);
    for (let i = 1; i < qs.length; i++) if (qs[i].id === qs[i - 1].id) { const j = qs.findIndex((x, k) => k > i && x.id !== qs[i].id); if (j > 0) [qs[i], qs[j]] = [qs[j], qs[i]]; }
    if (!alive) return;
    const res = {};
    let k = 0;
    const draw = () => {
      if (k >= qs.length) return finish();
      const it = qs[k];
      box.innerHTML = `<div class="ez-rv-top"><span>${k + 1} / ${qs.length}</span><span>${st.due.length ? "오늘 복습할 차례" : "미리 복습"} · ${papers.filter(Boolean).length}편 섞음</span></div><div class="ez-rv-bar"><i style="width:${(k / qs.length) * 100}%"></i></div>
        <p class="ez-rv-from">${esc(it.title)}</p>${quizHtml(it.q, "rv", "기억해서 고르기")}<div class="ez-row" id="ez-rv-next" hidden><button type="button" class="ez-btn primary">${k + 1 < qs.length ? "다음 문제" : "결과 보기"}</button></div>`;
      $(".qz", box).addEventListener("click", (e) => {
        const b = e.target.closest("[data-c]"); if (!b || b.disabled) return;
        const ok = answer($(".qz", box), +b.dataset.c);
        const r = (res[it.id] ||= { paper: it.id, correct: 0, total: 0 }); r.total++; if (ok) r.correct++;
        $("#ez-rv-next", box).hidden = false; $("#ez-rv-next button", box).focus();
      });
      $("#ez-rv-next button", box).addEventListener("click", () => { k++; draw(); });
    };
    const finish = async () => {
      const list = Object.values(res);
      box.innerHTML = `<h2>복습 끝!</h2><div class="ez-rv-sum">${list.map((r) => `<div><span>${esc(qs.find((x) => x.id === r.paper).title)}</span><b>${r.correct} / ${r.total}${!st.due.includes(r.paper) ? "" : r.correct * 2 >= r.total ? " · 다음 간격으로" : " · 내일 한 번 더"}</b></div>`).join("")}</div><p id="ez-rv-msg" class="ez-recall-s">저장하는 중…</p><div class="ez-row"><a class="ez-btn primary" href="#/papers/easy">16편 목록</a></div>`;
      if (!st.due.length) { $("#ez-rv-msg", box).textContent = "미리 한 복습이라 복습 날짜는 그대로 둬요. 틀린 문제는 그 논문을 다시 훑어보세요."; return; }
      try { await api.easyReview(list); $("#ez-rv-msg", box).textContent = "절반 이상 맞힌 논문은 다음 간격(3일 → 7일)으로, 아닌 논문은 내일 다시 나와요."; window.dispatchEvent(new CustomEvent("trio:changed", { detail: { kind: "papers" } })); }
      catch (x) { $("#ez-rv-msg", box).textContent = x.message || "저장하지 못했어요."; }
    };
    draw();
  })().catch((e) => { box.innerHTML = `<p class="ez-err">${esc(e.message || "불러오지 못했어요.")}</p>`; });
  wireMotion(root);
  return () => { alive = false; };
}
