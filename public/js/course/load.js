// 카드 과정 공용 읽기 — 경영(js/mba) · SW 공간(js/dev: dev · vg · onto · aip) 이 같이 써요. 목록 모양은 scripts/lib/course-schema.mjs
// 진도 키는 과정과 상관없이 "<모듈>/<항목>" — 카드는 state.items(card), 케이스 · 문제 · 강의는 state.done(item)
const cache = new Map();
export function getJSON(path) {
  if (!cache.has(path)) {
    const p = fetch(path).then((r) => { if (!r.ok) throw new Error(`${path} ${r.status}`); return r.json(); });
    p.catch(() => cache.delete(path));
    cache.set(path, p);
  }
  return cache.get(path);
}
export const courseIndex = (dir) => getJSON(`${dir}/index.json`);
export const courseModule = (dir, id) => getJSON(`${dir}/${id}.json`);
export const readSet = (st) => new Set((st.items || []).map((x) => x.module + "/" + x.card));
export const doneSet = (st) => new Set((st.done || []).map((x) => x.module + "/" + x.item));
