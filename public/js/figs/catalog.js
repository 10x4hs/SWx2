// 설명 그림 목록 — public/figs/map.json 하나로 (서버의 AI 튜터도 같은 파일을 읽어서 "그림 1-6" 이라고 말해요)
//   figs: 그림 id → { title, about } · videos: 영상 key → { id, title, channel, lang, length, start, why } · place: "과정/모듈/카드" → [{ fig?, video?, after, opts? }]
//   after: 숫자 = 그 '생각' 문단 뒤 · "lead" = 핵심 문장 뒤 · "steps" = 흐름 칸 뒤 · "code" = 코드 뒤 · "end" = 떠올리기 앞
import { esc } from "../util.js";
import { getJSON, COURSES } from "../dev/data.js";
import { videoMarkup } from "./player.js";

export const loadMap = () => getJSON("/figs/map.json");

// 한 모듈의 그림 자리 — 카드 순서대로 번호를 매겨요: "그림 <장>-<n>" (영상만 있는 자리는 번호 없음)
export function moduleFigs(map, course, mod) {
  const out = []; let k = 0;
  for (const c of mod.cards || []) {
    for (const p of map.place?.[`${course}/${mod.id}/${c.id}`] || []) {
      const f = p.fig ? map.figs?.[p.fig] : null;
      if (p.fig && !f) continue;
      out.push({ ...p, card: c.id, cardTitle: c.title, no: f ? `${Number(mod.no)}-${++k}` : null, title: f?.title || "", about: f?.about || "", video: p.video && map.videos?.[p.video] ? { ...map.videos[p.video], key: p.video } : null });
    }
  }
  return out;
}
export async function figCount(course) {
  const [map, idx] = await Promise.all([loadMap(), getJSON(`${COURSES[course].dir}/index.json`)]);
  return idx.modules.reduce((n, m) => n + moduleFigs(map, course, m).filter((x) => x.fig).length, 0);
}
// 그림 자리 HTML (그려지기 전엔 같은 높이의 빈 칸) — 영상만이면 영상 칸
export function slotHtml(p, o = {}) {
  if (!p.fig) return p.video ? videoMarkup(p.video) : "";
  return `<div class="fig-slot${o.compact ? " compact" : ""}" data-fig="${esc(p.fig)}" data-no="${esc(p.no || "")}" data-title="${esc(p.title || "")}" data-opts="${esc(JSON.stringify(p.opts || {}))}"${o.key ? ` data-key="${esc(o.key)}"` : ""}${p.video ? ` data-video="${esc(JSON.stringify(p.video))}"` : ""}${o.compact ? ' data-compact="1"' : ""}><div class="fig-ph"><span>그림 ${esc(p.no || "")}</span>${esc(p.title || "")}</div></div>`;
}
// 튜터가 부를 그림 하나씩 (id → 자리): 이 카드에 있는 자리 > 옵션 없는 기본 자리 > 처음 자리 — 서버(src/mba.js figsOfModule)와 같은 규칙
export function figRefs(figs, cardId) {
  const m = new Map(), rank = (p) => (p.card === cardId ? 0 : Object.keys(p.opts || {}).length ? 2 : 1);
  for (const p of figs) if (p.fig && (!m.has(p.fig) || rank(p) < rank(m.get(p.fig)))) m.set(p.fig, p);
  return m;
}
// AI 튜터 답 안의 [[그림:id]] → 그림 칩 (다 받은 뒤 진짜 그림으로 바꿔요)
//   md.js 가 [[…]] 를 위키링크(<a class="wikilink">)로 바꿔 두므로 둘 다 찾아요
export function figTokens(html, byId) {
  return html.replace(/<a class="wikilink" href="#" data-wikilink="\s*그림\s*:\s*([a-z0-9-]+)\s*">[^<]*<\/a>|\[\[\s*그림\s*:\s*([a-z0-9-]+)\s*\]\]/g, (m, a, b) => {
    const id = a || b, p = byId.get(id); if (!p) return "";
    return `<span class="fig-chip" data-figref="${esc(id)}">그림 ${esc(p.no || "")} · ${esc(p.title || "")}</span>`;
  });
}
