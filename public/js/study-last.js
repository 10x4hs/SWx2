// 공부 탭에서 마지막으로 보던 탭 — Dock 에서 Study 를 누르면 여기로 (dock-memory.js). 공부 화면 모듈 없이도 알 수 있게 따로 둬요.
export const KEY = "trio.study.sub";
export const SUB_HASH = { english: "#/english", papers: "#/papers", books: "#/books" };
export function lastHash() {
  try { const k = localStorage.getItem(KEY) || ""; if (k.startsWith("p:")) return "#/study/" + k.slice(2); return SUB_HASH[k] || "#/english"; } catch { return "#/english"; }
}
