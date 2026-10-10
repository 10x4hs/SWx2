// AI 공부책 검사: node scripts/books/check-books.mjs [book ...]   (규격 BOOK_SPEC.md 의 기계로 볼 수 있는 부분만)
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../public/books/", import.meta.url));
const files = readdirSync(ROOT).filter((f) => f.endsWith(".json") && f !== "index.json");
const ids = process.argv.slice(2).length ? process.argv.slice(2) : files.map((f) => f.replace(/\.json$/, ""));
const FIG = new Set(["figure", "compare", "flow", "grids", "bars", "scale", "steps", "scene", "play", "widget"]);
const BLOCKS = new Set([...FIG, "p", "analogy", "callout", "quiz", "code", "deep", "formula"]);
const DEEP_IN = new Set(["p", "formula", "code", "callout", "bars", "steps", "grids", "flow", "compare", "widget", "scale"]);
const WIDGETS = new Set(["bpe", "temperature", "attention", "loss", "cost", "memory", "scaling"]);
const TONES = new Set(["a", "b", "c", "d", "n", undefined]);
const COLORS = new Set(["rose", "violet", "blue", "teal", "green", "amber", "sand"]);
const ID = /^[a-z0-9][a-z0-9-]{0,40}$/;
let bad = 0;

function checkPlay(b, at, err) {
  if (!(b.rows?.length >= 1 && b.rows.length <= 4)) err.push(`${at} rows 1~4`);
  if (!(b.steps?.length >= 2 && b.steps.length <= 8)) err.push(`${at} 단계 2~8`);
  const ids = new Set(), rows = new Set((b.rows || []).map((r) => r.id));
  const item = (x, w) => { if (!x.id) err.push(`${w} id 없음`); ids.add(x.id); if (x.v != null && !(+x.v >= 0 && +x.v <= 1)) err.push(`${w} v 는 0~1`); if (!TONES.has(x.tone)) err.push(`${w} tone ${x.tone}`); };
  (b.rows || []).forEach((r) => { if (!r.id) err.push(`${at} row id 없음`); (r.items || []).forEach((x) => item(x, `${at} ${r.id}`)); });
  (b.steps || []).forEach((st, k) => {
    const w = `${at} ${k + 1}단계`;
    if (!st.text) err.push(`${w} 글 없음`);
    (st.add || []).forEach((x) => { if (x.row && !rows.has(x.row)) err.push(`${w} 없는 row ${x.row}`); item(x, w); });
    [...(st.remove || []), ...(st.hi || []), ...(st.set || []).map((x) => x.id), ...(st.link || []).flatMap((l) => [l.from, l.to])].forEach((id) => { if (!ids.has(id)) err.push(`${w} 없는 id ${id}`); });
    (st.link || []).forEach((l) => { if (l.w != null && !(+l.w >= 0 && +l.w <= 1)) err.push(`${w} link w 는 0~1`); });
  });
}
function checkBlock(b, at, err, warn, n, inDeep = false) {
  if (!BLOCKS.has(b.t)) { err.push(`${at} 모르는 블록`); return; }
  if (inDeep && !DEEP_IN.has(b.t)) err.push(`${at} deep 안에 못 넣는 블록`);
  if (FIG.has(b.t)) n.fig++;
  if (b.t === "p") { if (!b.text) err.push(`${at} 빈 문단`); else if (b.text.length > 420) warn.push(`${at} 문단 ${b.text.length}자`); }
  else if (b.t === "compare") { if (!(b.items?.length >= 2 && b.items.length <= 3)) err.push(`${at} 항목 2~3개`); }
  else if (b.t === "flow") { const st = b.rows ? b.rows.flat() : b.steps; if (!st?.length) err.push(`${at} 단계 없음`); }
  else if (b.t === "grids") { n.num++; if (!b.items?.length) err.push(`${at} 격자 없음`); }
  else if (b.t === "bars") { n.num++; if (!b.items?.every((x) => Number.isFinite(+x.value))) err.push(`${at} 숫자 아님`); if (!b.note) warn.push(`${at} 출처 note 없음`); }
  else if (b.t === "scale") { if (!b.items?.every((x) => +x.value >= 0 && +x.value <= 1)) err.push(`${at} 값은 0~1`); }
  else if (b.t === "steps") { if (!b.items?.length) err.push(`${at} 항목 없음`); }
  else if (b.t === "scene") { n.play++; if (!(b.steps?.length >= 2 && b.steps.length <= 8)) err.push(`${at} 단계 2~8개`); }
  else if (b.t === "play") { n.play++; checkPlay(b, at, err); }
  else if (b.t === "widget") { n.num++; if (!WIDGETS.has(b.kind)) err.push(`${at} 모르는 widget ${b.kind}`); }
  else if (b.t === "quiz") { n.quiz++; if (!(b.choices?.length >= 2) || !(b.answer >= 0 && b.answer < b.choices.length) || !b.why) err.push(`${at} 퀴즈 모양`); }
  else if (b.t === "code") { if (!b.code) err.push(`${at} 코드 없음`); }
  else if (b.t === "formula") { if (!b.text) err.push(`${at} 수식 없음`); }
  else if (b.t === "deep") { n.deep++; if (!Array.isArray(b.body) || !b.body.length) err.push(`${at} deep 비었음`); else b.body.forEach((x, j) => checkBlock(x, `${at}-${j + 1} ${x.t}`, err, warn, n, true)); }
  else if (b.t === "analogy" || b.t === "callout") { if (!b.text) err.push(`${at} 내용 없음`); if (b.t === "callout" && b.kind === "key") n.key++; }
  else if (b.t === "figure") { if (!b.src) err.push(`${at} src 없음`); }
}

for (const id of ids) {
  const f = `${ROOT}${id}.json`;
  if (!existsSync(f)) { console.log(`✖ ${id}: 파일 없음`); bad++; continue; }
  const err = [], warn = [];
  let d;
  try { d = JSON.parse(readFileSync(f, "utf8")); } catch (e) { console.log(`✖ ${id}: JSON 오류 ${e.message}`); bad++; continue; }
  if (d.id !== id || !ID.test(id)) err.push(`id 가 ${d.id}`);
  for (const k of ["title", "short", "headline", "lead", "why", "chapters"]) if (!d[k]) err.push(`${k} 없음`);
  if (!COLORS.has(d.color)) err.push(`color ${d.color}`);
  const C = d.chapters || [];
  if (C.length < 3 || C.length > 8) err.push(`장 ${C.length}개 (3~8)`);
  const seen = new Set();
  let tq = 0;
  C.forEach((c, i) => {
    const w = `${i + 1}장(${c.id})`;
    if (!ID.test(c.id || "")) err.push(`${w} id 모양`); if (seen.has(c.id)) err.push(`${w} id 중복`); seen.add(c.id);
    for (const k of ["title", "sections", "recap", "jarvis", "words"]) if (!c[k]) err.push(`${w} ${k} 없음`);
    if (c.week != null && !(c.week >= 1 && c.week <= 4)) err.push(`${w} week 1~4`);
    const S = c.sections || [];
    if (S.length < 4 || S.length > 7) err.push(`${w} 섹션 ${S.length}개 (4~7)`);
    const n = { fig: 0, num: 0, play: 0, quiz: 0, deep: 0, key: 0 };
    S.forEach((s, j) => { if (!s.title) err.push(`${w} ${j + 1}절 제목 없음`); if (!Array.isArray(s.body) || !s.body.length) { err.push(`${w} ${j + 1}절 body 없음`); return; } s.body.forEach((b, k) => checkBlock(b, `${w} ${j + 1}-${k + 1} ${b.t}`, err, warn, n)); });
    if (n.quiz < 3) err.push(`${w} 퀴즈 ${n.quiz}개 (≥3)`);
    if (n.play < 1) err.push(`${w} play/scene 없음`);
    if (n.deep < 1) err.push(`${w} deep 없음`);
    if (n.num < 1) warn.push(`${w} widget/bars/grids 없음`);
    if (n.key < 1) warn.push(`${w} callout key(한 줄 정리) 없음`);
    if (!(c.recap?.points?.length >= 3 && c.recap.points.length <= 5)) err.push(`${w} recap.points 3~5`);
    if (!(c.words?.length >= 5 && c.words.length <= 12)) warn.push(`${w} 낱말 ${c.words?.length || 0}개 (5~12)`);
    (c.words || []).forEach((x) => { if (!x.term || !x.easy) err.push(`${w} 낱말 모양`); });
    if (c.build && !(c.build.steps?.length >= 1)) err.push(`${w} build steps 없음`);
    tq += n.quiz;
  });
  const ok = !err.length;
  if (!ok) bad++;
  console.log(`${ok ? "✓" : "✖"} ${id}: 장 ${C.length} · 퀴즈 ${tq}${err.length ? "\n   오류: " + err.join(" | ") : ""}${warn.length ? "\n   참고: " + warn.join(" | ") : ""}`);
}
console.log(`\n${ids.length - bad}/${ids.length} 통과`);
process.exit(bad ? 1 : 0);
