// CIM 화면 조각 — 섞기 · 불러오는 중 · 오류 · 키보드 거르기 (장식 없이)
export { esc } from "../util.js";

export const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
export const pad2 = (n) => String(n).padStart(2, "0");
export const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
// 글 쓰는 칸 · 단축키 조합일 때는 화면 단축키를 쓰지 않아요
export const typing = (e) => e.target.closest?.("input, textarea, select, [contenteditable]") || e.metaKey || e.ctrlKey || e.altKey;
// 정답률 → 한 줄 판정 (합격선 70 · 과락선 40)
export const verdict = (pct) => (pct == null ? ["—", "아직 안 풀었어요", ""] : pct >= 70 ? [pct + "%", "합격선 넘음", "ok"] : pct >= 40 ? [pct + "%", "조금 더", ""] : [pct + "%", "과락 주의", "bad"]);

export const loading = (t = "불러오는 중") => `<div class="c-loading" role="status"><span class="c-pulse" aria-hidden="true"></span>${t}</div>`;
export const errorBox = (t) => `<div class="c-err" role="alert"><b>불러오지 못했어요</b><p>${t}</p><button type="button" class="c-btn" data-reload>다시 시도</button></div>`;
