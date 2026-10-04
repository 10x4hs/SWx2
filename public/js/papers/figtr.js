// 원문 그림 속 영어 → 한국어 (content/<id>.figtr.json · 규격 scripts/papers/FIGTR_SPEC.md)
// 그림 아래 [data-tr="파일이름"] 자리에 번역을 채워요. 제목 · 설명은 바로 보이고, 그림 속 글자 · 어려운 말은 펼쳐서.
const cache = new Map();
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export function loadFigtr(id) {
  if (!cache.has(id)) cache.set(id, fetch(`/papers/content/${encodeURIComponent(id)}.figtr.json`, { cache: "no-cache" }).then((r) => (r.ok ? r.json() : {})).catch(() => ({})));
  return cache.get(id);
}
export function figtrHtml(t) {
  if (!t) return "";
  const labels = (t.labels || []).filter((x) => x?.en && x?.ko), terms = (t.terms || []).filter((x) => x?.ko);
  return `<div class="ftr" lang="ko">
    <div class="ftr-k"><span class="ftr-flag" aria-hidden="true">한</span>그림 속 영어, 한국어로</div>
    ${t.title ? `<p class="ftr-t">${esc(t.title)}</p>` : ""}${t.caption ? `<p class="ftr-c">${esc(t.caption)}</p>` : ""}
    ${labels.length ? `<details class="ftr-d"><summary>그림 안의 글자 ${labels.length}개</summary><dl class="ftr-l">${labels.map((x) => `<dt>${esc(x.en)}</dt><dd>${esc(x.ko)}</dd>`).join("")}</dl></details>` : ""}
    ${terms.length ? `<details class="ftr-d"><summary>어려운 말 ${terms.length}개</summary><dl class="ftr-l">${terms.map((x) => `<dt>${esc(x.ko)}${x.en ? ` <small>${esc(x.en)}</small>` : ""}</dt><dd>${esc(x.easy || "")}</dd>`).join("")}</dl></details>` : ""}
  </div>`;
}
export async function fillFigtr(root, id) {
  const slots = [...root.querySelectorAll("[data-tr]")]; if (!slots.length) return;
  const tr = await loadFigtr(id);
  slots.forEach((el) => { const t = tr[el.dataset.tr]; if (t) { el.innerHTML = figtrHtml(t); el.hidden = false; } });
}
