// CIM 숫자표 — 플래시카드(먼저 떠올리고 눌러서 확인 · 몰랐던 카드는 3장 뒤에 다시) + 묶음별 표
// 그림으로 보기 — 그림 9개 + 부동산 계산기 모음 (각 그림 → 그 카드로)
import { NOTES } from "./notes.js";
import { FIGS } from "./figs.js";
import { chName } from "./meta.js";
import { esc, shuffle, pad2, chev, reduced } from "./ui.js";

export function mountTable(host) {
  const N = NOTES.NUMS, groups = [...new Set(N.map((x) => x.g))];
  let deck = shuffle(N), known = 0, again = 0, busy = false;
  host.innerHTML = `<section class="ct-deckv"><span class="badge b cim-num">숫자표 · ${N.length}장</span><h1>숫자만 나오면 바로 떠오르게</h1>
      <p>카드를 누르면 뒤집혀요. 오른쪽으로 밀면 '알아요', 왼쪽은 '다시'. 몰랐던 카드는 3장 뒤에 또 나와요.</p>
      <div class="ct-deck" id="ct-deck"></div>
      <div class="ct-tally cim-num"><span class="badge g" id="ct-k">알아요 0</span><span class="badge r" id="ct-u">다시 0</span><span class="badge n" id="ct-left"></span></div>
      <div class="ct-btns"><button type="button" class="cim-btn line press" data-fc="0">다시</button><button type="button" class="cim-btn line press" data-flip>뒤집기</button><button type="button" class="cim-btn press" data-fc="1">알아요</button></div>
      <p class="cq-hint" aria-hidden="true" style="justify-content:center"><kbd>Space</kbd> 뒤집기 · <kbd>←</kbd> 다시 · <kbd>→</kbd> 알아요</p></section>
    ${groups.map((g) => `<section class="cim-panel"><header class="cim-ph"><div><span class="cim-lab">숫자표</span><h2>${esc(g)}</h2></div></header><div class="cim-tscroll"><table class="cim-tbl ct-tbl"><tbody>${N.filter((x) => x.g === g).map((x) => `<tr><th scope="row">${esc(x.q)}</th><td><b>${esc(x.a)}</b>${x.rev ? ` <span class="badge r">개정 확인</span>` : ""}</td></tr>`).join("")}</tbody></table></div></section>`).join("")}
    <p class="cim-note" style="padding:0 4px">'개정 확인' = 최근 바뀌었거나 바뀔 수 있는 숫자예요. 시험 회차의 기준일(보통 교재 기준)을 시험 직전에 꼭 확인하세요.</p>`;
  const box = host.querySelector("#ct-deck");
  const face = (c) => `<span class="stamp k" aria-hidden="true">알아요</span><span class="stamp u" aria-hidden="true">다시</span><div class="inner"><div class="face"><span class="q">${esc(c.g)}</span><span class="big">${esc(c.q)}</span><span class="tap">눌러서 답 보기</span></div><div class="face b"><span class="q">답</span><span class="big cim-num">${esc(c.a)}</span>${c.rev ? `<span class="badge">개정 확인</span>` : ""}</div></div>`;
  const tally = () => {
    host.querySelector("#ct-k").textContent = `알아요 ${known}`; host.querySelector("#ct-u").textContent = `다시 ${again}`;
    host.querySelector("#ct-left").textContent = deck.length ? `남은 ${deck.length}` : "한 바퀴 끝";
  };
  // 맨 위 카드(#ct-card)와 그 밑 카드 한 장. 뒤집힘 = .back
  const draw = () => {
    tally(); busy = false;
    if (!deck.length) { box.innerHTML = `<div class="ct-done"><b>한 바퀴 끝!</b><span class="cim-num">알아요 ${known} · 다시 ${again}</span><button type="button" class="cim-btn press" data-restart>다시 섞어서 시작</button></div>`; return; }
    box.innerHTML = (deck[1] ? `<div class="ct-fc under" aria-hidden="true">${face(deck[1])}</div>` : "") + `<div class="ct-fc" id="ct-card" role="button" tabindex="0" aria-live="polite" aria-label="질문: ${esc(deck[0].q)}. 눌러서 답 보기">${face(deck[0])}</div>`;
    drag(box.querySelector("#ct-card"));
  };
  const flip = () => { const f = box.querySelector("#ct-card"); if (!f) return; const on = f.classList.toggle("back"); f.setAttribute("aria-label", on ? `답: ${deck[0].a}` : `질문: ${deck[0].q}. 눌러서 답 보기`); };
  const answer = (k) => {
    const f = box.querySelector("#ct-card"); if (!f || busy) return;
    busy = true;
    const c = deck.shift(); if (k) known++; else { again++; deck.splice(Math.min(3, deck.length), 0, c); }
    const dir = k ? 1 : -1;
    f.querySelector(k ? ".stamp.k" : ".stamp.u").style.opacity = 1;
    f.style.transform = `translateX(${dir * 560}px) rotate(${dir * 16}deg)`; f.style.opacity = "0";
    const u = box.querySelector(".ct-fc.under"); if (u) { u.style.transform = "none"; u.style.opacity = "1"; }
    setTimeout(draw, reduced() ? 0 : 300);
  };
  // 끌어서 넘기기: 90px 넘게 밀면 그쪽으로 날아가요. 거의 안 움직이고 떼면 뒤집기
  function drag(f) {
    let x0 = 0, dx = 0, down = false, moved = false;
    const sk = f.querySelector(".stamp.k"), su = f.querySelector(".stamp.u");
    f.onpointerdown = (e) => { if (e.button) return; down = true; moved = false; x0 = e.clientX; dx = 0; try { f.setPointerCapture(e.pointerId); } catch {} f.classList.add("dragging"); };
    f.onpointermove = (e) => { if (!down) return; dx = e.clientX - x0; if (Math.abs(dx) > 5) moved = true; if (!moved) return; f.style.transform = `translateX(${dx}px) rotate(${dx / 22}deg)`; sk.style.opacity = Math.max(0, Math.min(1, dx / 90)); su.style.opacity = Math.max(0, Math.min(1, -dx / 90)); };
    const up = () => { if (!down) return; down = false; f.classList.remove("dragging"); if (Math.abs(dx) > 90) answer(dx > 0 ? 1 : 0); else { f.style.transform = ""; sk.style.opacity = su.style.opacity = 0; if (!moved) flip(); } };
    f.onpointerup = up; f.onpointercancel = () => { dx = 0; up(); };
  }
  host.onclick = (e) => {
    const b = e.target.closest("[data-fc]"); if (b) return answer(+b.dataset.fc);
    if (e.target.closest("[data-flip]")) return flip();
    if (e.target.closest("[data-restart]")) { deck = shuffle(N); known = again = 0; draw(); }
  };
  const onKey = (e) => {
    if (e.target.closest?.("input, textarea, select, button, a") || e.metaKey || e.ctrlKey || !host.isConnected) return;
    if (e.key === " " || e.key === "Enter") { if (e.target === document.body || e.target.id === "ct-card") { e.preventDefault(); flip(); } }
    else if (e.key === "ArrowLeft") answer(0);
    else if (e.key === "ArrowRight") answer(1);
  };
  document.addEventListener("keydown", onKey);
  draw();
  return { stop: () => document.removeEventListener("keydown", onKey) };
}

export function mountFigs(host) {
  const keyOf = {}; Object.entries(NOTES.FIGS).forEach(([k, f]) => (keyOf[f] = k));
  host.innerHTML = `<header class="cim-vh"><span class="cim-lab">그림으로 보기</span><h1>움직여 보면 바로 보여요</h1><p>변화 자체가 개념인 것만 골랐어요. ‹ › 로 한 단계씩, 슬라이더로 직접 바꿔 보세요.</p></header>
    <ol class="cf-list">${Object.entries(FIGS).map(([k, f], i) => { const key = keyOf[k], [ch, n] = key ? key.split("-") : [f.ch, ""]; return `<li class="cim-panel cf-item" id="fig-${k}"><header class="cim-ph"><div><span class="cim-lab"><span class="badge ${k === "re" ? "g" : "b"} cim-num">${k === "re" ? "계산기" : "그림 " + pad2(i + 1)}</span> ${esc(chName(f.ch))}</span><h2>${esc(f.t)}</h2></div>${key ? `<a class="cim-go press" href="#/cim/book/${ch}/${n}">카드로${chev}</a>` : ""}</header><div data-f="${k}"></div></li>`; }).join("")}</ol>`;
  host.querySelectorAll("[data-f]").forEach((d) => { try { FIGS[d.dataset.f].mount(d); } catch (e) { console.warn(e); } });
  return {};
}
