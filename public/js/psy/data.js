// Psychology 내용 — public/psy/*.json (없으면 임시 데이터 fixture.js)
//   D.tracks · D.cards · D.byId · D.books · D.videos · D.scenarios
import { FIXTURE } from "./fixture.js";

let D = null, P = null;
export const data = () => D;
const get = async (name) => { try { const r = await fetch(`/psy/${name}.json`, { credentials: "same-origin" }); if (!r.ok) throw 0; return await r.json(); } catch { return FIXTURE[name]; } };

export function load() {
  if (D) return Promise.resolve(D);
  return (P ||= (async () => {
    const [cards, books, videos, spar] = await Promise.all(["cards", "books", "videos", "spar"].map(get));
    const byId = Object.create(null);
    for (const c of cards.cards || []) byId[c.id] = c;
    const tracks = (cards.tracks || []).map((t) => ({ ...t, order: (t.order?.length ? t.order : (cards.cards || []).filter((c) => c.track === t.id).map((c) => c.id)).filter((id) => byId[id]) }));
    const vById = Object.create(null);
    for (const v of videos.videos || []) vById[v.id] = v;
    D = { tracks, cards: cards.cards || [], byId, books: books.books || [], videos: videos.videos || [], vById, scenarios: spar.scenarios || [], fixture: cards === FIXTURE.cards };
    return D;
  })().finally(() => { P = null; }));
}
// 공부 순서 (서재 제외) — 새 카드는 이 순서로 나와요
export const studyOrder = () => D.tracks.filter((t) => t.id !== "library").flatMap((t) => t.order);
export const trackOf = (id) => D.tracks.find((t) => t.id === id);
export const bookOf = (id) => D.books.find((b) => b.id === id);
// 이 카드를 다루는 영상 (카드의 videos + 영상의 covers)
export const videosFor = (c) => { const s = new Set(c.videos || []); for (const v of D.videos) if (v.covers?.includes(c.id)) s.add(v.id); return [...s].map((id) => D.vById[id]).filter(Boolean); };
export const booksFor = (c) => D.books.filter((b) => b.cards?.some((id) => id === c.id || D.byId[id]?.related?.includes(c.id)));
