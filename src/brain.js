// AI 두뇌: 내 노트를 옵시디언처럼 정리하고(주제·#태그·[[링크]]·목차 노트), 새 개념 노트를 만들어요.
// AI가 쓰는 부분은 노트 끝의 표시된 구역에만 들어가고, 다시 돌리면 그 구역만 바뀌어요.
import { aiJson, aiText } from "./ai.js";

const AI_START = "<!-- ai:start -->", AI_END = "<!-- ai:end -->", MOC_MARK = "<!-- ai:moc -->";
const AI_BLOCK_RE = /\n*<!-- ai:start -->[\s\S]*?<!-- ai:end -->\n*/g;
const MOC_PREFIX = "MOC · ";
const MAX_ORGANIZE = 80;          // 한 번에 정리하는 노트 수
const PROMPT_BUDGET = 28_000;     // AI에게 보내는 본문 글자 수
const EMBED_URL = "https://api.cohere.com/v2/embed";
const EMBED_MODEL = "embed-multilingual-v3.0";
const EMBED_BATCH = 96;           // Cohere 한 번에 최대 96개
const EMBED_CHARS = 800;          // 노트마다 제목 + 앞부분만
// 이 모델은 상관없는 한국어 노트끼리도 0.35~0.45가 나와요 (관련 노트는 0.5~0.8) → 0.5부터 후보로
const SIM_MIN = 0.5;
const SIM_TOP = 3;

const stripAi = (text) => text.replace(AI_BLOCK_RE, "").replace(/\s+$/, "");
const cleanTitle = (s) => String(s || "").replace(/[\[\]|#\n]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
const cleanTopic = (s) => cleanTitle(s).slice(0, 16);
const cleanTag = (s) => String(s || "").replace(/^#/, "").trim().replace(/\s+/g, "_").replace(/[^\p{L}\p{N}_\-/]/gu, "").slice(0, 30);
const isMoc = (n) => n.body.startsWith(MOC_MARK);

// ---------- 비슷한 노트 찾기 (Cohere 임베딩) ----------
// 키가 없거나 실패하면 null → 그냥 예전처럼 AI 혼자 링크를 골라요
async function embedNotes(env, notes) {
  if (!env.COHERE_API_KEY || notes.length < 2) return null;
  const texts = notes.map((n) => `${n.title}\n${stripAi(n.body).slice(0, EMBED_CHARS)}`);
  const out = [];
  try {
    for (let i = 0; i < texts.length; i += EMBED_BATCH) {
      const batch = texts.slice(i, i + EMBED_BATCH);
      const res = await fetch(EMBED_URL, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${env.COHERE_API_KEY}` },
        body: JSON.stringify({ model: EMBED_MODEL, input_type: "search_document", embedding_types: ["float"], texts: batch, truncate: "END" }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) return null;
      const v = (await res.json()).embeddings?.float;
      if (!Array.isArray(v) || v.length !== batch.length) return null;
      out.push(...v);
    }
  } catch { return null; }
  // 길이를 1로 맞춰 두면 코사인 유사도 = 내적
  return out.map((v) => { const len = Math.hypot(...v) || 1; return v.map((x) => x / len); });
}

// 노트 id → 가장 비슷한 노트 제목 최대 3개
function similarMap(notes, vecs, targets) {
  const map = new Map();
  if (!vecs) return map;
  const idx = new Map(notes.map((n, i) => [n.id, i]));
  for (const t of targets) {
    const a = vecs[idx.get(t.id)];
    if (!a) continue;
    const scored = [];
    notes.forEach((n, j) => {
      if (n.id === t.id) return;
      const b = vecs[j];
      let s = 0;
      for (let k = 0; k < a.length; k++) s += a[k] * b[k];
      if (s >= SIM_MIN) scored.push([s, n.title]);
    });
    scored.sort((x, y) => y[0] - x[0]);
    if (scored.length) map.set(t.id, scored.slice(0, SIM_TOP).map((x) => x[1]));
  }
  return map;
}

const SYSTEM = [
  "너는 옵시디언 볼트를 정리하는 사서야. 사용자의 공부 노트를 읽고 주제를 나누고, 태그를 달고, 서로 관련된 노트를 연결해.",
  "항상 한국어. 주제 이름은 짧은 명사(12자 이내). 태그는 공백 없는 짧은 단어(영문 소문자나 한글).",
  "링크는 반드시 주어진 노트 제목 목록에 있는 제목을 글자 그대로 써. 없는 제목을 지어내지 마.",
].join("\n");

export function registerBrain(on, { json, body, fail, uid, now, indexStmts, MAX_NOTE }) {
  const ask = async (env, system, prompt) => {
    try { return await aiJson(env, system, prompt); }
    catch (e) { fail(e.status || 502, e.message || "AI 답을 받지 못했어요."); }
  };

  // 노트 끝 AI 구역을 새로 써요
  function aiBlock(topic, tags, links) {
    const lines = ["---", `**AI 정리** · 주제 [[${MOC_PREFIX}${topic}]]`];
    if (tags.length) lines.push(`태그 ${tags.map((t) => "#" + t).join(" ")}`);
    if (links.length) lines.push(`관련 ${links.map((l) => `[[${l}]]`).join(" · ")}`);
    return `${AI_START}\n${lines.join("\n")}\n${AI_END}`;
  }
  const withAi = (text, block) => `${stripAi(text)}\n\n${block}`.replace(/^\n+/, "");

  // 본문 + 주제 + 링크/태그 색인을 한 묶음으로 (쓰기를 한 번에 해야 DB가 덜 막혀요)
  const bodyStmts = (env, id, text, topic, touch) => [
    touch ? env.DB.prepare("UPDATE notes SET body = ?, topic = ?, updated_at = ? WHERE id = ?").bind(text, topic, now(), id)
      : env.DB.prepare("UPDATE notes SET body = ?, topic = ? WHERE id = ?").bind(text, topic, id),
    ...indexStmts(env, id, text),
  ];

  // 주제마다 목차(MOC) 노트: 그 주제 노트 목록 + 요약. 사용자가 고쳐 쓴 목차(표시가 사라진 것)는 건드리지 않아요.
  async function rebuildMoc(env, user, topic) {
    const [{ results: list }, t, existing] = await Promise.all([
      env.DB.prepare("SELECT title FROM notes WHERE user_id = ? AND topic = ? COLLATE NOCASE AND body NOT LIKE ? ORDER BY title").bind(user.id, topic, MOC_MARK + "%").all(),
      env.DB.prepare("SELECT summary FROM topics WHERE user_id = ? AND name = ?").bind(user.id, topic).first(),
      env.DB.prepare("SELECT id, body FROM notes WHERE user_id = ? AND title = ? COLLATE NOCASE").bind(user.id, MOC_PREFIX + topic).first(),
    ]);
    if (existing && !isMoc(existing)) return existing.id;
    if (!list.length) {
      if (existing) await env.DB.prepare("DELETE FROM notes WHERE id = ?").bind(existing.id).run();
      return null;
    }
    const text = [MOC_MARK, `# ${topic}`, t?.summary || "", "", "## 노트", ...list.map((n) => `- [[${n.title}]]`), "", "#moc"].join("\n");
    const id = existing?.id || uid();
    await env.DB.batch([
      existing ? env.DB.prepare("UPDATE notes SET body = ?, topic = ?, updated_at = ? WHERE id = ?").bind(text, topic, now(), id)
        : env.DB.prepare("INSERT INTO notes (id, user_id, title, body, shared, topic, created_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, ?, ?)").bind(id, user.id, MOC_PREFIX + topic, text, topic, now(), now()),
      ...indexStmts(env, id, text),
    ]);
    return id;
  }

  // keep = 이미 있는 주제의 요약은 그대로 (생성할 땐 기존 주제에 노트만 보태니까)
  async function saveTopics(env, user, topics, keep = false) {
    const stmts = topics.filter((t) => t.name).map((t) =>
      env.DB.prepare(`INSERT INTO topics (user_id, name, summary, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(user_id, name) DO ${keep ? "UPDATE SET updated_at = excluded.updated_at" : "UPDATE SET summary = excluded.summary, updated_at = excluded.updated_at"}`)
        .bind(user.id, t.name, String(t.summary || "").slice(0, 300), now()));
    if (stmts.length) await env.DB.batch(stmts);
  }

  const knownTopics = async (env, user) => (await env.DB.prepare("SELECT name FROM topics WHERE user_id = ? ORDER BY updated_at DESC LIMIT 30").bind(user.id).all()).results.map((t) => t.name);

  // ---------- 편집기 안 AI: 이 노트를 보면서 바로 묻기 (답은 마크다운, 노트에 끼워 넣기 좋게 짧게) ----------
  on("POST", "/ai/ask", async ({ req, env, user }) => {
    const b = await body(req);
    const question = String(b.question || "").trim().slice(0, 2000);
    if (!question) fail(400, "무엇을 물어볼지 적어 주세요.");
    let note = null;
    if (typeof b.note_id === "string" && b.note_id) note = await env.DB.prepare("SELECT title, body FROM notes WHERE id = ? AND user_id = ?").bind(b.note_id, user.id).first();
    const context = typeof b.context === "string" ? b.context.slice(0, 12000) : (note?.body || "").slice(0, 12000);
    const system = [
      "너는 세 명이 같이 쓰는 공부 노트 앱 안의 AI야. 사용자가 노트를 쓰다가 바로 물어봐. 답은 그 노트에 그대로 끼워 넣을 수 있게 마크다운으로, 군더더기 없이 써.",
      "규칙: 한국어. 제목 없이 본문만. 필요하면 짧은 목록·굵게. 코드가 필요하면 코드 블록. 길어야 300단어. 노트에 이미 있는 내용은 반복하지 말고 이어서 써.",
      note ? `지금 보는 노트 제목: ${note.title}` : "",
      context ? `노트 내용:\n${context}` : "",
    ].filter(Boolean).join("\n\n");
    try {
      const { text, used } = await aiText(env, system, [{ role: "user", content: question }]);
      return json({ text: String(text || "").trim(), model: used });
    } catch (e) { fail(e.status || 502, e.message || "AI 답을 받지 못했어요."); }
  });

  // ---------- 정리: 노트 하나 또는 내 노트 전부 ----------
  on("POST", "/ai/organize", async ({ req, env, user }) => {
    const b = await body(req);
    const { results: all } = await env.DB.prepare("SELECT id, title, body, topic FROM notes WHERE user_id = ? ORDER BY updated_at DESC LIMIT ?").bind(user.id, MAX_ORGANIZE * 2).all();
    const notes = all.filter((n) => !isMoc(n) && !n.title.startsWith(MOC_PREFIX));
    if (!notes.length) fail(400, "정리할 노트가 없어요. 노트를 먼저 써 주세요.");
    const one = b.note_id ? notes.find((n) => n.id === b.note_id) : null;
    if (b.note_id && !one) fail(404, "정리할 노트를 찾을 수 없어요.");
    const targets = one ? [one] : notes.slice(0, MAX_ORGANIZE);
    const titles = notes.map((n) => n.title);
    const [prev, vecs] = await Promise.all([knownTopics(env, user), embedNotes(env, notes)]);
    const similar = similarMap(notes, vecs, targets);

    const per = Math.max(200, Math.floor(PROMPT_BUDGET / targets.length));
    const prompt = [
      `## 볼트의 모든 노트 제목\n${titles.join("\n")}`,
      prev.length ? `## 이미 있는 주제 (가능하면 그대로 써)\n${prev.join(", ")}` : "",
      `## 정리할 노트 ${targets.length}개`,
      ...targets.map((n) => `### ${n.title}\n${similar.has(n.id) ? `(비슷한 노트 후보: ${similar.get(n.id).join(", ")})\n` : ""}${stripAi(n.body).slice(0, per) || "(빈 노트)"}`),
      "",
      "다음 JSON으로 답해:",
      `{"topics":[{"name":"주제","summary":"이 주제 노트들이 다루는 내용 한두 문장"}],"notes":[{"title":"정리할 노트 제목 그대로","topic":"topics 중 하나","tags":["태그1","태그2"],"links":["관련 노트 제목"]}]}`,
      `규칙: topics는 ${one ? "1개" : "2~8개"}, 정리할 노트마다 notes 항목 하나, tags 1~4개, links 0~5개(자기 자신 제외, 정말 관련 있을 때만).${similar.size ? " '비슷한 노트 후보'는 내용이 비슷하다고 계산된 노트야. 링크를 고를 때 먼저 살펴보되, 실제로 관련 있을 때만 넣어." : ""}`,
    ].filter(Boolean).join("\n\n");

    const { data, used } = await ask(env, SYSTEM, prompt);
    const byTitle = new Map(notes.map((n) => [n.title.toLowerCase(), n]));
    const topics = (Array.isArray(data.topics) ? data.topics : []).map((t) => ({ name: cleanTopic(t?.name), summary: t?.summary })).filter((t) => t.name);
    const topicSet = new Map(topics.map((t) => [t.name.toLowerCase(), t.name]));
    await saveTopics(env, user, topics);

    const touched = new Set(), writes = [];
    let updated = 0;
    for (const item of Array.isArray(data.notes) ? data.notes : []) {
      const n = byTitle.get(String(item?.title || "").trim().toLowerCase());
      if (!n || !targets.includes(n)) continue;
      const topic = topicSet.get(cleanTopic(item.topic).toLowerCase()) || cleanTopic(item.topic) || topics[0]?.name || "기타";
      const tags = [...new Set((item.tags || []).map(cleanTag).filter(Boolean))].slice(0, 4);
      const links = [...new Set((item.links || []).map((l) => byTitle.get(String(l).trim().toLowerCase())?.title).filter((l) => l && l !== n.title))].slice(0, 5);
      const text = withAi(n.body, aiBlock(topic, tags, links));
      if (text.length > MAX_NOTE) continue;
      writes.push(...bodyStmts(env, n.id, text, topic, false));
      if (n.topic && n.topic !== topic) touched.add(n.topic);
      touched.add(topic);
      updated++;
    }
    if (!updated) fail(502, "AI가 정리 결과를 제대로 주지 않았어요. 다시 시도해 주세요.");
    await env.DB.batch(writes);

    // 전체 정리면 더 이상 안 쓰는 AI 목차는 지워요
    if (!one) {
      const live = new Set([...touched].map((t) => (MOC_PREFIX + t).toLowerCase()));
      const stale = all.filter((n) => isMoc(n) && !live.has(n.title.toLowerCase()));
      if (stale.length) await env.DB.batch(stale.map((n) => env.DB.prepare("DELETE FROM notes WHERE id = ?").bind(n.id)));
    }
    for (const t of touched) await rebuildMoc(env, user, t);
    return json({ updated, topics: [...touched], model: used, similar: similar.size });
  });

  // ---------- 생성: 주제 / 채팅 / 노트 → 서로 링크된 개념 노트 여러 개 + 목차 ----------
  on("POST", "/ai/generate", async ({ req, env, user }) => {
    const b = await body(req);
    let source = "", ask_for = "";
    if (b.chat_id) {
      const chat = await env.DB.prepare("SELECT id, title FROM chats WHERE id = ? AND user_id = ?").bind(b.chat_id, user.id).first();
      if (!chat) fail(404, "대화를 찾을 수 없어요.");
      const { results } = await env.DB.prepare("SELECT role, content FROM chat_messages WHERE chat_id = ? ORDER BY created_at, rowid").bind(chat.id).all();
      source = results.map((m) => `${m.role === "user" ? "질문" : "답"}: ${m.content}`).join("\n\n").slice(-PROMPT_BUDGET);
      if (!source.trim()) fail(400, "정리할 대화 내용이 없어요.");
      ask_for = `아래 AI 튜터와의 대화("${chat.title}")에서 배운 내용을 개념 노트로 정리해.`;
    } else if (b.note_id) {
      const n = await env.DB.prepare("SELECT title, body FROM notes WHERE id = ? AND user_id = ?").bind(b.note_id, user.id).first();
      if (!n) fail(404, "노트를 찾을 수 없어요.");
      source = `### ${n.title}\n${stripAi(n.body)}`.slice(0, PROMPT_BUDGET);
      ask_for = `아래 노트("${n.title}")의 내용을 개념 하나당 노트 하나로 쪼개서 정리해. 원래 노트 제목은 쓰지 마.`;
    } else {
      const topic = String(b.topic || "").trim().slice(0, 500);
      if (!topic) fail(400, "무엇에 대한 노트를 만들지 적어 주세요.");
      ask_for = `"${topic}"에 대해 공부용 개념 노트를 만들어.`;
    }

    const { results: mine } = await env.DB.prepare("SELECT id, title, body FROM notes WHERE user_id = ? ORDER BY updated_at DESC LIMIT 200").bind(user.id).all();
    const titles = mine.filter((n) => !isMoc(n)).map((n) => n.title);
    const prev = await knownTopics(env, user);
    const prompt = [
      ask_for,
      source ? `## 원본\n${source}` : "",
      titles.length ? `## 이미 있는 내 노트 제목 (관련 있으면 [[제목]]으로 연결)\n${titles.slice(0, 150).join("\n")}` : "",
      prev.length ? `## 이미 있는 주제 (맞으면 그대로 써)\n${prev.join(", ")}` : "",
      "다음 JSON으로 답해:",
      `{"topic":"주제","summary":"한두 문장","notes":[{"title":"개념 이름","body":"마크다운 본문","tags":["태그"]}]}`,
      "규칙: notes는 3~7개. 제목은 짧은 개념 이름(40자 이내, [ ] | # 금지). body는 200~900자 마크다운: 핵심 정의 → 예시 → 헷갈리는 점. body 안에서 다른 새 노트나 이미 있는 노트를 [[제목]]으로 자연스럽게 연결해. 사실이 아닌 내용을 지어내지 마.",
    ].filter(Boolean).join("\n\n");

    const { data, used } = await ask(env, SYSTEM, prompt);
    const topic = cleanTopic(data.topic) || prev[0] || "새 주제";
    await saveTopics(env, user, [{ name: topic, summary: data.summary }], prev.some((t) => t.toLowerCase() === topic.toLowerCase()));
    const byTitle = new Map(mine.map((n) => [n.title.toLowerCase(), n]));
    const gen = (Array.isArray(data.notes) ? data.notes : []).map((n) => ({ title: cleanTitle(n?.title), body: String(n?.body || "").slice(0, 20_000), tags: [...new Set((n?.tags || []).map(cleanTag).filter(Boolean))].slice(0, 4) }))
      .filter((n) => n.title && n.body.trim() && !n.title.startsWith(MOC_PREFIX.trim()));
    if (!gen.length) fail(502, "AI가 노트를 만들지 못했어요. 다시 시도해 주세요.");
    const genTitles = gen.map((n) => n.title);

    const out = [], writes = [];
    for (const g of gen) {
      const links = genTitles.filter((t) => t !== g.title).slice(0, 5);
      const block = aiBlock(topic, g.tags, links);
      const old = byTitle.get(g.title.toLowerCase());
      if (old) {
        const text = withAi(`${stripAi(old.body)}\n\n## AI 보충\n${g.body}`, block);
        if (text.length > MAX_NOTE) continue;
        writes.push(...bodyStmts(env, old.id, text, topic, true));
        out.push({ id: old.id, title: old.title, created: false });
      } else {
        const id = uid(), text = withAi(g.body, block);
        writes.push(env.DB.prepare("INSERT INTO notes (id, user_id, title, body, shared, topic, created_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, ?, ?)")
          .bind(id, user.id, g.title, text, topic, now(), now()), ...indexStmts(env, id, text));
        byTitle.set(g.title.toLowerCase(), { id, title: g.title, body: text });
        out.push({ id, title: g.title, created: true });
      }
    }
    if (writes.length) await env.DB.batch(writes);
    const moc_id = await rebuildMoc(env, user, topic);
    return json({ topic, notes: out, moc_id, model: used }, 201);
  });
}
