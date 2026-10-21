// CIM 내용 불러오기 — 장마다 public/cim/<장>.json 을 처음 볼 때만 받아요 (껍데기는 가볍게).
// 받은 장은 색인해 둬요: 핵심포인트 key = "<장>-<번호>", 문제 id = "<key>-<순번>" → QI[id]
import { ORDER } from "./meta.js";

const cache = new Map(); // 장 id → Promise<장>
export const QI = {}; // 문제 id → { q, o, a, x, id, ch, s, pt }
export const QS_BY = {}; // 장 id → [문제…]

function indexChapter(c) {
  const id = `s${c.s}c${c.c}`;
  c.id = id;
  const qs = [];
  c.sec.forEach((s) => s.p.forEach((p) => {
    p.key = `${id}-${p.n}`;
    // q.k: 다른 카드로 옮겨진 문제는 예전 id 를 그대로 써요 (저장된 정답·오답 기록이 같은 문제에 붙어 있게)
    p.q.forEach((q, i) => { const o = { ...q, id: q.k || `${p.key}-${i}`, ch: id, s: c.s, pt: p }; qs.push(o); QI[o.id] = o; });
  }));
  QS_BY[id] = qs;
  return c;
}

export function chapter(id) {
  if (!ORDER.includes(id)) return Promise.reject(new Error("없는 장이에요: " + id));
  if (!cache.has(id)) {
    const p = fetch(`/cim/${id}.json`).then((r) => { if (!r.ok) throw new Error(`/cim/${id}.json ${r.status}`); return r.json(); }).then(indexChapter);
    p.catch(() => cache.delete(id));
    cache.set(id, p);
  }
  return cache.get(id);
}
export const loaded = (id) => !!QS_BY[id];

// 여러 장 (모의고사 · 섞어 풀기 · 오답) — 동시에 4개씩, 하나 받을 때마다 onStep(받은 수, 전체)
export async function chapters(ids, onStep) {
  const list = [...new Set(ids)];
  let n = 0;
  const one = async (id) => { await chapter(id); onStep?.(++n, list.length); };
  const q = list.slice();
  await Promise.all(Array.from({ length: Math.min(4, q.length) }, async () => { while (q.length) await one(q.shift()); }));
  return list;
}
