// 논문 자료 점검: node scripts/papers/check.mjs — 16편 JSON 모양 · 그림 파일 · SVG 규칙
import { readFileSync, existsSync, statSync } from "node:fs";
const idx = JSON.parse(readFileSync("public/papers/index.json", "utf8"));
let bad = 0;
const err = (id, m) => { bad++; console.log(`✖ ${id}: ${m}`); };
for (const p of idx.papers) {
  const f = `public/papers/content/${p.id}.json`;
  if (!existsSync(f)) { err(p.id, "JSON 없음"); continue; }
  let c; try { c = JSON.parse(readFileSync(f, "utf8")); } catch (e) { err(p.id, "JSON 깨짐 " + e.message); continue; }
  for (const k of ["id", "title", "one_line", "analogy", "problem", "idea", "diagram", "figures", "results", "pipeline_role", "caveats", "script_3min", "keywords_3min", "quiz", "glossary", "videos", "links"]) if (c[k] == null) err(p.id, "빠진 칸 " + k);
  if (c.id !== p.id) err(p.id, "id 불일치 " + c.id);
  if ((c.quiz || []).length !== 5) err(p.id, "퀴즈 " + (c.quiz || []).length + "개");
  (c.quiz || []).forEach((q, i) => { if (!Array.isArray(q.choices) || q.choices.length !== 4 || !(q.answer >= 0 && q.answer < 4) || !q.why) err(p.id, `퀴즈 ${i + 1} 모양`); });
  for (const x of c.figures || []) { const fp = `public/papers/fig/${p.id}/${x.src}`; if (!existsSync(fp)) err(p.id, "그림 없음 " + x.src); else if (statSync(fp).size > 420e3) err(p.id, "그림 큼 " + x.src); }
  const dg = `public/papers/fig/${p.id}/${c.diagram?.src}`;
  if (!existsSync(dg)) err(p.id, "diagram 없음");
  else { const s = readFileSync(dg, "utf8"); if (/<script|foreignObject|<image|style=|font-family=|stroke="|fill="(?!none")/.test(s)) err(p.id, "SVG 규칙 위반"); }
  for (const v of c.videos || []) if (!/^[\w-]{11}$/.test(v.youtube || "")) err(p.id, "영상 id " + v.youtube);
  const n = (c.script_3min || "").length; if (n < 500 || n > 1200) err(p.id, "대본 " + n + "자");
  console.log(`✓ ${p.id.padEnd(12)} 아이디어 ${c.idea.length} · 그림 ${c.figures.length}+1 · 결과 ${c.results.length} · 영상 ${c.videos.length} · 용어 ${c.glossary.length} · 대본 ${n}자`);
}
console.log(bad ? `\n${bad}개 문제` : "\n모두 통과");
process.exitCode = bad ? 1 : 0;

// 자세히 읽기(deep) 점검 — 없으면 '만드는 중'으로 보여서 실패는 아니에요
let deepBad = 0, deepN = 0;
for (const p of idx.papers) {
  const f = `public/papers/content/${p.id}.deep.json`;
  if (!existsSync(f)) { console.log(`… ${p.id}: 자세히 읽기 아직 없음`); continue; }
  let d; try { d = JSON.parse(readFileSync(f, "utf8")); } catch (e) { deepBad++; console.log(`✖ ${p.id}.deep: JSON 깨짐`); continue; }
  const secs = d.sections || [], chars = secs.reduce((n, s) => n + (s.body || "").length, 0);
  const probs = [];
  if (secs.length < 6) probs.push(`절 ${secs.length}개`);
  secs.forEach((s) => { if (!/^[a-z0-9-]+$/.test(s.id || "")) probs.push(`id ${s.id}`); if ((s.body || "").length < 300) probs.push(`짧은 절 ${s.id}`); if (/^## /m.test(s.body || "")) probs.push(`## 사용 ${s.id}`); });
  if (new Set(secs.map((s) => s.id)).size !== secs.length) probs.push("절 id 중복");
  if (probs.length) { deepBad++; console.log(`✖ ${p.id}.deep: ${probs.join(", ")}`); } else { deepN++; console.log(`✓ ${p.id.padEnd(12)} 자세히 ${secs.length}절 · ${chars}자 · FAQ ${(d.faq || []).length}`); }
}
console.log(deepBad ? `자세히 읽기 ${deepBad}개 문제` : `자세히 읽기 ${deepN}편 통과`);
if (deepBad) process.exitCode = 1;

// 용어 사전 점검
let termBad = 0;
for (const f of ["public/papers/terms-common.json", ...idx.papers.map((p) => `public/papers/content/${p.id}.terms.json`)]) {
  if (!existsSync(f)) { termBad++; console.log(`✖ 사전 없음 ${f}`); continue; }
  let d; try { d = JSON.parse(readFileSync(f, "utf8")); } catch { termBad++; console.log(`✖ 사전 JSON 깨짐 ${f}`); continue; }
  const bad = (d.terms || []).filter((t) => !t.term || !t.easy || !Array.isArray(t.match) || t.match.some((m) => typeof m !== "string" || m.trim().length < 2));
  if (bad.length || !(d.terms || []).length) { termBad++; console.log(`✖ ${f}: 이상한 항목 ${bad.map((t) => t.term).join(", ")}`); }
}
console.log(termBad ? `용어 사전 ${termBad}개 문제` : "용어 사전 17개 통과");
if (termBad) process.exitCode = 1;
