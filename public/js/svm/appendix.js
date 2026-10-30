// 부록 — 용어(#/svm/glossary[/<개념>]) · 영상(#/svm/videos) · 더 읽을 거리(#/svm/more) · 비판 모아 보기(#/svm/counter)
//   서재의 APPENDIX 줄과 글 읽기의 링크에서 와요. 위 머리줄의 찾기(/)는 이 화면들에서 걸러 보기예요.
import { data, personName, pad2, ytThumb, ytEmbed, volColor } from "./model.js";
import { esc } from "../util.js";

const cut = (s, n) => (s && s.length > n ? s.slice(0, n - 1) + "…" : s || "");
const head = (label, title, lede) => `<header class="sv-apx-h"><span class="sv-label sv-mono"><a href="#/svm">LIBRARY</a> · APPENDIX · ${esc(label)}</span><h1>${esc(title)}</h1>${lede ? `<p>${esc(lede)}</p>` : ""}</header>`;
const chLink = (e) => `<a href="#/svm/read/${esc(e.id)}" style="--vc:${volColor(e.section)}"><b class="sv-mono">CH ${pad2(e.no)}</b> ${esc(cut(e.ko || e.title, 26))}</a>`;

export const videoCard = (v) => `<figure class="sv-vcard">
    <button type="button" class="sv-thumb" data-play="${esc(v.id)}" data-start="${Number(v.start) || 0}" aria-label="${esc(v.title)} 재생"><img src="${ytThumb(v.id)}" alt="" loading="lazy" decoding="async"><span class="sv-play" aria-hidden="true">▶</span></button>
    <figcaption><b>${esc(v.title)}</b><span class="sv-mono">${esc(v.channel || "")}${v.year ? " · " + esc(v.year) : ""}${v.start > 0 ? ` · ${Math.floor(v.start / 60)}:${pad2(Math.floor(v.start % 60))}부터` : ""}</span>${v.about ? `<span class="sv-about">${esc(v.about)}</span>` : ""}</figcaption>
  </figure>`;
// 썸네일 → 그 자리에서 재생 (youtube-nocookie)
export function play(btn) {
  const f = document.createElement("iframe");
  f.src = ytEmbed(btn.dataset.play, Number(btn.dataset.start) || 0);
  f.title = btn.getAttribute("aria-label") || "영상";
  f.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen";
  f.allowFullscreen = true; f.className = "sv-frame";
  btn.replaceWith(f);
}

function glossary(q, sel) {
  const D = data(), list = D.concepts.filter((c) => !q || [c.en, c.name, c.short, c.long, ...(c.terms || [])].join(" ").toLowerCase().includes(q));
  return head(`용어 ${D.concepts.length}`, "용어 풀이", "글 안의 점선 밑줄 말들 — 야빈이 쓰는 뜻 그대로.") + `<div class="sv-gl">${list.map((c) => `<section class="sv-con" id="sv-c-${esc(c.id)}"${sel === c.id ? ` data-on="1"` : ""}>
      <span class="sv-tag sv-mono">${esc(c.en || c.id.toUpperCase())}</span>
      <h2>${esc(c.name)}</h2><p class="sv-short">${esc(c.short || "")}</p>${c.long ? `<p>${esc(c.long)}</p>` : ""}
      ${c.essays.length ? `<p class="sv-chs">${c.essays.map((id) => D.E.get(id)).map(chLink).join("")}</p>` : ""}
    </section>`).join("") || `<p class="sv-empty">맞는 말이 없어요.</p>`}</div>`;
}

function videos(q) {
  const D = data(), list = D.videos.filter((v) => !q || [v.title, v.channel, v.about, v.year].join(" ").toLowerCase().includes(q));
  return head(`영상 ${D.videos.length}`, "영상", "인터뷰 · 강연 · 해설. 누르면 이 자리에서 재생돼요.") + `<div class="sv-vgrid">${list.map((v) => `<div class="sv-vitem">${videoCard(v)}${(v.essays || []).length ? `<p class="sv-chs">${v.essays.map((id) => D.E.get(id)).filter(Boolean).map(chLink).join("")}</p>` : ""}</div>`).join("") || `<p class="sv-empty">맞는 영상이 없어요.</p>`}</div>`;
}

// 더 읽을 거리: 야빈의 다른 글 · 뿌리(그가 읽은 책) · 계보(실리콘밸리 쪽) · 해설 · 비판 · 보도 (글쓴이가 인물 id 가 아니면 이름 그대로)
function more(q) {
  const D = data(), list = D.more.filter((m) => !q || [m.title, m.ko, m.venue, m.year, personName(m.author)].join(" ").toLowerCase().includes(q));
  const GROUP = [["yarvin", "커티스 야빈의 다른 글"], ["root", "뿌리 · 그가 읽은 책"], ["sv", "계보 · 실리콘밸리"], ["etc", "해설 · 비판 · 보도"]];
  const kindOf = (a) => { const p = D.P.get(a); return a === "yarvin" ? "yarvin" : p?.lineage === 1 ? "root" : p?.lineage >= 3 ? "sv" : "etc"; };
  const groups = new Map(GROUP.map(([k]) => [k, []]));
  for (const m of list) groups.get(kindOf(m.author)).push(m);
  return head(`더 읽을 거리 ${D.more.length}`, "더 읽을 거리", `핵심 ${D.essays.length}장 밖에서. 누르면 원문 사이트가 새 탭에서 열려요.`) + (GROUP.filter(([k]) => groups.get(k).length).map(([k, label]) => `<h2 class="sv-grp sv-mono">${esc(label)} · ${groups.get(k).length}</h2>${groups.get(k).sort((a, b) => (a.year || 0) - (b.year || 0)).map((m) => `<a class="sv-more" href="${esc(m.url)}" target="_blank" rel="noopener noreferrer">
      <span class="sv-mono sv-yr">${esc(m.year || "")}</span><span class="sv-ti"><b>${esc(m.title)} ↗</b><small>${esc(m.ko || "")}${k !== "yarvin" && m.author ? ` · ${esc(personName(m.author))}` : ""}${m.venue ? ` · ${esc(m.venue)}` : ""}</small></span></a>`).join("")}`).join("") || `<p class="sv-empty">맞는 글이 없어요.</p>`);
}

// 비판 모아 보기: 장마다 붙은 대표 반론 (누가 · 어디서)
function counter(q) {
  const D = data(), n = D.essays.reduce((k, e) => k + (e.critiques?.length || 0), 0);
  const list = D.essays.map((e) => [e, (e.critiques || []).filter((c) => !q || [c.text, c.by, c.label].join(" ").toLowerCase().includes(q))]).filter(([, cs]) => cs.length);
  return head(`비판 ${n}`, "비판 모아 보기", "글마다 붙은 대표 반론. 야빈을 읽을 때 같이 들고 가면 좋은 질문들이에요.") + (list.map(([e, cs]) => `<section class="sv-cset" style="--vc:${volColor(e.section)}"><a class="sv-cset-h" href="#/svm/read/${esc(e.id)}"><span class="sv-mono">CH ${pad2(e.no)}</span><b>${esc(e.ko || e.title)}</b></a>
      ${cs.map((c) => `<div class="sv-crit"><p>${esc(c.text)}</p><p class="sv-refs sv-mono">${esc(c.by || "")}${c.url ? ` · <a href="${esc(c.url)}" target="_blank" rel="noopener noreferrer">${esc(c.label || "출처")} ↗</a>` : c.label ? ` · ${esc(c.label)}` : ""}</p></div>`).join("")}</section>`).join("") || `<p class="sv-empty">맞는 비판이 없어요.</p>`);
}

export function mountAppendix(host, r, env) {
  let cur = r;
  const draw = () => {
    const q = env.q();
    host.innerHTML = `<div class="sv-apx">${cur.tab === "videos" ? videos(q) : cur.tab === "more" ? more(q) : cur.tab === "counter" ? counter(q) : glossary(q, cur.id)}</div>`;
    env.crumb(`<a href="#/svm">/ LIBRARY</a> <span>/ APPENDIX</span>`);
    if (cur.tab === "glossary" && cur.id) requestAnimationFrame(() => host.querySelector(`#sv-c-${CSS.escape(cur.id)}`)?.scrollIntoView({ block: "start" }));
  };
  draw();
  const onClick = (e) => { const b = e.target.closest("[data-play]"); if (b) play(b); };
  host.addEventListener("click", onClick);
  return {
    update(nr) { if (!["glossary", "videos", "more", "counter"].includes(nr.tab)) return false; cur = nr; draw(); if (!(nr.tab === "glossary" && nr.id)) env.scroller()?.scrollTo?.({ top: 0 }); return true; },
    find: draw,
    stop() { host.removeEventListener("click", onClick); },
  };
}
