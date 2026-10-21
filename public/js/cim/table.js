// CIM 숫자표 — 플래시카드(먼저 떠올리고 눌러서 확인 · 몰랐던 카드는 3장 뒤에 다시) + 묶음별 표
// 그림으로 보기 — 그림 9개 + 부동산 계산기 모음 (각 그림 → 그 카드로)
import { NOTES } from "./notes.js";
import { FIGS } from "./figs.js";
import { chName } from "./meta.js";
import { esc, shuffle, pad2 } from "./ui.js";

export function mountTable(host) {
  const N = NOTES.NUMS, groups = [...new Set(N.map((x) => x.g))];
  let deck = shuffle(N), flip = false, known = 0;
  host.innerHTML = `<header class="cim-vh"><h1>숫자표 · 플래시카드</h1><p>시험에 그대로 나오는 숫자만 모았어요. 먼저 답을 떠올린 뒤 눌러서 확인해요.</p></header>
    <section class="cim-panel ct-fc"><header class="cim-ph"><div><span class="cim-lab">플래시카드</span><h2>몰랐던 카드는 뒤에 다시 나와요</h2></div><span class="cim-num ct-left" id="ct-left"></span></header>
      <button type="button" class="ct-card" id="ct-card" aria-live="polite"></button>
      <div class="cim-row ct-btns"><button type="button" class="cim-btn line" data-fc="0">몰랐어요</button><button type="button" class="cim-btn" data-fc="1">알았어요</button></div>
      <p class="cq-hint" aria-hidden="true"><kbd>Space</kbd> 뒤집기 · <kbd>←</kbd> 몰랐어요 · <kbd>→</kbd> 알았어요</p></section>
    ${groups.map((g) => `<section class="cim-panel"><header class="cim-ph"><div><span class="cim-lab">숫자표</span><h2>${esc(g)}</h2></div></header><div class="cim-tscroll"><table class="cim-tbl ct-tbl"><tbody>${N.filter((x) => x.g === g).map((x) => `<tr><th scope="row">${esc(x.q)}</th><td><b>${esc(x.a)}</b>${x.rev ? ` <span class="cc-tag rev">개정 확인</span>` : ""}</td></tr>`).join("")}</tbody></table></div></section>`).join("")}
    <p class="cim-note">'개정 확인' = 최근 바뀌었거나 바뀔 수 있는 숫자예요. 시험 회차의 기준일(보통 교재 기준)을 시험 직전에 꼭 확인하세요.</p>`;
  const card = host.querySelector("#ct-card");
  const draw = () => {
    host.querySelector("#ct-left").textContent = deck.length ? `남은 ${deck.length} · 안 ${known}` : `한 바퀴 끝 · 안 ${known}`;
    const c = deck[0];
    card.classList.toggle("back", flip && !!c);
    card.innerHTML = !c ? `<span class="ct-q">한 바퀴 끝! 다시 하려면 아래 버튼을 눌러요.</span>`
      : flip ? `<span class="cim-lab">${esc(c.q)}</span><span class="ct-a">${esc(c.a)}</span>${c.rev ? `<span class="cc-tag rev">개정 확인</span>` : ""}`
      : `<span class="cim-lab">${esc(c.g)}</span><span class="ct-q">${esc(c.q)}</span><span class="ct-tap">눌러서 답 보기</span>`;
    card.setAttribute("aria-label", c ? (flip ? `답: ${c.a}` : `질문: ${c.q}. 눌러서 답 보기`) : "한 바퀴 끝");
  };
  const answer = (k) => {
    if (!deck.length) { deck = shuffle(N); known = 0; }
    else { const c = deck.shift(); if (k) known++; else deck.splice(Math.min(3, deck.length), 0, c); }
    flip = false; draw();
  };
  card.onclick = () => { flip = !flip; draw(); };
  host.querySelectorAll("[data-fc]").forEach((b) => (b.onclick = () => answer(+b.dataset.fc)));
  const onKey = (e) => {
    if (e.target.closest?.("input, textarea, select") || e.metaKey || e.ctrlKey || !host.isConnected) return;
    if (e.key === " " && e.target === document.body) { e.preventDefault(); flip = !flip; draw(); }
    else if (e.key === "ArrowLeft") answer(0);
    else if (e.key === "ArrowRight") answer(1);
  };
  document.addEventListener("keydown", onKey);
  draw();
  return { stop: () => document.removeEventListener("keydown", onKey) };
}

export function mountFigs(host) {
  const keyOf = {}; Object.entries(NOTES.FIGS).forEach(([k, f]) => (keyOf[f] = k));
  host.innerHTML = `<header class="cim-vh"><h1>그림으로 보기</h1><p>변화 자체가 개념인 것만 골랐어요. ‹ › 로 한 단계씩, 슬라이더로 직접 바꿔 보세요.</p></header>
    <ol class="cf-list">${Object.entries(FIGS).map(([k, f], i) => { const key = keyOf[k], [ch, n] = key ? key.split("-") : [f.ch, ""]; return `<li class="cim-panel" id="fig-${k}"><header class="cim-ph"><div><span class="cim-lab">${k === "re" ? "계산기" : "그림 " + pad2(i + 1)} · ${esc(chName(f.ch))}</span><h2>${esc(f.t)}</h2></div>${key ? `<a class="cim-go" href="#/cim/book/${ch}/${n}">카드로 가기<span aria-hidden="true">→</span></a>` : ""}</header><div data-f="${k}"></div></li>`; }).join("")}</ol>`;
  host.querySelectorAll("[data-f]").forEach((d) => { try { FIGS[d.dataset.f].mount(d); } catch (e) { console.warn(e); } });
  return {};
}
