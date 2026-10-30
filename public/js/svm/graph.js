// 인물 지도 (부록 · 승인 시안 v3, 2026-10-30 "그래프가 너무 보기 힘들고" → 단순하게)
//   인물 15명만 (글 · 개념 점은 빼요) · 이름 크게 · 관계 이름은 선에 마우스를 올릴 때만 · 끌어서 옮기기는 그대로 (엔진은 Obsidian 과 같은 graph/obsidian.js)
//   색: 사람 = 글자색 · 뿌리(칼라일 · 버넘 · 호페) = 회색 · 비판한 사람 = 빨강 / 선: 투자 · 후원 = 라임 · 영향 = 글자색 · 비판 = 빨간 점선
//   #/svm/people/<인물 id> 로 들어오면 그 사람을 골라 둬요 · 오른쪽: 소개 · 나오는 장 · 관계 · 모든 인물(누르면 지도에서 고르기)
import { mountGraph } from "../graph/obsidian.js";
import { data, peopleGraph, personName, pad2, REL, volColor } from "./model.js";
import { esc } from "../util.js";

const PREFS = "svm-people-prefs";

export function mountPeople(host, r, env) {
  const D = data();
  host.innerHTML = `<div class="sv-gv"><section class="sv-gc" aria-label="인물 지도"></section><aside class="sv-gp" aria-label="고른 인물"></aside></div>`;
  const gc = host.querySelector(".sv-gc"), gp = host.querySelector(".sv-gp");
  const css = (v, f) => getComputedStyle(gc).getPropertyValue(v).trim() || f;
  const C = { ink: css("--sv-ink", "#F5F5F6"), sub: css("--sv-sub", "#8E8E97"), faint: css("--sv-faint", "#5E5E66"), lime: css("--sv-glime", "#D4FF45"), bad: css("--sv-bad", "#FF6369") };
  const types = { person: { label: "인물", color: C.ink, tier: 1 }, root: { label: "뿌리", color: C.sub, tier: 2 }, critic: { label: "비판한 사람", color: C.bad, tier: 2 } };
  const STYLE = {
    INVESTED: { color: C.lime, arrow: true }, BACKED: { color: C.lime, arrow: true }, INFLUENCED: { color: C.ink, arrow: true },
    CITED: { color: C.ink, dash: [3, 3], arrow: true }, PEER: { color: C.sub }, CRITIC: { color: C.bad, dash: [5, 3], arrow: true }, DEBATED: { color: C.bad, dash: [2, 3] },
  };
  const edgeStyle = (l) => { const s = STYLE[l.kind] || { color: C.sub }; return { color: s.color, dash: l.weak ? [4, 4] : s.dash || null, arrow: !!s.arrow, label: (REL[l.kind] || l.kind) + (l.weak ? " (간접)" : "") }; };
  const legend = [["INVESTED", "투자 · 후원"], ["INFLUENCED", "영향"], ["CITED", "인용"], ["CRITIC", "비판"]].map(([k, label]) => ({ label, color: STYLE[k].color, dash: STYLE[k].dash || null }));
  let prefs = {};
  try { prefs = JSON.parse(localStorage.getItem(PREFS) || "{}") || {}; } catch {}
  const G = peopleGraph(), has = (id) => G.nodes.some((n) => n.id === id);
  let sel = has(r.id) ? r.id : has("thiel") ? "thiel" : "yarvin";
  const graph = mountGraph(gc, {
    data: G, types, scope: "svm-people", select: true, edgeStyle, legend, edgeLabels: "hover",
    empty: "인물이 없어요.",
    prefs: { basis: "tier", text: 15, node: 1, ...prefs, open: false }, savePrefs: (p) => { try { localStorage.setItem(PREFS, JSON.stringify({ ...p, open: false })); } catch {} },
    initial: { sel },
    onSelect: (n) => { if (!n) return; sel = n.id; panel(); history.replaceState(history.state, "", "#/svm/people/" + sel); },
    onOpen: (n) => { location.hash = `#/svm/people/${n.id}`; },
  });

  const chaptersOf = (id) => D.essays.filter((e) => e.author === id || e.people?.includes(id));
  function panel() {
    const p = D.P.get(sel);
    if (!p) { gp.innerHTML = ""; return; }
    const chs = chaptersOf(p.id);
    const rels = D.edges.filter((x) => x.a === p.id || x.b === p.id).map((x) => ({ other: x.a === p.id ? x.b : x.a, out: x.a === p.id, rel: x.rel, weak: !!x.weak, ko: x.ko, url: x.url }));
    gp.innerHTML = `<div class="sv-gnode">
        <span class="sv-label sv-mono">NODE · ${esc([p.name, p.years].filter(Boolean).join(" · ").toUpperCase())}</span>
        <h2>${esc(p.ko || p.name)}</h2>${p.role ? `<span class="sv-gsub">${esc(p.role)}</span>` : ""}
        ${p.bio || p.short ? `<p>${esc(p.bio || p.short)}</p>` : ""}
        ${(p.refs || []).length ? `<p class="sv-glinks">${p.refs.slice(0, 3).map((x) => `<a class="sv-mono" href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">${esc(x.label || "출처")} ↗</a>`).join("")}</p>` : ""}
      </div>
      ${chs.length ? `<div class="sv-gsec"><span class="sv-label sv-mono">CHAPTERS · 이 사람이 나오는 장</span><p class="sv-chs">${chs.map((e) => `<a href="#/svm/read/${esc(e.id)}" style="--vc:${volColor(e.section)}"><b class="sv-mono">CH ${pad2(e.no)}</b> ${esc(e.ko || e.title)}</a>`).join("")}</p></div>` : ""}
      ${rels.length ? `<div class="sv-gsec"><span class="sv-label sv-mono">RELATIONS · ${rels.length}</span>${rels.map((x) => `<button type="button" class="sv-gedge" data-pick="${esc(x.other)}" title="${esc(x.ko || "")}"><span><i class="sv-mono" aria-hidden="true">${x.out ? "→" : "←"}</i> ${esc(personName(x.other))}</span><span class="sv-mono${x.rel === "INVESTED" || x.rel === "BACKED" ? " hot" : x.rel === "CRITIC" ? " bad" : ""}">${esc(REL[x.rel] || x.rel)}${x.weak ? " ?" : ""}</span></button>`).join("")}</div>` : ""}
      <div class="sv-gsec"><span class="sv-label sv-mono">ALL PEOPLE · 누르면 지도에서 골라요</span><p class="sv-gall">${D.people.map((x) => `<button type="button" data-pick="${esc(x.id)}"${x.id === sel ? ' aria-current="true"' : ""}>${esc(x.ko || x.name)}</button>`).join("")}</p></div>`;
  }
  panel();
  env.crumb(`<a href="#/svm">/ LIBRARY</a> <span>/ APPENDIX · PEOPLE ${D.people.length}</span>`);
  const onClick = (e) => {
    const go = e.target.closest("[data-pick]");
    if (go) { sel = go.dataset.pick; graph.select?.(sel); panel(); history.replaceState(history.state, "", "#/svm/people/" + sel); }
  };
  gp.addEventListener("click", onClick);
  return {
    update(nr) { if (nr.id && nr.id !== sel && has(nr.id)) { sel = nr.id; graph.select?.(sel); panel(); } return true; },
    stop() { gp.removeEventListener("click", onClick); graph(); },
  };
}
