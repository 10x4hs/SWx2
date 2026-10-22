// CIM 숫자 외우기 (#/cim/exam/cards) — 카드를 누르면 뒤집혀요. 오른쪽으로 밀면 '알아요', 왼쪽은 '다시'(3장 뒤에 또 나와요)
//   키보드: Space 뒤집기 · ← 다시 · → 알아요. 맨 아래 접힌 '숫자 전체 보기'에 표가 있어요.
import { NOTES } from "./notes.js";
import { setAi } from "./ai.js";
import { esc, shuffle, reduced } from "./ui.js";

export function mountCards(host) {
  const N = NOTES.NUMS;
  let deck = shuffle(N), known = 0, again = 0, busy = false;
  host.innerHTML = `<div class="c-exam"><div class="c-shead"><a class="c-ghost press" href="#/cim/exam">← 시험</a><span class="num" id="ct-left"></span></div>
      <h1>숫자 외우기</h1>
      <p class="c-lead">먼저 떠올리고, 눌러서 확인해요. 오른쪽으로 밀면 알아요, 왼쪽은 다시.</p>
      <div class="ct-deck" id="ct-deck"></div>
      <div class="c-col2"><button type="button" class="c-btn press" data-fc="0">다시 <span class="num" id="ct-u">0</span></button><button type="button" class="c-btn lime press" data-fc="1">알아요 <span class="num" id="ct-k">0</span></button></div>
      <details class="c-strat"><summary>숫자 전체 보기</summary><div class="c-tw"><table class="c-tbl"><tbody>${N.map((x) => `<tr><td>${esc(x.q)}</td><td><b>${esc(x.a)}</b>${x.rev ? ` <span class="c-tag">개정 확인</span>` : ""}</td></tr>`).join("")}</tbody></table></div>
      <p class="c-lead sm">'개정 확인' = 최근 바뀌었거나 바뀔 수 있는 숫자예요. 시험 직전에 교재 기준일을 꼭 확인하세요.</p></details></div>`;
  const box = host.querySelector("#ct-deck");
  const face = (c) => `<span class="stamp k" aria-hidden="true">알아요</span><span class="stamp u" aria-hidden="true">다시</span><div class="inner"><div class="face"><span class="q">${esc(c.g)}</span><span class="big">${esc(c.q)}</span><span class="tap">눌러서 답 보기</span></div><div class="face b"><span class="q">답</span><span class="big num">${esc(c.a)}</span>${c.rev ? `<span class="c-tag">개정 확인</span>` : ""}</div></div>`;
  const tally = () => {
    host.querySelector("#ct-k").textContent = known; host.querySelector("#ct-u").textContent = again;
    host.querySelector("#ct-left").textContent = deck.length ? `남은 ${deck.length}장` : "한 바퀴 끝";
  };
  const draw = () => {
    tally(); busy = false;
    if (!deck.length) { box.innerHTML = `<div class="ct-done"><b>한 바퀴 끝</b><span class="num">알아요 ${known} · 다시 ${again}</span><button type="button" class="c-btn dark press" data-restart>다시 섞어서</button></div>`; return; }
    box.innerHTML = (deck[1] ? `<div class="ct-fc under" aria-hidden="true">${face(deck[1])}</div>` : "") + `<div class="ct-fc" id="ct-card" role="button" tabindex="0" aria-live="polite" aria-label="질문: ${esc(deck[0].q)}. 눌러서 답 보기">${face(deck[0])}</div>`;
    drag(box.querySelector("#ct-card"));
    setAi({ kind: "general", topic: `숫자 외우기 카드: ${deck[0].q} → ${deck[0].a}` });
  };
  const flip = () => { const f = box.querySelector("#ct-card"); if (!f) return; const on = f.classList.toggle("back"); f.setAttribute("aria-label", on ? `답: ${deck[0].a}` : `질문: ${deck[0].q}. 눌러서 답 보기`); };
  const answer = (k) => {
    const f = box.querySelector("#ct-card"); if (!f || busy) return;
    busy = true;
    const c = deck.shift(); if (k) known++; else { again++; deck.splice(Math.min(3, deck.length), 0, c); }
    const dir = k ? 1 : -1;
    f.querySelector(k ? ".stamp.k" : ".stamp.u").style.opacity = 1;
    f.style.transform = `translateX(${dir * 560}px) rotate(${dir * 14}deg)`; f.style.opacity = "0";
    const u = box.querySelector(".ct-fc.under"); if (u) { u.style.transform = "none"; u.style.opacity = "1"; }
    setTimeout(draw, reduced() ? 0 : 280);
  };
  // 끌어서 넘기기: 90px 넘게 밀면 그쪽으로 날아가요. 거의 안 움직이고 떼면 뒤집기
  function drag(f) {
    let x0 = 0, dx = 0, down = false, moved = false;
    const sk = f.querySelector(".stamp.k"), su = f.querySelector(".stamp.u");
    f.onpointerdown = (e) => { if (e.button) return; down = true; moved = false; x0 = e.clientX; dx = 0; try { f.setPointerCapture(e.pointerId); } catch {} f.classList.add("dragging"); };
    f.onpointermove = (e) => { if (!down) return; dx = e.clientX - x0; if (Math.abs(dx) > 5) moved = true; if (!moved) return; f.style.transform = `translateX(${dx}px) rotate(${dx / 24}deg)`; sk.style.opacity = Math.max(0, Math.min(1, dx / 90)); su.style.opacity = Math.max(0, Math.min(1, -dx / 90)); };
    const up = () => { if (!down) return; down = false; f.classList.remove("dragging"); if (Math.abs(dx) > 90) answer(dx > 0 ? 1 : 0); else { f.style.transform = ""; sk.style.opacity = su.style.opacity = 0; if (!moved) flip(); } };
    f.onpointerup = up; f.onpointercancel = () => { dx = 0; up(); };
  }
  host.onclick = (e) => {
    const b = e.target.closest("[data-fc]"); if (b) return answer(+b.dataset.fc);
    if (e.target.closest("[data-restart]")) { deck = shuffle(N); known = again = 0; draw(); }
  };
  const onKey = (e) => {
    if (e.target.closest?.("input, textarea, select, button, a, summary") || e.metaKey || e.ctrlKey || !host.isConnected) return;
    if (e.key === " " || e.key === "Enter") { if (e.target === document.body || e.target.id === "ct-card") { e.preventDefault(); flip(); } }
    else if (e.key === "ArrowLeft") answer(0);
    else if (e.key === "ArrowRight") answer(1);
  };
  document.addEventListener("keydown", onKey);
  draw();
  return { stop: () => document.removeEventListener("keydown", onKey) };
}
