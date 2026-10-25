// 뜻으로 찾기 (semantic search) + 근거 찾기 — 글자 찾기(D1 FTS5) 와 뜻 찾기(Vectorize) 를 RRF 로 섞어요.
//   D1 chunks 표가 원본이에요 (migrations/0067_chunks.sql). Vectorize 는 거기서 다시 만들 수 있는 색인이라, 늦게 보이거나(쓰기 후 30초~몇 분, 재 보니 2~3분) 실패해도
//   글자 찾기는 그대로 돼요. 벡터 결과도 D1 에서 주인(user_id)을 다시 확인한 것만 내보내요.
//
//   자료 두 가지
//     · CIM 카드 399장 (모두 같이, namespace "cim") — 카드 하나 = 조각 하나, 'CIM > N과목 M장 장제목 > 절 > 카드제목' 경로를 앞에 붙여 임베딩
//       CIM 문제 1,995개는 벡터 없이 글자 찾기만(cimq) — 맞으면 그 문제의 카드로 모여요
//     · 내 노트 (namespace "u:<내 id>", 늘 서버가 세션 사람으로 정해요) — 제목 · 절 경로를 앞에 붙인 300~1400자 조각. 일기는 넣지 않아요
//   벡터 바인딩: 배포본 = VECTORS(swx2-chunks), wrangler dev = VECTORS_DEV(swx2-chunks-dev, remote) — 로컬에서 배포 색인을 더럽히지 않게 (vecIndex)
//   무료 한도: Vectorize 저장 5M 차원(계정 전체) ≈ 1024차원 4,880개 → CIM 399 (배포) + 399 (개발) + 노트 RAG_NOTE_VEC_MAX(기본 3000) 까지만 벡터,
//             넘는 조각은 skip (글자 찾기로는 찾아요). Workers AI 무료 하루 10,000 뉴런 → 크론 임베딩은 하루 RAG_DAILY_NEURONS(기본 4000) 어림값까지.
import { canUse } from "./features.js";
import { kstToday } from "./lib/day.js";
import { CIM_ORDER, cimHref, cimRows, chunkNote, terms, trigrams, snippetOf, NOTE_MAX_CHUNKS } from "./lib/rag-text.js";
export { CIM_ORDER, cimHref, cimRows, chunkNote, terms, snippetOf, checkCites } from "./lib/rag-text.js";

export const EMBED_MODEL = "@cf/baai/bge-m3";
export const RERANK_MODEL = "@cf/baai/bge-reranker-base";
export const DIMS = 1024;              // bge-m3 출력 차원 (GET /api/rag/status?probe=1 로 확인)
const RRF_K = 60;
const EMBED_CHARS = 1800;              // 임베딩 한 조각 최대 글자 (bge-m3 는 8k 토큰까지지만 뜻은 앞에 몰려 있어요)
const EMBED_BATCH = 16;                // AI 한 번에 보내는 조각 수
const NEURONS_PER_MTOK = 1075;         // bge-m3 ≈ 1,075 뉴런 / 100만 토큰
const CHARS_PER_TOKEN = 1.5;           // 한국어 어림값

// 기본값 — scripts/rag-eval.mjs 결과로 골랐어요 (README · 보고 참고). 환경값으로 바꿀 수 있어요.
export const DEFAULTS = { rerank: false, neighbors: false, minCos: 0.47, ftsMode: "tri", qPenalty: 2 };
const flag = (env, k, d) => (env[k] === "1" ? true : env[k] === "0" ? false : d);
export const settings = (env) => ({
  rerank: flag(env, "RAG_RERANK", DEFAULTS.rerank),
  neighbors: flag(env, "RAG_NEIGHBORS", DEFAULTS.neighbors),
  minCos: Number(env.RAG_MIN_COS || DEFAULTS.minCos),
  noteVecMax: Number(env.RAG_NOTE_VEC_MAX || 3000),
  userVecMax: Number(env.RAG_USER_VEC_MAX || 1500),
  dailyNeurons: Number(env.RAG_DAILY_NEURONS || 4000),
});

/** 쓸 벡터 색인 — 로컬(PASSWORDLESS=1)은 개발 색인만, 배포본은 배포 색인만. 없으면 null (글자 찾기만) */
export const vecIndex = (env) => (env.PASSWORDLESS === "1" ? env.VECTORS_DEV : env.VECTORS) || null;
export const nsOf = (userId) => (userId ? "u:" + userId : "cim");

const nowMs = () => Date.now();
async function sha(s) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d).slice(0, 10)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
const inList = (n) => Array.from({ length: n }, () => "?").join(",");
async function batchAll(env, stmts, size = 50) {
  for (let i = 0; i < stmts.length; i += size) await env.DB.batch(stmts.slice(i, i + size));
}

// ---------- 하루 뉴런 어림값 (크론 · 색인용 임베딩만 세요. 검색어 임베딩은 아주 작아서 안 세요) ----------
const neuronKey = () => "neu:" + kstToday(0);
export async function neuronsToday(env) {
  const r = await env.DB.prepare("SELECT v FROM rag_meta WHERE k = ?").bind(neuronKey()).first();
  return Number(r?.v || 0);
}
export async function addNeurons(env, n) {
  await env.DB.prepare("INSERT INTO rag_meta (k, v) VALUES (?1, ?2) ON CONFLICT(k) DO UPDATE SET v = CAST(CAST(v AS REAL) + ?2 AS TEXT)").bind(neuronKey(), String(n)).run();
}
export const neuronsFor = (chars) => (chars / CHARS_PER_TOKEN) * NEURONS_PER_MTOK / 1e6;

// ---------- 임베딩 ----------
export async function embed(env, texts) {
  if (!env.AI) throw new Error("AI binding missing");
  const out = [];
  for (let i = 0; i < texts.length; i += EMBED_BATCH) {
    const part = texts.slice(i, i + EMBED_BATCH).map((t) => String(t || " ").slice(0, EMBED_CHARS));
    const r = await env.AI.run(EMBED_MODEL, { text: part });
    const data = r?.data;
    if (!Array.isArray(data) || data.length !== part.length) throw new Error("embedding shape mismatch");
    out.push(...data);
  }
  return out;
}
// 같은 isolate 안에서 같은 검색어는 다시 임베딩하지 않아요 (팔레트에서 글자를 지웠다 다시 칠 때)
const qCache = new Map();
async function embedQuery(env, q) {
  const k = q.slice(0, 300);
  if (qCache.has(k)) return qCache.get(k);
  const [v] = await embed(env, [k]);
  qCache.set(k, v);
  if (qCache.size > 200) qCache.delete(qCache.keys().next().value);
  return v;
}

/**
 * 노트마다 벡터 하나 (첫 조각 note:<id>:0) — Vectorize 에 이미 있는 벡터를 다시 써요. 없는 노트만 bge-m3 로 (저장은 안 해요 · 크론이 따로 넣어요).
 * notes: [{ id, title, body }] · text(n): 없는 노트를 임베딩할 글. 돌려주는 것: notes 와 같은 순서의 길이 1 벡터 (못 구하면 null)
 * 개인 노트 글은 Workers AI(내 계정) 밖으로 나가지 않아요 — 예전 brain.js 의 Cohere 임베딩을 대신해요 (2026-10-25)
 */
export async function noteVectors(env, userId, notes, { text = (n) => n.title + "\n" + (n.body || ""), maxEmbed = 80 } = {}) {
  const out = new Array(notes.length).fill(null);
  if (!notes.length) return out;
  const vi = vecIndex(env), at = new Map(notes.map((n, i) => ["note:" + n.id + ":0", i]));
  if (vi) {
    const ids = [...at.keys()], done = [];
    for (let i = 0; i < ids.length; i += 80) {
      const part = ids.slice(i, i + 80);
      const { results } = await env.DB.prepare(`SELECT id FROM chunks WHERE vec_state = 'done' AND user_id = ? AND id IN (${inList(part.length)})`).bind(userId, ...part).all();
      done.push(...results.map((r) => r.id));
    }
    for (let i = 0; i < done.length; i += 20) {
      try { for (const v of await vi.getByIds(done.slice(i, i + 20))) if (v?.values?.length && at.has(v.id)) out[at.get(v.id)] = Array.from(v.values); }
      catch (e) { console.log("noteVectors getByIds", String(e?.message || e)); }
    }
  }
  const miss = out.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0).slice(0, maxEmbed);
  if (miss.length && env.AI) {
    const texts = miss.map((i) => String(text(notes[i]) || " ").slice(0, EMBED_CHARS));
    const vs = await embed(env, texts);
    miss.forEach((i, j) => { out[i] = vs[j]; });
    await addNeurons(env, neuronsFor(texts.reduce((a, t) => a + t.length, 0))).catch(() => {});
  }
  return out.map((v) => { if (!v) return null; const len = Math.hypot(...v) || 1; return v.map((x) => x / len); });
}

// ---------- 조각 만들기 ----------
const embedText = (row) => (row.path + "\n" + row.text).slice(0, EMBED_CHARS);

// ---------- D1 에 조각 맞추기 (원본과 비교해 바뀐 것만) ----------
async function reconcile(env, { userId, sourceType, sourceIds, rows, vecState = (r) => "pending" }) {
  // 지금 D1 에 있는 조각 (이 문서들의 것)
  const have = new Map();
  for (let i = 0; i < sourceIds.length; i += 80) {
    const part = sourceIds.slice(i, i + 80);
    const { results } = await env.DB.prepare(`SELECT id, content_hash, vec_state, user_id, source_type FROM chunks WHERE source_type IN (${sourceType.map(() => "?").join(",")}) AND source_id IN (${inList(part.length)})`).bind(...sourceType, ...part).all();
    for (const r of results) have.set(r.id, r);
  }
  const t = nowMs(), stmts = [], keep = new Set();
  let changed = 0;
  for (const r of rows) {
    keep.add(r.id);
    const hash = await sha(r.path + "\u0001" + r.text);
    const old = have.get(r.id);
    if (old && old.content_hash === hash) continue;
    changed++;
    stmts.push(env.DB.prepare(
      `INSERT INTO chunks (id, user_id, source_type, source_id, title, path, text, content_hash, vec_state, vec_tries, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 0, ?10)
       ON CONFLICT(id) DO UPDATE SET user_id = ?2, source_type = ?3, source_id = ?4, title = ?5, path = ?6, text = ?7, content_hash = ?8, vec_state = ?9, vec_tries = 0, updated_at = ?10`
    ).bind(r.id, userId, r.source_type, r.source_id, r.title, r.path, r.text, hash, vecState(r), t));
  }
  const gone = [...have.values()].filter((r) => !keep.has(r.id));
  for (const g of gone) {
    stmts.push(env.DB.prepare("DELETE FROM chunks WHERE id = ?").bind(g.id));
    if (g.vec_state === "done") stmts.push(env.DB.prepare("INSERT OR IGNORE INTO rag_tomb (id, ns, at) VALUES (?, ?, ?)").bind(g.id, nsOf(g.user_id), t));
  }
  await batchAll(env, stmts);
  return { changed, removed: gone.length };
}

async function loadCimChapter(env, ch) {
  const res = await env.ASSETS.fetch(new Request(`https://assets.local/cim/${ch}.json`));
  if (!res.ok) throw new Error(`cim ${ch} ${res.status}`);
  return res.text();
}
/** CIM 장 하나를 D1 에 맞춰요 (파일 지문이 같으면 건너뛰어요) */
export async function syncCimChapter(env, ch, { force = false } = {}) {
  if (!CIM_ORDER.includes(ch)) throw new Error("unknown chapter");
  const raw = await loadCimChapter(env, ch), hash = await sha(raw), key = "cimch:" + ch;
  const doc = await env.DB.prepare("SELECT hash FROM rag_docs WHERE key = ?").bind(key).first();
  if (!force && doc?.hash === hash) return { ch, skipped: true };
  const rows = cimRows(JSON.parse(raw));
  const cards = [...new Set(rows.map((r) => r.source_id))];
  // 옛 카드 key 가 사라졌을 수도 있어서, 이 장의 모든 카드 조각과 비교해요
  const { results: old } = await env.DB.prepare("SELECT DISTINCT source_id FROM chunks WHERE source_type IN ('cim','cimq') AND source_id LIKE ?").bind(ch + "-%").all();
  const ids = [...new Set([...cards, ...old.map((o) => o.source_id)])];
  const r = await reconcile(env, { userId: null, sourceType: ["cim", "cimq"], sourceIds: ids, rows, vecState: (x) => (x.source_type === "cimq" ? "none" : "pending") });
  await env.DB.prepare("INSERT INTO rag_docs (key, user_id, src_updated_at, hash, indexed_at) VALUES (?1, NULL, 0, ?2, ?3) ON CONFLICT(key) DO UPDATE SET hash = ?2, indexed_at = ?3").bind(key, hash, nowMs()).run();
  return { ch, cards: cards.length, ...r };
}

/** 노트 하나를 D1 에 맞춰요 — 지워졌으면 조각도 지우고 벡터는 rag_tomb 로 */
export async function syncNote(env, noteId) {
  const n = await env.DB.prepare("SELECT id, user_id, title, body, updated_at FROM notes WHERE id = ?").bind(noteId).first();
  if (!n) {
    const r = await reconcile(env, { userId: null, sourceType: ["note"], sourceIds: [noteId], rows: [] });
    await env.DB.prepare("DELETE FROM rag_docs WHERE key = ?").bind("note:" + noteId).run();
    return { id: noteId, deleted: true, ...r };
  }
  const rows = chunkNote(n.title, n.body).map((c, i) => ({ id: `note:${n.id}:${i}`, source_type: "note", source_id: n.id, title: n.title, path: c.path, text: c.text }));
  const r = await reconcile(env, { userId: n.user_id, sourceType: ["note"], sourceIds: [n.id], rows });
  await env.DB.prepare("INSERT INTO rag_docs (key, user_id, src_updated_at, hash, indexed_at) VALUES (?1, ?2, ?3, '', ?4) ON CONFLICT(key) DO UPDATE SET user_id = ?2, src_updated_at = ?3, indexed_at = ?4")
    .bind("note:" + n.id, n.user_id, n.updated_at || 0, nowMs()).run();
  return { id: n.id, chunks: rows.length, ...r };
}

/** 저장 직후 (ctx.waitUntil 안에서): D1 조각을 맞추고 바뀐 조각을 바로 임베딩해요. 실패해도 크론이 다시 해요 */
export async function syncNoteSoon(env, noteId) {
  try {
    await syncNote(env, noteId);
    await embedPending(env, { sourceId: noteId, limit: NOTE_MAX_CHUNKS });
  } catch (e) { console.log("rag note sync", noteId, String(e?.message || e)); }
}

/** 원본보다 낡은 노트(새로 생김 · 고쳐짐)와 지워진 노트를 골라 맞춰요 */
export async function syncDirtyNotes(env, { userId = null, limit = 10 } = {}) {
  const who = userId ? "AND n.user_id = ?2" : "";
  const dirty = await env.DB.prepare(
    `SELECT n.id FROM notes n LEFT JOIN rag_docs d ON d.key = 'note:' || n.id
     WHERE (d.key IS NULL OR d.src_updated_at < n.updated_at) ${who} ORDER BY n.updated_at DESC LIMIT ?1`
  ).bind(limit, ...(userId ? [userId] : [])).all();
  const gone = await env.DB.prepare(
    `SELECT substr(d.key, 6) id FROM rag_docs d WHERE d.key LIKE 'note:%' ${userId ? "AND d.user_id = ?2" : ""} AND NOT EXISTS (SELECT 1 FROM notes n WHERE n.id = substr(d.key, 6)) LIMIT ?1`
  ).bind(limit, ...(userId ? [userId] : [])).all();
  const ids = [...dirty.results, ...gone.results].map((r) => r.id);
  for (const id of ids) await syncNote(env, id);
  return { synced: ids.length };
}

/** 임베딩이 필요한 조각을 골라 Vectorize 에 넣어요 (노트는 벡터 한도 안에서만, 넘치면 skip) */
export async function embedPending(env, { sourceId = null, userId = null, limit = 64, budget = Infinity } = {}) {
  const vec = vecIndex(env);
  if (!vec || !env.AI) return { embedded: 0, reason: "no-binding" };
  const S = settings(env);
  const where = sourceId ? "AND source_id = ?2" : userId ? "AND user_id = ?2" : "";
  const { results: rows } = await env.DB.prepare(
    `SELECT id, user_id, source_type, source_id, path, text, content_hash FROM chunks
     WHERE (vec_state = 'pending' OR (vec_state = 'error' AND vec_tries < 5)) ${where}
     ORDER BY source_type = 'cim' DESC, updated_at DESC LIMIT ?1`
  ).bind(limit, ...(sourceId ? [sourceId] : userId ? [userId] : [])).all();
  if (!rows.length) return { embedded: 0 };
  // 노트 벡터 한도 (전체 · 사람마다)
  const notes = rows.filter((r) => r.source_type === "note");
  const skip = [];
  if (notes.length) {
    const tot = (await env.DB.prepare("SELECT COUNT(*) n FROM chunks WHERE source_type = 'note' AND vec_state = 'done'").first()).n;
    let room = S.noteVecMax - tot;
    const per = new Map();
    for (const r of notes) {
      if (!per.has(r.user_id)) per.set(r.user_id, S.userVecMax - (await env.DB.prepare("SELECT COUNT(*) n FROM chunks WHERE source_type = 'note' AND vec_state = 'done' AND user_id = ?").bind(r.user_id).first()).n);
      if (room <= 0 || per.get(r.user_id) <= 0) { skip.push(r.id); continue; }
      room--; per.set(r.user_id, per.get(r.user_id) - 1);
    }
  }
  if (skip.length) await batchAll(env, skip.map((id) => env.DB.prepare("UPDATE chunks SET vec_state = 'skip' WHERE id = ?").bind(id)));
  let todo = rows.filter((r) => !skip.includes(r.id));
  // 하루 뉴런 어림값 안에서만
  let spend = 0;
  todo = todo.filter((r) => { const n = neuronsFor(embedText(r).length); if (spend + n > budget) return false; spend += n; return true; });
  if (!todo.length) return { embedded: 0, skipped: skip.length };
  try {
    const vectors = await embed(env, todo.map(embedText));
    await vec.upsert(todo.map((r, i) => ({ id: r.id, values: vectors[i], namespace: nsOf(r.user_id), metadata: { kind: r.source_type, user_id: r.user_id || "", src: r.source_id } })));
    // 그 사이 내용이 또 바뀌었으면(해시가 다르면) pending 으로 남아 다음에 다시 해요
    await batchAll(env, todo.map((r) => env.DB.prepare("UPDATE chunks SET vec_state = 'done', vec_tries = 0 WHERE id = ? AND content_hash = ?").bind(r.id, r.content_hash)));
    await addNeurons(env, spend);
    return { embedded: todo.length, skipped: skip.length, neurons: Math.round(spend * 100) / 100 };
  } catch (e) {
    await batchAll(env, todo.map((r) => env.DB.prepare("UPDATE chunks SET vec_state = 'error', vec_tries = vec_tries + 1 WHERE id = ?").bind(r.id)));
    return { embedded: 0, error: String(e?.message || e) };
  }
}

async function flushTombs(env, limit = 100) {
  const vec = vecIndex(env);
  if (!vec) return { deleted: 0 };
  const { results } = await env.DB.prepare("SELECT id FROM rag_tomb ORDER BY at LIMIT ?").bind(limit).all();
  if (!results.length) return { deleted: 0 };
  const ids = results.map((r) => r.id);
  // 같은 id 가 다시 살아났으면(노트 되돌리기 등) 지우지 않아요
  const alive = new Set((await env.DB.prepare(`SELECT id FROM chunks WHERE vec_state = 'done' AND id IN (${inList(ids.length)})`).bind(...ids).all()).results.map((r) => r.id));
  const dead = ids.filter((id) => !alive.has(id));
  if (dead.length) await vec.deleteByIds(dead);
  await env.DB.prepare(`DELETE FROM rag_tomb WHERE id IN (${inList(ids.length)})`).bind(...ids).run();
  return { deleted: dead.length };
}

/** 매시 크론 한 걸음 (src/cron.js HOURLY): 지울 벡터 → CIM 장 하나 → 바뀐 노트 → 임베딩 (하루 뉴런 어림값 안에서) */
export async function ragCron(env) {
  const out = {};
  out.tomb = await flushTombs(env).catch((e) => ({ error: String(e?.message || e) }));
  // CIM: 아직 한 번도 색인하지 않은 장이 있으면 한 번에 두 장씩, 다 했으면 한 시간에 한 장씩 돌아가며 파일 지문만 확인 (바뀌었을 때만 다시 색인)
  try {
    const done = new Set((await env.DB.prepare("SELECT key FROM rag_docs WHERE key LIKE 'cimch:%'").all()).results.map((r) => r.key.slice(6)));
    let list = CIM_ORDER.filter((c) => !done.has(c)).slice(0, 2);
    if (!list.length) {
      const pos = Number((await env.DB.prepare("SELECT v FROM rag_meta WHERE k = 'cim_pos'").first())?.v || 0);
      list = [CIM_ORDER[pos % CIM_ORDER.length]];
      await env.DB.prepare("INSERT INTO rag_meta (k, v) VALUES ('cim_pos', ?1) ON CONFLICT(k) DO UPDATE SET v = ?1").bind(String((pos + 1) % CIM_ORDER.length)).run();
    }
    out.cim = [];
    for (const ch of list) out.cim.push(await syncCimChapter(env, ch));
  } catch (e) { out.cim = { error: String(e?.message || e) }; }
  out.notes = await syncDirtyNotes(env, { limit: 40 }).catch((e) => ({ error: String(e?.message || e) }));
  try {
    const S = settings(env), left = S.dailyNeurons - (await neuronsToday(env));
    // 한도 안에서 skip 이었던 노트 조각은 자리가 나면 다시 pending 으로
    const tot = (await env.DB.prepare("SELECT COUNT(*) n FROM chunks WHERE source_type = 'note' AND vec_state = 'done'").first()).n;
    if (tot < S.noteVecMax) await env.DB.prepare(
      `UPDATE chunks SET vec_state = 'pending' WHERE id IN (SELECT c.id FROM chunks c WHERE c.vec_state = 'skip'
         AND (SELECT COUNT(*) FROM chunks d WHERE d.user_id = c.user_id AND d.source_type = 'note' AND d.vec_state = 'done') < ?2 ORDER BY c.updated_at DESC LIMIT ?1)`
    ).bind(Math.min(64, S.noteVecMax - tot), S.userVecMax).run();
    out.embed = left > 0 ? await embedPending(env, { limit: 96, budget: left }) : { embedded: 0, reason: "daily-neurons" };
  } catch (e) { out.embed = { error: String(e?.message || e) }; }
  return out;
}

// ---------- 찾기 ----------
// 보이는 조각: 내 노트(지금도 내 것인 노트) + (CIM 기능이 있으면) CIM
const VIS = `((c.source_type = 'note' AND c.user_id = ?U AND EXISTS (SELECT 1 FROM notes n WHERE n.id = c.source_id AND n.user_id = ?U))
  OR (?C = 1 AND c.user_id IS NULL AND c.source_type IN ('cim', 'cimq')))`;
const vis = (sql, n) => sql.replaceAll("?U", "?" + n).replaceAll("?C", "?" + (n + 1));

export async function keywordSearch(env, userId, q, { cim = true, notes = true, k = 30, excludeQ = null, ftsMode = "tri", qPenalty = 0 } = {}) {
  const ts = terms(q), short = ts.filter((t) => t.length === 2);
  let long = ts.filter((t) => t.length >= 3);
  if (ftsMode === "tri") long = trigrams(long);
  if (!ts.length) return [];
  const ex = excludeQ === "all" ? "AND c.source_type != 'cimq'" : excludeQ ? "AND c.id != ?X" : "";
  const noteOnly = notes ? "" : "AND c.source_type != 'note'";
  const cols = "c.id, c.user_id, c.source_type, c.source_id, c.title, c.path, c.text";
  let sql, binds;
  if (long.length) {
    const match = long.map((t) => `"${t.replace(/"/g, "")}"`).join(" OR ");
    const bonus = short.map((_, i) => `- 1.5 * (instr(lower(c.path || ' ' || c.text), ?${3 + i}) > 0)`).join(" ");
    const n = 3 + short.length;
    const pen = qPenalty ? `+ ${Number(qPenalty)} * (c.source_type = 'cimq')` : "";
    sql = vis(`SELECT ${cols}, bm25(chunks_fts, 2.0, 1.0) ${bonus} ${pen} AS sc FROM chunks_fts JOIN chunks c ON c.rid = chunks_fts.rowid
      WHERE chunks_fts MATCH ?1 AND ${VIS} ${ex} ${noteOnly} ORDER BY sc LIMIT ?2`, n);
    binds = [match, k, ...short, userId, cim ? 1 : 0];
  } else {
    const hits = short.map((_, i) => `(instr(lower(c.path), ?${3 + i}) > 0) * 2 + (instr(lower(c.text), ?${3 + i}) > 0)`).join(" + ");
    const any = short.map((_, i) => `instr(lower(c.path || ' ' || c.text), ?${3 + i}) > 0`).join(" OR ");
    const n = 3 + short.length;
    sql = vis(`SELECT ${cols}, -(${hits}) AS sc FROM chunks c WHERE (${any}) AND ${VIS} ${ex} ${noteOnly} AND ?1 = ?1 ORDER BY sc, c.updated_at DESC LIMIT ?2`, n);
    binds = ["", k, ...short, userId, cim ? 1 : 0];
  }
  if (ex.includes("?X")) { sql = sql.replace("?X", "?" + (binds.length + 1)); binds.push("cimq:" + excludeQ); }
  const { results } = await env.DB.prepare(sql).bind(...binds).all();
  return results;
}

export async function vectorSearch(env, userId, q, { cim = true, notes = true, k = 20, qvec = null } = {}) {
  const vec = vecIndex(env);
  if (!vec || !env.AI) return { ok: false, hits: [] };
  // 내 노트 벡터가 하나도 없으면 내 namespace 는 묻지 않아요 (Vectorize 무료 질의 한도 아끼기)
  const [v, mine] = await Promise.all([qvec || embedQuery(env, q), notes && userId ? env.DB.prepare("SELECT 1 FROM chunks WHERE user_id = ? AND source_type = 'note' AND vec_state = 'done' LIMIT 1").bind(userId).first() : null]);
  const asks = [];
  if (cim) asks.push(vec.query(v, { topK: k, namespace: "cim", returnValues: false, returnMetadata: "none" }));
  if (mine) asks.push(vec.query(v, { topK: k, namespace: nsOf(userId), returnValues: false, returnMetadata: "none" }));
  const res = await Promise.all(asks);
  const matches = res.flatMap((r) => r.matches || []).sort((a, b) => b.score - a.score);
  if (!matches.length) return { ok: true, hits: [] };
  // D1 에서 다시 확인 (주인 · 아직 있는지) — Vectorize 의 낡은 벡터는 여기서 걸러져요
  const ids = matches.map((m) => m.id);
  const { results } = await env.DB.prepare(vis(`SELECT c.id, c.user_id, c.source_type, c.source_id, c.title, c.path, c.text FROM chunks c WHERE c.id IN (${inList(ids.length)}) AND ${VIS}`, ids.length + 1)).bind(...ids, userId, cim ? 1 : 0).all();
  const byId = new Map(results.map((r) => [r.id, r]));
  return { ok: true, hits: matches.filter((m) => byId.has(m.id)).map((m) => ({ ...byId.get(m.id), cos: m.score })) };
}

const unitOf = (c) => (c.source_type === "note" ? c.id : "cim:" + c.source_id);

async function rerank(env, q, items) {
  const top = items.slice(0, 20);
  const r = await env.AI.run(RERANK_MODEL, { query: q.slice(0, 500), contexts: top.map((it) => ({ text: (it.path + "\n" + it.text).slice(0, 1000) })), top_k: top.length });
  const scores = new Map((r?.response || []).map((x) => [x.id, x.score]));
  const ranked = top.map((it, i) => ({ ...it, rr: scores.get(i) ?? -1 })).sort((a, b) => b.rr - a.rr);
  return [...ranked, ...items.slice(20)];
}

// 노트 1-hop 이웃: 위쪽 노트 결과가 [[링크]]로 가리키거나 그 노트를 가리키는 내 노트의 첫 조각 (실험 · RAG_NEIGHBORS)
async function neighborUnits(env, userId, noteIds) {
  if (!noteIds.length) return [];
  const { results } = await env.DB.prepare(
    `SELECT c.id, c.user_id, c.source_type, c.source_id, c.title, c.path, c.text FROM chunks c JOIN notes n ON n.id = c.source_id AND n.user_id = ?1
     WHERE c.source_type = 'note' AND c.id = 'note:' || n.id || ':0' AND n.id NOT IN (${inList(noteIds.length)}) AND (
       lower(n.title) IN (SELECT lower(l.dst_title) FROM note_links l JOIN notes s ON s.id = l.src_id AND s.user_id = ?1 WHERE l.src_id IN (${inList(noteIds.length)}))
       OR n.id IN (SELECT l.src_id FROM note_links l JOIN notes d ON lower(d.title) = lower(l.dst_title) AND d.user_id = ?1 WHERE d.id IN (${inList(noteIds.length)})))
     LIMIT 6`
  ).bind(userId, ...noteIds, ...noteIds, ...noteIds).all();
  return results;
}

/**
 * 글자 찾기 + 뜻 찾기 → RRF(k=60). 한 결과 = 카드 하나(문제는 자기 카드로 모여요) 또는 노트 조각 하나.
 * mode: "hybrid" | "fts" | "vec". 돌려주는 것: { items: [{…조각, unit, rrf, cos, kw}], vecOk }
 */
export async function retrieve(env, user, q, opt = {}) {
  const S = settings(env);
  const o = { mode: "hybrid", cim: canUse(user, "cim"), notes: true, k: 30, rerank: S.rerank, neighbors: S.neighbors, excludeQ: null, wk: 1, wv: 1, ftsMode: DEFAULTS.ftsMode, qPenalty: DEFAULTS.qPenalty, ...opt };
  const [kw, vr] = await Promise.all([
    o.mode === "vec" ? [] : keywordSearch(env, user.id, q, o),
    o.mode === "fts" ? { ok: false, hits: [] } : vectorSearch(env, user.id, q, { ...o, k: 20 }).catch((e) => { console.log("rag vec", String(e?.message || e)); return { ok: false, hits: [] }; }),
  ]);
  const units = new Map();
  const add = (c, rank, from) => {
    const u = unitOf(c);
    let it = units.get(u);
    if (!it) units.set(u, (it = { ...c, unit: u, rrf: 0, cos: null, kw: null, vr: null }));
    if (from === "kw" && it.kw === null) { it.kw = rank; it.rrf += o.wk / (RRF_K + rank); }
    if (from === "vec" && it.vr === null) { it.vr = rank; it.rrf += o.wv / (RRF_K + rank); it.cos = c.cos; }
    // CIM 문제로 맞았으면 보여 줄 글은 카드 것으로 (아래에서 채워요)
    if (it.source_type === "cimq" && c.source_type === "cim") Object.assign(it, { id: c.id, source_type: "cim", text: c.text });
  };
  let r = 0; const seenKw = new Set();
  for (const c of kw) { const u = unitOf(c); if (seenKw.has(u)) continue; seenKw.add(u); add(c, ++r, "kw"); }
  r = 0; const seenV = new Set();
  for (const c of vr.hits) { const u = unitOf(c); if (seenV.has(u)) continue; seenV.add(u); add(c, ++r, "vec"); }
  let items = [...units.values()].sort((a, b) => b.rrf - a.rrf);
  if (o.neighbors && o.notes) {
    const top = items.filter((i) => i.source_type === "note").slice(0, 3).map((i) => i.source_id);
    const nb = await neighborUnits(env, user.id, top).catch(() => []);
    const floor = items.length ? items[Math.min(items.length - 1, 9)].rrf * 0.9 : 0.01;
    for (const c of nb) if (!units.has(unitOf(c))) items.push({ ...c, unit: unitOf(c), rrf: floor, cos: null, kw: null, vr: null, via: "link" });
    items.sort((a, b) => b.rrf - a.rrf);
  }
  // 문제로만 맞은 카드 → 카드 본문을 채워요
  const needCard = items.filter((i) => i.source_type === "cimq").slice(0, 20);
  if (needCard.length) {
    const keys = needCard.map((i) => "cim:" + i.source_id);
    const { results } = await env.DB.prepare(`SELECT id, source_id, title, path, text FROM chunks WHERE id IN (${inList(keys.length)})`).bind(...keys).all();
    const by = new Map(results.map((x) => [x.source_id, x]));
    for (const i of needCard) { const c = by.get(i.source_id); if (c) Object.assign(i, { id: c.id, source_type: "cim", title: c.title, path: c.path, text: c.text }); }
  }
  if (o.rerank && env.AI && items.length > 1) items = await rerank(env, q, items).catch(() => items);
  return { items, vecOk: vr.ok };
}

export const hrefOf = (it) => (it.source_type === "note" ? "#/notes/" + it.source_id : cimHref(it.source_id));

// ---------- API ----------
const needAdmin = (user, fail) => { if (user.role !== "admin" || user.imp_by) fail(403, "관리자만 쓸 수 있어요."); };

export function registerRag(on, { json, fail }) {
  // 뜻으로 찾기 — ⌘K 팔레트의 '뜻으로 찾기' 칸. 노트는 언제나 내 것만, CIM 카드는 CIM 기능이 열린 사람만.
  on("GET", "/search/semantic", async ({ env, ec, user, q }) => {
    const term = String(q.get("q") || "").trim().slice(0, 200);
    if (!term) fail(400, "검색어를 적어 주세요.");
    const limit = Math.max(1, Math.min(20, Number(q.get("limit")) || 8));
    // 다른 길(Brain · 가져오기 · MCP)로 바뀐 내 노트를 뒤에서 몇 개씩 따라잡아요
    ec.waitUntil((async () => {
      await syncDirtyNotes(env, { userId: user.id, limit: 5 });
      const left = settings(env).dailyNeurons - (await neuronsToday(env));
      if (left > 0) await embedPending(env, { userId: user.id, limit: 32, budget: left });
    })().catch((e) => console.log("rag catch-up", String(e?.message || e))));
    const S = settings(env);
    const { items, vecOk } = await retrieve(env, user, term);
    // 뜻으로만 맞은 것 중 약한 것(코사인이 낮은 것)은 빼요 — 글자로도 맞은 건 그대로
    const keep = items.filter((i) => i.kw !== null || (i.cos ?? 0) >= S.minCos || i.via === "link");
    // 노트는 조각이 여러 개면 가장 위 조각 하나만
    const seen = new Set(), ranked = [];
    for (const i of keep) {
      const key = i.source_type + ":" + i.source_id;
      if (seen.has(key)) continue;
      seen.add(key);
      ranked.push({ type: i.source_type === "note" ? "note" : "cim", id: i.source_id, title: i.title, path: i.path, snippet: snippetOf(i.text, term), score: Math.round(i.rrf * 1e4) / 1e4, cos: i.cos === null ? null : Math.round(i.cos * 1000) / 1000, via: [i.kw !== null && "fts", i.vr !== null && "vec", i.via].filter(Boolean), href: hrefOf(i) });
    }
    // 내 노트가 교재 카드에 밀려 사라지지 않게: 자리의 절반(이상)은 노트 몫으로 남겨요
    const nq = ranked.filter((x) => x.type === "note"), cq = ranked.filter((x) => x.type === "cim");
    const nNotes = Math.min(nq.length, Math.max(Math.ceil(limit / 2), limit - cq.length)), nCim = Math.min(cq.length, limit - nNotes);
    const out = [...nq.slice(0, nNotes), ...cq.slice(0, nCim)].sort((x, y) => y.score - x.score);
    return json({ q: term, results: out, vector: vecOk });
  });

  // 관리자: 상태 (조각 수 · 벡터 상태 · 오늘 뉴런 어림값). probe=1 이면 임베딩 한 번 해서 차원을 알려 줘요
  on("GET", "/rag/status", async ({ env, user, q }) => {
    needAdmin(user, fail);
    const { results } = await env.DB.prepare("SELECT source_type, vec_state, COUNT(*) n FROM chunks GROUP BY 1, 2 ORDER BY 1, 2").all();
    const out = { chunks: results, neurons_today: Math.round((await neuronsToday(env)) * 100) / 100, index: env.PASSWORDLESS === "1" ? "swx2-chunks-dev" : "swx2-chunks", vector: !!vecIndex(env), ai: !!env.AI, settings: settings(env) };
    if (q.get("probe") === "1") { const [v] = await embed(env, ["차원 확인"]); out.dims = v.length; }
    if (q.get("describe") === "1" && vecIndex(env)) out.describe = await vecIndex(env).describe();
    return json(out);
  });
  // 관리자: CIM 장 하나 색인 (ch 없으면 다음 장) — scripts/rag-index.mjs 가 19장을 차례로 불러요
  on("POST", "/rag/index/cim", async ({ env, user, q }) => {
    needAdmin(user, fail);
    const ch = q.get("ch");
    if (!CIM_ORDER.includes(ch)) fail(400, "ch=s1c1 … s3c10");
    const sync = await syncCimChapter(env, ch, { force: q.get("force") === "1" });
    const emb = await embedPending(env, { limit: 64 });
    return json({ sync, embed: emb });
  });
  // 관리자: 크론 한 걸음을 지금
  on("POST", "/rag/index/step", async ({ env, user }) => {
    needAdmin(user, fail);
    return json(await ragCron(env));
  });
  // 관리자: 평가 (scripts/rag-eval.mjs) — 한 질문을 여러 방식으로 찾아 카드 순위만 돌려줘요 (CIM 만, 노트는 안 봐요)
  on("GET", "/rag/eval", async ({ env, user, q }) => {
    needAdmin(user, fail);
    const term = String(q.get("q") || "").trim().slice(0, 600);
    if (!term) fail(400, "q");
    const excludeQ = q.get("exclude") || null, scope = q.get("scope") === "notes" ? "notes" : "cim";
    const modes = String(q.get("modes") || "fts,vec,hybrid").split(",");
    const base = scope === "notes" ? { cim: false, notes: true } : { cim: true, notes: false };
    // 노트 평가는 로컬에서만 다른(임시) 사람으로 볼 수 있어요 — 배포본에서는 관리자도 남의 노트를 못 봐요
    const who = scope === "notes" && env.PASSWORDLESS === "1" && q.get("as") ? { ...user, id: q.get("as") } : user;
    const out = {};
    for (const m of modes) {
      const [mode, ...fl] = m.split("+");
      const t0 = Date.now();
      const wv = fl.find((f) => /^w\d+$/.test(f)), noq = fl.includes("noq");
      const r = await retrieve(env, who, term, { ...base, mode, excludeQ: noq ? "all" : excludeQ, rerank: fl.includes("rerank"), neighbors: fl.includes("nb"), ...(wv ? { wv: Number(wv.slice(1)) / 10 } : {}), ...(fl.find((f) => /^qp\d+$/.test(f)) ? { qPenalty: Number(fl.find((f) => /^qp\d+$/.test(f)).slice(2)) / 10 } : {}), ...(fl.includes("term") ? { ftsMode: "term" } : fl.includes("tri") ? { ftsMode: "tri" } : {}) });
      const list = [];
      for (const i of r.items) { const k = i.source_id; if (!list.includes(k)) list.push(k); if (list.length >= 10) break; }
      out[m] = { list, ms: Date.now() - t0, topCos: Math.max(-1, ...r.items.map((i) => i.cos ?? -1)) };
    }
    return json(out);
  });
}
