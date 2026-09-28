// EDOLUS식 글자 뒤섞임: 기호가 흩어졌다가 왼쪽부터 제자리를 찾아요.
const GLYPHS = "▯▮░▒/\\<>_-=+*#%0123456789ABCDEFXYZ";
const reduce = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

export function scramble(el, text, { duration = 620 } = {}) {
  if (!el) return;
  if (reduce() || !text) { el.textContent = text; return; }
  if (el._scr) cancelAnimationFrame(el._scr);
  const start = performance.now(), chars = [...text];
  const step = (now) => {
    const k = Math.min(1, (now - start) / duration);
    const fixed = Math.floor(chars.length * k);
    el.textContent = chars.map((c, i) => (i < fixed || c === " " ? c : GLYPHS[(Math.random() * GLYPHS.length) | 0])).join("");
    if (k < 1) el._scr = requestAnimationFrame(step); else { el.textContent = text; el._scr = 0; }
  };
  el._scr = requestAnimationFrame(step);
}

// 화면이 바뀔 때 제목·라벨을 한 번 뒤섞어 보여줘요 (한글 제목은 그대로 두고 라틴·숫자 라벨만)
export function scrambleIn(root) {
  if (reduce()) return;
  root.querySelectorAll(".eyebrow, [data-scramble]").forEach((el, i) => {
    if (el.children.length) return;
    const text = el.textContent;
    setTimeout(() => scramble(el, text, { duration: 520 }), i * 60);
  });
}
