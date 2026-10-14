// 수식 (KaTeX) — 노트에 수식이 있을 때만 CDN 에서 한 번 불러와요. 블록 수식 .nb-eq[data-expr] · 글 속 $...$ → .nb-math[data-tex]
import { esc } from "../util.js";
const CDN = "https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/";
let loading = null;
export function loadKatex() {
  if (window.katex) return Promise.resolve(window.katex);
  return (loading ||= new Promise((ok, no) => {
    const l = document.createElement("link"); l.rel = "stylesheet"; l.href = CDN + "katex.min.css"; document.head.appendChild(l);
    const s = document.createElement("script"); s.src = CDN + "katex.min.js"; s.crossOrigin = "anonymous";
    s.onload = () => ok(window.katex); s.onerror = () => { loading = null; no(new Error("KaTeX 를 못 불러왔어요")); };
    document.head.appendChild(s);
  }));
}
// 글 속 $...$ : 앞뒤가 공백이 아닌 수식만 ($5 and $6 같은 돈 표기는 안 걸려요)
const INLINE_MATH = /(?<![\\$\w])\$([^\s$](?:[^$\n]*?[^\s$\\])?)\$(?![\w$])/g;
const ONE = new RegExp(INLINE_MATH.source); // /g 정규식은 lastIndex 가 남아서 검사용은 따로
export const hasMath = (t) => ONE.test(t || "");
// renderInline 은 수식 조각 사이에만 — 수식 안의 _ * 가 마크다운으로 바뀌지 않게
export function inlineWithMath(t, renderInline) {
  if (!hasMath(t)) return renderInline(t);
  let out = "", last = 0;
  for (const m of t.matchAll(INLINE_MATH)) {
    out += renderInline(t.slice(last, m.index)) + `<span class="nb-math" data-tex="${esc(m[1])}">${esc(m[1])}</span>`;
    last = m.index + m[0].length;
  }
  return out + renderInline(t.slice(last));
}
export async function paintMath(host) {
  const els = host.querySelectorAll(".nb-math[data-tex]:not([data-done]), .nb-eq[data-expr]:not([data-done])");
  if (!els.length) return;
  let k; try { k = await loadKatex(); } catch { return; }
  for (const el of els) {
    if (!el.isConnected) continue;
    const tex = el.dataset.tex ?? el.dataset.expr;
    try { k.render(tex, el, { displayMode: el.classList.contains("nb-eq"), throwOnError: false }); el.dataset.done = "1"; } catch {}
  }
}
