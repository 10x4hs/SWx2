// SW 과정 첫 화면 (#/sw) — 과정 두 권을 책처럼 나란히: 표지(이름 · 장 수) · 한 줄 소개 · 진도 · [이어서 하기](다음 카드) · 목차 보기
//   2026-10-20: 3D 유리 판 · 별 배경 대신 종이 위 책 두 권 (공부하는 느낌 · 바로 이어서)
import { esc } from "../util.js";
import { api } from "../api.js";
import { COURSES, getJSON, progressOf, nextCards, nightBtn } from "./data.js";

const LIST = [
  { c: COURSES.vg, vol: "1권", line: "글을 숫자(벡터)로 바꾸고, 가까운 것을 빨리 찾고, 관계(그래프)로 엮어 AI가 답하게 해요.", span: "8장 · 임베딩에서 GraphRAG까지" },
  { c: COURSES.dev, vol: "2권", line: "아이디어가 문서가 되고, 화면과 서버가 되고, 고객에게 닿고, 고장 나고, 다시 좋아지는 흐름을 따라가요.", span: "12장 · 가상 회사 두런과 함께" },
  { c: COURSES.onto, vol: "3권", line: "세상을 '무엇이 있고 어떻게 이어지는지'로 적어 기계가 뜻을 알게 해요. 원리부터 왜 지금 뜨는지까지.", span: "8장 · 논리에서 AI 시대 세계 동향까지" },
  { c: COURSES.aip, vol: "4권", line: "회사를 객체 · 링크 · 액션으로 옮기고, 그 위에서 LLM 이 일하게 하는 Palantir 의 방식을 뜯어봐요.", span: "8장 · 온톨로지에서 AIP 에이전트 · 사례 · 한계까지" },
];

export function mountSw(host, ctx) {
  let alive = true;
  const info = LIST.map(() => null);
  function draw() {
    host.innerHTML = `<header class="dv-top"><nav class="dv-crumbs" aria-label="지금 위치"><b aria-current="page">SW 과정</b></nav><nav class="dv-nav" aria-label="보기">${nightBtn()}</nav></header>
      <div class="sw-home">
        <header class="sw-home-h"><h1>SW 과정</h1><p>책마다 하루 30~60분씩 읽어요. 카드 몇 장, 어제 것 복습, 그리고 회의실 문제 하나.</p></header>
        <div class="sw-books">${LIST.map(({ c, vol, line, span }, k) => {
          const x = info[k], pct = x ? Math.round(x.ratio * 100) : 0;
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
  draw();
  // 과정마다 진도 · 다음 카드
  LIST.forEach(({ c }, k) => {
    Promise.all([getJSON(`${c.dir}/index.json`), api.courseState(c.key).catch(() => ({ items: [], done: [] }))]).then(([idx, st]) => {
      if (!alive) return;
      const per = idx.modules.map((m) => progressOf(m, st)), nx = nextCards(idx, st, 1)[0];
      info[k] = { mods: idx.modules.length, doneMods: per.filter((p) => p.ratio >= 0.999).length, ratio: per.reduce((n, p) => n + p.ratio, 0) / (idx.modules.length || 1), started: (st.items || []).length > 0,
        next: nx ? { card: true, href: `${c.base}/${nx.module.id}/${nx.card.id}`, label: `${nx.module.no} ${nx.module.title} · 카드 ${nx.module.cards.indexOf(nx.card) + 1} — ${nx.card.title}` } : { href: c.base, label: "모든 카드를 읽었어요" } };
      draw();
    }).catch(() => {});
  });
  return () => { alive = false; };
}
