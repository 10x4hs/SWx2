// Obsidian(#/brain · #/notes) 길 찾기 — '← 뒤로' · Dock 아이콘 한 칸 위 · 층마다 보던 모습 (2026-10-22)
//   back(fallback)        바로 전 화면이 Brain · 노트면 브라우저 뒤로(그 화면의 확대 · 위치 그대로), 아니면 fallback(한 칸 위 층)으로
//   upHash(hash)          한 칸 위: 노트 → 그 노트가 보이는 그래프 층, 층 → 부모 층, 맨 위 → 그대로 (dock-memory.js)
//   learnParents(map)     Brain 나무의 부모 (id → 부모 id | null). 노트 화면은 노트의 부모 노트를 { "n:<id>": parent_id }
//   viewOf(level) · keepView(level, state)   층마다 확대 · 위치 · 고른 점 (이 탭에서만, sessionStorage)
const TRAIL = "trio-brain-trail", PAR = "trio-brain-parents", VIEW = "trio-brain-view:";
const ss = {
  get: (k, d) => { try { return JSON.parse(sessionStorage.getItem(k) || "null") ?? d; } catch { return d; } },
  set: (k, v) => { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
export const isBrainHash = (h) => /^#\/(brain(?!\/graph)|notes\/(?!tag\/)[^/]+)/.test(h || "");

// 이 탭에서 지나온 주소 (뒤로 가기가 Brain 안에서 끝나는지 알려고)
let trail = ss.get(TRAIL, []);
function note(hash) {
  if (trail.at(-1) === hash) return;
  if (trail.at(-2) === hash) trail.pop(); // 뒤로 왔어요
  else trail.push(hash);
  if (trail.length > 60) trail = trail.slice(-60);
  ss.set(TRAIL, trail);
}
addEventListener("hashchange", () => note(location.hash));
note(location.hash);

let parents = ss.get(PAR, {});
export function learnParents(map) {
  let ch = false;
  for (const [k, v] of Object.entries(map)) if (parents[k] !== v) { parents[k] = v; ch = true; }
  if (ch) { ss.set(PAR, parents); syncDock(); }
}
export const parentOf = (id) => parents[id];
const enc = encodeURIComponent;
const levelHash = (id) => (id ? "#/brain/" + enc(id) : "#/brain");

export function upHash(hash) {
  const m = (hash || "").match(/^#\/(brain|notes)\/([^/]+)/);
  if (!m || (m[1] === "brain" && m[2] === "graph")) return "#/brain";
  let id; try { id = decodeURIComponent(m[2]); } catch { id = m[2]; }
  if (m[1] === "notes") { // 노트의 부모 노트(노트 화면이 막 받은 것)가 먼저, 부모가 없으면 Brain 나무에서 본 자리 (Unsorted · 개념은 맨 위)
    const p = parents["n:" + id];
    if (p) return levelHash(p);
    return parents[id] !== undefined ? levelHash(parents[id]) : "#/brain";
  }
  return levelHash(parents[id] || null);
}
// Dock 의 Obsidian 아이콘: 지금 Brain 안이면 한 칸 위 (app.js 가 화면을 바꿀 때 한 번, 나무를 알게 되면 여기서 한 번 더)
export function syncDock() {
  if (!isBrainHash(location.hash)) return;
  const up = upHash(location.hash);
  document.querySelectorAll('a.rail-btn[data-nav="brain"]').forEach((a) => a.setAttribute("href", up));
}

export function back(fallback, go) {
  const prev = trail.at(-2);
  if (prev && isBrainHash(prev) && history.length > 1) { history.back(); return; }
  go(fallback);
}

export const viewOf = (level) => ss.get(VIEW + (level || "root"), null);
export const keepView = (level, st) => { if (st) ss.set(VIEW + (level || "root"), st); };
