// decide() 평가 — 작은 정답지(scripts/onto-eval-data.json)로 embed-proto 와 llm 의 정확도 · 확신 눈금(calibration)을 봐요 (2026-10-24).
//   BASE=http://127.0.0.1:8797 USER=<로컬 관리자 아이디> node scripts/onto-eval.mjs [concept|rel|route|all] [--no-llm]
//   · concept : 노트 55개의 개념(5개) — embed-proto (나 빼고 원형 = leave-one-out · 설명만 = 처음 쓰는 사람 · 개념마다 노트 3개) vs llm (Groq, 3표)
//   · rel     : 노트 쌍 44개의 관계 — llm (Groq, 3표 · 실제 제안과 같은 질문) vs embed-proto (쌍 글 벡터 · leave-one-out 원형, 기준선)
//   · route   : CIM 튜터 질문 32개의 길 — 규칙만 · 규칙+embed-proto (서버 airoute.js) · llm
//   관리자 API(/decide/embed · /decide/run · /decide/route-eval)를 써요. 결과 JSON 은 OUT(기본 ./onto-eval-out.json)에.
import { readFileSync, writeFileSync } from "node:fs";
import { protoProbs, meanVec } from "../src/decide.js";
import { CONCEPTS, relCriteria } from "../src/lib/onto-vocab.js";

const BASE = process.env.BASE || "http://127.0.0.1:8797", USER = process.env.USER_ID || process.env.EVAL_USER || "t_onto_a";
const what = process.argv[2] || "all", noLlm = process.argv.includes("--no-llm");
const D = JSON.parse(readFileSync(new URL("./onto-eval-data.json", import.meta.url)));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PAUSE = Number(process.env.EVAL_PAUSE || 25000); // Groq 무료: 모델마다 분당 8천 토큰
const H = { "x-trio": "1", "content-type": "application/json" };
const lg = await fetch(BASE + "/api/auth/login", { method: "POST", headers: H, body: JSON.stringify({ username: USER }) });
if (!lg.ok) { console.error("login failed", lg.status); process.exit(1); }
const cookie = lg.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
async function api(path, data) {
  for (let i = 0; i < 4; i++) {
    const r = await fetch(BASE + "/api" + path, { method: "POST", headers: { ...H, cookie }, body: JSON.stringify(data) });
    const j = await r.json().catch(() => null);
    if (r.ok) return j;
    console.error(path, r.status, j?.error); await sleep(3000);
  }
  throw new Error(path + " failed");
}
const embedAll = async (texts) => { const out = []; for (let i = 0; i < texts.length; i += 32) out.push(...(await api("/decide/embed", { texts: texts.slice(i, i + 32) })).vectors); return out; };
const pct = (x) => (x === null || Number.isNaN(x) ? "—" : (x * 100).toFixed(0) + "%");
const BUCKETS = [[0.85, 1.01, "≥0.85"], [0.66, 0.85, "0.66–0.85"], [0.5, 0.66, "0.50–0.66"], [0, 0.5, "<0.50"]];
/** rows: [{ ok: bool | null(=abstain/unknown), conf }] → 정확도 · 눈금 */
function summary(rows, thr = 0.85) {
  const ans = rows.filter((r) => r.ok !== null);
  const hi = ans.filter((r) => r.conf >= thr);
  return {
    n: rows.length, answered: ans.length, acc_all: rows.filter((r) => r.ok).length / rows.length, acc_answered: ans.length ? ans.filter((r) => r.ok).length / ans.length : null,
    at_thr: { thr, coverage: hi.length / rows.length, precision: hi.length ? hi.filter((r) => r.ok).length / hi.length : null, n: hi.length },
    buckets: BUCKETS.map(([a, b, l]) => { const xs = ans.filter((r) => r.conf >= a && r.conf < b); return { bucket: l, n: xs.length, acc: xs.length ? xs.filter((r) => r.ok).length / xs.length : null, mean_conf: xs.length ? xs.reduce((s, r) => s + r.conf, 0) / xs.length : null }; }),
  };
}
const show = (name, s) => console.log(`  ${name.padEnd(34)} 전체 ${pct(s.acc_all)} · 답한 것 ${pct(s.acc_answered)} (${s.answered}/${s.n}) · 확신≥${s.at_thr.thr}: 정확 ${pct(s.at_thr.precision)} / 덮음 ${pct(s.at_thr.coverage)} (${s.at_thr.n}) · 눈금 ${s.buckets.filter((b) => b.n).map((b) => `${b.bucket}:${pct(b.acc)}(${b.n})`).join(" ")}`);
const out = { at: new Date().toISOString(), base: BASE };

// ---------- 개념 (새 노트 자리) ----------
if (what === "all" || what === "concept") {
  console.log("\n[개념 5개 — 노트 " + D.notes.length + "개]");
  const labels = Object.keys(CONCEPTS);
  const nv = await embedAll(D.notes.map((n) => (n.t + "\n" + n.b).slice(0, 1600)));
  const dv = await embedAll(labels.map((k) => `${k}: ${CONCEPTS[k]}`));
  const desc = Object.fromEntries(labels.map((k, i) => [k, dv[i]]));
  const protosFor = (skip, perConcept = Infinity, descW = 2) => Object.fromEntries(labels.map((k) => {
    const mine = D.notes.map((n, i) => [n, i]).filter(([n, i]) => n.c === k && i !== skip).slice(0, perConcept).map(([, i]) => nv[i]);
    return [k, meanVec([desc[k], ...mine], [descW, ...mine.map(() => 1)])];
  }));
  const run = (T, floor, perConcept, descW = 2) => D.notes.map((n, i) => { const r = protoProbs(nv[i], protosFor(i, perConcept, descW), { T, floor }); return { ok: r.choice === "unknown" ? null : r.choice === n.c, conf: r.confidence, choice: r.choice, want: n.c }; });
  // 온도 · 기준선 고르기: '확신 ≥ 0.85' 의 정확도가 leave-one-out ≥ 95% 이고 설명만(처음 쓰는 사람) ≥ 90% 인 것 중 두 덮는 비율의 합이 가장 큰 것
  const grid = [];
  for (const T of [0.005, 0.0075, 0.01, 0.015, 0.02, 0.03, 0.05]) for (const floor of [0.2, 0.3, 0.35, 0.4, 0.45, 0.5]) {
    const s = summary(run(T, floor, Infinity)), c = summary(run(T, floor, 0));
    grid.push({ T, floor, precision: s.at_thr.precision, coverage: s.at_thr.coverage, acc: s.acc_all, cold_precision: c.at_thr.precision, cold_coverage: c.at_thr.coverage });
  }
  const okGrid = grid.filter((g) => (g.precision ?? 0) >= 0.95 && (g.cold_precision ?? 0) >= 0.9).sort((a, b) => b.coverage + b.cold_coverage - (a.coverage + a.cold_coverage) || b.floor - a.floor);
  const best = okGrid[0] || grid.sort((a, b) => (b.precision ?? 0) - (a.precision ?? 0))[0];
  console.log(`  고른 값: T=${best.T} floor=${best.floor} (확신≥0.85 정확 ${pct(best.precision)} · 덮음 ${pct(best.coverage)})`);
  out.concept = { grid, chosen: best };
  const loo = run(best.T, best.floor, Infinity), cold = run(best.T, best.floor, 0), few = run(best.T, best.floor, 3);
  for (const [k, rows] of [["embed-proto (노트 다 · LOO)", loo], ["embed-proto (설명만 · 처음)", cold], ["embed-proto (개념마다 노트 3개)", few]]) { const s = summary(rows); show(k, s); out.concept[k] = s; }
  out.concept.misses = loo.filter((r) => r.ok === false).map((r, i) => r.want + " → " + r.choice);
  // 짧은 한 줄 노트 (처음 쓰는 사람 = 설명만 · 노트가 쌓인 뒤 = 노트 다) + 문턱 훑기 — 자리 칩 문턱(ONTO_SORT_MIN)과 짧은 글 거르기를 정해요
  if (D.short_notes?.length) {
    const sv = await embedAll(D.short_notes.map((n) => (n.t + "\n" + n.b).slice(0, 1600)));
    const runS = (perConcept) => D.short_notes.map((n, i) => { const r = protoProbs(sv[i], protosFor(-1, perConcept), { T: best.T, floor: best.floor }); return { ok: r.choice === "unknown" ? null : r.choice === n.c, conf: r.confidence, choice: r.choice, want: n.c, t: n.t }; });
    const sweep = (rows) => [0.85, 0.9, 0.95].map((t) => { const s = summary(rows, t); return `≥${t}: 정확 ${pct(s.at_thr.precision)} / 덮음 ${pct(s.at_thr.coverage)}`; }).join(" · ");
    const sCold = runS(0), sWarm = runS(Infinity);
    show("짧은 노트 · 설명만", summary(sCold)); console.log("    " + sweep(sCold));
    show("짧은 노트 · 노트 다", summary(sWarm)); console.log("    " + sweep(sWarm));
    console.log("    긴 노트 · 설명만 " + sweep(cold));
    out.concept.short = { cold: summary(sCold), warm: summary(sWarm), cold_misses: sCold.filter((r) => r.ok === false).map((r) => `${r.t}: ${r.want} → ${r.choice} (${r.conf})`) };
  }
  if (!noLlm) {
    const rows = [];
    for (let i = 0; i < D.notes.length; i += 11) {
      const part = D.notes.slice(i, i + 11);
      const state = part.map((n, j) => `[${j + 1}] 「${n.t}」 ${n.b}`).join("\n");
      const questions = Object.fromEntries(part.map((n, j) => ["n" + j, { type: "choice", instructions: `노트 [${j + 1}] 「${n.t}」는 어느 큰 개념 아래에 두면 좋을까요?`, criteria: CONCEPTS }]));
      const r = await api("/decide/run", { state, questions, engine: "llm", private: true });
      part.forEach((n, j) => { const a = r.answers["n" + j]; rows.push({ ok: a.choice === "unknown" ? null : a.choice === n.c, conf: a.confidence, choice: a.choice, want: n.c }); });
      console.log(`  llm ${Math.min(i + 11, D.notes.length)}/${D.notes.length} (${r.meta?.used || r.meta?.error}, 토큰 ${r.meta?.tokens || 0})`);
      await sleep(PAUSE);
    }
    const s = summary(rows); show("llm (Groq · 3표)", s); out.concept.llm = s; out.concept.llm_misses = rows.filter((r) => r.ok === false).map((r) => r.want + " → " + r.choice);
  }
}

// ---------- 관계 종류 ----------
if (what === "all" || what === "rel") {
  console.log("\n[관계 — 쌍 " + D.pairs.length + "개]");
  const by = new Map(D.notes.map((n) => [n.t, n]));
  const isOk = (p, choice) => (choice === "unknown" ? null : p.ok.includes(choice));
  out.rel = {};
  if (!noLlm) {
    const rows = [];
    for (let i = 0; i < D.pairs.length; i += 8) {
      const part = D.pairs.slice(i, i + 8);
      const titles = [...new Set(part.flatMap((p) => [p.a, p.b]))];
      const state = "노트들:\n" + titles.map((t) => `「${t}」 ${by.get(t).b}`).join("\n");
      const questions = Object.fromEntries(part.map((p, j) => ["p" + j, { type: "choice", instructions: `노트 A 「${p.a}」에서 노트 B 「${p.b}」로 가는 관계는 무엇인가요? A와 B를 바꿔 읽어야 맞으면 _inv 를 골라요.`, criteria: relCriteria() }]));
      const r = await api("/decide/run", { state, questions, engine: "llm", private: true });
      part.forEach((p, j) => { const a = r.answers["p" + j]; rows.push({ ok: isOk(p, a.choice), conf: a.confidence, choice: a.choice, want: p.ok[0], pair: p.a + " → " + p.b, none: p.ok[0] === "none" }); });
      console.log(`  llm ${Math.min(i + 8, D.pairs.length)}/${D.pairs.length} (${r.meta?.used || r.meta?.error}, 토큰 ${r.meta?.tokens || 0})`);
      await sleep(PAUSE);
    }
    const s = summary(rows); show("llm (Groq · 3표)", s);
    const s66 = summary(rows, 0.66); show("llm — 확신≥0.66 (제안함 문턱)", s66);
    // 제안 파이프라인 눈으로: 정답이 none 인 쌍에 관계를 확신 ≥ 0.66 으로 붙인 수 (잘못된 제안)
    const falseSugg = rows.filter((r) => r.none && r.choice !== "none" && r.choice !== "unknown" && !r.ok && r.conf >= 0.66).length;
    out.rel.llm = { ...s, at66: s66.at_thr, false_suggestions_on_none_pairs: falseSugg, none_pairs: rows.filter((r) => r.none).length, misses: rows.filter((r) => r.ok === false).map((r) => `${r.pair}: ${r.choice} (정답 ${r.want}, ${r.conf})`) };
    console.log(`  정답 none 인 쌍 ${out.rel.llm.none_pairs}개 중 잘못 제안될 것(확신≥0.66): ${falseSugg}`);
  }
  // 기준선: 쌍 글 벡터 + 관계 원형(설명 + 다른 쌍들 평균, 나 빼고)
  const crit = relCriteria(), keys = Object.keys(crit);
  const pv = await embedAll(D.pairs.map((p) => `「${p.a}」 ${by.get(p.a).b}\n→ 「${p.b}」 ${by.get(p.b).b}`));
  const cv = await embedAll(keys.map((k) => crit[k]));
  const rows = D.pairs.map((p, i) => {
    const protos = Object.fromEntries(keys.map((k, j) => { const mates = D.pairs.map((q, m) => [q, m]).filter(([q, m]) => m !== i && q.ok[0] === k).map(([, m]) => pv[m]); return [k, meanVec([cv[j], ...mates], [1, ...mates.map(() => 1)])]; }));
    const r = protoProbs(pv[i], protos, { T: 0.02, floor: 0.0 });
    return { ok: isOk(p, r.choice), conf: r.confidence, choice: r.choice };
  });
  const s = summary(rows); show("embed-proto (쌍 벡터 · LOO, 기준선)", s); out.rel.embed_proto = s;
}

// ---------- AI 길 (CIM 튜터) ----------
if (what === "all" || what === "route") {
  console.log("\n[AI 길 — 질문 " + D.routes.length + "개]");
  const r = await api("/decide/route-eval", { questions: D.routes.map((x) => x.q) });
  const rules = r.results.map((x, i) => ({ ok: x.rules.choice === "unknown" ? null : x.rules.choice === D.routes[i].r, conf: x.rules.confidence }));
  const full = r.results.map((x, i) => ({ ok: x.full.choice === "unknown" ? null : x.full.choice === D.routes[i].r, conf: x.full.confidence, engine: x.full.engine }));
  out.route = { rules: summary(rules, 0.7), full: summary(full, 0.7), proto_used: full.filter((x) => x.engine === "embed-proto").length, misses: r.results.map((x, i) => [D.routes[i], x.full]).filter(([w, g]) => g.choice !== w.r).map(([w, g]) => `${w.q} → ${g.choice} (${g.engine}, 정답 ${w.r})`) };
  show("규칙만", out.route.rules); show("규칙 + embed-proto", out.route.full);
  console.log(`  embed-proto 를 쓴 질문 ${out.route.proto_used}개`);
  if (!noLlm) {
    const crit = { quick: "용어 뜻 · 한 줄 정의 · 짧은 확인처럼 짧게 답하면 되는 질문", deep: "왜 그런지 · 원리 · 차이 · 비교처럼 깊게 풀어 줘야 하는 질문", my_notes: "내가 정리한 노트 · 내 메모를 찾아봐야 하는 질문", calc: "숫자를 넣어 수익률 · 가치 · 비율을 계산해야 하는 질문" };
    const rows = [];
    for (let i = 0; i < D.routes.length; i += 16) {
      const part = D.routes.slice(i, i + 16);
      const questions = Object.fromEntries(part.map((x, j) => ["q" + j, { type: "choice", instructions: `학생 질문 「${x.q}」에 맞는 답하는 길은?`, criteria: crit }]));
      const res = await api("/decide/run", { state: "CIM(투자자산운용사) 튜터에 들어온 학생 질문들이에요.", questions, engine: "llm", private: true });
      part.forEach((x, j) => { const a = res.answers["q" + j]; rows.push({ ok: a.choice === "unknown" ? null : a.choice === x.r, conf: a.confidence }); });
      await sleep(PAUSE);
    }
    out.route.llm = summary(rows, 0.7); show("llm (Groq · 3표)", out.route.llm);
  }
}
writeFileSync(process.env.OUT || "onto-eval-out.json", JSON.stringify(out, null, 1));
console.log("\n결과:", process.env.OUT || "onto-eval-out.json");
