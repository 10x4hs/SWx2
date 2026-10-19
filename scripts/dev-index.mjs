// SW 공간 과정의 모듈 목록 만들기 — 과정: dev(개발 흐름, 기본) · vg(Vector & Graph)
//   node scripts/dev-index.mjs [vg]          public/<과정>/index.json 을 새로 써요 (모듈 파일의 소개 · 카드 · 사례 · 문제 · 강의 목록)
//   node scripts/dev-index.mjs [vg] --check  모듈 파일 규칙 검사 + 목록이 낡았으면 실패 (npm test 가 불러요)
// 규칙: 모듈마다 카드 20장(하루 4장 × 5일) · 사례 2 · 회의실 문제 15 (보기 중 정답 하나) · 강의 3~6 (https) · 출처가 붙은 카드
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ARGS = process.argv.slice(2), COURSE = ARGS.includes("vg") ? "vg" : "dev", CHECK = ARGS.includes("--check");
const DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "public", COURSE);
const ORDERS = {
  dev: ["company", "mvp", "requirements", "ux", "architecture", "data", "security", "planning", "repo", "release", "ops", "lead"],
  vg: ["vg-embeddings", "vg-ann-index", "vg-vector-db", "vg-hybrid-search", "vg-rag", "vg-graph-model", "vg-kg-algo", "vg-graphrag"],
};
export const ORDER = ORDERS[COURSE];
const ID = /^[a-z0-9][a-z0-9-]{0,40}$/;

const problems = [];
const modules = ORDER.map((id, i) => {
  const f = join(DIR, `${id}.json`), no = String(i + 1).padStart(2, "0");
  if (!existsSync(f)) { problems.push(`${id}.json 이 없어요`); return { id, no, title: id, short: id, q: "", sub: "", doc: "", goals: [], story: { title: "", size: 0 }, cards: [], cases: [], problems: [], lectures: [] }; }
  const d = JSON.parse(readFileSync(f, "utf8"));
  const bad = (m) => problems.push(`${id}: ${m}`);
  if (d.id !== id) bad(`id 가 ${d.id}`);
  if (d.no !== no) bad(`no 가 ${d.no} (${no} 이어야 해요)`);
  for (const k of ["title", "short", "q", "sub", "doc"]) if (!d[k]) bad(`${k} 이 비었어요`);
  if (!d.story?.title || !Array.isArray(d.story.body) || !d.story.body.length) bad("story");
  const seen = new Set(), uniq = (x, w) => { if (!ID.test(x || "") || seen.has(x)) bad(`${w} id ${x}`); seen.add(x); };
  const cards = d.cards || [];
  if (cards.length !== 20) bad(`카드 ${cards.length}장 (20장이어야 해요)`);
  cards.forEach((c, j) => {
    uniq(c.id, "카드");
    if (c.id === "case" || c.id === "practice" || c.id === "docs") bad(`카드 id ${c.id} 는 주소에 써요`);
    if (c.day !== Math.floor(j / 4) + 1) bad(`${c.id}: day ${c.day} (하루 4장 순서)`);
    if (!c.title || !c.lead || !Array.isArray(c.idea) || !c.idea.length || !c.recall?.q) bad(`${c.id}: title · lead · idea · recall`);
    if (!Array.isArray(c.sources) || !c.sources.length || c.sources.some((s) => !s.title)) bad(`${c.id}: 출처`);
    for (const q of c.quiz || []) if (!Array.isArray(q.options) || !(q.answer >= 0 && q.answer < q.options.length)) bad(`${c.id}: 퀴즈 답 번호`);
    if (c.code && (typeof c.code.text !== "string" || c.code.text.split("\n").length > 8 || !c.code.read)) bad(`${c.id}: 코드는 8줄 이하 + 읽는 법`);
  });
  if ((d.cases || []).length !== 2) bad(`사례 ${(d.cases || []).length}개 (2개)`);
  for (const k of d.cases || []) { uniq(k.id, "사례"); if (!k.sources?.length || !k.timeline?.length || !k.questions?.length) bad(`${k.id}: 출처 · 타임라인 · 질문`); }
  if ((d.problems || []).length !== 15) bad(`문제 ${(d.problems || []).length}개 (15개)`);
  for (const p of d.problems || []) {
    uniq(p.id, "문제");
    if (!(p.day >= 1 && p.day <= 5)) bad(`${p.id}: day`);
    if (!Array.isArray(p.options) || p.options.filter((o) => o.ok).length !== 1) bad(`${p.id}: 정답은 하나`);
  }
  const lec = d.lectures || [];
  if (lec.length < 3 || lec.length > 6) bad(`강의 ${lec.length}개 (3~6)`);
  for (const l of lec) { uniq(l.id, "강의"); if (!/^https:\/\//.test(l.url || "")) bad(`${l.id}: 강의 주소`); }
  return {
    id, no, title: d.title, short: d.short, q: d.q, sub: d.sub, doc: d.doc, goals: d.goals || [],
    story: { title: d.story?.title || "", size: d.story?.size || 0 },
    cards: cards.map((c) => ({ id: c.id, title: c.title, day: c.day })),
    cases: (d.cases || []).map((k) => ({ id: k.id, title: k.title, day: k.day })),
    problems: (d.problems || []).map((p) => ({ id: p.id, title: p.title, day: p.day, mixed: !!p.mixed })),
    lectures: lec.map((l) => ({ id: l.id, title: l.title, url: l.url, min: l.min, day: l.day, lang: l.lang || "" })),
  };
});
const out = JSON.stringify({ version: 1, note: "node scripts/dev-index.mjs 가 모듈 파일에서 만들어요. 손으로 고치지 마세요.", modules }, null, 2) + "\n";
const file = join(DIR, "index.json"), sum = (k) => modules.reduce((n, m) => n + m[k].length, 0);
const line = `${COURSE} 모듈 ${modules.length}개 · 카드 ${sum("cards")}장 · 사례 ${sum("cases")} · 문제 ${sum("problems")} · 강의 ${sum("lectures")}`;
if (CHECK) {
  if (problems.length) { console.error(`${COURSE} 모듈 파일 문제:`+"\n  " + problems.join("\n  ")); process.exit(1); }
  if (!existsSync(file) || readFileSync(file, "utf8") !== out) { console.error(`public/${COURSE}/index.json 이 낡았어요 → node scripts/dev-index.mjs${COURSE === "dev" ? "" : " " + COURSE}`); process.exit(1); }
  console.log(line);
} else {
  if (problems.length) console.warn("주의:\n  " + problems.join("\n  "));
  writeFileSync(file, out);
  console.log("index.json 썼어요 — " + line);
}
