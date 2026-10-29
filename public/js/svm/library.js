// 서재(승인 시안 A) — 왼쪽: 진행 칸 · 묶음 · INDEX / 오른쪽: 계보 줄 + 글 표
//   같은 껍데기에서 걸러 보기(묶음 · 인물 · 안 읽은 것) · 더 읽을 거리 · 영상 · 개념 사전도 그려요
import { data, personName, sectionOf, pad2, ytThumb, ytEmbed } from "./model.js";
import { st } from "./store.js";
import { esc } from "../util.js";

// 이름 뒤 '과/와' — 받침이 있으면 과 (틸과 · 랜드와), 한글이 아니면 '과(와)'
const gwa = (s) => { const c = (s || "").trim().slice(-1).charCodeAt(0); return c >= 0xac00 && c <= 0xd7a3 ? ((c - 0xac00) % 28 ? "과" : "와") : "과(와)"; };
const cut = (s, n) => (s && s.length > n ? s.slice(0, n - 1) + "…" : s || "");
const stateOf = (e) => { const S = st(); return S?.read?.[e.id] ? "read" : (S?.pos?.[e.id] || 0) > 0 ? "reading" : ""; };
const conceptCode = (id) => data().C.get(id)?.en || id.toUpperCase();
const hay = (e) => [e.title, e.ko, e.sub, e.core, e.venue, e.year, personName(e.author), ...(e.concepts || []).map((c) => data().C.get(c)?.name), ...(e.people || []).map(personName)].join(" ").toLowerCase();

// 묶음 · 인물 · 안 읽은 것 → 글 목록과 제목
function pick(f) {
  const D = data();
  if (!f || f === "all") return { list: D.essays, title: null };
  if (f === "unread") return { list: D.essays.filter((e) => !st()?.read?.[e.id]), title: "안 읽은 글" };
  if (f.startsWith("p:")) { const id = f.slice(2), p = D.P.get(id); return { list: D.essays.filter((e) => e.author === id || e.people?.includes(id)), title: p ? `${p.ko || p.name}${gwa(p.ko || p.name)} 이어진 글` : "인물", person: p }; }
  const s = sectionOf(f);
  return { list: D.essays.filter((e) => e.section === f), title: s ? `${s.no} · ${s.name}` : f };
}

function sideHtml(r) {
  const D = data(), S = st(), f = r.tab === "s" ? r.id : r.tab || "all";
  const cells = D.essays.map((e) => `<a class="sv-cell" data-s="${stateOf(e)}" href="#/svm/read/${esc(e.id)}" aria-label="${esc(pad2(e.no) + " " + e.title)}"></a>`).join("");
  const read = D.essays.filter((e) => S?.read?.[e.id]).length, pctAll = D.essays.length ? Math.round((read / D.essays.length) * 100) : 0;
  const item = (href, on, label, n) => `<a href="${href}"${on ? ` aria-current="page"` : ""}><span>${label}</span><span class="sv-mono">${n}</span></a>`;
  const cnt = (id) => { const l = D.essays.filter((e) => e.section === id); return `${l.filter((e) => S?.read?.[e.id]).length}/${l.length}`; };
  return `<div class="sv-prog">
      <div class="sv-prog-h sv-mono"><span>PROGRESS</span><b>${pctAll}%</b></div>
      <div class="sv-cells">${cells}</div>
      <span class="sv-cap">칸 하나 = 글 하나 · 진한 칸 = 읽는 중 · 라임 = 다 읽음</span>
    </div>
    <div class="sv-nav">
      ${item("#/svm", f === "all" && !r.tab, "전체", D.essays.length)}
      ${D.sections.map((s) => item(`#/svm/s/${s.id}`, f === s.id, `${s.no} ${esc(s.name)}`, cnt(s.id))).join("")}
      ${item("#/svm/s/unread", f === "unread", "안 읽은 것", D.essays.length - read)}
      ${item("#/svm/more", r.tab === "more", "+ 더 읽을 거리", D.more.length)}
    </div>
    <div class="sv-nav">
      <span class="sv-label sv-mono">INDEX</span>
      ${item("#/svm/videos", r.tab === "videos", "영상", pad2(D.videos.length))}
      ${item("#/svm/glossary", r.tab === "glossary", "개념 사전", pad2(D.concepts.length))}
      ${item("#/svm/graph/people", false, "인물 지도", pad2(D.people.length))}
    </div>`;
}

// 계보 줄: lineage 1(뿌리) → 5(지금), 같은 숫자는 한 칸 · 누르면 그 사람과 이어진 글만
function lineageHtml(sel) {
  const D = data(), stages = new Map();
  for (const p of D.people) if (Number.isInteger(p.lineage)) { if (!stages.has(p.lineage)) stages.set(p.lineage, []); stages.get(p.lineage).push(p); }
  const keys = [...stages.keys()].sort((a, b) => a - b);
  if (keys.length < 2) return "";
  const node = (k, ps) => {
    const one = ps.length === 1, me = ps.some((p) => p.id === "yarvin");
    const names = ps.map((p) => `<a href="#/svm/s/p:${esc(p.id)}"${sel === "p:" + p.id ? ` aria-current="page"` : ""}>${esc(one ? p.name : p.name.split(" ").slice(-1)[0])}</a>`).join(" · ");
    const sub = k === keys[0] ? "뿌리" : one ? ps[0].years || cut(ps[0].role || "", 14) : ""; // 설명은 짧게 (생몰년), 자세한 건 이름을 눌러서
    return `<div class="sv-lin-n${me ? " me" : ""}"><i aria-hidden="true"></i><b>${names}</b><span class="sv-mono">${esc(sub)}</span></div>`;
  };
  return `<section class="sv-lin" aria-label="사상 계보">
    <div class="sv-lin-h sv-mono"><span>LINEAGE · 누구에게 흘러갔나</span><span class="sv-wide">이름을 누르면 그 사람과 이어진 글만</span></div>
    <div class="sv-lin-row">${keys.map((k, i) => (i ? `<span class="sv-lin-l" aria-hidden="true"></span>` : "") + node(k, stages.get(k))).join("")}</div>
  </section>`;
}

function rowHtml(e) {
  const s = stateOf(e), pos = st()?.pos?.[e.id] || 0;
  const mark = s === "read" ? " ✓" : s === "reading" ? " ●" : "";
  const meta = s === "reading" ? `읽는 중 · ${pos}%` : `${esc(e.sub || e.ko || "")} · ${esc(e.year || "")}`;
  return `<a class="sv-row" data-s="${s}" href="#/svm/read/${esc(e.id)}">
    <span class="sv-no sv-mono">${pad2(e.no)}${mark}</span>
    <span class="sv-ti"><b>${esc(e.title)}</b><small>${meta}</small></span>
    <span class="sv-tags">${(e.concepts || []).slice(0, 2).map((c) => `<span class="sv-tag sv-mono">${esc(conceptCode(c))}</span>`).join("")}</span>
    <span class="sv-mono sv-vid">${e.vids.length ? "▶ " + e.vids.length : "—"}</span>
    <span class="sv-mono sv-min">${pad2(e.mins)}m</span>
  </a>`;
}

function libraryHtml(r, q) {
  const D = data(), f = r.tab === "s" ? r.id : "all", { list, title, person } = pick(f);
  const rows = q ? list.filter((e) => hay(e).includes(q)) : list;
  const S = st(), last = S?.last && D.E.get(S.last), resume = last && !S.read?.[last.id] ? last : D.essays.find((e) => !S?.read?.[e.id]);
  const groups = f === "all" && !q ? D.sections.map((s) => [s, rows.filter((e) => e.section === s.id)]).filter(([, l]) => l.length) : [[null, rows]];
  const head = `<div class="sv-thead sv-mono" aria-hidden="true"><span>NO</span><span>제목</span><span>개념</span><span>영상</span><span class="sv-min">요약</span></div>`;
  return `${title ? `<header class="sv-hero"><span class="sv-label sv-mono"><a href="#/svm">‹ 전체</a></span><h1>${esc(title)}</h1>${person ? `<p>${esc(person.bio || person.short || "")}</p><p class="sv-cta"><a href="#/svm/graph/p:${esc(person.id)}">그래프에서 보기 →</a></p>` : ""}</header>`
      : `<header class="sv-hero"><h1>민주주의를 의심한 사람</h1><p>Curtis Yarvin(Mencius Moldbug) — 실리콘밸리에서 가장 많이 인용되는 ${D.essays.length}편과, 그 생각이 누구에게 흘러갔는지.</p>${resume ? `<p class="sv-cta"><a href="#/svm/read/${esc(resume.id)}">${S?.pos?.[resume.id] ? "이어 읽기" : "여기서 시작"} → ${pad2(resume.no)} ${esc(resume.title)}</a></p>` : ""}</header>`}
    ${f === "all" || f.startsWith("p:") ? lineageHtml(f) : ""}
    ${q ? `<p class="sv-found sv-mono">“${esc(q)}” · ${rows.length}편</p>` : ""}
    <div class="sv-table">${head}${groups.map(([s, l]) => (s ? `<h2 class="sv-grp sv-mono">${s.no} · ${esc(s.name)}</h2>` : "") + l.map(rowHtml).join("")).join("") || `<p class="sv-empty">맞는 글이 없어요.</p>`}</div>`;
}

function moreHtml(q) {
  const D = data(), list = D.more.filter((m) => !q || [m.title, m.ko, m.venue, m.year, personName(m.author)].join(" ").toLowerCase().includes(q));
  // 묶음: 야빈의 다른 글 · 뿌리(그가 읽은 책) · 계보(실리콘밸리 쪽 사람들) · 해설 · 비판 · 보도 (글쓴이가 인물 id 가 아니면 이름 그대로)
  const GROUP = [["yarvin", "커티스 야빈의 다른 글"], ["root", "뿌리 · 그가 읽은 책"], ["sv", "계보 · 실리콘밸리"], ["etc", "해설 · 비판 · 보도"]];
  const kindOf = (a) => { const p = D.P.get(a); return a === "yarvin" ? "yarvin" : p?.lineage === 1 ? "root" : p?.lineage >= 3 ? "sv" : "etc"; };
  const groups = new Map(GROUP.map(([k]) => [k, []]));
  for (const m of list) groups.get(kindOf(m.author)).push(m);
  const keys = GROUP.map(([k]) => k).filter((k) => groups.get(k).length), label = Object.fromEntries(GROUP);
  return `<header class="sv-hero"><h1>더 읽을 거리</h1><p>핵심 ${D.essays.length}편 밖에서 — 야빈의 다른 글, 그 생각의 뿌리, 그리고 비판. 누르면 원문 사이트가 새 탭에서 열려요.</p></header>
    ${keys.map((k) => `<h2 class="sv-grp sv-mono">${esc(label[k])} · ${groups.get(k).length}</h2>${groups.get(k).sort((a, b) => (a.year || 0) - (b.year || 0)).map((m) => `<a class="sv-more" href="${esc(m.url)}" target="_blank" rel="noopener noreferrer">
      <span class="sv-mono sv-yr">${esc(m.year || "")}</span><span class="sv-ti"><b>${esc(m.title)} ↗</b><small>${esc(m.ko || "")}${k !== "yarvin" && m.author ? ` · ${esc(personName(m.author))}` : ""}${m.venue ? ` · ${esc(m.venue)}` : ""}</small></span></a>`).join("")}`).join("") || `<p class="sv-empty">맞는 글이 없어요.</p>`}`;
}

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

function videosHtml(q) {
  const D = data(), list = D.videos.filter((v) => !q || [v.title, v.channel, v.about, v.year].join(" ").toLowerCase().includes(q));
  return `<header class="sv-hero"><h1>영상</h1><p>인터뷰 · 강연 · 해설. 누르면 이 자리에서 재생돼요.</p></header>
    <div class="sv-vgrid">${list.map((v) => `<div class="sv-vitem">${videoCard(v)}${(v.essays || []).length ? `<p class="sv-vlinks sv-mono">${v.essays.map((id) => D.E.get(id)).filter(Boolean).map((e) => `<a href="#/svm/read/${esc(e.id)}">${pad2(e.no)} ${esc(cut(e.title, 28))}</a>`).join(" · ")}</p>` : ""}</div>`).join("") || `<p class="sv-empty">맞는 영상이 없어요.</p>`}</div>`;
}

function glossaryHtml(q, sel) {
  const D = data(), list = D.concepts.filter((c) => !q || [c.en, c.name, c.short, c.long, ...(c.terms || [])].join(" ").toLowerCase().includes(q));
  return `<header class="sv-hero"><h1>개념 사전</h1><p>글 안의 점선 밑줄 말들 — 야빈이 쓰는 뜻 그대로.</p></header>
    <div class="sv-gl">${list.map((c) => `<section class="sv-con" id="sv-c-${esc(c.id)}"${sel === c.id ? ` data-on="1"` : ""}>
      <span class="sv-tag sv-mono">${esc(c.en || c.id.toUpperCase())}</span>
      <h2>${esc(c.name)}</h2><p class="sv-short">${esc(c.short || "")}</p>${c.long ? `<p>${esc(c.long)}</p>` : ""}
      ${c.essays.length ? `<p class="sv-vlinks sv-mono">${c.essays.map((id) => D.E.get(id)).map((e) => `<a href="#/svm/read/${esc(e.id)}">${pad2(e.no)} ${esc(cut(e.title, 30))}</a>`).join(" · ")}</p>` : ""}
    </section>`).join("") || `<p class="sv-empty">맞는 개념이 없어요.</p>`}</div>`;
}

export function mountLibrary(host, r, env) {
  host.innerHTML = `<div class="sv-lib"><nav class="sv-side" aria-label="목차"></nav><div class="sv-main"></div></div>`;
  const side = host.querySelector(".sv-side"), main = host.querySelector(".sv-main");
  let cur = r;
  const drawMain = () => {
    const q = env.q();
    main.innerHTML = cur.tab === "more" ? moreHtml(q) : cur.tab === "videos" ? videosHtml(q) : cur.tab === "glossary" ? glossaryHtml(q, cur.id) : libraryHtml(cur, q);
    if (cur.tab === "glossary" && cur.id) requestAnimationFrame(() => host.querySelector(`#sv-c-${CSS.escape(cur.id)}`)?.scrollIntoView({ block: "start" }));
  };
  const draw = () => { side.innerHTML = sideHtml(cur); drawMain(); };
  draw();
  const onClick = (e) => { const b = e.target.closest("[data-play]"); if (b) play(b); };
  host.addEventListener("click", onClick);
  return {
    update(nr) { cur = nr; draw(); if (!(nr.tab === "glossary" && nr.id)) env.scroller()?.scrollTo?.({ top: 0 }); return true; },
    find: drawMain,
    stop() { host.removeEventListener("click", onClick); },
  };
}
