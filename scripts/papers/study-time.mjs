// 논문마다 공부 예상 시간 재기 → public/papers/study-time.json
//   node scripts/papers/study-time.mjs
// 실제 분량(글자 수 · 그림 · 장면 단계 · 퀴즈)을 세고, 아래 속도로 시간을 계산해요. 내용을 고치면 다시 돌려요 (배포 때 자동).
//
// 읽기 속도 근거
//   - 한국어 젊은 성인 묵독: 평균 약 202 어절/분 (≈ 600 음절/분, 쉬운 문장 기준) — 한국어 읽기 속도 측정 앱 연구 (KCI ART002099342)
//   - 영어 성인 비소설 묵독 평균 238 wpm, 공부하며 읽기는 그보다 느림 — Brysbaert 2019 메타분석 (190개 연구)
//   - 그래서 '이해하며 공부하는' 속도를 쉬운 글 300자/분, 요약 250자/분, 전문 해설 200자/분으로 잡았어요 (공백 · 기호 빼고 센 글자).
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../public/papers/", import.meta.url));
const RATE = { easy: 300, page: 250, deep: 200 }; // 글자/분
const SEC = { figure: 45, figtr: 0, sceneStep: 15, grids: 30, bars: 15, quiz: 45, pretest: 60, recall: 240, explain: 480 };
const read = (f) => JSON.parse(readFileSync(ROOT + f, "utf8"));
// 화면에 보이는 글만 세요 (키 이름 · 색 · 파일 이름 · 숫자 · 공백은 빼요)
const SKIP = new Set(["t", "src", "tone", "kind", "id", "icon", "bg", "youtube", "lang", "anchor", "href", "page", "commits", "w", "h", "x", "y", "x2", "y2", "s", "answer", "hi", "max", "ground"]);
function textOf(o) {
  if (typeof o === "string") return o;
  if (Array.isArray(o)) return o.map(textOf).join(" ");
  if (o && typeof o === "object") return Object.entries(o).filter(([k]) => !SKIP.has(k)).map(([, v]) => textOf(v)).join(" ");
  return "";
}
const chars = (o) => textOf(o).replace(/\*\*|\{[abc]:|\}/g, "").replace(/[\s.,·:;!?"'()\[\]→←\-–—/0-9%]/g, "").length;

const idx = read("index.json"), out = {};
for (const p of idx.papers) {
  const id = p.id, easy = read(`content/${id}.easy.json`), page = read(`content/${id}.json`), deep = read(`content/${id}.deep.json`);
  let figtr = {}; try { figtr = read(`content/${id}.figtr.json`); } catch {}
  const blocks = easy.sections.flatMap((s) => s.body), n = (t) => blocks.filter((b) => b.t === t).length;
  const easyFigs = blocks.filter((b) => b.t === "figure").map((b) => b.src), steps = blocks.filter((b) => b.t === "scene").reduce((a, b) => a + (b.steps?.length || 0), 0);
  const trChars = (srcs) => srcs.reduce((a, s) => a + (figtr[s] ? chars({ t: figtr[s].title, c: figtr[s].caption }) : 0), 0);
  // 쉽게 읽기: 본문 + 그림(번역 상자 포함) + 장면 단계 + 격자 · 막대 + 퀴즈 + 짐작 + 책 덮고 말하기
  const easyText = chars(easy) + trChars(easyFigs);
  const easyMin = easyText / RATE.easy + (easyFigs.length * SEC.figure + steps * SEC.sceneStep + n("grids") * SEC.grids + n("bars") * SEC.bars + n("quiz") * SEC.quiz + SEC.pretest + SEC.recall) / 60;
  // 공부 페이지: 요약 글 + 원문 그림 + 퀴즈 5문제 + 3분 설명 쓰고 채점받기 (영상 · 자세히 읽기 빼고)
  const pageFigs = (page.figures || []).map((f) => f.src);
  const pageText = chars({ a: page.one_line, b: page.analogy, c: page.problem, d: page.idea, e: page.results, f: page.pipeline_role, g: page.caveats, h: page.glossary, i: page.figures }) + trChars(pageFigs);
  const pageMin = pageText / RATE.page + (pageFigs.length * SEC.figure + (page.quiz?.length || 0) * SEC.quiz + SEC.explain) / 60;
  // 자세히 읽기: 전문 해설 전부
  const deepText = chars(deep), deepMin = deepText / RATE.deep;
  const r = (m) => Math.max(5, Math.round(m));
  out[id] = { easy: r(easyMin), page: r(pageMin), deep: r(deepMin), total: r(easyMin) + r(pageMin) + r(deepMin),
    measured: { easy_chars: easyText, page_chars: pageText, deep_chars: deepText, figures: easyFigs.length, scene_steps: steps, quizzes: n("quiz") } };
}
writeFileSync(ROOT + "study-time.json", JSON.stringify({
  method: `글자 수를 세서 이해하며 읽는 속도(쉽게 읽기 ${RATE.easy}자/분 · 공부 페이지 ${RATE.page}자/분 · 자세히 읽기 ${RATE.deep}자/분)로 나누고, 그림 ${SEC.figure}초 · 장면 한 단계 ${SEC.sceneStep}초 · 퀴즈 ${SEC.quiz}초 · 책 덮고 말하기 ${SEC.recall / 60}분 · 3분 설명 쓰기 ${SEC.explain / 60}분을 더했어요. 근거: 한국어 성인 묵독 약 202어절/분(쉬운 문장), Brysbaert 2019 메타분석(비소설 238 wpm) — 공부하며 읽기는 이보다 느려요.`,
  measured_at: new Date().toISOString().slice(0, 10), papers: out,
}, null, 1) + "\n");
const tot = Object.values(out).reduce((a, x) => a + x.total, 0);
console.log(Object.entries(out).map(([k, v]) => `${k.padEnd(12)} 쉽게 ${String(v.easy).padStart(3)} · 공부 ${String(v.page).padStart(3)} · 자세히 ${String(v.deep).padStart(3)} = ${v.total}분`).join("\n") + `\n합계 ${tot}분 (${(tot / 60).toFixed(1)}시간)`);
