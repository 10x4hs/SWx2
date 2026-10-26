// decide() — 작은 판정 하나를 Jev(TypeSafe AI systemone) 모양으로 (2026-10-24, docs.typesafe.ai/primitives).
//   decide(env, { state, questions, engine?, private?, vec?, log?, ec? }) → { answers: { id: { type, choice | score | value, probabilities, confidence, engine, … } } }
//     questions: { id: { type: "choice", instructions, criteria: { 이름: 설명 } (255개까지), protos?: { 이름: 벡터 } }
//                     | { type: "score", instructions, criteria: [수준 설명 …] (낮음 → 높음) }
//                     | { type: "noul", instructions, criteria?: 문자열 } }      → noul 답은 value 0..1
//     choice 에는 늘 "unknown"(판단 어려움 · 사람이 보기)을 넣어요 (Jev 문서의 권고). 큰 판단은 작은 질문 여러 개로 나눠 코드에서 합쳐요.
//   엔진 (engine 으로 고르거나 "auto" = protos+vec 가 있으면 embed-proto, 아니면 llm)
//     · embed-proto : 상태 벡터(vec) 와 라벨 원형(protos) 의 코사인 → softmax(온도 T) · unknown 은 '기준선(floor)' 로짓. 확신 = 1등 − 2등 확률. 공짜 · 늘 같은 답.
//     · llm         : Groq JSON 을 N=3 번(온도 0.7) 뽑아 표를 세요 → 확률 = 표 비율, 확신 = 1등 표 / N (Groq 는 logprobs 가 없어요).
//                     private(기본 true)이면 Groq 만 — 무료 등급 데이터로 학습하지 않는 곳만 (cimask.js PRIVATE_SAFE 와 같은 규칙). Groq 가 안 되면 unknown(확신 0).
//                     private=false 일 때만 다른 공급사(ai.js aiJson 순서)로 넘어가요.
//     · jev / laya  : /v1/systemone 어댑터. JEV_API_KEY(api.typesafe.ai) · LAYA_URL 이 있을 때만. 개인 자료(private)는 DECIDE_EXT_PRIVATE=1 일 때만 보내요.
//   그림자(shadow): DECIDE_SHADOW=jev|laya 면 같은 질문을 뒤에서(ec.waitUntil) 그 엔진에도 묻고 decide_log 에 나란히 적기만 해요 (답으로 쓰지 않아요) — 나중에 한국어 정확도 비교용.
//   기록: log = { userId, kind, subjects: { id: 열쇠 } } 를 주면 답마다 decide_log 한 줄 (노트 글은 적지 않아요). answers[id].log_id 로 나중에 사람 결과(outcome)를 적어요.
//   이 파일은 다른 모듈을 정적으로 불러오지 않아요 (node 로 바로 시험: scripts/smoke.mjs 의 decide 검사). 다른 공급사 대체만 ai.js 를 늦게 불러요.

export const UNKNOWN = "unknown";
const UNKNOWN_DESC = "판단하기 어렵거나 자료가 부족해요 (사람이 보는 게 좋아요)";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_CHAIN = ["openai/gpt-oss-120b", "openai/gpt-oss-20b", "qwen/qwen3.8-27b"]; // 하루 토큰(모델마다 20만)이 다 차면 다음 모델로 — ai.js groq 체인과 같아요
export const LLM_SAMPLES = 3;
const JEV_URL = "https://api.typesafe.ai/v1/systemone";

// embed-proto 기본값 — scripts/onto-eval.mjs 로 맞췄어요 (보고 참고). 환경값 DECIDE_PROTO_T · DECIDE_PROTO_FLOOR 로 바꿀 수 있어요.
export const PROTO_DEFAULTS = { T: 0.005, floor: 0.3 }; // 개념 5개 · 노트 55개 (2026-10-24): leave-one-out 확신≥0.85 정확 98% · 덮음 91% · 설명만(처음 쓰는 사람) 95% · 78%

const uidish = () => crypto.randomUUID().replace(/-/g, "").slice(0, 20);
const round = (x, n = 4) => Math.round(x * 10 ** n) / 10 ** n;

/** 질문 다듬기: choice 에 unknown 넣기 · 255개 상한 · 이름 검사. 잘못된 질문은 던져요 */
export function normalizeQuestions(questions) {
  if (!questions || typeof questions !== "object") throw new Error("questions 가 필요해요");
  const out = {};
  for (const [id, q] of Object.entries(questions)) {
    if (!/^[A-Za-z0-9_.:-]{1,64}$/.test(id)) throw new Error("질문 id: " + id);
    const instructions = String(q?.instructions || "").slice(0, 2000);
    if (q?.type === "choice") {
      const criteria = { ...(q.criteria || {}) };
      if (!Object.hasOwn(criteria, UNKNOWN)) criteria[UNKNOWN] = UNKNOWN_DESC;
      const names = Object.keys(criteria);
      if (names.length < 2 || names.length > 255) throw new Error("choice 선택지는 2~255개예요");
      // evidence: 근거 문장을 찾을 글 (있으면 llm 이 quote 를 글자 그대로 옮겨야 하고, 그 글에 없는 quote 의 표는 버려요 · none/unknown 은 빼고)
      out[id] = { type: "choice", instructions, criteria, protos: q.protos || null, evidence: typeof q.evidence === "string" && q.evidence.trim() ? q.evidence.slice(0, 8000) : null };
    } else if (q?.type === "score") {
      const levels = Array.isArray(q.criteria) ? q.criteria.map((x) => String(x).slice(0, 300)) : [];
      if (levels.length < 2 || levels.length > 11) throw new Error("score 수준은 2~11개예요");
      out[id] = { type: "score", instructions, criteria: levels };
    } else if (q?.type === "noul") {
      out[id] = { type: "noul", instructions, criteria: typeof q.criteria === "string" ? q.criteria.slice(0, 600) : "" };
    } else throw new Error("모르는 질문 종류: " + q?.type);
  }
  return out;
}

// ---------- embed-proto ----------
const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
const norm = (a) => Math.sqrt(dot(a, a)) || 1;
export const cosine = (a, b) => dot(a, b) / (norm(a) * norm(b));
/** 벡터 여러 개의 평균 방향 (각각 길이 1 로 맞춘 뒤 더해요). weights 를 주면 가중 평균 */
export function meanVec(list, weights = null) {
  const d = list[0]?.length || 0, out = new Array(d).fill(0);
  list.forEach((v, j) => { const n = norm(v), w = weights ? weights[j] : 1; for (let i = 0; i < d; i++) out[i] += (v[i] / n) * w; });
  const n = norm(out);
  return out.map((x) => x / n);
}
/** 코사인 → 확률. labels 순서는 protos 의 순서 + unknown. 늘 같은 입력이면 같은 답 (난수 없음) */
export function protoProbs(vec, protos, { T = PROTO_DEFAULTS.T, floor = PROTO_DEFAULTS.floor } = {}) {
  const labels = Object.keys(protos).filter((k) => k !== UNKNOWN && Array.isArray(protos[k]) && protos[k].length);
  const cos = Object.fromEntries(labels.map((k) => [k, cosine(vec, protos[k])]));
  const logits = labels.map((k) => cos[k] / T);
  const all = [...labels, UNKNOWN];
  logits.push(floor / T);
  const m = Math.max(...logits), ex = logits.map((x) => Math.exp(x - m)), s = ex.reduce((a, b) => a + b, 0);
  const probabilities = Object.fromEntries(all.map((k, i) => [k, round(ex[i] / s)]));
  const sorted = Object.entries(probabilities).sort((a, b) => b[1] - a[1]);
  return { choice: sorted[0][0], probabilities, confidence: round(sorted[0][1] - (sorted[1]?.[1] || 0)), cos: Object.fromEntries(Object.entries(cos).map(([k, v]) => [k, round(v)])) };
}

// ---------- llm ----------
function llmPrompt(state, Q) {
  // 같은 선택지를 쓰는 질문이 여럿이면(관계 쌍 8개처럼) 선택지는 한 번만 적어요 — 토큰을 아껴요 (Groq 무료 분당 토큰이 작아요)
  const sig = (q) => (q.type === "choice" ? JSON.stringify(q.criteria) : q.type === "score" ? JSON.stringify(q.criteria) : "");
  const groups = new Map();
  for (const [id, q] of Object.entries(Q)) { const k = q.type + sig(q); if (!groups.has(k)) groups.set(k, { q, ids: [] }); groups.get(k).ids.push(id); }
  const lines = [];
  for (const { q, ids } of groups.values()) {
    if (q.type === "choice") { lines.push(`선택지 (질문 ${ids.join(", ")} 공통 · 이름: 뜻):`); for (const [k, v] of Object.entries(q.criteria)) lines.push(`- ${k}: ${v}`); }
    if (q.type === "score") { lines.push(`수준 (질문 ${ids.join(", ")} 공통 · 번호: 뜻, 낮음 → 높음):`); q.criteria.forEach((v, i) => lines.push(`- ${i}: ${v}`)); }
    for (const id of ids) { const x = Q[id]; lines.push(`[질문 ${id}] ${x.instructions}${x.type === "noul" ? ` (예/아니요 — 답은 0~1 숫자${x.criteria ? ". " + x.criteria : ""})` : ""}`); }
    lines.push("");
  }
  const shape = Object.entries(Q).map(([id, q]) => `"${id}": {"answer": ${q.type === "choice" ? '"<선택지 이름>"' : q.type === "score" ? "<수준 번호>" : "<0~1 숫자>"}, ${q.evidence ? '"quote": "<자료의 노트 본문에서 글자 그대로 옮긴 근거 문장 하나>", ' : ""}"why": "<근거 한 문장, 40자 이내>"}`).join(", ");
  const needQuote = Object.values(Q).some((q) => q.evidence);
  return {
    system: "너는 조심스러운 판정기야. 각 질문에 주어진 선택지 이름 중 정확히 하나만 고르고, 자료로 판단이 어려우면 unknown 을 골라. 지어내지 마. 근거(why)는 자료 속 표현을 짧게 인용하거나 요약해. 반드시 JSON 객체 하나만 출력해.",
    user: `[자료]\n${String(state).slice(0, 9000)}\n\n${lines.join("\n")}\n${needQuote ? "quote 는 반드시 노트 본문에 있는 문장을 한 글자도 바꾸지 말고 옮겨. 그런 문장이 없으면 none 이나 unknown 을 골라.\n" : ""}출력 형식: {"answers": {${shape}}}`,
  };
}
async function groqOnce(env, system, user, temperature) {
  if (env.__AI_MOCK) return { data: { answers: {} }, model: "mock", usage: null }; // 로컬 검사 (AI_MOCK): 모두 unknown
  let last = null, retried = false;
  for (let i = 0; i < GROQ_CHAIN.length; i++) {
    const model = GROQ_CHAIN[i];
    try {
      const res = await fetch(GROQ_URL, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${env.GROQ_API_KEY}` },
        body: JSON.stringify({ model, messages: [{ role: "system", content: system }, { role: "user", content: user }], response_format: { type: "json_object" }, temperature, max_tokens: 2048, ...(model.startsWith("openai/gpt-oss") ? { reasoning_effort: "low" } : {}) }),
      });
      if (res.status === 429 && !retried) {
        // 분당 토큰(8천)에 걸리면: 기다릴 시간이 짧으면 같은 모델로 한 번 더 (아니면 다음 모델)
        const wait = Number(res.headers.get("retry-after")) || 0;
        if (wait > 0 && wait <= 12) { retried = true; await new Promise((r) => setTimeout(r, wait * 1000 + 200)); i--; continue; }
      }
      if (!res.ok) { last = new Error("groq " + res.status); if ([429, 503, 404, 400, 413].includes(res.status)) continue; throw last; }
      const j = await res.json();
      const text = j.choices?.[0]?.message?.content || "";
      const a = text.indexOf("{"), b = text.lastIndexOf("}");
      return { data: JSON.parse(a >= 0 ? text.slice(a, b + 1) : text), model, usage: j.usage || null };
    } catch (e) { last = e; }
  }
  throw last || new Error("groq failed");
}
async function otherOnce(env, system, user) {
  if (env.__AI_MOCK) return { data: { answers: {} }, model: "mock", usage: null };
  const { aiJson } = await import("./ai.js"); // 개인 자료가 아닐 때만 여기까지 와요
  const r = await aiJson(env, system, user);
  return { data: r.data, model: r.provider + ":" + r.model, usage: r.usage || null };
}
// 근거 문장 확인: 띄어쓰기 · 문장부호를 빼고 글 안에 있는지 (6글자 이상)
const squash = (t) => String(t || "").toLowerCase().replace(/[\s"'“”‘’「」『』()\[\].,!?·…:;~\-]/g, "");
export function quoteFound(quote, text) { const qq = squash(quote); return qq.length >= 6 && squash(text).includes(qq); }
/** 한 표(sample)의 답을 질문 모양에 맞게 — 틀린 이름 · 범위 밖은 버려요 */
function readVote(q, v) {
  const a = v && typeof v === "object" ? v.answer ?? v.choice ?? v.score ?? v.value : v;
  if (q.type === "choice") { const k = String(a ?? "").trim(); return Object.hasOwn(q.criteria, k) ? k : null; }
  if (q.type === "score") { const n = Number(a); return Number.isInteger(n) && n >= 0 && n < q.criteria.length ? n : null; }
  const x = Number(a); return Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : null;
}
async function runLlm(env, state, Q, { private: priv = true, samples = LLM_SAMPLES, temperature = 0.7 } = {}) {
  const { system, user } = llmPrompt(state, Q);
  const once = async () => {
    if (env.GROQ_API_KEY) { try { return await groqOnce(env, system, user, temperature); } catch (e) { if (priv) throw e; } }
    else if (priv) throw new Error("no private-safe provider");
    return otherOnce(env, system, user);
  };
  const got = (await Promise.allSettled(Array.from({ length: samples }, once))).filter((r) => r.status === "fulfilled").map((r) => r.value);
  const used = [...new Set(got.map((g) => g.model))].join(",");
  const tokens = got.reduce((a, g) => a + (g.usage?.total_tokens || 0), 0);
  const answers = {};
  for (const [id, q] of Object.entries(Q)) {
    const votes = [], whys = new Map(), quotes = new Map();
    let dropped = 0;
    for (const g of got) {
      const raw = g.data?.answers?.[id] ?? g.data?.[id];
      const v = readVote(q, raw);
      if (v === null) continue;
      // 근거를 요구한 질문: 관계를 골랐는데 quote 가 본문에 없으면 그 표는 버려요 (지어낸 근거)
      const quote = raw && typeof raw.quote === "string" ? raw.quote.slice(0, 200) : "";
      if (q.evidence && v !== "none" && v !== UNKNOWN && !quoteFound(quote, q.evidence)) { dropped++; continue; }
      votes.push(v);
      if (!whys.has(v) && raw && typeof raw.why === "string") whys.set(v, raw.why.slice(0, 160));
      if (q.evidence && quote && !quotes.has(v)) quotes.set(v, quote);
    }
    if (q.type === "noul") {
      const value = votes.length ? round(votes.reduce((a, b) => a + b, 0) / votes.length, 3) : null;
      const spread = votes.length > 1 ? Math.max(...votes) - Math.min(...votes) : 1;
      answers[id] = { type: "noul", value, confidence: votes.length ? round((votes.length / samples) * (1 - spread), 3) : 0, engine: "llm", samples: votes.length };
      continue;
    }
    const keys = q.type === "choice" ? Object.keys(q.criteria) : q.criteria.map((_, i) => i);
    const cnt = new Map(keys.map((k) => [k, 0]));
    for (const v of votes) cnt.set(v, (cnt.get(v) || 0) + 1);
    const probabilities = Object.fromEntries(keys.map((k) => [k, round((cnt.get(k) || 0) / samples, 3)]));
    if (!votes.length) probabilities[q.type === "choice" ? UNKNOWN : 0] = 1;
    const best = [...cnt.entries()].sort((a, b) => b[1] - a[1])[0];
    const top = votes.length ? best[0] : q.type === "choice" ? UNKNOWN : null;
    const conf = votes.length ? round(best[1] / samples, 3) : 0;
    answers[id] = q.type === "choice"
      ? { type: "choice", choice: top, probabilities, confidence: conf, engine: "llm", why: whys.get(top) || "", samples: votes.length, ...(q.evidence ? { quote: quotes.get(top) || "", dropped } : {}) }
      : { type: "score", score: top, legend: q.criteria, probabilities, confidence: conf, engine: "llm", why: whys.get(top) || "", samples: votes.length };
  }
  return { answers, meta: { used, tokens, calls: samples, ok: got.length } };
}

// ---------- jev / laya (/v1/systemone) ----------
export const extAvailable = (env, kind) => (kind === "jev" ? !!env.JEV_API_KEY : kind === "laya" ? !!env.LAYA_URL : false);
const extAllowed = (env, priv) => !priv || env.DECIDE_EXT_PRIVATE === "1";
async function runExt(env, kind, state, Q) {
  const url = kind === "jev" ? JEV_URL : String(env.LAYA_URL).replace(/\/$/, "") + "/v1/systemone";
  const key = kind === "jev" ? env.JEV_API_KEY : env.LAYA_KEY;
  const questions = Object.fromEntries(Object.entries(Q).map(([id, q]) => [id, q.type === "noul" ? { type: "noul", instructions: q.instructions, ...(q.criteria ? { criteria: q.criteria } : {}) } : { type: q.type, instructions: q.instructions, criteria: q.criteria }]));
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...(key ? { authorization: `Bearer ${key}` } : {}) },
    body: JSON.stringify({ state: typeof state === "string" ? state : JSON.stringify(state), model: kind === "jev" ? env.JEV_MODEL || "jev-latest" : env.LAYA_MODEL || "laya", questions }),
  });
  if (!res.ok) throw new Error(kind + " " + res.status);
  const j = await res.json(), answers = {};
  for (const [id, q] of Object.entries(Q)) {
    const a = j.answers?.[id] || {};
    if (q.type === "choice") answers[id] = { type: "choice", choice: Object.hasOwn(q.criteria, a.choice) ? a.choice : UNKNOWN, probabilities: a.probabilities || {}, confidence: Number(a.confidence ?? 0), engine: kind };
    else if (q.type === "score") answers[id] = { type: "score", score: a.score ?? null, legend: a.legend || q.criteria, probabilities: a.probabilities || {}, confidence: Number(a.confidence ?? 0), engine: kind };
    else answers[id] = { type: "noul", value: typeof a.noul === "number" ? a.noul : null, confidence: null, engine: kind };
  }
  return { answers, meta: { used: kind, calls: 1 } };
}

// ---------- 기록 ----------
const answerText = (a) => String(a.type === "choice" ? a.choice : a.type === "score" ? a.score : a.value);
const topProbs = (p) => (p ? JSON.stringify(Object.fromEntries(Object.entries(p).sort((a, b) => b[1] - a[1]).slice(0, 5))) : null);
async function writeLog(env, log, answers) {
  if (!env.DB || !log) return;
  const t = Date.now(), stmts = [];
  for (const [id, a] of Object.entries(answers)) {
    a.log_id = uidish();
    stmts.push(env.DB.prepare("INSERT INTO decide_log (id, user_id, kind, subject, engine, answer, confidence, probs, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(a.log_id, log.userId || null, String(log.kind || "test").slice(0, 40), String(log.subjects?.[id] ?? id).slice(0, 200), a.engine, answerText(a).slice(0, 80), a.confidence ?? null, topProbs(a.probabilities), t));
  }
  if (stmts.length) await env.DB.batch(stmts);
}
/** 규칙(rules) 처럼 decide() 밖에서 정한 판정도 같은 표에 — 돌려주는 것: log id */
export async function logDecision(env, { userId = null, kind, subject = "", engine, answer, confidence = null, probabilities = null }) {
  if (!env.DB) return null;
  const id = uidish();
  await env.DB.prepare("INSERT INTO decide_log (id, user_id, kind, subject, engine, answer, confidence, probs, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(id, userId, String(kind).slice(0, 40), String(subject).slice(0, 200), engine, String(answer).slice(0, 80), confidence, topProbs(probabilities), Date.now()).run();
  return id;
}
/** 사람 결과 적기 — label = 사람이 고른 답(맞으면 answer 와 같아요) */
export async function recordOutcome(env, { logId = null, userId, kind = null, subject = null }, label) {
  if (!env.DB) return;
  const t = Date.now(), l = String(label).slice(0, 80);
  if (logId) return env.DB.prepare("UPDATE decide_log SET outcome = ?, outcome_at = ? WHERE id = ? AND user_id IS ?").bind(l, t, logId, userId ?? null).run();
  return env.DB.prepare("UPDATE decide_log SET outcome = ?, outcome_at = ? WHERE id = (SELECT id FROM decide_log WHERE user_id IS ? AND kind = ? AND subject = ? ORDER BY created_at DESC LIMIT 1)").bind(l, t, userId ?? null, kind, subject).run();
}

/**
 * 판정 하나 (질문 여러 개를 한 번에).
 * opts.engine: "auto" | "embed-proto" | "llm" | "jev" | "laya" · opts.private(기본 true) · opts.vec(embed-proto 상태 벡터)
 */
export async function decide(env, { state = "", questions, engine = "auto", private: priv = true, vec = null, log = null, ec = null, samples, proto = null } = {}) {
  const Q = normalizeQuestions(questions);
  const answers = {};
  let meta = { calls: 0 };
  const llmQ = {};
  for (const [id, q] of Object.entries(Q)) {
    const useProto = q.type === "choice" && q.protos && vec && (engine === "embed-proto" || engine === "auto");
    if (useProto) {
      const P = { T: Number(env.DECIDE_PROTO_T || proto?.T || PROTO_DEFAULTS.T), floor: Number(env.DECIDE_PROTO_FLOOR || proto?.floor || PROTO_DEFAULTS.floor) };
      const protos = Object.fromEntries(Object.keys(q.criteria).filter((k) => q.protos[k]).map((k) => [k, q.protos[k]]));
      answers[id] = { type: "choice", ...protoProbs(vec, protos, P), engine: "embed-proto" };
    } else if (engine === "embed-proto") {
      answers[id] = q.type === "choice" ? { type: "choice", choice: UNKNOWN, probabilities: { [UNKNOWN]: 1 }, confidence: 0, engine: "embed-proto" } : { type: q.type, score: null, value: null, confidence: 0, engine: "embed-proto" };
    } else llmQ[id] = q;
  }
  if (Object.keys(llmQ).length) {
    const ext = engine === "jev" || engine === "laya" ? engine : null;
    try {
      if (ext) {
        if (!extAvailable(env, ext)) throw new Error(ext + " unavailable");
        if (!extAllowed(env, priv)) throw new Error(ext + " not allowed for private state");
        const r = await runExt(env, ext, state, llmQ); Object.assign(answers, r.answers); meta = r.meta;
      } else { const r = await runLlm(env, state, llmQ, { private: priv, samples: samples || LLM_SAMPLES }); Object.assign(answers, r.answers); meta = r.meta; }
    } catch (e) {
      meta = { error: String(e?.message || e) };
      for (const [id, q] of Object.entries(llmQ)) answers[id] = q.type === "choice" ? { type: "choice", choice: UNKNOWN, probabilities: { [UNKNOWN]: 1 }, confidence: 0, engine: ext || "none" } : q.type === "score" ? { type: "score", score: null, legend: q.criteria, probabilities: {}, confidence: 0, engine: ext || "none" } : { type: "noul", value: null, confidence: 0, engine: ext || "none" };
    }
  }
  await writeLog(env, log, answers).catch((e) => console.log("decide log", String(e?.message || e)));
  // 그림자: 뒤에서 묻고 적기만
  const sh = env.DECIDE_SHADOW;
  let shadow = null;
  if ((sh === "jev" || sh === "laya") && sh !== engine && extAvailable(env, sh) && extAllowed(env, priv)) {
    shadow = runExt(env, sh, state, Q).then(async (r) => {
      if (!env.DB || !log) return r;
      const stmts = Object.entries(r.answers).filter(([id]) => answers[id]?.log_id).map(([id, a]) => env.DB.prepare("UPDATE decide_log SET shadow_engine = ?, shadow_answer = ?, shadow_conf = ? WHERE id = ?").bind(sh, answerText(a).slice(0, 80), a.confidence ?? null, answers[id].log_id));
      if (stmts.length) await env.DB.batch(stmts);
      return r;
    }).catch((e) => { console.log("decide shadow", sh, String(e?.message || e)); return null; });
    if (ec?.waitUntil) ec.waitUntil(shadow);
  }
  return { answers, meta, shadow };
}

// ---------- 관리자: 엔진별 · 질문 종류별 정확도 (사람 결과와 비교) ----------
export function registerDecide(on, { json, fail }) {
  on("GET", "/decide/stats", async ({ env, user, q }) => {
    if (user.role !== "admin" || user.imp_by) fail(403, "관리자만 쓸 수 있어요.");
    const days = Math.max(1, Math.min(365, Number(q.get("days")) || 90)), since = Date.now() - days * 86400e3;
    const [rows, buckets, shadow, recent] = await env.DB.batch([
      env.DB.prepare(`SELECT kind, engine, COUNT(*) n, SUM(outcome IS NOT NULL) judged, SUM(outcome = answer) correct, ROUND(AVG(confidence), 3) avg_conf, SUM(answer = 'unknown') unknowns
        FROM decide_log WHERE created_at > ? GROUP BY kind, engine ORDER BY kind, engine`).bind(since),
      env.DB.prepare(`SELECT kind, engine, CASE WHEN confidence >= 0.85 THEN '0.85–1' WHEN confidence >= 0.7 THEN '0.70–0.85' WHEN confidence >= 0.5 THEN '0.50–0.70' ELSE '0–0.50' END bucket,
        COUNT(*) judged, SUM(outcome = answer) correct FROM decide_log WHERE created_at > ? AND outcome IS NOT NULL GROUP BY 1, 2, 3 ORDER BY 1, 2, 3`).bind(since),
      env.DB.prepare(`SELECT kind, shadow_engine engine, COUNT(*) n, SUM(shadow_answer = answer) agree, SUM(outcome IS NOT NULL) judged, SUM(outcome = shadow_answer) correct
        FROM decide_log WHERE created_at > ? AND shadow_engine IS NOT NULL GROUP BY 1, 2`).bind(since),
      env.DB.prepare("SELECT kind, engine, answer, confidence, outcome, created_at FROM decide_log ORDER BY created_at DESC LIMIT 20"),
    ]);
    const acc = (r) => ({ ...r, accuracy: r.judged ? round(r.correct / r.judged, 3) : null });
    return json({ days, engines: rows.results.map(acc), calibration: buckets.results.map(acc), shadow: shadow.results.map((r) => ({ ...r, agreement: r.n ? round(r.agree / r.n, 3) : null, accuracy: r.judged ? round(r.correct / r.judged, 3) : null })), recent: recent.results,
      config: { shadow: env.DECIDE_SHADOW || null, jev: extAvailable(env, "jev"), laya: extAvailable(env, "laya"), ext_private: env.DECIDE_EXT_PRIVATE === "1", route: env.DECIDE_ROUTE || "log", proto: { T: Number(env.DECIDE_PROTO_T || PROTO_DEFAULTS.T), floor: Number(env.DECIDE_PROTO_FLOOR || PROTO_DEFAULTS.floor) } } });
  });
}
