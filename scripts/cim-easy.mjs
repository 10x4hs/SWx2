// CIM '쉽게 보기' 미리 만들기 — 카드마다 쉬운 말 3–5줄 · 비유 하나 · 작은 숫자 예 · 시험 포인트를 장 JSON(public/cim/s*c*.json)의 p.easy 에 넣어요
//   node scripts/cim-easy.mjs                 아직 없거나 카드 글이 바뀐 것만 (p.easy.h = 카드 지문) — 끊겨도 다시 돌리면 이어서
//   node scripts/cim-easy.mjs --only=s3c6     한 장만 · --force 다시 만들기 · --check 검사만(만들지 않음, 실패하면 exit 1)
//   node scripts/cim-easy.mjs --env=/path/.dev.vars   AI 키 파일 (기본: 이 저장소의 .dev.vars). 키는 화면에 찍지 않아요
// 근거는 교재 카드 글 하나뿐 (공개 교재 내용이라 어느 공급사든 괜찮아요). 숫자 검사: 예시 칸 밖에서는 카드 글에 없는 숫자를 못 써요.
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIR = join(ROOT, "public", "cim");
const flags = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith("--")).map((a) => { const [k, v] = a.slice(2).split("="); return [k, v ?? true]; }));

export const hashOf = (p) => createHash("sha1").update(p.t + "\n" + p.b).digest("hex").slice(0, 12);
const NUM = /\d+(?:[.,]\d+)?/g;
// 카드 글에 나온 숫자 (1,000 = 1000 · 4.5 · 2 …)
const numsIn = (s) => new Set((String(s).match(NUM) || []).map((x) => x.replace(/,/g, "")));

/** 검사 — 문제 목록 (빈 배열이면 통과) */
export function validate(e, p) {
  const bad = [];
  if (!e || typeof e !== "object") return ["형식"];
  const { lines, analogy, example, points } = e;
  if (!Array.isArray(lines) || lines.length < 3 || lines.length > 5) bad.push("lines 3–5줄");
  if (!Array.isArray(points) || points.length < 1 || points.length > 3) bad.push("points 1–3개");
  if (typeof analogy !== "string" || analogy.length < 8) bad.push("analogy 없음");
  if (typeof example !== "string") bad.push("example 문자열");
  if (bad.length) return bad;
  lines.forEach((l, i) => { if (typeof l !== "string" || l.length < 6 || l.length > 90) bad.push(`lines[${i}] 길이 ${l?.length}`); });
  if (analogy.length > 140) bad.push("analogy 너무 김");
  if (example.length > 200) bad.push("example 너무 김");
  points.forEach((l, i) => { if (typeof l !== "string" || l.length < 6 || l.length > 110) bad.push(`points[${i}] 길이`); });
  const src = numsIn(p.t + "\n" + p.b);
  for (const [k, s] of [["lines", lines.join(" ")], ["analogy", analogy], ["points", points.join(" ")]]) {
    for (const n of numsIn(s)) if (!src.has(n)) bad.push(`${k}: 카드에 없는 숫자 ${n}`);
  }
  // 해요체 — 쉬운 말 줄은 대부분 '요'로 끝나야 해요
  if (lines.filter((l) => /요[.!?]?$|요\)?$/.test(l.trim())).length < lines.length - 1) bad.push("해요체 아님");
  if (/[一-龥]/.test(JSON.stringify(e))) bad.push("한자");
  // 숫자를 한글로 풀어 써서 숫자 검사를 비켜 가는 것 ("사십오퍼센트" · "사점사") — 숫자는 아라비아 숫자로만
  if (/퍼센트|[일이삼사오육칠팔구]십[일이삼사오육칠팔구]?\s*(?:퍼|%|년|일|원|배)/.test(JSON.stringify(e))) bad.push("숫자를 한글로 씀");
  // 영어 약어를 한글 소리로 (피이알 · 디알 · 피비알) — 약어는 영문 그대로
  if (/피이알|피비알|디알|이피에스/.test(JSON.stringify(e))) bad.push("약어를 한글 소리로");
  return bad;
}

const SYSTEM = `너는 투자자산운용사(CIM) 교재를 중학생도 알아듣게 풀어 주는 선생님이야.
반드시 [카드] 글만 근거로 써. 카드에 없는 사실 · 숫자 · 법 조문 · 세율은 절대 지어내지 마.
JSON 객체 하나만 출력해: {"lines": [...], "analogy": "...", "example": "...", "points": [...]}
- lines: 3~5개. 한 줄에 한 문장, 40자 안팎(최대 80자). 쉬운 한국어 해요체("~예요/~해요"). 어려운 용어는 쉬운 말로 바꾸거나 바로 뒤 괄호로 풀어 줘. 카드의 핵심만.
- analogy: 일상 비유 한 문장 (가게 · 용돈 · 학교 같은 것). 숫자는 쓰지 마.
- example: 카드에 공식 · 계산 · 숫자 기준이 있으면 아주 작은 숫자 예 한두 문장("예: …"로 시작, 계산은 한 줄씩). 없으면 빈 문자열 "".
- points: 시험에 자주 나오는 것 1~3개. 짧게, 흔한 함정(헷갈리는 짝 · 예외 · 반대로 묻기)을 포함해.
- lines · analogy · points 에는 카드 글에 실제로 나온 숫자만 쓸 수 있어 (예시 칸만 예외).
- 숫자는 꼭 아라비아 숫자(45%, 10년)로 써. "사십오퍼센트"처럼 한글로 풀어 쓰지 마. 기간 · 단위(영업일 · 원 · %)는 카드 그대로.
- PER · CDS · DR 같은 영문 약어는 영문 그대로 써 (한글 소리로 바꾸지 마).
- 한자 · 영어 문장 · 마크다운 기호(**, #) 쓰지 마.`;

function readEnv(file) {
  const env = {};
  for (const line of readFileSync(file, "utf8").split("\n")) { const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
  return env;
}

const card = (p, ch) => `[카드] ${ch.s}과목 ${ch.c}장 ${ch.t} · 핵심 ${p.n} · ${p.t}\n${String(p.b).replace(/\n{2,}/g, "\n").slice(0, 4000)}`;

async function main() {
  const files = readdirSync(DIR).filter((f) => /^s\dc\d+\.json$/.test(f) && (!flags.only || f === flags.only + ".json"));
  if (flags.check) {
    let n = 0, miss = 0, fail = 0;
    for (const f of files) {
      const c = JSON.parse(readFileSync(join(DIR, f), "utf8"));
      for (const s of c.sec) for (const p of s.p) { n++; if (!p.easy) { miss++; continue; } const b = validate(p.easy, p); if (b.length || p.easy.h !== hashOf(p)) { fail++; console.log(`✗ ${f} ${p.n} ${p.easy.h !== hashOf(p) ? "지문 다름 " : ""}${b.join(" · ")}`); } }
    }
    console.log(`카드 ${n} · 없음 ${miss} · 검사 실패 ${fail}`);
    process.exit(miss || fail ? 1 : 0);
  }
  const envFile = flags.env || join(ROOT, ".dev.vars");
  if (!existsSync(envFile)) { console.error("AI 키 파일이 없어요: --env=<.dev.vars>"); process.exit(1); }
  const env = readEnv(envFile);
  const { aiJson } = await import("../src/ai.js");
  const PREFER = ["gemini", "groq", "cohere", "zhipu", "mimo"]; // 돌아가며 맨 앞 — 한 곳의 분당 한도에 몰리지 않게
  const stat = { done: 0, skip: 0, fail: [], by: {} };
  let turn = 0;
  for (const f of files) {
    const path = join(DIR, f), c = JSON.parse(readFileSync(path, "utf8"));
    const todo = c.sec.flatMap((s) => s.p).filter((p) => flags.force || !p.easy || p.easy.h !== hashOf(p) || validate(p.easy, p).length);
    stat.skip += c.sec.reduce((n, s) => n + s.p.length, 0) - todo.length;
    const one = async (p) => {
      let note = "";
      for (let a = 0; a < 4; a++) {
        const prefer = PREFER[turn++ % PREFER.length];
        try {
          const r = await aiJson(env, SYSTEM, card(p, c) + (note ? `\n\n[지난 답의 문제 — 고쳐서 다시] ${note}` : ""), prefer);
          const e = r.data || {};
          const out = { lines: (e.lines || []).map((x) => String(x).trim()), analogy: String(e.analogy || "").trim(), example: String(e.example || "").trim(), points: (e.points || []).map((x) => String(x).trim()) };
          const bad = validate(out, p);
          if (bad.length) { note = bad.join(" · "); continue; }
          p.easy = { ...out, h: hashOf(p), by: r.model };
          stat.by[r.provider] = (stat.by[r.provider] || 0) + 1;
          return true;
        } catch (e) { note = ""; await new Promise((r) => setTimeout(r, 1500 * (a + 1))); }
      }
      stat.fail.push(`${f.replace(".json", "")}-${p.n}`);
      return false;
    };
    const q = todo.slice();
    await Promise.all(Array.from({ length: Math.min(3, q.length) }, async () => {
      while (q.length) { const p = q.shift(); if (await one(p)) { stat.done++; writeFileSync(path, JSON.stringify(c)); } process.stdout.write(`\r${f} 남음 ${q.length}   `); }
    }));
    console.log(`\n✓ ${f} — 이번에 ${todo.length}장 시도`);
  }
  console.log(JSON.stringify({ done: stat.done, skipped: stat.skip, failed: stat.fail, providers: stat.by }));
}
if (process.argv[1] === fileURLToPath(import.meta.url)) main();
