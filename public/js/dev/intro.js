// SW 공간 시작 연출 — 세션에 한 번. 검정 위에 작은 HUD 글씨 → 원형 조준경(호 · 눈금 · 퍼센트)이 그려지고 → 커지며 사라지면 장면의 입자가 모여요.
//   누르거나 키를 치면 바로 건너뛰어요. 움직임 줄이기면 보여 주지 않아요.
const KEY = "sw-intro";
export function playIntro(host, onDone) {
  let seen = false; try { seen = sessionStorage.getItem(KEY) === "1"; sessionStorage.setItem(KEY, "1"); } catch {}
  if (seen || matchMedia("(prefers-reduced-motion: reduce)").matches) { onDone?.(); return () => {}; }
  const el = document.createElement("div");
  el.className = "sw-intro"; el.setAttribute("role", "presentation");
  const ticks = Array.from({ length: 72 }, (_, i) => { const a = (i / 72) * Math.PI * 2, r1 = i % 6 ? 118 : 112, x1 = 160 + Math.cos(a) * r1, y1 = 160 + Math.sin(a) * r1, x2 = 160 + Math.cos(a) * 124, y2 = 160 + Math.sin(a) * 124; return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/>`; }).join("");
  const petals = Array.from({ length: 12 }, (_, i) => `<path d="M160 52 Q166 70 160 84 Q154 70 160 52Z" transform="rotate(${i * 30} 160 160)"/>`).join("");
  el.innerHTML = `<div class="sw-intro-hud m"><span>SWX2 / SOFTWARE SPACE</span><span id="sw-intro-sys">SYS · INIT</span></div>
    <svg class="sw-intro-ret" viewBox="0 0 320 320" aria-hidden="true">
      <g class="ri-ticks">${ticks}</g>
      <circle class="ri-arc a1" cx="160" cy="160" r="140"/><circle class="ri-arc a2" cx="160" cy="160" r="96"/><circle class="ri-arc a3" cx="160" cy="160" r="64"/>
      <g class="ri-petals">${petals}</g>
      <path class="ri-br" d="M40 120 Q28 160 40 200 M280 120 Q292 160 280 200"/>
    </svg>
    <div class="sw-intro-pct m"><b id="sw-intro-n">000</b><span>LOADING</span></div>
    <div class="sw-intro-skip m">CLICK TO SKIP</div>`;
  host.appendChild(el);
  let done = false, raf = 0;
  const t0 = performance.now(), D = 1900, n = el.querySelector("#sw-intro-n"), sys = el.querySelector("#sw-intro-sys");
  const words = ["SYS · INIT", "SCENE · LOAD", "PARTICLES · 15K", "LINK · OK"];
  const tick = (now) => {
    const p = Math.min(1, (now - t0) / D);
    n.textContent = String(Math.round(p * 100)).padStart(3, "0"); sys.textContent = words[Math.min(words.length - 1, Math.floor(p * words.length))];
    el.style.setProperty("--p", p.toFixed(3));
    if (p < 1) raf = requestAnimationFrame(tick); else finish();
  };
  function finish() {
    if (done) return; done = true; cancelAnimationFrame(raf);
    el.classList.add("out"); onDone?.();
    setTimeout(() => el.remove(), 900);
    removeEventListener("keydown", finish); el.removeEventListener("pointerdown", finish);
  }
  addEventListener("keydown", finish); el.addEventListener("pointerdown", finish);
  raf = requestAnimationFrame(tick);
  return () => { if (!done) { done = true; cancelAnimationFrame(raf); el.remove(); removeEventListener("keydown", finish); } };
}
