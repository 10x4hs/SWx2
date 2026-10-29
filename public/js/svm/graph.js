// 지식그래프(승인 시안 C) — 인물(원) · 글(네모) · 개념(테두리 원) · 영상(작은 네모), 그래프 엔진은 Obsidian 과 같은 graph/obsidian.js
//   한 번 누르기 = 고르기 → 오른쪽 패널(소개 · 걸러 보기 · 연결 · 다음에 읽을 글) · 두 번 누르기 = 그 글 · 개념으로
//   #/svm/graph/<점 id> 로 들어오면 그 점을 골라 둬요 (p:thiel · e:open-letter · c:cathedral) · #/svm/graph/people = 인물만
import { mountGraph } from "../graph/obsidian.js";
import { data, graphData, personName, pad2, REL } from "./model.js";
import { st } from "./store.js";
import { esc } from "../util.js";

const PREFS = "svm-graph-prefs";
let SHOW = { person: true, essay: true, concept: true, video: false }, READ_ONLY = false; // 걸러 보기는 이 창에서만 기억해요
const FILTERS = [["person", "인물"], ["essay", "글"], ["concept", "개념"], ["video", "영상"]];

export function mountGraphView(host, r, env) {
  const D = data();
  if (r.id === "people") SHOW = { person: true, essay: false, concept: false, video: false };
  host.innerHTML = `<div class="sv-gv"><section class="sv-gc" aria-label="지식그래프"></section><aside class="sv-gp" aria-label="고른 점"></aside></div>`;
  const gc = host.querySelector(".sv-gc"), gp = host.querySelector(".sv-gp");
  const css = (v, f) => getComputedStyle(gc).getPropertyValue(v).trim() || f;
  const C = { ink: css("--sv-ink", "#F5F5F6"), sub: css("--sv-sub", "#8E8E97"), faint: css("--sv-faint", "#5E5E66"), lime: css("--sv-glime", "#D4FF45"), bad: css("--sv-bad", "#FF6369") };
  const types = {
    person: { label: "인물", color: C.ink, tier: 1 },
    essay: { label: "글", color: C.sub, tier: 2, shape: "square" },
    concept: { label: "개념", color: C.lime, tier: 2, shape: "ring" },
    video: { label: "영상", color: C.faint, tier: 3, shape: "square" },
  };
  const STYLE = {
    INVESTED: { color: C.lime, arrow: true }, BACKED: { color: C.lime, arrow: true }, INFLUENCED: { color: C.ink, arrow: true },
    CITED: { color: C.ink, dash: [3, 3], arrow: true }, PEER: { color: C.sub }, CRITIC: { color: C.bad, dash: [5, 3], arrow: true },
    DEBATED: { color: C.bad, dash: [2, 3] }, SV: { color: C.faint, dash: [2, 3] }, VIDEO: { color: C.faint, dash: [1.5, 3] },
  };
  const edgeStyle = (l) => { const s = STYLE[l.kind]; if (!s && !l.weak) return null; return { color: s?.color || C.sub, dash: l.weak ? [4, 4] : s?.dash || null, arrow: !!s?.arrow, label: REL[l.kind] || l.kind }; };
  const legend = [["INFLUENCED", "영향"], ["INVESTED", "투자 · 후원"], ["CITED", "인용"], ["CRITIC", "비판"], ["SV", "실리콘밸리에서 읽음"]].map(([k, label]) => ({ label, color: STYLE[k].color, dash: STYLE[k].dash || null }));
  let prefs = {};
  try { prefs = JSON.parse(localStorage.getItem(PREFS) || "{}") || {}; } catch {}

  const build = () => {
    const g = graphData(SHOW);
    if (READ_ONLY) { const S = st(), drop = new Set(D.essays.filter((e) => !S?.read?.[e.id]).map((e) => "e:" + e.id)); g.nodes = g.nodes.filter((n) => !drop.has(n.id)); g.links = g.links.filter((l) => !drop.has(l.s) && !drop.has(l.t)); }
    return g;
  };
  let G = build(), sel = null;
  const want = r.id && r.id !== "people" ? r.id : D.P.has("thiel") ? "p:thiel" : "p:yarvin"; // 처음엔 시안처럼 틸 — 야빈은 연결이 30개 넘어 이름표가 겹쳐요
  const graph = mountGraph(gc, {
    data: G, types, scope: "svm", select: true, edgeStyle, legend,
    empty: "보여 줄 점이 없어요. 오른쪽에서 걸러 보기를 켜 주세요.",
    prefs: { basis: "tier", ...prefs, open: false }, // 크기는 종류별(인물 > 글 · 개념) — 연결 수로 키우면 가운데가 붐벼요 savePrefs: (p) => { try { localStorage.setItem(PREFS, JSON.stringify({ ...p, open: false })); } catch {} },
    initial: { sel: want },
    onSelect: (n) => { sel = n?.id || null; panel(); if (sel) history.replaceState(history.state, "", "#/svm/graph/" + sel); },
    onOpen: (n) => { const href = hrefOf(n.id); if (href) location.hash = href; },
  });
  sel = G.nodes.some((n) => n.id === want) ? want : null;

  function hrefOf(id) {
    const [k, x] = [id.slice(0, 1), id.slice(2)];
    return k === "e" ? `#/svm/read/${x}` : k === "c" ? `#/svm/glossary/${x}` : k === "p" ? `#/svm/s/p:${x}` : k === "v" ? "#/svm/videos" : null;
  }
  const titleOf = (id) => G.nodes.find((n) => n.id === id)?.title || id;
  function info(id) {
    const k = id.slice(0, 1), x = id.slice(2);
    if (k === "p") { const p = D.P.get(x); return p && { kind: "인물", name: p.ko || p.name, sub: [p.name !== p.ko ? p.name : "", p.role, p.years].filter(Boolean).join(" · "), text: p.bio || p.short, links: [[`#/svm/s/p:${x}`, "이어진 글 보기 →"]], refs: p.refs }; }
    if (k === "e") { const e = D.E.get(x); return e && { kind: "글", name: e.title, sub: `${pad2(e.no)} · ${e.venue || ""} · ${e.year || ""} · ${personName(e.author)}`, text: e.core, links: [[`#/svm/read/${x}`, "읽기 →"]] }; }
    if (k === "c") { const c = D.C.get(x); return c && { kind: "개념", name: c.name, sub: c.en, text: c.long || c.short, links: [[`#/svm/glossary/${x}`, "개념 사전에서 →"]] }; }
    if (k === "v") { const v = D.V.get(x); return v && { kind: "영상", name: v.title, sub: `${v.channel || ""} · ${v.year || ""}`, text: v.about, links: [["#/svm/videos", "영상에서 보기 →"]], refs: [{ label: "YouTube", url: `https://www.youtube.com/watch?v=${x}` }] }; }
    return null;
  }
  function next(id) {
    const k = id.slice(0, 1), x = id.slice(2), S = st();
    const unread = (l) => l.find((e) => !S?.read?.[e.id]) || l[0];
    if (k === "e") { const i = D.essays.findIndex((e) => e.id === x); return D.essays[i + 1] || null; }
    if (k === "p") return unread(D.essays.filter((e) => e.author === x || e.people?.includes(x)));
    if (k === "c") return unread(D.essays.filter((e) => e.concepts?.includes(x)));
    if (k === "v") return unread((D.V.get(x)?.essays || []).map((i) => D.E.get(i)).filter(Boolean));
    return null;
  }
  function panel() {
    const it = sel && info(sel);
    const edges = sel ? G.links.filter((l) => l.s === sel || l.t === sel).map((l) => ({ other: l.s === sel ? l.t : l.s, out: l.s === sel, kind: l.kind, weak: l.weak })) : [];
    const nx = sel && next(sel);
    gp.innerHTML = `${it ? `<div class="sv-gnode">
        <span class="sv-label sv-mono">NODE · ${esc(it.kind)}</span>
        <h2>${esc(it.name)}</h2>${it.sub ? `<span class="sv-mono sv-gsub">${esc(it.sub)}</span>` : ""}
        ${it.text ? `<p>${esc(it.text)}</p>` : ""}
        <p class="sv-glinks">${it.links.map(([h, l]) => `<a href="${h}">${esc(l)}</a>`).join("")}${(it.refs || []).slice(0, 3).map((x) => `<a class="sv-mono" href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">${esc(x.label || "출처")} ↗</a>`).join("")}</p>
      </div>` : `<div class="sv-gnode"><span class="sv-label sv-mono">NODE</span><p class="sv-cap">점을 누르면 소개 · 연결이 여기 나와요. 두 번 누르면 그 글 · 개념으로 가요.</p></div>`}
      <div class="sv-gfil"><span class="sv-label sv-mono">FILTER</span><div class="sv-chips">${FILTERS.map(([k, l]) => `<button type="button" class="sv-fchip" data-show="${k}" aria-pressed="${!!SHOW[k]}">${l}</button>`).join("")}<button type="button" class="sv-fchip" data-readonly aria-pressed="${READ_ONLY}">읽은 글만</button></div></div>
      ${sel ? `<div class="sv-gedges"><span class="sv-label sv-mono">EDGES · 연결 ${edges.length}</span>${edges.map((x) => `<button type="button" class="sv-gedge" data-go="${esc(x.other)}" title="${x.out ? "이 점 → " : "← "}${esc(titleOf(x.other))} · ${esc(REL[x.kind] || x.kind)}"><span><i class="sv-mono" aria-hidden="true">${x.out ? "→" : "←"}</i> ${esc(titleOf(x.other))}</span><span class="sv-mono${x.kind === "INVESTED" || x.kind === "BACKED" ? " hot" : ""}">${esc(x.kind)}${x.weak ? " ?" : ""}</span></button>`).join("") || `<p class="sv-cap">연결이 없어요.</p>`}</div>` : ""}
      ${nx ? `<div class="sv-gnext"><span class="sv-label sv-mono">READ NEXT</span><a href="#/svm/read/${esc(nx.id)}">${esc(nx.title)} →</a><span class="sv-mono">${esc(personName(nx.author))} · ${esc(nx.year || "")} · 요약 ${pad2(nx.mins)}m</span></div>` : ""}`;
  }
  panel();
  const onClick = (e) => {
    const f = e.target.closest("[data-show]");
    if (f) { SHOW = { ...SHOW, [f.dataset.show]: !SHOW[f.dataset.show] }; G = build(); graph.setData?.(G); if (sel && !G.nodes.some((n) => n.id === sel)) sel = null; panel(); return; }
    if (e.target.closest("[data-readonly]")) { READ_ONLY = !READ_ONLY; G = build(); graph.setData?.(G); if (sel && !G.nodes.some((n) => n.id === sel)) sel = null; panel(); return; }
    const go = e.target.closest("[data-go]");
    if (go) { sel = go.dataset.go; graph.select?.(sel); panel(); history.replaceState(history.state, "", "#/svm/graph/" + sel); }
  };
  gp.addEventListener("click", onClick);
  return {
    update(nr) { if (nr.id && nr.id !== "people" && nr.id !== sel && G.nodes.some((n) => n.id === nr.id)) { sel = nr.id; graph.select?.(sel); panel(); } return nr.id !== "people"; },
    stop() { gp.removeEventListener("click", onClick); graph(); },
  };
}
