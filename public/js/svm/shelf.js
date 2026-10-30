// 서재 첫 화면 (승인 시안 v3 · 2026-10-30 "책처럼, 보고 싶은 걸 골라 볼 수 있게" + "조금 더 하이테크")
//   책장 4권(권마다 색 하나 · 표지 선화 · 진행) → 누르면 그 권의 차례(volume.js)
//   QUERY · 무엇이 궁금하세요?: 질문을 누르면 답이 있는 장들이 펼쳐져요 · 적으면 장을 찾아요 · ↑↓ ↵
//   INDEX · 개념 × 장 (+ 인물 × 장): 점 = 그 장에 나오는 말 · 점을 누르면 그 장으로 · 부록(인물 지도 · 용어 · 영상 · 더 읽을 거리 · 비판)
import { data, volume, volColor, matrix, search, pad2 } from "./model.js";
import { st } from "./store.js";
import { esc } from "../util.js";

// 표지 선화 — 내용을 뜻하는 모양만 (rings 문 · grid 형식 · mirror 거울 · tree 계보)
export const ART = {
  rings: `<g fill="none" stroke="currentColor" stroke-width="1.2"><circle cx="100" cy="60" r="12"/><circle cx="100" cy="60" r="26" stroke-opacity=".7"/><circle cx="100" cy="60" r="40" stroke-opacity=".45"/><circle cx="100" cy="60" r="54" stroke-opacity=".25"/></g><line x1="0" y1="60" x2="200" y2="60" stroke="currentColor" stroke-opacity=".25" stroke-dasharray="2 4"/>`,
  grid: `<g fill="none" stroke="currentColor" stroke-width="1.2"><rect x="40" y="10" width="30" height="30"/><rect x="85" y="10" width="30" height="30" stroke-opacity=".7"/><rect x="130" y="10" width="30" height="30" stroke-opacity=".45"/><rect x="40" y="55" width="30" height="30" stroke-opacity=".7"/><rect x="85" y="55" width="30" height="30" fill="currentColor" fill-opacity=".22"/><rect x="130" y="55" width="30" height="30" stroke-opacity=".45"/><line x1="40" y1="104" x2="160" y2="104" stroke-opacity=".3"/></g>`,
  mirror: `<g fill="none" stroke="currentColor" stroke-width="1.2"><path d="M30 60 A70 50 0 0 1 170 60"/><path d="M30 60 A70 50 0 0 0 170 60" stroke-opacity=".3" stroke-dasharray="3 4"/><path d="M60 60 A40 28 0 0 1 140 60" stroke-opacity=".7"/><path d="M60 60 A40 28 0 0 0 140 60" stroke-opacity=".2" stroke-dasharray="3 4"/></g><line x1="10" y1="60" x2="190" y2="60" stroke="currentColor" stroke-opacity=".5"/>`,
  tree: `<g fill="none" stroke="currentColor" stroke-width="1.2"><path d="M20 60 L70 60"/><path d="M70 60 L120 30 L170 18"/><path d="M70 60 L120 60 L170 60" stroke-opacity=".7"/><path d="M70 60 L120 90 L170 102" stroke-opacity=".45"/><path d="M120 30 L170 42" stroke-opacity=".45"/></g><g fill="currentColor"><circle cx="20" cy="60" r="3"/><circle cx="70" cy="60" r="4"/><circle cx="120" cy="30" r="3"/><circle cx="120" cy="60" r="3"/><circle cx="120" cy="90" r="3"/><circle cx="170" cy="18" r="3"/><circle cx="170" cy="42" r="3"/><circle cx="170" cy="60" r="3"/><circle cx="170" cy="102" r="3"/></g>`,
};

// 권 표지 (서재 · 권 차례가 같이 써요) — i = 책장에서 몇 번째 (높이 · 기울기가 조금씩 달라요)
export function cover(id, { i = 0, big = false, link = true } = {}) {
  const v = volume(id), S = st();
  const read = v.list.filter((e) => S?.read?.[e.id]).length, reading = v.list.find((e) => !S?.read?.[e.id] && (S?.pos?.[e.id] || 0) > 0);
  const pct = v.list.length ? Math.round((read / v.list.length) * 100) : 0;
  const tag = link ? "a" : "div";
  return `<${tag} class="sv-book${big ? " big" : ""}" ${link ? `href="#/svm/v/${esc(v.id)}"` : ""} style="--vc:${volColor(v.id)}" data-i="${i}" aria-label="VOL.${esc(v.no)} ${esc(v.name)}">
    <span class="sv-book-top sv-mono"><b>VOL.${esc(v.no)}</b><span>${pad2(v.list.length)} CH</span></span>
    <svg class="sv-book-art" viewBox="0 0 200 120" aria-hidden="true">${ART[v.art] || ART.rings}</svg>
    <b class="sv-book-ti">${esc(v.name)}</b>
    <span class="sv-book-bl">${esc(v.blurb || "")}</span>
    <span class="sv-grow"></span>
    <span class="sv-book-meta sv-mono"><span>${pad2(v.mins)} MIN</span><span${reading ? ' class="on"' : ""}>${reading ? "● READING" : `${pad2(read)}/${pad2(v.list.length)} READ`}</span></span>
    <span class="sv-book-bar" aria-hidden="true"><i style="width:${pct}%"></i></span>
  </${tag}>`;
}

const chRefs = (ids) => ids.map((id) => data().E.get(id)).filter(Boolean).map((e) => pad2(e.no));
function questionsHtml(open) {
  const D = data();
  return D.questions.map((q, i) => {
    if (q.to === "counter") { const n = D.essays.reduce((k, e) => k + (e.critiques?.length || 0), 0); return `<a class="sv-qi" href="#/svm/counter" data-qi><span class="sv-qi-t"><b>${esc(q.q)}</b><small>${esc(q.a.replace("대표 비판을", `대표 비판 ${n}개를`))}</small></span><span class="sv-mono sv-qi-r">COUNTER →</span></a>`; }
    const es = q.essays.map((id) => D.E.get(id)).filter(Boolean), on = open === i;
    return `<div class="sv-qwrap${on ? " open" : ""}"><button type="button" class="sv-qi" data-qi data-q="${i}" aria-expanded="${on}"><span class="sv-qi-t"><b>${esc(q.q)}</b><small>${esc(q.a)}</small></span><span class="sv-mono sv-qi-r">CH ${chRefs(q.essays).join(" · ")}</span></button>
      ${on ? `<div class="sv-qans">${es.map((e) => `<a class="sv-qch" href="#/svm/read/${esc(e.id)}" data-qi style="--vc:${volColor(e.section)}"><span class="sv-mono">CH ${pad2(e.no)}</span><span class="sv-qi-t"><b>${esc(e.ko || e.title)}</b><small>${esc(e.core || "")}</small></span></a>`).join("")}</div>` : ""}</div>`;
  }).join("");
}
function resultsHtml(q) {
  const list = search(q), D = data();
  const qs = D.questions.filter((x) => x.q.toLowerCase().includes(q.toLowerCase()));
  return (qs.length ? qs.map((x) => `<a class="sv-qi" data-qi href="${x.to === "counter" ? "#/svm/counter" : `#/svm/read/${esc(x.essays[0])}`}"><span class="sv-qi-t"><b>${esc(x.q)}</b><small>${esc(x.a)}</small></span><span class="sv-mono sv-qi-r">↵</span></a>`).join("") : "")
    + (list.map((e) => `<a class="sv-qch" data-qi href="#/svm/read/${esc(e.id)}" style="--vc:${volColor(e.section)}"><span class="sv-mono">CH ${pad2(e.no)}</span><span class="sv-qi-t"><b>${esc(e.ko || e.title)}</b><small>${esc(e.title)} · ${esc(e.year || "")}</small></span></a>`).join("")
      || (qs.length ? "" : `<p class="sv-qnone">“${esc(q)}” 이 나오는 장이 없어요. 개념 이름(대성당 · 패치워크)이나 사람 이름(틸 · 랜드)으로 찾아보세요.</p>`));
}

function matrixHtml() {
  const D = data(), { concepts, people } = matrix();
  const cols = D.essays.map((e, i) => { const nx = D.essays[i + 1]; return `<span class="sv-mx-c${nx && nx.section !== e.section ? " sep" : ""}" style="--vc:${volColor(e.section)}">${pad2(e.no)}</span>`; }).join("");
  const row = (r) => `<div class="sv-mx-r"><a class="sv-mx-l" href="${r.href}">${esc(r.name)}</a>${r.cells.map((on, i) => { const e = D.essays[i], nx = D.essays[i + 1], sep = nx && nx.section !== e.section ? " sep" : ""; return on ? `<a class="sv-dot on${sep}" href="#/svm/read/${esc(e.id)}" style="--vc:${volColor(e.section)}" title="CH ${pad2(e.no)} · ${esc(e.ko || e.title)}" aria-label="${esc(r.name)} — ${pad2(e.no)}장 ${esc(e.ko || e.title)}"></a>` : `<span class="sv-dot${sep}" aria-hidden="true"></span>`; }).join("")}</div>`;
  return `<div class="sv-mx" role="group" aria-label="개념 × 장"><div class="sv-mx-r sv-mx-h sv-mono"><span>VOL · CH</span>${cols}</div>${concepts.map(row).join("")}<div class="sv-mx-sep" aria-hidden="true"></div>${people.slice(0, 7).map(row).join("")}</div>`;
}

export function mountShelf(host, r, env) {
  const D = data();
  let open = null, q = "", active = -1;
  const S = st(), last = S?.last && D.E.get(S.last), resume = last && !S.read?.[last.id] ? last : D.essays.find((e) => !S?.read?.[e.id]);
  const nCrit = D.essays.reduce((k, e) => k + (e.critiques?.length || 0), 0);
  host.innerHTML = `<div class="sv-shelfpg">
    <section class="sv-hero2">
      <div class="sv-hero2-l"><span class="sv-label sv-mono">COLLECTION · CURTIS YARVIN · ${D.sections.length} VOLUMES · ${D.essays.length} CHAPTERS</span><h1>민주주의를 의심한 사람</h1></div>
      ${resume ? `<a class="sv-resume" href="#/svm/read/${esc(resume.id)}"><span class="sv-mono"><span>${S?.pos?.[resume.id] ? "RESUME" : "START"} · CH ${pad2(resume.no)}</span><b>${S?.pos?.[resume.id] || 0}%</b></span><strong>${esc(resume.ko || resume.title)} →</strong><span class="sv-book-bar"><i style="width:${S?.pos?.[resume.id] || 0}%"></i></span></a>` : `<span class="sv-resume done sv-mono">ALL ${D.essays.length} CHAPTERS READ ✓</span>`}
    </section>
    <section class="sv-shelf" aria-label="책장"><div class="sv-books">${D.sections.map((s, i) => cover(s.id, { i })).join("")}</div><div class="sv-shelf-line" aria-hidden="true"></div></section>
    <section class="sv-below">
      <div class="sv-query">
        <span class="sv-label sv-mono">QUERY · 무엇이 궁금하세요?</span>
        <div class="sv-qbox">
          <label class="sv-qin"><span class="sv-mono" aria-hidden="true">›</span><span class="sv-vh">질문 고르기 · 장 찾기</span><input type="search" id="sv-query" placeholder="질문을 고르거나 적어 보세요" autocomplete="off" spellcheck="false"><kbd class="sv-mono" aria-hidden="true">↑↓ ↵</kbd></label>
          <div class="sv-qlist" id="sv-qlist">${questionsHtml(open)}</div>
        </div>
        <nav class="sv-appx sv-mono" aria-label="부록"><span>APPENDIX</span>
          <a href="#/svm/people">인물 지도 ${D.people.length}</a><a href="#/svm/glossary">용어 ${D.concepts.length}</a><a href="#/svm/videos">영상 ${D.videos.length}</a><a href="#/svm/more">더 읽을 거리 ${D.more.length}</a><a href="#/svm/counter">비판 ${nCrit}</a>
        </nav>
      </div>
      <div class="sv-index">
        <div class="sv-index-h sv-mono"><span>INDEX · 개념 × 장</span><span class="sv-wide">점을 누르면 그 장으로</span></div>
        <div class="sv-mx-wrap">${matrixHtml()}</div>
      </div>
    </section>
  </div>`;
  const list = host.querySelector("#sv-qlist"), input = host.querySelector("#sv-query");
  const items = () => [...list.querySelectorAll("[data-qi]")];
  const mark = () => items().forEach((el, i) => el.classList.toggle("act", i === active));
  const draw = () => { list.innerHTML = q ? resultsHtml(q) : questionsHtml(open); active = Math.min(active, items().length - 1); mark(); };
  const onInput = () => { q = input.value.trim(); active = q ? 0 : -1; draw(); };
  const onKey = (e) => {
    const n = items().length;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); if (!n) return; active = (active + (e.key === "ArrowDown" ? 1 : -1) + n) % n; mark(); items()[active]?.scrollIntoView({ block: "nearest" }); }
    else if (e.key === "Enter" && active >= 0) { e.preventDefault(); items()[active]?.click(); }
    else if (e.key === "Escape") { input.value = ""; onInput(); input.blur(); }
  };
  const onClick = (e) => {
    const b = e.target.closest("button[data-q]");
    if (b) { const i = Number(b.dataset.q); open = open === i ? null : i; draw(); if (!q) { active = items().indexOf(list.querySelector(`button[data-q="${i}"]`)); mark(); } }
  };
  input.addEventListener("input", onInput);
  input.addEventListener("keydown", onKey);
  host.addEventListener("click", onClick);
  return {
    update() { return false; },
    focus() { input.focus(); },
    stop() { input.removeEventListener("input", onInput); input.removeEventListener("keydown", onKey); host.removeEventListener("click", onClick); },
  };
}
