// 가벼운 온톨로지 — 노트 사이 연결에 '관계 종류' 를 달아요 (2026-10-24). 표: note_rel (migrations/0068_ontology_decide.sql)
//   관계 8가지 (화면 이름): is_a 종류 · part_of 부분 · example_of 예시 · causes 원인 · contrasts_with 반대·비교 · prerequisite_of 먼저 알아야 함 · defined_by 정의 · related 관련(기본)
//   방향은 사람이 읽는 대로 src → dst ("A 는 B 의 예시" = A → B). contrasts_with · related 는 방향이 없어요.
//   본문의 [[링크]] 는 그대로(note_links). 행이 없는 링크는 '관련'. AI 는 노트 본문을 절대 고치지 않아요 — 제안은 note_rel 에만.
//
//   상태: suggested(AI 제안함) · auto(AI 가 정함 — [[링크]] 가 이미 있는 쌍 + 확신 ≥ ONTO_AUTO_MIN 만, 'AI' 표시 · 바꾸기 · 되돌리기)
//         confirmed(사람) · rejected(거절 — 같은 쌍은 다시 제안하지 않아요)
//   제안 흐름: 노트 저장(뒤에서, 20분에 한 번) · 매시 크론(하루 몫 안에서)
//     → 바뀐 노트의 [[링크]] 상대 + 뜻이 가까운 내 노트(Vectorize u:<id>, 위 8개) 중 아직 행이 없는 쌍
//     → decide() 의 choice 질문 (관계 8 + 반대 방향 6 + none + unknown) 을 llm 엔진(Groq 만, 3표)으로 → auto · suggested · 아무것도 안 함
//     하루 제안 ONTO_DAILY_SUGGEST(30) · 노트마다 3 · 하루 묻는 쌍 ONTO_DAILY_ASK(120)
//   새 노트 자리 제안(concept_sort): 맨 위(Unsorted) 노트 → 개념 5개 + unknown 을 embed-proto 로 → 확신 ≥ ONTO_SORT_MIN 이면 화면에 '‘AI & Dev’에 둘까요?' (옮기기는 사람이 눌러야)
import { decide, recordOutcome, meanVec, logDecision, UNKNOWN } from "./decide.js";
import { embed, vecIndex, nsOf, addNeurons, neuronsFor, noteVectors } from "./rag.js";
import { chunkNote } from "./lib/rag-text.js";
import { kstToday } from "./lib/day.js";
import { fail, json, body, now, uid } from "./http.js";

// 관계 · 개념 이름표는 src/lib/onto-vocab.js (node 평가 스크립트도 같이 써요)
import { REL, REL_KEYS, SYMMETRIC, relCriteria, readRelChoice, outcomeLabel, CONCEPTS, TYPE_CRIT, dirCriteria, combineRel, exampleLine } from "./lib/onto-vocab.js";
export { REL, REL_KEYS, relCriteria, readRelChoice, outcomeLabel, CONCEPTS };
const STATUS = new Set(["suggested", "auto", "confirmed", "rejected"]);
const ORIGIN = new Set(["human", "ai", "embedding"]);
const CONCEPT_LOW = new Set([...Object.keys(CONCEPTS), "Unsorted"].map((t) => t.toLowerCase()));

const num = (env, k, d) => (env[k] !== undefined && env[k] !== "" && Number.isFinite(Number(env[k])) ? Number(env[k]) : d);
export const ontoSettings = (env) => ({
  autoMin: num(env, "ONTO_AUTO_MIN", 1.01),       // auto (이미 링크가 있는 쌍) — 기본 꺼짐: 평가에서 관계 정확도가 68% (확신 3표 일치는 n=5) 라 사람 확인 데이터가 쌓이면 0.85 로 켜요
  suggestMin: num(env, "ONTO_SUGGEST_MIN", 0.66), // 제안함에 넣는 최소 확신 (3표 중 2표)
  sortMin: num(env, "ONTO_SORT_MIN", 0.85),        // 자리 제안 칩
  daySuggest: num(env, "ONTO_DAILY_SUGGEST", 30),
  noteSuggest: 3,
  dayAsk: num(env, "ONTO_DAILY_ASK", 120),
  dayGuess: num(env, "ONTO_DAILY_GUESS", 80),
  neighborCos: num(env, "ONTO_NEIGHBOR_COS", 0.5),
  shotsPos: num(env, "ONTO_SHOTS_POS", 0),         // few-shot: 사용자가 확인한 비슷한 쌍 — 기본 꺼짐: 평가(2026-10-25, qwen)에서 덮음 57%→39% 로 줄고 정확도도 96%→88% (흉내 낸 예시라 실제 확인 데이터로 다시 재요). 4 · 2 로 켜요
  shotsNeg: num(env, "ONTO_SHOTS_NEG", 0),         // few-shot: 사용자가 거절한 비슷한 제안
});
const dayStart = () => Date.parse(kstToday(0) + "T00:00:00+09:00");
const short = (title, body, n) => { const c = chunkNote(title, body || "")[0]; return (c?.text || "").replace(/\s+/g, " ").trim().slice(0, n); };
async function sha(s) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d).slice(0, 8)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
const inList = (n) => Array.from({ length: n }, () => "?").join(",");

// ---------- 행 읽기 · 쓰기 ----------
const COLS = "r.id, r.src_id, r.dst_id, r.rel, r.status, r.origin, r.confidence, r.evidence, r.decide_id, r.updated_at";
async function pairRow(env, userId, a, b) {
  return env.DB.prepare(`SELECT ${COLS} FROM note_rel r WHERE r.user_id = ?1 AND ((r.src_id = ?2 AND r.dst_id = ?3) OR (r.src_id = ?3 AND r.dst_id = ?2))`).bind(userId, a, b).first();
}
async function ownNotes(env, userId, ids) {
  const { results } = await env.DB.prepare(`SELECT id, title FROM notes WHERE user_id = ? AND id IN (${inList(ids.length)})`).bind(userId, ...ids).all();
  return new Map(results.map((r) => [r.id, r]));
}
async function linked(env, a, b) {
  return !!(await env.DB.prepare(
    `SELECT 1 FROM note_links l JOIN notes s ON s.id = l.src_id JOIN notes d ON lower(d.title) = lower(l.dst_title) AND d.user_id = s.user_id
     WHERE (l.src_id = ?1 AND d.id = ?2) OR (l.src_id = ?2 AND d.id = ?1) LIMIT 1`).bind(a, b).first());
}
/** 쌍 하나를 정해요 (방향 무관 한 행). 돌려주는 것: { rel: 새 행, prev: 전 행 | null } */
export async function setRel(env, userId, { src_id, dst_id, rel, status = "confirmed", origin = "human", confidence = null, evidence = null, decide_id = null, restore = false }) {
  if (!REL[rel]) fail(400, "모르는 관계예요.");
  if (!STATUS.has(status) || !ORIGIN.has(origin)) fail(400, "모르는 상태예요.");
  if (!src_id || !dst_id || src_id === dst_id) fail(400, "노트 두 개가 필요해요.");
  const own = await ownNotes(env, userId, [src_id, dst_id]);
  if (own.size !== 2) fail(404, "노트를 찾을 수 없어요.");
  const prev = await pairRow(env, userId, src_id, dst_id), t = now();
  if (prev) {
    await env.DB.prepare("UPDATE note_rel SET src_id = ?, dst_id = ?, rel = ?, status = ?, origin = ?, confidence = ?, evidence = ?, decide_id = ?, updated_at = ? WHERE id = ? AND user_id = ?")
      .bind(src_id, dst_id, rel, status, origin, confidence, evidence, decide_id ?? prev.decide_id ?? null, t, prev.id, userId).run();
  } else {
    await env.DB.prepare("INSERT INTO note_rel (id, user_id, src_id, dst_id, rel, status, origin, confidence, evidence, decide_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(uid(), userId, src_id, dst_id, rel, status, origin, confidence, evidence, decide_id, t, t).run();
  }
  const row = await pairRow(env, userId, src_id, dst_id);
  // 사람 결과: AI 가 물었던 판정(decide_id) 에 사람이 고른 답을 적어요 (되돌리기면 지워요)
  const did = row.decide_id;
  if (did) {
    if (restore && (status === "suggested" || status === "auto")) await env.DB.prepare("UPDATE decide_log SET outcome = NULL, outcome_at = NULL WHERE id = ? AND user_id = ?").bind(did, userId).run();
    else if (origin === "human" || status === "confirmed" || status === "rejected") {
      const lg = await env.DB.prepare("SELECT subject FROM decide_log WHERE id = ? AND user_id = ?").bind(did, userId).first();
      const [as, ad] = String(lg?.subject || "").split(">");
      if (as && ad) await recordOutcome(env, { logId: did, userId }, status === "rejected" ? "none" : outcomeLabel(as, ad, row.src_id, row.dst_id, row.rel));
    }
  }
  return { rel: row, prev };
}
const withTitles = async (env, userId, rows) => {
  if (!rows.length) return [];
  const ids = [...new Set(rows.flatMap((r) => [r.src_id, r.dst_id]))];
  const t = await ownNotes(env, userId, ids);
  return rows.filter((r) => t.has(r.src_id) && t.has(r.dst_id)).map((r) => ({ ...r, src_title: t.get(r.src_id).title, dst_title: t.get(r.dst_id).title, ko: REL[r.rel]?.ko || r.rel }));
};
/** 그래프에 그릴 관계 (내 것 · auto + confirmed) + 제안 수 — GET /graph 가 같이 보내요 */
export async function graphRels(env, userId) {
  const [rels, cnt] = await env.DB.batch([
    env.DB.prepare("SELECT id, src_id, dst_id, rel, status, origin, confidence FROM note_rel WHERE user_id = ? AND status IN ('auto', 'confirmed')").bind(userId),
    env.DB.prepare("SELECT COUNT(*) n FROM note_rel WHERE user_id = ? AND status = 'suggested'").bind(userId),
  ]);
  return { rels: rels.results, rel_suggested: cnt.results[0]?.n || 0 };
}

// ---------- 제안 만들기 ----------
async function askedToday(env, userId, kind) {
  return (await env.DB.prepare("SELECT COUNT(*) n FROM decide_log WHERE user_id = ? AND kind = ? AND created_at >= ?").bind(userId, kind, dayStart()).first()).n;
}
async function aiRowsToday(env, userId) {
  return (await env.DB.prepare("SELECT COUNT(*) n FROM note_rel WHERE user_id = ? AND origin = 'ai' AND created_at >= ?").bind(userId, dayStart()).first()).n;
}
/** 뜻이 가까운 내 노트 (자기 빼고, 노트마다 가장 가까운 조각 하나) → [{ id, cos }] */
async function vecNeighbors(env, userId, vec, selfId, k = 8, minCos = 0.5) {
  const vi = vecIndex(env);
  if (!vi) return [];
  const r = await vi.query(vec, { topK: 30, namespace: nsOf(userId), returnValues: false, returnMetadata: "none" });
  const best = new Map();
  for (const m of r.matches || []) {
    const id = String(m.id).split(":")[1];
    if (!id || id === selfId || m.score < minCos) continue;
    if (!best.has(id) || best.get(id) < m.score) best.set(id, m.score);
  }
  return [...best].map(([id, cos]) => ({ id, cos })).sort((a, b) => b.cos - a.cos).slice(0, k * 2);
}
// ---------- 관계 판정 (나눠 묻기 · few-shot · 근거 문장) — 2026-10-25 ----------
// ① 종류만 (TYPE_CRIT, 방향 없음) + 근거 quote (두 노트 본문에 글자 그대로 있어야 표가 살아요)
// ② 방향이 있는 종류만 방향 질문 (forward / backward) — 한 번 더 Groq 3표
// 확신 = ① 확신 × ② 확신 (대칭 관계는 ① 만). 사용자 예시(확인한 쌍 · 거절한 제안)는 자료 맨 위에.
const noteBlock = (t, body, n) => `「${t}」 ${short(t, body, n) || "(본문 없음)"}`;
function pairState(pairs, examples, n = 420) {
  const seen = new Map();
  for (const p of pairs) for (const x of [p.a, p.b]) if (!seen.has(x.title)) seen.set(x.title, noteBlock(x.title, x.body, n));
  const pos = examples?.pos || [], neg = examples?.neg || [];
  return [
    pos.length ? "[사용자가 직접 확인한 관계 — 종류와 방향을 고를 때 참고]\n" + pos.map((x) => exampleLine(x)).join("\n") : "",
    neg.length ? "[사용자가 거절한 제안 — 비슷한 쌍에 같은 답을 고르지 마]\n" + neg.map((x) => exampleLine(x, true)).join("\n") : "",
    "[노트]\n" + [...seen.values()].join("\n"),
  ].filter(Boolean).join("\n\n");
}
/**
 * 쌍 여러 개의 관계 (Groq 만, private). pairs: [{ a: { title, body }, b: { title, body } }] (A → B 로 물어요)
 * 돌려주는 것: { results: [{ choice(relCriteria 이름 | none | unknown), confidence, why, quote, type, dir }], meta }
 */
export async function judgePairs(env, pairs, { examples = null, samples } = {}) {
  const state = pairState(pairs, examples);
  const tq = {};
  pairs.forEach((p, i) => {
    tq["t" + i] = { type: "choice", criteria: TYPE_CRIT, evidence: `${p.a.title}\n${p.a.body || ""}\n${p.b.title}\n${p.b.body || ""}`,
      instructions: `「${p.a.title}」와 「${p.b.title}」 사이의 관계 종류는? (방향은 묻지 않아요 — 종류만)` };
  });
  const r1 = await decide(env, { state, questions: tq, engine: "llm", private: true, samples });
  const dq = {};
  pairs.forEach((p, i) => {
    const t = r1.answers["t" + i];
    if (t && REL[t.choice] && !SYMMETRIC.has(t.choice) && t.confidence > 0)
      dq["d" + i] = { type: "choice", criteria: dirCriteria(t.choice), instructions: `A=「${p.a.title}」, B=「${p.b.title}」. 두 노트의 관계는 '${REL[t.choice].ko}' 예요. 어느 방향으로 읽어야 맞나요? (forward = A → B 문장이 맞음 · backward = B → A 문장이 맞음)` };
  });
  const r2 = Object.keys(dq).length ? await decide(env, { state, questions: dq, engine: "llm", private: true, samples }) : { answers: {}, meta: {} };
  const results = pairs.map((p, i) => {
    const t = r1.answers["t" + i] || { choice: UNKNOWN, confidence: 0 };
    const d = r2.answers["d" + i] || null;
    const choice = combineRel(t.choice, d?.choice);
    const conf = !REL[t.choice] || SYMMETRIC.has(t.choice) ? t.confidence : choice === UNKNOWN ? 0 : Math.round(t.confidence * (d?.confidence || 0) * 1000) / 1000;
    return { choice, confidence: t.choice === "none" ? t.confidence : conf, why: d?.why || t.why || "", quote: t.quote || "", type: { choice: t.choice, confidence: t.confidence, dropped: t.dropped || 0 }, dir: d ? { choice: d.choice, confidence: d.confidence } : null };
  });
  const tokens = (r1.meta?.tokens || 0) + (r2.meta?.tokens || 0);
  return { results, meta: { used: [r1.meta?.used, r2.meta?.used].filter(Boolean).join(",") || r1.meta?.error || "", tokens, calls: (r1.meta?.calls || 0) + (r2.meta?.calls || 0), error: r1.meta?.error || r2.meta?.error || null } };
}
const unit = (v) => { if (!v) return null; const l = Math.hypot(...v) || 1; return v.map((x) => x / l); };
const cos = (a, b) => { let x = 0; for (let i = 0; i < a.length; i++) x += a[i] * b[i]; return x; };
/** few-shot: 사용자가 확인(confirmed)한 관계 · 거절(rejected)한 제안 중 지금 쌍들과 가장 비슷한 것 (쌍 벡터 = 두 노트 벡터 평균, Vectorize 에 있는 것 재사용) */
async function relExamples(env, userId, targets, S) {
  if (!S.shotsPos && !S.shotsNeg) return null;
  const { results: rows } = await env.DB.prepare(
    `SELECT r.src_id, r.dst_id, r.rel, r.status, s.title st, d.title dt FROM note_rel r JOIN notes s ON s.id = r.src_id JOIN notes d ON d.id = r.dst_id
     WHERE r.user_id = ? AND r.status IN ('confirmed', 'rejected') ORDER BY r.updated_at DESC LIMIT 40`).bind(userId).all();
  if (!rows.length) return null;
  const skip = new Set(targets.flatMap((t) => [t.a.id + ">" + t.b.id, t.b.id + ">" + t.a.id]));
  const ex = rows.filter((r) => !skip.has(r.src_id + ">" + r.dst_id));
  if (!ex.length) return null;
  const ids = [...new Set([...ex.flatMap((r) => [r.src_id, r.dst_id]), ...targets.flatMap((t) => [t.a.id, t.b.id])])];
  let vec = new Map();
  try { const vs = await noteVectors(env, userId, ids.map((id) => ({ id })), { maxEmbed: 0 }); ids.forEach((id, i) => vs[i] && vec.set(id, vs[i])); }
  catch (e) { console.log("onto shots vectors", String(e?.message || e)); }
  const pv = (a, b) => (vec.has(a) && vec.has(b) ? unit(vec.get(a).map((x, k) => x + vec.get(b)[k])) : null);
  const tv = targets.map((t) => pv(t.a.id, t.b.id)).filter(Boolean);
  const score = (r) => { const v = pv(r.src_id, r.dst_id); return v && tv.length ? Math.max(...tv.map((t) => cos(t, v))) : -1; }; // 벡터가 없으면 최근 것 순서
  const ranked = ex.map((r, i) => ({ r, s: score(r), i })).sort((x, y) => y.s - x.s || x.i - y.i);
  const pick = (st, k) => ranked.filter((x) => x.r.status === st).slice(0, k).map(({ r }) => ({ a: r.st, b: r.dt, rel: r.rel }));
  const out = { pos: pick("confirmed", S.shotsPos), neg: pick("rejected", S.shotsNeg) };
  return out.pos.length || out.neg.length ? out : null;
}

/**
 * 노트 하나의 관계 제안. force = 지문 · 20분 간격을 무시 (하루 몫은 그대로).
 * 돌려주는 것: { asked, auto, suggested, skipped? }
 */
export async function suggestForNote(env, noteId, { force = false, ec = null } = {}) {
  const S = ontoSettings(env);
  const n = await env.DB.prepare("SELECT id, user_id, title, body, kind FROM notes WHERE id = ?").bind(noteId).first();
  if (!n || n.kind === "database") return { skipped: "no-note" };
  if (CONCEPT_LOW.has(n.title.trim().toLowerCase())) return { skipped: "concept" };
  if (!env.GROQ_API_KEY) return { skipped: "no-private-provider" }; // 노트 글은 Groq 에만 보내요
  const text = (n.title + "\n" + (n.body || "")).slice(0, 4000), hash = await sha(text);
  const seen = await env.DB.prepare("SELECT hash, at FROM onto_seen WHERE note_id = ?").bind(n.id).first();
  if (!force && seen && (seen.hash === hash || seen.at > now() - 20 * 60e3)) return { skipped: "seen" };
  const mark = () => env.DB.prepare("INSERT INTO onto_seen (note_id, user_id, hash, at) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(note_id) DO UPDATE SET hash = ?3, at = ?4").bind(n.id, n.user_id, hash, now()).run();
  if ((n.body || "").replace(/\s/g, "").length < 15) { await mark(); return { skipped: "short" }; }
  const made = await aiRowsToday(env, n.user_id);
  if (made >= S.daySuggest) return { skipped: "daily-suggest-cap" };
  const asked = await askedToday(env, n.user_id, "rel_type");
  if (asked >= S.dayAsk) return { skipped: "daily-ask-cap" };

  // 후보: [[링크]] 상대 먼저, 그다음 뜻이 가까운 노트
  const { results: lk } = await env.DB.prepare(
    `SELECT d.id FROM note_links l JOIN notes d ON lower(d.title) = lower(l.dst_title) AND d.user_id = ?2 WHERE l.src_id = ?1
     UNION SELECT s.id FROM note_links l JOIN notes s ON s.id = l.src_id AND s.user_id = ?2 WHERE lower(l.dst_title) = lower(?3)`).bind(n.id, n.user_id, n.title).all();
  const linkIds = new Set(lk.map((r) => r.id).filter((id) => id !== n.id));
  let near = [];
  try {
    const q = (n.title + "\n" + short(n.title, n.body, 1200)).slice(0, 1400);
    const [v] = await embed(env, [q]);
    await addNeurons(env, neuronsFor(q.length)).catch(() => {});
    near = await vecNeighbors(env, n.user_id, v, n.id, 8, S.neighborCos);
  } catch (e) { console.log("onto neighbors", String(e?.message || e)); }
  const order = [...linkIds, ...near.map((x) => x.id).filter((id) => !linkIds.has(id))];
  if (!order.length) { await mark(); return { asked: 0, auto: 0, suggested: 0 }; }
  const { results: had } = await env.DB.prepare(`SELECT src_id, dst_id FROM note_rel WHERE user_id = ? AND (src_id = ? OR dst_id = ?)`).bind(n.user_id, n.id, n.id).all();
  const done = new Set(had.map((r) => (r.src_id === n.id ? r.dst_id : r.src_id)));
  const pick = order.filter((id) => !done.has(id)).slice(0, Math.min(8, S.dayAsk - asked));
  if (!pick.length) { await mark(); return { asked: 0, auto: 0, suggested: 0 }; }
  const { results: cn } = await env.DB.prepare(`SELECT id, title, body FROM notes WHERE user_id = ? AND id IN (${inList(pick.length)})`).bind(n.user_id, ...pick).all();
  const by = new Map(cn.map((c) => [c.id, c]));
  const cands = pick.map((id) => by.get(id)).filter(Boolean);
  const pairs = cands.map((c) => ({ a: { id: n.id, title: n.title, body: n.body }, b: { id: c.id, title: c.title, body: c.body } }));
  const examples = await relExamples(env, n.user_id, pairs, S).catch((e) => { console.log("onto shots", String(e?.message || e)); return null; });
  const { results: judged, meta } = await judgePairs(env, pairs, { examples });
  // 정하기: 링크 있는 쌍 + 확신 높음 → auto, 나머지 확신 ≥ suggestMin → suggested (노트마다 3, 하루 몫 안에서)
  const out = { asked: cands.length, auto: 0, suggested: 0, engine: meta.used || meta.error || "", shots: examples ? examples.pos.length + examples.neg.length : 0 };
  const sugg = [];
  for (const [i, c] of cands.entries()) {
    const a = judged[i];
    // 판정 기록 (사람이 확인 · 거절하면 recordOutcome 이 outcome 을 붙여요 — 물은 방향 n → c 기준)
    const logId = await logDecision(env, { userId: n.user_id, kind: "rel_type", subject: `${n.id}>${c.id}`, engine: "llm-split", answer: a.choice, confidence: a.confidence, probabilities: { [a.choice]: a.confidence } }).catch(() => null);
    const rc = readRelChoice(a.choice);
    if (!rc) continue;
    const src = rc.swap ? c.id : n.id, dst = rc.swap ? n.id : c.id;
    const isLinked = linkIds.has(c.id) || (await linked(env, n.id, c.id));
    const evidence = (a.quote ? `“${a.quote}”${a.why ? " — " + a.why : ""}` : a.why || "").slice(0, 300) || null;
    const row = { src_id: src, dst_id: dst, rel: rc.rel, origin: "ai", confidence: a.confidence, evidence, decide_id: logId };
    if (isLinked && rc.rel === "related") continue; // 링크 = 이미 '관련' 이에요
    if (isLinked && a.confidence >= S.autoMin) sugg.push({ ...row, status: "auto" });
    else if (a.confidence >= S.suggestMin) sugg.push({ ...row, status: "suggested" });
  }
  sugg.sort((x, y) => (y.status === "auto") - (x.status === "auto") || y.confidence - x.confidence);
  let room = Math.min(S.noteSuggest, S.daySuggest - made);
  for (const r of sugg) {
    if (room <= 0) break;
    if (await pairRow(env, n.user_id, r.src_id, r.dst_id)) continue; // 그 사이 사람이 정했어요
    const t = now();
    await env.DB.prepare("INSERT OR IGNORE INTO note_rel (id, user_id, src_id, dst_id, rel, status, origin, confidence, evidence, decide_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'ai', ?, ?, ?, ?, ?)")
      .bind(uid(), n.user_id, r.src_id, r.dst_id, r.rel, r.status, r.confidence, r.evidence, r.decide_id, t, t).run();
    out[r.status === "auto" ? "auto" : "suggested"]++; room--;
  }
  await mark();
  return out;
}
/** 저장 직후 (waitUntil): 실패해도 크론이 다시 해요 */
export async function suggestSoon(env, noteId, ec) {
  try { return await suggestForNote(env, noteId, { ec }); } catch (e) { console.log("onto suggest", noteId, String(e?.message || e)); return null; }
}
/** 매시 크론 한 걸음: 바뀐 뒤 10분 넘게 조용한 노트 몇 개 (fetch 몫 left() 안에서 — Groq 3번 = 노트 하나) */
export async function ontoCron(env, { left = () => Infinity } = {}) {
  if (!env.GROQ_API_KEY) return { skipped: "no-private-provider" };
  const { results } = await env.DB.prepare(
    `SELECT n.id FROM notes n LEFT JOIN onto_seen s ON s.note_id = n.id
     WHERE coalesce(n.kind, 'page') != 'database' AND n.updated_at < ?1 AND (s.note_id IS NULL OR s.at < n.updated_at) AND length(coalesce(n.body, '')) >= 15
       AND EXISTS (SELECT 1 FROM chunks c WHERE c.user_id = n.user_id AND c.source_type = 'note' AND c.vec_state = 'done')
     ORDER BY n.updated_at DESC LIMIT 6`).bind(now() - 10 * 60e3).all();
  const out = { notes: 0, auto: 0, suggested: 0 };
  // 판정 기록은 180일 뒤 지워요 (사람 결과가 붙은 것은 1년 — 문턱값을 다시 맞출 때 써요)
  await env.DB.prepare("DELETE FROM decide_log WHERE created_at < ? AND (outcome IS NULL OR created_at < ?)").bind(now() - 180 * 86400e3, now() - 365 * 86400e3).run().catch(() => {});
  for (const r of results) {
    if (left() < 5) { out.stop = "budget"; break; }
    const x = await suggestForNote(env, r.id).catch((e) => ({ error: String(e?.message || e) }));
    if (x?.asked !== undefined) { out.notes++; out.auto += x.auto; out.suggested += x.suggested; }
  }
  return out;
}

// ---------- 새 노트 자리 (개념 5개) — embed-proto ----------
const PROTO_TTL = 6 * 3600e3, DESC_W = 2, PROTO_NOTES = 12;
// 설명 문장(CONCEPTS)이 바뀌면 캐시도 새로 — 판 이름에 문장 지문을 붙여요
const DESC_VER = (() => { let h = 5381; for (const ch of JSON.stringify(CONCEPTS)) h = ((h * 33) ^ ch.charCodeAt(0)) >>> 0; return h.toString(36); })();
const K_DESC = "concept_desc:" + DESC_VER, K_USER = "concept:" + DESC_VER;
// 짧은 노트는 자리 칩을 띄우지 않아요 — 한 줄 노트는 처음 쓰는 사람(설명만으로 만든 원형)에서 확신이 높아도 자주 틀려요 (scripts/onto-eval.mjs 짧은 노트: ≥0.85 정확 82%)
export const SORT_MIN_CHARS = 30;
async function descVectors(env) {
  const { results } = await env.DB.prepare("SELECT label, vec FROM decide_proto WHERE user_id = '' AND kind = ?").bind(K_DESC).all();
  const have = new Map(results.map((r) => [r.label, JSON.parse(r.vec)]));
  const miss = Object.keys(CONCEPTS).filter((k) => !have.has(k));
  if (miss.length) {
    const texts = miss.map((k) => `${k}: ${CONCEPTS[k]}`), vs = await embed(env, texts);
    await env.DB.batch(miss.map((k, i) => env.DB.prepare("INSERT OR REPLACE INTO decide_proto (user_id, kind, label, vec, n, updated_at) VALUES ('', ?, ?, ?, 0, ?)").bind(K_DESC, k, JSON.stringify(vs[i]), now())));
    miss.forEach((k, i) => have.set(k, vs[i]));
  }
  return have;
}
/** 사람마다 개념 원형 = 설명 벡터(가중 2) + 그 개념 아래 최근 노트 12개의 첫 조각 벡터 평균. 6시간 캐시 */
export async function conceptProtos(env, userId, { fresh = false } = {}) {
  if (!fresh) {
    const { results } = await env.DB.prepare("SELECT label, vec, n, updated_at FROM decide_proto WHERE user_id = ? AND kind = ?").bind(userId, K_USER).all();
    if (results.length === Object.keys(CONCEPTS).length && results.every((r) => r.updated_at > now() - PROTO_TTL)) return Object.fromEntries(results.map((r) => [r.label, JSON.parse(r.vec)]));
  }
  const desc = await descVectors(env);
  const { results: notes } = await env.DB.prepare("SELECT id, parent_id, title, updated_at FROM notes WHERE user_id = ?").bind(userId).all();
  const kids = new Map();
  for (const x of notes) if (x.parent_id) { if (!kids.has(x.parent_id)) kids.set(x.parent_id, []); kids.get(x.parent_id).push(x); }
  const vi = vecIndex(env), protos = {}, stmts = [];
  for (const label of Object.keys(CONCEPTS)) {
    const root = notes.find((x) => !x.parent_id && x.title.toLowerCase() === label.toLowerCase());
    const under = [];
    if (root) { const q = [...(kids.get(root.id) || [])]; while (q.length && under.length < 400) { const x = q.shift(); under.push(x); q.push(...(kids.get(x.id) || [])); } }
    under.sort((a, b) => b.updated_at - a.updated_at);
    let vals = [];
    if (vi && under.length) {
      const ids = under.slice(0, 40).map((x) => `note:${x.id}:0`);
      const { results: ok } = await env.DB.prepare(`SELECT id FROM chunks WHERE vec_state = 'done' AND user_id = ? AND id IN (${inList(ids.length)})`).bind(userId, ...ids).all();
      const got = ok.map((r) => r.id).slice(0, PROTO_NOTES);
      for (let i = 0; i < got.length; i += 20) { try { vals.push(...(await vi.getByIds(got.slice(i, i + 20))).map((v) => v.values).filter((v) => v?.length)); } catch (e) { console.log("onto proto getByIds", String(e?.message || e)); } }
      vals = vals.map((v) => Array.from(v));
    }
    const vec = meanVec([desc.get(label), ...vals], [DESC_W, ...vals.map(() => 1)]);
    protos[label] = vec;
    stmts.push(env.DB.prepare("INSERT OR REPLACE INTO decide_proto (user_id, kind, label, vec, n, updated_at) VALUES (?, ?, ?, ?, ?, ?)").bind(userId, K_USER, label, JSON.stringify(vec.map((x) => Math.round(x * 1e5) / 1e5)), vals.length, now()));
  }
  await env.DB.batch(stmts);
  return protos;
}
const conceptCriteria = () => Object.fromEntries(Object.entries(CONCEPTS).map(([k, v]) => [k, v]));
/** 노트 하나의 자리 제안 (맨 위 노트만) */
export async function sortSuggest(env, user, noteId, { ec = null } = {}) {
  const S = ontoSettings(env);
  const n = await env.DB.prepare("SELECT id, title, body, parent_id, kind, created_at, updated_at FROM notes WHERE id = ? AND user_id = ?").bind(noteId, user.id).first();
  if (!n) fail(404, "노트를 찾을 수 없어요.");
  if (n.parent_id || n.kind === "database" || CONCEPT_LOW.has(n.title.trim().toLowerCase())) return { show: false, reason: "not-root" };
  if (n.created_at < now() - 14 * 86400e3) return { show: false, reason: "old" };
  if ((n.body || "").replace(/\s/g, "").length < SORT_MIN_CHARS) return { show: false, reason: "short" };
  const last = await env.DB.prepare("SELECT id, answer, confidence, probs, outcome, created_at FROM decide_log WHERE user_id = ? AND kind = 'concept_sort' AND subject = ? ORDER BY created_at DESC LIMIT 1").bind(user.id, n.id).first();
  if (last?.outcome) return { show: false, reason: "answered", outcome: last.outcome };
  const view = (concept, confidence, logId, probabilities) => ({ show: concept !== UNKNOWN && confidence >= S.sortMin, concept, confidence, log_id: logId, probabilities, concept_id: null, min: S.sortMin });
  let r;
  if (last && last.created_at >= n.updated_at && last.created_at > now() - PROTO_TTL) r = view(last.answer, last.confidence, last.id, JSON.parse(last.probs || "{}"));
  else {
    if (!env.AI) return { show: false, reason: "no-ai" };
    const protos = await conceptProtos(env, user.id);
    const q = (n.title + "\n" + short(n.title, n.body, 1500)).slice(0, 1600);
    const [vec] = await embed(env, [q]);
    const { answers } = await decide(env, { questions: { c: { type: "choice", instructions: "이 노트는 어느 큰 개념 아래에 두면 좋을까요?", criteria: conceptCriteria(), protos } }, vec, engine: "embed-proto", log: { userId: user.id, kind: "concept_sort", subjects: { c: n.id } }, ec });
    const a = answers.c;
    r = view(a.choice, a.confidence, a.log_id, a.probabilities);
  }
  if (r.show) r.concept_id = (await env.DB.prepare("SELECT id FROM notes WHERE user_id = ? AND parent_id IS NULL AND lower(title) = lower(?)").bind(user.id, r.concept).first())?.id || null;
  return r;
}

// ---------- API ----------
const needAdmin = (user) => { if (user.role !== "admin" || user.imp_by) fail(403, "관리자만 쓸 수 있어요."); };
export function registerRels(on) {
  // 관리자 평가용 (scripts/onto-eval.mjs): 글 → 벡터 · decide 한 번 · 길 고르기 비교. 기록은 kind = "test"
  on("POST", "/decide/embed", async ({ req, env, user }) => {
    needAdmin(user);
    const b = await body(req);
    const texts = Array.isArray(b.texts) ? b.texts.slice(0, 64).map((t) => String(t).slice(0, 1800)) : fail(400, "texts");
    const vs = await embed(env, texts);
    await addNeurons(env, neuronsFor(texts.join("").length)).catch(() => {});
    return json({ vectors: vs });
  });
  on("POST", "/decide/run", async ({ req, env, user, ec }) => {
    needAdmin(user);
    const b = await body(req);
    try { return json(await decide(env, { state: String(b.state || "").slice(0, 9000), questions: b.questions, engine: b.engine || "auto", private: b.private !== false, vec: Array.isArray(b.vec) ? b.vec : null, samples: Math.max(1, Math.min(5, Number(b.samples) || 3)), log: { userId: user.id, kind: "test", subjects: {} }, ec }).then(({ answers, meta }) => ({ answers, meta }))); }
    catch (e) { fail(400, String(e?.message || e)); }
  });
  // 관리자 평가용: 실제 제안과 같은 판정(judgePairs — 나눠 묻기 · few-shot · 근거 문장). 기록 안 남겨요
  on("POST", "/onto/rel-judge", async ({ req, env, user }) => {
    needAdmin(user);
    const b = await body(req);
    const note = (x) => ({ title: String(x?.title || "").slice(0, 120), body: String(x?.body || "").slice(0, 2000) });
    const pairs = Array.isArray(b.pairs) ? b.pairs.slice(0, 10).map((p) => ({ a: note(p.a), b: note(p.b) })) : fail(400, "pairs");
    const ex = (xs) => (Array.isArray(xs) ? xs.slice(0, 8).map((x) => ({ a: String(x.a || "").slice(0, 120), b: String(x.b || "").slice(0, 120), rel: REL[x.rel] ? x.rel : null })) : []);
    const examples = b.examples ? { pos: ex(b.examples.pos), neg: ex(b.examples.neg) } : null;
    return json(await judgePairs(env, pairs, { examples, samples: Math.max(1, Math.min(5, Number(b.samples) || 3)) }));
  });
  on("POST", "/decide/route-eval", async ({ req, env, user }) => {
    needAdmin(user);
    const { routeRules, routeAsk } = await import("./airoute.js");
    const b = await body(req);
    const qs = Array.isArray(b.questions) ? b.questions.slice(0, 60).map((x) => String(x).slice(0, 500)) : fail(400, "questions");
    const out = [];
    for (const x of qs) out.push({ rules: routeRules(x), full: await routeAsk(env, null, x, "test", { log: false }) });
    return json({ results: out });
  });
  // 제안함 · 관계 목록 (내 것만). status = suggested(기본) | auto | confirmed | all
  on("GET", "/rels", async ({ env, user, q }) => {
    const st = q.get("status") || "suggested";
    const where = st === "all" ? "status != 'rejected'" : STATUS.has(st) ? "status = ?2" : fail(400, "status");
    const { results } = await env.DB.prepare(`SELECT ${COLS} FROM note_rel r WHERE r.user_id = ?1 AND ${where} ORDER BY coalesce(r.confidence, 1) DESC, r.updated_at DESC LIMIT 200`).bind(user.id, ...(st === "all" ? [] : [st])).all();
    const cnt = await env.DB.prepare("SELECT status, COUNT(*) n FROM note_rel WHERE user_id = ? GROUP BY status").bind(user.id).all();
    return json({ rels: await withTitles(env, user.id, results), counts: Object.fromEntries(cnt.results.map((r) => [r.status, r.n])), labels: Object.fromEntries(REL_KEYS.map((k) => [k, REL[k].ko])) });
  });
  // 관계 정하기 (사람) · 되돌리기(restore: 전 행 그대로 — status · origin 도 받아요)
  on("PUT", "/rels", async ({ req, env, user }) => {
    const b = await body(req);
    const restore = b.restore === true;
    const r = await setRel(env, user.id, {
      src_id: String(b.src_id || ""), dst_id: String(b.dst_id || ""), rel: String(b.rel || "related"),
      status: restore ? String(b.status || "confirmed") : b.status === "rejected" ? "rejected" : "confirmed",
      origin: restore ? String(b.origin || "human") : "human",
      confidence: restore && typeof b.confidence === "number" ? b.confidence : null,
      evidence: restore && typeof b.evidence === "string" ? b.evidence.slice(0, 300) : null,
      restore,
    });
    // 연결할 때 AI 가 먼저 짐작한 답(guess)이 있었으면 사람 결과를 적어요
    if (typeof b.guess_log === "string" && b.guess_log && !restore) {
      const lg = await env.DB.prepare("SELECT subject FROM decide_log WHERE id = ? AND user_id = ? AND kind = 'rel_guess'").bind(b.guess_log, user.id).first();
      const [as, ad] = String(lg?.subject || "").split(">");
      if (as && ad) await recordOutcome(env, { logId: b.guess_log, userId: user.id }, outcomeLabel(as, ad, r.rel.src_id, r.rel.dst_id, r.rel.rel));
    }
    return json(r);
  });
  // 제안함 버튼: 확정 · 다른 종류 · 거절 · 방향 바꾸기
  on("PATCH", "/rels/:id", async ({ req, env, user, params }) => {
    const row = await env.DB.prepare(`SELECT ${COLS} FROM note_rel r WHERE r.id = ? AND r.user_id = ?`).bind(params.id, user.id).first();
    if (!row) fail(404, "그 관계를 찾을 수 없어요.");
    const b = await body(req);
    const action = String(b.action || "confirm");
    const swap = b.swap === true;
    const next = { src_id: swap ? row.dst_id : row.src_id, dst_id: swap ? row.src_id : row.dst_id, rel: b.rel ? String(b.rel) : row.rel, confidence: row.confidence, evidence: row.evidence };
    if (action === "reject") return json(await setRel(env, user.id, { ...next, rel: row.rel, status: "rejected", origin: row.origin }));
    if (action !== "confirm") fail(400, "action");
    return json(await setRel(env, user.id, { ...next, status: "confirmed", origin: row.origin }));
  });
  // 쌍으로 지우기 (연결하며 고른 관계를 되돌릴 때 — 다시 하기마다 id 가 바뀌어서 쌍으로 찾아요)
  on("DELETE", "/rels/pair", async ({ env, user, q }) => {
    const row = await pairRow(env, user.id, String(q.get("a") || ""), String(q.get("b") || ""));
    if (!row) return json({ prev: null });
    await env.DB.prepare("DELETE FROM note_rel WHERE id = ? AND user_id = ?").bind(row.id, user.id).run();
    if (row.decide_id) await env.DB.prepare("UPDATE decide_log SET outcome = NULL, outcome_at = NULL WHERE id = ? AND user_id = ?").bind(row.decide_id, user.id).run();
    return json({ prev: row });
  });
  // 행 지우기 (새로 만든 관계를 되돌릴 때). 지운 쌍은 다시 제안될 수 있어요 — 거절은 PATCH reject
  on("DELETE", "/rels/:id", async ({ env, user, params }) => {
    const row = await env.DB.prepare(`SELECT ${COLS} FROM note_rel r WHERE r.id = ? AND r.user_id = ?`).bind(params.id, user.id).first();
    if (!row) fail(404, "그 관계를 찾을 수 없어요.");
    await env.DB.prepare("DELETE FROM note_rel WHERE id = ? AND user_id = ?").bind(row.id, user.id).run();
    if (row.decide_id) await env.DB.prepare("UPDATE decide_log SET outcome = NULL, outcome_at = NULL WHERE id = ? AND user_id = ?").bind(row.decide_id, user.id).run();
    return json({ prev: row });
  });
  // 연결 직후 AI 짐작 (한 쌍 · Groq 만 · 3표). 하루 ONTO_DAILY_GUESS 번까지
  on("GET", "/rels/guess", async ({ env, user, q, ec }) => {
    const a = String(q.get("src") || ""), b = String(q.get("dst") || "");
    if (!a || !b || a === b) fail(400, "노트 두 개가 필요해요.");
    const S = ontoSettings(env);
    if (!env.GROQ_API_KEY) return json({ rel: null, reason: "no-private-provider" });
    if ((await askedToday(env, user.id, "rel_guess")) >= S.dayGuess) return json({ rel: null, reason: "daily-cap" });
    const { results } = await env.DB.prepare(`SELECT id, title, body FROM notes WHERE user_id = ? AND id IN (?, ?)`).bind(user.id, a, b).all();
    const A = results.find((x) => x.id === a), B = results.find((x) => x.id === b);
    if (!A || !B) fail(404, "노트를 찾을 수 없어요.");
    const pairs = [{ a: A, b: B }];
    const examples = await relExamples(env, user.id, pairs, S).catch(() => null);
    const x = (await judgePairs(env, pairs, { examples })).results[0], rc = readRelChoice(x.choice);
    const probabilities = { [x.choice]: x.confidence };
    const logId = await logDecision(env, { userId: user.id, kind: "rel_guess", subject: `${a}>${b}`, engine: "llm-split", answer: x.choice, confidence: x.confidence, probabilities }).catch(() => null);
    return json({ rel: rc?.rel || null, src_id: rc?.swap ? b : a, dst_id: rc?.swap ? a : b, choice: x.choice, confidence: x.confidence, why: x.why || "", quote: x.quote || "", log_id: logId, probabilities });
  });
  // 이 노트의 관계 제안을 지금 (내 노트만 · 하루 몫은 그대로)
  on("POST", "/rels/suggest/:id", async ({ env, user, params, ec }) => {
    const n = await env.DB.prepare("SELECT id FROM notes WHERE id = ? AND user_id = ?").bind(params.id, user.id).first();
    if (!n) fail(404, "노트를 찾을 수 없어요.");
    return json(await suggestForNote(env, n.id, { force: true, ec }));
  });
  // 새 노트 자리 제안 · 결과
  on("GET", "/notes/:id/sort", async ({ env, user, params, ec }) => json(await sortSuggest(env, user, params.id, { ec })));
  on("POST", "/notes/:id/sort", async ({ req, env, user, params }) => {
    const b = await body(req);
    if (typeof b.log_id !== "string" || !b.log_id) fail(400, "log_id");
    const row = await env.DB.prepare("SELECT id FROM decide_log WHERE id = ? AND user_id = ? AND kind = 'concept_sort' AND subject = ?").bind(b.log_id, user.id, params.id).first();
    if (!row) fail(404, "그 제안을 찾을 수 없어요.");
    const picked = typeof b.picked === "string" && CONCEPTS[b.picked] ? b.picked : "rejected";
    await recordOutcome(env, { logId: row.id, userId: user.id }, picked);
    return json({ ok: true, outcome: picked });
  });
}
