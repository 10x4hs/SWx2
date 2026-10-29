// Silicon Valley Mafia 내용 — 파일 넷을 합쳐요 (규격: src/svm/CONTENT_SPEC.md · 점검: node scripts/svm-check.mjs)
//   public/ 에 두지 않고 서버 번들에 넣어요: 주소만 알면 누구나 받을 수 있는 정적 파일이 되면 안 돼서 (관리자 전용)
import core from "./data/core.json";
import gray from "./data/gray.json";
import lineage from "./data/lineage.json";
import media from "./data/media.json";

const SECTIONS = [
  { id: "intro", no: "01", name: "입문" },
  { id: "core", no: "02", name: "핵심 개념" },
  { id: "gray", no: "03", name: "최근 Gray Mirror" },
  { id: "lineage", no: "04", name: "계보" },
];
const list = (x) => (Array.isArray(x) ? x : []);
const essays = [...list(core.essays), ...list(gray.essays), ...list(lineage.essays)].sort((a, b) => a.no - b.no);

export const DATA = {
  sections: SECTIONS,
  essays,
  concepts: list(core.concepts),
  people: list(lineage.people),
  edges: list(lineage.edges),
  videos: list(media.videos),
  more: list(media.more),
};
export const essayOf = (id) => essays.find((e) => e.id === id) || null;
