// Silicon Valley Mafia 내용 — 파일 다섯을 합쳐요 (규격: src/svm/CONTENT_SPEC.md · 점검: node scripts/svm-check.mjs)
//   public/ 에 두지 않고 서버 번들에 넣어요: 주소만 알면 누구나 받을 수 있는 정적 파일이 되면 안 돼서 (관리자 전용)
import core from "./data/core.json";
import gray from "./data/gray.json";
import lineage from "./data/lineage.json";
import media from "./data/media.json";
import guide from "./data/guide.json";

// 서재의 네 권 — 권마다 색 하나 · 표지 선화(art: rings 문 · grid 형식 · mirror 거울 · tree 계보) · 한 줄 소개 · 권 소개
const SECTIONS = [
  { id: "intro", no: "01", name: "입문", color: "lime", art: "rings", blurb: "야빈 사상으로 들어가는 두 개의 문", about: "야빈이 직접 쓴 두 개의 입문 연재. 민주주의 · 대성당 · 레드필 같은 말이 처음 나온다. 여기서 시작하면 나머지가 쉽다." },
  { id: "core", no: "02", name: "핵심 개념", color: "blue", art: "grid", blurb: "형식주의 · 패치워크 · 보편주의 — 그가 만든 말들", about: "2007~2013년 블로그 『Unqualified Reservations』에서 만든 말들. 국가를 회사로 보는 눈과, 진보주의를 종교로 보는 눈이 여기서 나온다." },
  { id: "gray", no: "03", name: "Gray Mirror", color: "silver", art: "mirror", blurb: "2020년대 — 대성당, 나비 혁명, 트럼프 2기", about: "2020년부터 쓰는 서브스택 『Gray Mirror』. 짧아진 대성당 정의, 'CEO 대통령' 상상, 트럼프 2기 평가, 앤드리슨과의 논쟁." },
  { id: "lineage", no: "04", name: "계보", color: "green", art: "tree", blurb: "틸 · 랜드 · 발라지 · 앤드리슨 — 생각을 옮긴 글", about: "야빈의 생각을 받아 실리콘밸리로 옮긴 네 사람의 글. 정치 밖으로의 탈출, 어두운 계몽, 네트워크 국가, 기술낙관주의." },
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
  questions: list(guide.questions), // 서재의 '무엇이 궁금하세요?' — 질문 → 답이 있는 장들 (to: "counter" = 비판 모아 보기)
};
export const essayOf = (id) => essays.find((e) => e.id === id) || null;
