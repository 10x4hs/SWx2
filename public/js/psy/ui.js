// Psychology 화면 조각 — 카드 한 장(LEARN), 점 지도, 카드 링크
import { esc } from "../util.js";
import { data, trackOf, bookOf, videosFor, booksFor } from "./data.js";
import { box, known, isDue } from "./store.js";

export const link = (id) => { const c = data().byId[id]; return c ? `<a class="ps-chip" href="#/psy/c/${esc(id)}">${esc(c.ko)}</a>` : ""; };
export const links = (ids) => (ids || []).map(link).filter(Boolean).join("");
// 예시 대화: "누구: 말" 줄마다 · '나:' 줄은 강조
export const dialog = (t) => String(t || "").split("\n").filter(Boolean).map((l) => `<span${/^\s*나\s*[:(]/.test(l) ? ' class="ps-me"' : ""}>${esc(l)}</span>`).join("");
// 점 지도 — 한 점 = 한 장 · 익힘 = 보라 · 복습할 때 = 깜빡
export const dots = (ids) => ids.map((id) => `<i class="ps-dot${known(id) ? " on" : box(id) >= 0 ? " seen" : ""}${isDue(id) ? " due" : ""}" title="${esc(data().byId[id]?.ko || "")}"></i>`).join("");
const MAS = ["NEW", "BOX 0", "BOX 1", "BOX 2", "KNOWN 3", "KNOWN 4", "KNOWN 5"];
export const mastery = (id) => MAS[box(id) + 1];

export function cardHTML(c, { rate = true } = {}) {
  const t = trackOf(c.track), vids = videosFor(c), books = c.book ? [bookOf(c.book)].filter(Boolean) : booksFor(c);
  const sec = (k, v) => (v ? `<div><b class="ps-k">${k}</b><p>${esc(v)}</p></div>` : "");
  return `<article class="ps-card">
    <section class="ps-card-main">
      <span class="ps-k ps-acc">${esc(c.en)}${c.evidence ? ` · ${esc(c.evidence)}` : ""}</span>
      <h1>${esc(c.ko)}</h1>
      <p class="ps-line">${esc(c.line)}</p>
      ${c.example ? `<div class="ps-ex"><span class="ps-k">EXAMPLE</span>${dialog(c.example)}</div>` : ""}
    </section>
    <aside class="ps-card-side">
      ${sec("WHY", c.why)}${sec("USE", c.use)}${sec("COUNTER", c.counter)}
      ${c.note ? `<p class="ps-note">${esc(c.note)}</p>` : ""}
      <p class="ps-src ps-mono">${c.source?.url ? `<a href="${esc(c.source.url)}" target="_blank" rel="noopener">${esc(c.source.cite)}</a>` : esc(c.source?.cite || "")}${t ? ` · <a href="#/psy/t/${esc(t.id)}">${esc(t.no)} ${esc(t.ko)}</a>` : ""}</p>
      ${c.related?.length ? `<div><b class="ps-k">RELATED</b><p class="ps-chips">${links(c.related)}</p></div>` : ""}
      ${vids.length ? `<div><b class="ps-k">▶ VIDEO ${vids.length}</b><p class="ps-chips">${vids.map((v) => `<a class="ps-chip" href="#/psy/v/${esc(v.id)}">${esc(v.title)}</a>`).join("")}</p></div>` : ""}
      ${books.length ? `<div><b class="ps-k">서재</b><p class="ps-chips">${books.map((b) => `<a class="ps-chip" href="#/psy/library/${esc(b.id)}">${esc(b.ko)}</a>`).join("")}</p></div>` : ""}
    </aside>
  </article>
  ${rate ? `<footer class="ps-rate">
    <button type="button" data-rate="1">몰랐어 <i>1</i></button>
    <button type="button" data-rate="2">헷갈려 <i>2</i></button>
    <button type="button" class="ps-primary" data-rate="3">알아 <i>3</i></button>
  </footer>` : ""}`;
}
// 섞기 · 퀴즈 보기 만들기 (같은 분야 먼저, 모자라면 이웃 분야)
export const shuffle = (a) => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
export function quizFor(c) {
  const D = data(), ti = D.tracks.findIndex((t) => t.id === c.track);
  const near = [D.tracks[ti], D.tracks[ti - 1], D.tracks[ti + 1], ...D.tracks].filter((t) => t && t.id !== "library");
  const pool = [];
  for (const t of near) for (const id of shuffle(t.order)) if (id !== c.id && !pool.includes(id) && D.byId[id].ko !== c.ko) pool.push(id);
  return shuffle([c.id, ...pool.slice(0, 3)]);
}
export const quizable = () => data().cards.filter((c) => c.track !== "library" && c.example);
