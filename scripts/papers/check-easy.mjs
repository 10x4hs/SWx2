// 쉽게 읽기 검사: node scripts/papers/check-easy.mjs [id ...]
// 규격(EASY_SPEC.md)의 기계로 볼 수 있는 부분만 봐요. 내용이 맞는지는 사람이 읽어야 해요.
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../public/papers/", import.meta.url));
const idx = JSON.parse(readFileSync(ROOT + "index.json", "utf8"));
const ids = process.argv.slice(2).length ? process.argv.slice(2) : idx.papers.map((p) => p.id);
const FIG = new Set(["figure", "compare", "flow", "grids", "bars", "scale", "steps", "scene"]);
const TONES = new Set(["a", "b", "c", "d", "n", undefined]);
let bad = 0, missing = 0;

for (const id of ids) {
  const f = `${ROOT}content/${id}.easy.json`;
  if (!existsSync(f)) { console.log(`· ${id}: 아직 없음`); missing++; continue; }
  const err = [], warn = [];
  let d;
  try { d = JSON.parse(readFileSync(f, "utf8")); } catch (e) { console.log(`✖ ${id}: JSON 오류 ${e.message}`); bad++; continue; }
  const figs = new Set(existsSync(`${ROOT}fig/${id}`) ? readdirSync(`${ROOT}fig/${id}`) : []);
  if (d.id !== id) err.push(`id 가 ${d.id}`);
  for (const k of ["title", "kicker", "headline", "lead", "sections", "recap", "words"]) if (!d[k]) err.push(`${k} 없음`);
  if ((d.headline || "").split("\n").length > 2) warn.push("headline 3줄 이상");
  const S = d.sections || [];
  if (S.length < 9 || S.length > 15) err.push(`장 ${S.length}개 (9~15)`);
  let noFig = 0, nFigure = 0, nBars = 0, nQuiz = 0, nScene = 0;
  S.forEach((s, i) => {
    const where = `${i + 1}장`;
    if (!s.title) err.push(`${where} 제목 없음`);
    if (!Array.isArray(s.body) || !s.body.length) { err.push(`${where} body 없음`); return; }
    if (!s.body.some((b) => FIG.has(b.t))) noFig++;
    s.body.forEach((b, j) => {
      const at = `${where}-${j + 1} ${b.t}`;
      if (b.t === "p") { if (!b.text) err.push(`${at} 빈 문단`); else if (b.text.length > 420) warn.push(`${at} 문단 ${b.text.length}자`); }
      else if (b.t === "figure") { nFigure++; if (!figs.has(b.src)) err.push(`${at} 그림 파일 없음: ${b.src}`); }
      else if (b.t === "compare") { if (!(b.items?.length >= 2 && b.items.length <= 3)) err.push(`${at} 항목 2~3개`); b.items?.forEach((x) => { if (!TONES.has(x.tone)) err.push(`${at} tone ${x.tone}`); }); }
      else if (b.t === "flow") { const st = b.rows ? b.rows.flat() : b.steps; if (!st?.length) err.push(`${at} 단계 없음`); else if (!b.rows && (st.length < 3 || st.length > 6)) warn.push(`${at} 단계 ${st.length}개 (3~6)`); }
      else if (b.t === "grids") {
        if (!b.items?.length) err.push(`${at} 격자 없음`);
        b.items?.forEach((g) => { if (!Array.isArray(g.values) || g.values.length > 6 || g.values.some((r) => !Array.isArray(r) || r.length > 6)) err.push(`${at} 격자 모양 (최대 6×6)`); });
        if (b.ops && b.ops.length !== b.items.length - 1) err.push(`${at} ops 개수`);
        if (!b.note) warn.push(`${at} note 없음 (설명용 예시 표시)`);
      }
      else if (b.t === "bars") { nBars++; if (!b.items?.every((x) => Number.isFinite(+x.value))) err.push(`${at} 숫자 아님`); if (!b.note) warn.push(`${at} 출처 note 없음`); }
      else if (b.t === "scale") { if (!b.items?.every((x) => +x.value >= 0 && +x.value <= 1)) err.push(`${at} 값은 0~1`); }
      else if (b.t === "steps") { if (!b.items?.length) err.push(`${at} 항목 없음`); }
      else if (b.t === "scene") {
        nScene++;
        const W = +b.w || 16, H = +b.h || 9, ids = new Set();
        if (!(b.steps?.length >= 2 && b.steps.length <= 8)) err.push(`${at} 단계 2~8개`);
        (b.things || []).forEach((t) => { if (!["person", "car", "bike", "tree", "house", "box", "dot", "text"].includes(t.kind)) err.push(`${at} 물체 종류 ${t.kind}`); if (!(+t.x >= 0 && +t.x <= W && +t.y >= 0 && +t.y <= H)) err.push(`${at} 물체 좌표 밖`); });
        (b.steps || []).forEach((st, k) => {
          if (!st.text) err.push(`${at} ${k + 1}단계 글 없음`);
          (st.add || []).forEach((o) => { if (!["box", "mask", "dot", "arrow", "label", "tag"].includes(o.kind || "box")) err.push(`${at} 덮개 종류 ${o.kind}`); if (!(+o.x >= 0 && +o.x <= W && +o.y >= 0 && +o.y <= H)) err.push(`${at} ${k + 1}단계 덮개 좌표 밖`); if (o.id) ids.add(o.id); });
          [...(st.remove || []), ...(st.move || []).map((m) => m.id)].forEach((id) => { if (!ids.has(id)) err.push(`${at} ${k + 1}단계 없는 id ${id}`); });
        });
      }
      else if (b.t === "quiz") { nQuiz++; if (!(b.choices?.length >= 2) || !(b.answer >= 0 && b.answer < b.choices.length) || !b.why) err.push(`${at} 퀴즈 모양`); }
      else if (b.t === "analogy" || b.t === "callout") { if (!b.text) err.push(`${at} 내용 없음`); }
      else err.push(`${at} 모르는 블록`);
    });
  });
  if (noFig > 2) err.push(`그림 없는 장 ${noFig}개 (최대 2)`);
  if (process.env.RICH && nScene < 2) err.push(`scene ${nScene}개 (≥2)`);
  if (process.env.RICH && (S.length < 11 || S.length > 15)) err.push(`장 ${S.length}개 (11~15)`);
  if (nFigure < 2) err.push(`원문 그림 ${nFigure}개 (≥2)`);
  if (nBars < 1) err.push("bars 없음");
  if (nQuiz < 2 || nQuiz > 4) err.push(`퀴즈 ${nQuiz}개 (2~4)`);
  if ((d.words || []).length < 8) warn.push(`낱말 ${d.words?.length || 0}개 (8~15)`);
  const ok = !err.length;
  if (!ok) bad++;
  console.log(`${ok ? "✓" : "✖"} ${id}: 장 ${S.length} · 그림 ${nFigure} · 막대 ${nBars} · 퀴즈 ${nQuiz} · 장면 ${nScene}${err.length ? "\n   오류: " + err.join(" | ") : ""}${warn.length ? "\n   참고: " + warn.join(" | ") : ""}`);
}
console.log(`\n${ids.length - missing - bad}/${ids.length} 통과${missing ? ` · ${missing} 없음` : ""}${bad ? ` · ${bad} 오류` : ""}`);
process.exit(bad ? 1 : 0);
