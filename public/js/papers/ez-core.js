// 쉽게 읽기 공통 부품 — 논문 쉽게 읽기(easy.js)와 AI 공부책(books/)이 같이 써요.
// 글 안 표시(inline) · 블록 그리기(blocks) · 장면/재생 그림 · 퀴즈 · 움직임(wireMotion) · 목차 · 진행 막대 · 위 막대.
// 여기엔 서버(api) 호출이 없어요. 화면별 저장은 각자(easy.js · books/)가 해요.
import { $, $$, esc } from "../util.js";
export { $, $$, esc };
export const store = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };
const TONE = { a: "var(--a)", b: "var(--b)", c: "var(--c)", d: "var(--d)", n: "var(--n)" };
export const tc = (t) => (TONE[t] ? `--tc:${TONE[t]};` : "");
const cache = new Map();
export const getJSON = async (u) => { if (cache.has(u)) return cache.get(u); const r = await fetch(u, { cache: "no-cache" }); if (!r.ok) throw new Error(String(r.status)); const j = await r.json(); cache.set(u, j); return j; };
export const md = (d) => { const [, m, dd] = d.split("-"); return `${+m}월 ${+dd}일`; };
export const plain = (t) => String(t || "").replace(/\*\*|\{[abc]:|\}/g, "");

// 글 안의 표시: **굵게** · {a:파랑} · {b:주황} · {c:초록}
export function inline(s) {
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
export const svg = (k) => (ICON[k] ? `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[k]}</svg>` : "");
export const capOf = (b) => `${b.caption ? `<p class="ez-cap">${inline(b.caption)}</p>` : ""}${b.note ? `<p class="ez-note">${inline(b.note)}</p>` : ""}`;

export function blocks(figBase, extra = {}) {
  return { ...extra,
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
    play: (b) => playHtml(b),
    ...extra,
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

// ---------- play: 칩(토큰 · 상자)이 줄에 놓이고, 단계마다 생기고 · 밝아지고 · 선으로 이어지는 '원리 재생' 그림 ----------
// rows: [{id, label, items: [{id, text, tone?, v?(0~1 막대)}]}]
// steps: [{text, add: [{row, id, text, tone?, v?}], remove: [id], set: [{id, text?, v?, tone?}], hi: [id], link: [{from, to, w?(0~1), tone?, label?}]}]
// hi 와 link 는 그 단계의 값으로 바뀌고(없으면 비움), add · remove · set 은 쌓여요.
function playHtml(b) {
  const data = { rows: (b.rows || []).map((r) => ({ id: r.id, label: r.label || "", items: r.items || [] })), steps: b.steps || [] };
  return `<div class="ez-fig wide ez-play" data-play='${esc(JSON.stringify(data))}'>
    <div class="pl-stage"><div class="pl-rows">${data.rows.map((r) => `<div class="pl-row" data-row="${esc(r.id)}"><span class="pl-l">${inline(r.label)}</span><div class="pl-items"></div></div>`).join("")}</div><svg class="pl-links" aria-hidden="true"></svg></div>
    <div class="sc-ctl"><button type="button" class="sc-b" data-sc="prev" aria-label="이전 단계">◀</button><span class="sc-dots">${data.steps.map((_, i) => `<i data-dot="${i}"></i>`).join("")}</span><button type="button" class="sc-b" data-sc="next" aria-label="다음 단계">▶</button><p class="sc-text" aria-live="polite"></p></div>
    ${capOf(b)}</div>`;
}
function playState(data, k) {
  const rows = new Map(data.rows.map((r) => [r.id, r.items.map((x) => ({ ...x }))]));
  let hi = [], links = [];
  for (let i = 0; i <= k && i < data.steps.length; i++) {
    const st = data.steps[i];
    (st.remove || []).forEach((id) => rows.forEach((items, rid) => rows.set(rid, items.filter((x) => x.id !== id))));
    (st.add || []).forEach((o) => { const r = rows.get(o.row) || rows.get([...rows.keys()][0]); if (r) r.push({ ...o, _new: i === k }); });
    (st.set || []).forEach((o) => rows.forEach((items) => items.forEach((x) => { if (x.id === o.id) Object.assign(x, o, { _set: i === k }); })));
    if (st.hi) hi = st.hi; if (st.link) links = st.link;
  }
  return { rows, hi: new Set(hi), links };
}
const chip = (x, hi) => `<span class="pl-c${hi ? " hi" : ""}${x._new ? " new" : ""}${x._set ? " set" : ""}" data-id="${esc(x.id || "")}" style="${tc(x.tone)}${x.v != null ? `--v:${Math.max(0, Math.min(1, +x.v))};` : ""}"><span>${inline(String(x.text ?? ""))}</span>${x.v != null ? `<i class="pl-v"></i><small>${Math.round(+x.v * 100)}%</small>` : ""}</span>`;
function drawPlay(fig, data, k) {
  const { rows, hi, links } = playState(data, k);
  rows.forEach((items, rid) => { const el = $(`[data-row="${rid}"] .pl-items`, fig); if (el) el.innerHTML = items.map((x) => chip(x, hi.has(x.id))).join(""); });
  const svg = $(".pl-links", fig), box = $(".pl-stage", fig);
  const draw = () => {
    const R = box.getBoundingClientRect(); svg.setAttribute("viewBox", `0 0 ${R.width} ${R.height}`); svg.setAttribute("width", R.width); svg.setAttribute("height", R.height);
    const c = (id) => { const e = $(`.pl-c[data-id="${id}"]`, fig); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left - R.left + r.width / 2, y: r.top - R.top + r.height / 2, h: r.height }; };
    svg.innerHTML = links.map((l) => {
      const a = c(l.from), b = c(l.to); if (!a || !b) return "";
      const w = l.w == null ? 0.6 : Math.max(0, Math.min(1, +l.w)), col = TONE[l.tone] || "var(--a)";
      const up = b.y < a.y, y1 = a.y + (up ? -a.h / 2 : a.h / 2), y2 = b.y + (up ? b.h / 2 : -b.h / 2), my = (y1 + y2) / 2;
      return `<path d="M${a.x} ${y1} C ${a.x} ${my}, ${b.x} ${my}, ${b.x} ${y2}" fill="none" stroke="${col}" stroke-width="${1 + 5 * w}" stroke-opacity="${0.25 + 0.65 * w}" stroke-linecap="round"/>${l.label || l.w != null ? `<text x="${(a.x + b.x) / 2}" y="${my - 4}" text-anchor="middle" class="pl-lt" fill="${col}">${esc(l.label ?? Math.round(w * 100) + "%")}</text>` : ""}`;
    }).join("");
  };
  requestAnimationFrame(draw);
  return draw;
}
export const quizHtml = (b, key, label = "잠깐 확인") => `<div class="qz" data-quiz="${esc(key)}" data-a="${+b.answer}"><p class="qz-k">${esc(label)}</p><p class="qz-q">${inline(b.q)}</p><div class="qz-c">${b.choices.map((c, i) => `<button type="button" data-c="${i}">${inline(c)}</button>`).join("")}</div><p class="qz-w" hidden>${inline(b.why || "")}</p></div>`;
// 퀴즈 답하기: 정답 · 고른 것 표시, 해설 보이기. 돌려주는 값 = 맞혔는지
export function answer(q, c) {
  const a = +q.dataset.a, btn = $(`[data-c="${c}"]`, q);
  $$("[data-c]", q).forEach((x) => { x.disabled = true; if (+x.dataset.c === a) x.classList.add("ok"); });
  if (c !== a) btn?.classList.add("no");
  const w = $(".qz-w", q); w.hidden = false; w.innerHTML = `<b>${c === a ? "맞아요." : "아쉬워요."}</b> ${w.innerHTML}`;
  return c === a;
}

// ---------- 움직임 ----------
// 기본은 켜요. 예전엔 기기의 '동작 줄이기' 설정을 따라 꺼졌는데, 친구들 화면에서 그림이 안 움직이는 원인이었어요 (끄기는 스위치로)
let motion = store.get("ez-motion") !== "off";
export function wireMotion(root) {
  const timers = new Map(); // 그림마다 돌고 있는 타이머
  const stop = (fig) => { (timers.get(fig) || []).forEach((t) => { clearInterval(t); clearTimeout(t); }); timers.delete(fig); };
  const keep = (fig, t) => { timers.set(fig, [...(timers.get(fig) || []), t]); return t; };

  // 장면: 켜짐 = 보이면 한 단계씩 자동 재생 · 꺼짐 = ◀ ▶ 로 직접 넘기기
  const scenes = new Map();
  function sceneInit(fig) {
    const isPlay = !!fig.dataset.play, data = JSON.parse(fig.dataset.play || fig.dataset.scene), steps = data.steps, ov = $(".sc-ov", fig), text = $(".sc-text", fig);
    const st = { k: 0, steps, user: false };
    const draw = () => {
      if (isPlay) st.redraw = drawPlay(fig, data, st.k);
      else ov.innerHTML = sceneState(steps, st.k).map((o) => `<g class="${o._new ? "sc-new" : ""}">${overlay(o)}</g>`).join("");
      text.innerHTML = steps[st.k] ? `<b>${st.k + 1} / ${steps.length}</b> ${inline(steps[st.k].text || "")}` : "";
      $$("[data-dot]", fig).forEach((d, i) => d.classList.toggle("on", i <= st.k));
    };
    if (isPlay) { const ro = new ResizeObserver(() => st.redraw?.()); ro.observe(fig); } // 폭이 바뀌면 선을 다시 그려요
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
    if (fig.dataset.scene || fig.dataset.play) scenePlay(fig);
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
    if (fig.dataset.scene || fig.dataset.play) sceneInit(fig);
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
    if (e.isIntersecting) { if (!f.classList.contains("seen")) { f.classList.add("seen"); motion ? play(f) : finish(f); } else if (motion && (f.dataset.scene || f.dataset.play || f.hasAttribute("data-flowfig")) && !timers.has(f)) play(f); }
    else if (f.dataset.scene || f.dataset.play || f.hasAttribute("data-flowfig")) stop(f); // 안 보이면 멈춰요
  }), { threshold: 0.3 });
  $$(".ez-fig", root).forEach((f) => io.observe(f));
  set(motion);
  return () => { io.disconnect(); [...timers.keys()].forEach(stop); };
}
export function wireZoom(root) {
  root.addEventListener("click", (e) => {
    const img = e.target.closest(".ez-img img"); if (!img) return;
    const z = document.createElement("div"); z.className = "ez-zoom"; z.innerHTML = `<img src="${img.src}" alt="">`;
    const close = () => { z.remove(); removeEventListener("keydown", onK); };
    const onK = (ev) => { if (ev.key === "Escape") close(); };
    z.addEventListener("click", close); addEventListener("keydown", onK); document.body.append(z);
  });
}
export const bar = (extra = "", { href = "#/papers/easy", label = "쉽게 읽기", right = "" } = {}) => `<header class="ez-bar"><div class="ez-bar-in"><a class="ez-brand" href="${href}"><b>${label}</b><span>${extra}</span></a><span class="ez-grow"></span>${right}<button type="button" class="ez-link" id="ez-motion" aria-pressed="false">애니메이션 멈추기</button></div><div class="ez-progress" aria-hidden="true"><i id="ez-progress"></i></div></header>`;
export function wireProgress(root) {
  const sc = root.closest(".main") || document.scrollingElement, el = $("#ez-progress", root);
  const on = () => { const t = sc === document.scrollingElement ? scrollY : sc.scrollTop, h = (sc.scrollHeight || document.documentElement.scrollHeight) - (sc.clientHeight || innerHeight); if (el) el.style.width = (h > 0 ? Math.min(100, (t / h) * 100) : 0) + "%"; };
  const target = sc === document.scrollingElement ? window : sc;
  target.addEventListener("scroll", on, { passive: true }); on();
  return () => target.removeEventListener("scroll", on);
}


// ---------- 목차: 넓은 화면은 왼쪽에 붙어 있고, 좁은 화면은 위 막대의 '목차' 버튼으로 ----------
// d: 쉽게 읽기 문서({sections}) 또는 [[id, 글], …] 목록. 머리글(.ez-hero)에 id "ez-top" 을 붙여요
export function wireToc(root, main, d) {
  const items = Array.isArray(d) ? d : [["ez-top", "시작 · 짐작해 보기"], ...d.sections.map((s, k) => [`ez-s${k + 1}`, `${String(k + 1).padStart(2, "0")}  ${plain(s.title)}`]), ["ez-recall-sec", "책 덮고 말해 보기"]];
  const hero = $(".ez-hero", main); if (hero && !hero.id) hero.id = "ez-top";
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
export const STAGE = (r, today) => (!r ? "" : r.stage >= 4 ? `<span class="ez-stage-b s4">복습 끝</span>` : r.due_day <= today ? `<span class="ez-stage-b due">복습할 차례</span>` : `<span class="ez-stage-b s${r.stage}">${r.stage === 1 ? "읽음" : `복습 ${r.stage - 1}회`} · ${md(r.due_day)}</span>`);
