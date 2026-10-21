// SW 과정 첫 화면 (#/sw) — 책을 깊이 길 위에 한 권씩: 휠 · 스와이프 · ↑↓ · 오른쪽 점으로 다음 책. 지금 책만 또렷하고 글은 왼쪽(폰: 아래) 패널에
//   2026-10-20: 종이 위 책 목록 · 2026-10-21: 책이 늘어도 아래로 길어지지 않게 3D 깊이 길(js/dev/depth.js). three 가 안 되면 · [목록] 이면 예전 목록
import { esc } from "../util.js";
import { api } from "../api.js";
import { COURSES, getJSON, progressOf, nextCards, nightBtn } from "./data.js";
import { mountDepth, fitStage, listPref } from "./depth.js";

const LIST = [
  { c: COURSES.vg, vol: "1권", line: "글을 숫자(벡터)로 바꾸고, 가까운 것을 빨리 찾고, 관계(그래프)로 엮어 AI가 답하게 해요.", span: "8장 · 임베딩에서 GraphRAG까지" },
  { c: COURSES.dev, vol: "2권", line: "아이디어가 문서가 되고, 화면과 서버가 되고, 고객에게 닿고, 고장 나고, 다시 좋아지는 흐름을 따라가요.", span: "12장 · 가상 회사 두런과 함께" },
  { c: COURSES.onto, vol: "3권", line: "세상을 '무엇이 있고 어떻게 이어지는지'로 적어 기계가 뜻을 알게 해요. 원리부터 왜 지금 뜨는지까지.", span: "8장 · 논리에서 AI 시대 세계 동향까지" },
  { c: COURSES.aip, vol: "4권", line: "회사를 객체 · 링크 · 액션으로 옮기고, 그 위에서 LLM 이 일하게 하는 Palantir 의 방식을 뜯어봐요.", span: "8장 · 온톨로지에서 AIP 에이전트 · 사례 · 한계까지" },
];
const POS = "sw-depth:home";

export function mountSw(host, ctx) {
  let alive = true, depth = null, unfit = null, k3 = 0;
  const info = LIST.map(() => null);
  let asList = listPref.get("home");
  const top = () => `<header class="dv-top"><nav class="dv-crumbs" aria-label="지금 위치"><b aria-current="page">SW 과정</b></nav><nav class="dv-nav" aria-label="보기"><button type="button" class="dv-night dp-view" data-view aria-pressed="${asList}">${asList ? "3D로 보기" : "목록으로 보기"}</button>${nightBtn()}</nav></header>`;
  const prog = (k) => { const x = info[k], pct = x ? Math.round(x.ratio * 100) : 0; return { x, pct }; };

  function listHtml() {
    return `<div class="sw-home">
        <header class="sw-home-h"><h1>SW 과정</h1><p>책마다 하루 30~60분씩 읽어요. 카드 몇 장, 어제 것 복습, 그리고 회의실 문제 하나.</p></header>
        <div class="sw-books">${LIST.map(({ c, vol, line, span }, k) => {
          const { x, pct } = prog(k);
          return `<article class="sw-book" data-course="${c.key}">
            <a class="sw-cover" href="${c.base}" aria-label="${esc(c.name)} 목차"><span class="sw-vol">${vol}</span><b>${esc(c.name)}</b><span class="sw-span">${esc(span)}</span></a>
            <div class="sw-book-b">
              <p class="sw-line">${esc(line)}</p>
              <div class="sw-prog"><div class="sw-bar" role="progressbar" aria-label="${esc(c.name)} 진도" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><i style="width:${pct}%"></i></div><span>${x ? `모듈 ${x.doneMods} / ${x.mods} · ${pct}%` : "진도 불러오는 중"}</span></div>
              <p class="sw-next-l">${x ? (x.next.card ? `다음 · ${esc(x.next.label)}` : esc(x.next.label)) : "&nbsp;"}</p>
              <div class="sw-acts"><a class="dv-btn" href="${x?.next?.href || c.base}">${x && x.started ? "이어서 하기" : "시작하기"}</a><a class="dv-link" href="${c.base}">목차 보기 →</a></div>
            </div>
          </article>`;
        }).join("")}</div>
      </div>`;
  }
  // 지금 책 패널 (WebGL 밖 HTML)
  function panelHtml(k) {
    const { c, vol, line, span } = LIST[k], { x, pct } = prog(k);
    return `<p class="dp-k">${vol} <span>/ ${LIST.length}</span></p>
      <h1 class="dp-t">${esc(c.name)}</h1>
      <p class="dp-line">${esc(line)}</p>
      <p class="dp-sub">${esc(span)}</p>
      <div class="dp-prog"><div class="dp-bar" role="progressbar" aria-label="${esc(c.name)} 진도" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><i style="width:${pct}%"></i></div><span>${x ? `${x.doneMods} / ${x.mods}장 · ${pct}%` : "진도 불러오는 중"}</span></div>
      <p class="dp-next">${x ? (x.next.card ? `다음 · ${esc(x.next.label)}` : esc(x.next.label)) : "&nbsp;"}</p>
      <div class="dp-acts"><a class="dv-btn" href="${x?.next?.href || c.base}">${x && x.started ? "이어서 하기" : "시작하기"}</a><a class="dv-link" href="${c.base}">목차 보기 →</a></div>`;
  }
  const face = (k) => { const { c, vol, span } = LIST[k], { pct } = prog(k); return { top: `${vol}`, title: c.name, sub: `${span} · ${pct}%`, ratio: pct / 100 }; };
  function paintPanel() { const p = host.querySelector(".dp-panel"); if (p) p.innerHTML = panelHtml(k3); }

  function stop3d() { depth?.destroy(); depth = null; unfit?.(); unfit = null; }
  function draw() {
    stop3d();
    if (asList) { host.classList.remove("dv-deep"); host.innerHTML = top() + listHtml(); return; }
    host.classList.add("dv-deep");
    host.innerHTML = `${top()}<div class="dp" data-kind="books"><section class="dp-panel" aria-live="polite"></section><p class="dp-hint" aria-hidden="true">휠 · 스와이프 · ↑↓ 로 다음 책</p></div>`;
    const stage = host.querySelector(".dp");
    unfit = fitStage(stage);
    let start = 0; try { start = Math.min(LIST.length - 1, Number(sessionStorage.getItem(POS)) || 0); } catch {}
    k3 = start; paintPanel();
    mountDepth(stage, LIST.map(({ c, vol }, k) => ({ dot: `${vol} ${c.name}`, face: face(k) })), {
      shape: [3, 4], start, label: "SW 과정 책 — 휠 · 스와이프 · 위아래 화살표로 다음 책, Enter 로 목차",
      onFocus: (k) => { k3 = k; paintPanel(); try { sessionStorage.setItem(POS, String(k)); } catch {} },
      onOpen: (k) => { location.hash = LIST[k].c.base; },
    }).then((d) => { if (!alive || !stage.isConnected) { d.destroy(); return; } depth = d; LIST.forEach((_, k) => info[k] && d.update(k, face(k))); })
      .catch(() => { if (!alive || !stage.isConnected) return; unfit?.(); unfit = null; host.classList.remove("dv-deep"); host.innerHTML = top() + listHtml(); });
  }
  host.addEventListener("click", (e) => {
    if (!e.target.closest("[data-view]")) return;
    asList = !asList; listPref.set("home", asList); draw();
  });
  draw();
  // 과정마다 진도 · 다음 카드
  LIST.forEach(({ c }, k) => {
    Promise.all([getJSON(`${c.dir}/index.json`), api.courseState(c.key).catch(() => ({ items: [], done: [] }))]).then(([idx, st]) => {
      if (!alive) return;
      const per = idx.modules.map((m) => progressOf(m, st)), nx = nextCards(idx, st, 1)[0];
      info[k] = { mods: idx.modules.length, doneMods: per.filter((p) => p.ratio >= 0.999).length, ratio: per.reduce((n, p) => n + p.ratio, 0) / (idx.modules.length || 1), started: (st.items || []).length > 0,
        next: nx ? { card: true, href: `${c.base}/${nx.module.id}/${nx.card.id}`, label: `${nx.module.no} ${nx.module.title} · 카드 ${nx.module.cards.indexOf(nx.card) + 1} — ${nx.card.title}` } : { href: c.base, label: "모든 카드를 읽었어요" } };
      if (asList || !host.querySelector(".dp")) { if (asList) host.innerHTML = top() + listHtml(); else if (!host.classList.contains("dv-deep")) host.innerHTML = top() + listHtml(); return; }
      depth?.update(k, face(k)); if (k === k3) paintPanel();
    }).catch(() => {});
  });
  return () => { alive = false; stop3d(); };
}
