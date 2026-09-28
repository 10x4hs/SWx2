// AI 채팅: Gemini(Google AI Studio) · Xiaomi MiMo · 둘 다 비교.
// 키는 Worker 비밀값(GEMINI_API_KEY, MIMO_API_KEY)에만 있고 브라우저로 나가지 않아요.

const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/";
const MIMO_URL = "https://api.xiaomimimo.com/v1/chat/completions";

// 혼잡(503)·한도(429)·폐지(404)면 다음 모델로 넘어가요
const MODELS = {
  gemini: { label: "Gemini Flash", desc: "빠르고 한국어가 자연스러워요", provider: "gemini", chain: ["gemini-3.8-flash", "gemini-flash-latest", "gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-3.5-flash"] },
  // 무료 키는 Pro 한도가 거의 없어서(429) 막히면 Flash로 내려가요
  "gemini-pro": { label: "Gemini Pro", desc: "깊게 풀어요 · 무료 한도가 작아요", provider: "gemini", chain: ["gemini-3.1-pro-preview", "gemini-pro-latest", "gemini-3.8-flash", "gemini-flash-latest"] },
  mimo: { label: "MiMo Flash", desc: "생각 과정을 보여줘요", provider: "mimo", chain: ["mimo-v2.6-flash", "mimo-v2.5"] },
  "mimo-pro": { label: "MiMo Pro", desc: "추론이 강한 큰 모델", provider: "mimo", chain: ["mimo-v2.6-pro", "mimo-v2.5-pro"] },
};
const COMPARE = ["gemini", "mimo"]; // "all" = 이 둘을 나란히
const DAILY_LIMIT = 200;             // 사람당 하루 질문 수
const RETRYABLE = new Set([404, 429, 500, 502, 503, 504]);

const available = (env, id) => (MODELS[id].provider === "gemini" ? !!env.GEMINI_API_KEY : !!env.MIMO_API_KEY);

export function registerAi(on, { json, body, fail, str, uid, now }) {
  on("GET", "/ai/models", ({ env }) => json({
    models: [
      { id: "all", label: "전체 비교", desc: "Gemini와 MiMo 답을 나란히", available: COMPARE.every((m) => available(env, m)) },
      ...Object.entries(MODELS).map(([id, m]) => ({ id, label: m.label, desc: m.desc, available: available(env, id) })),
    ],
    default: "all",
  }));

  on("GET", "/ai/chats", async ({ env, user }) => {
    const { results } = await env.DB.prepare("SELECT id, title, model, updated_at FROM chats WHERE user_id = ? ORDER BY updated_at DESC LIMIT 100").bind(user.id).all();
    return json({ chats: results });
  });

  const ownChat = async (env, id, user) => {
    const c = await env.DB.prepare("SELECT * FROM chats WHERE id = ? AND user_id = ?").bind(id, user.id).first();
    if (!c) fail(404, "대화를 찾을 수 없어요.");
    return c;
  };

  on("GET", "/ai/chats/:id", async ({ env, user, params }) => {
    const chat = await ownChat(env, params.id, user);
    const { results } = await env.DB.prepare("SELECT id, role, model, content, created_at FROM chat_messages WHERE chat_id = ? ORDER BY created_at, rowid").bind(chat.id).all();
    return json({ chat, messages: results });
  });

  on("PATCH", "/ai/chats/:id", async ({ req, env, user, params }) => {
    const chat = await ownChat(env, params.id, user);
    const title = str((await body(req)).title, 60, "제목");
    await env.DB.prepare("UPDATE chats SET title = ? WHERE id = ?").bind(title, chat.id).run();
    return json({ chat: { ...chat, title } });
  });

  on("DELETE", "/ai/chats/:id", async ({ env, user, params }) => {
    await ownChat(env, params.id, user);
    await env.DB.prepare("DELETE FROM chats WHERE id = ?").bind(params.id).run();
    return json({ ok: true });
  });

  // 질문 보내기 → text/event-stream 으로 답을 흘려보내요
  on("POST", "/ai/chat", async ({ req, env, ec, user }) => {
    const b = await body(req);
    const message = str(b.message, 4000, "질문");
    const modelId = b.model === "all" || MODELS[b.model] ? b.model : "all";
    const targets = modelId === "all" ? COMPARE : [modelId];
    const missing = targets.filter((t) => !available(env, t));
    if (missing.length === targets.length) fail(503, "AI 키가 설정되지 않았어요. README의 'AI 키' 부분을 확인해 주세요.");
    const live = targets.filter((t) => available(env, t));

    const since = now() - 864e5;
    const { n } = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM chat_messages m JOIN chats c ON c.id = m.chat_id WHERE c.user_id = ? AND m.role = 'user' AND m.created_at > ?"
    ).bind(user.id, since).first();
    if (n >= DAILY_LIMIT) fail(429, `하루 질문 한도(${DAILY_LIMIT}개)를 다 썼어요. 내일 다시 물어봐 주세요.`);

    let chat;
    if (b.chat_id) chat = await ownChat(env, b.chat_id, user);
    else {
      chat = { id: uid(), user_id: user.id, title: message.replace(/\s+/g, " ").slice(0, 40), model: modelId, created_at: now(), updated_at: now() };
      await env.DB.prepare("INSERT INTO chats (id, user_id, title, model, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(chat.id, chat.user_id, chat.title, chat.model, chat.created_at, chat.updated_at).run();
    }
    const { results: past } = await env.DB.prepare("SELECT role, model, content FROM chat_messages WHERE chat_id = ? ORDER BY created_at, rowid").bind(chat.id).all();
    const userMsg = { id: uid(), created_at: now() };
    await env.DB.batch([
      env.DB.prepare("INSERT INTO chat_messages (id, chat_id, role, model, content, created_at) VALUES (?, ?, 'user', ?, ?, ?)").bind(userMsg.id, chat.id, modelId, message, userMsg.created_at),
      env.DB.prepare("UPDATE chats SET updated_at = ?, model = ? WHERE id = ?").bind(now(), modelId, chat.id),
    ]);

    const system = b.use_context === false ? basePrompt(user) : await contextPrompt(env, user, b, message);

    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const enc = new TextEncoder();
    let open = true;
    const send = async (o) => { if (!open) return; try { await writer.write(enc.encode(`data: ${JSON.stringify(o)}\n\n`)); } catch { open = false; } };

    const task = (async () => {
      await send({ type: "meta", chat_id: chat.id, title: chat.title, targets: live, skipped: missing });
      const results = await Promise.all(live.map(async (t) => {
        // 모델마다 자기 답만 이어서 기억해요 (비교 모드에서 서로 섞이지 않게)
        const history = past.filter((m) => m.role === "user" || m.model === t).slice(-16);
        try {
          const r = await runModel(env, t, system, history, message, (kind, text) => send({ type: kind, model: t, text }));
          await send({ type: "done", model: t, used: r.used });
          return { t, text: r.text };
        } catch (e) {
          await send({ type: "error", model: t, message: e.message || "답을 받지 못했어요." });
          return { t, text: "" };
        }
      }));
      const saves = results.filter((r) => r.text.trim()).map((r, i) =>
        env.DB.prepare("INSERT INTO chat_messages (id, chat_id, role, model, content, created_at) VALUES (?, ?, 'assistant', ?, ?, ?)").bind(uid(), chat.id, r.t, r.text, now() + i + 1));
      if (saves.length) await env.DB.batch(saves);
      await send({ type: "end" });
      open = false;
      try { await writer.close(); } catch {}
    })();
    ec?.waitUntil(task);

    return new Response(readable, { headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" } });
  });
}

// ---------- prompts ----------
function basePrompt(user) {
  return [
    `너는 세 친구가 함께 쓰는 공부 앱 'Study Trio'의 AI 튜터야. 지금 대화하는 사람은 ${user.display_name}이야.`,
    "항상 한국어로, 친절하지만 군더더기 없이 답해. 마크다운(제목, 목록, 표, 코드블록)을 적절히 써.",
    "개념 설명은 핵심 → 예시 → 헷갈리기 쉬운 점 순서로. 문제 풀이는 단계별로.",
    "모르는 건 모른다고 말하고, 사용자의 기록에 없는 내용을 기록인 것처럼 지어내지 마.",
  ].join("\n");
}

async function contextPrompt(env, user, b, message) {
  const p = b.periods || {};
  const periods = [p.day, p.week, p.month, p.year].filter((x) => typeof x === "string" && /^[DWMY]:[\d\-W]+$/.test(x));
  const day = typeof b.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.day) ? b.day : null;
  const [plans, logs, titles] = await env.DB.batch([
    env.DB.prepare(`SELECT scope, period, text, done, start, mins FROM plans WHERE user_id = ? AND period IN (${periods.map(() => "?").join(",") || "''"}) ORDER BY scope, start, created_at`).bind(user.id, ...periods),
    env.DB.prepare("SELECT at, text, kind FROM logs WHERE user_id = ? AND day = ? ORDER BY at").bind(user.id, day || ""),
    env.DB.prepare("SELECT id, title FROM notes WHERE user_id = ?1 OR shared = 1 ORDER BY updated_at DESC LIMIT 80").bind(user.id),
  ]);

  // 질문과 관련된 노트: [[제목]] 언급 > 제목이 질문에 들어감 > 본문에 질문 단어가 들어감
  const q = message.toLowerCase();
  const mentioned = [...message.matchAll(/\[\[([^\]]+)\]\]/g)].map((m) => m[1].trim().toLowerCase());
  const byTitle = titles.results.filter((n) => mentioned.includes(n.title.toLowerCase()) || (n.title.length >= 2 && q.includes(n.title.toLowerCase())));
  const words = [...new Set(message.split(/[\s,.?!·()\[\]"'“”]+/).filter((w) => w.length >= 2))].slice(0, 6);
  let byBody = [];
  if (byTitle.length < 3 && words.length) {
    const cond = words.map((_, i) => `(n.title LIKE ?${i + 2} OR n.body LIKE ?${i + 2})`).join(" OR ");
    const r = await env.DB.prepare(`SELECT n.id, n.title FROM notes n WHERE (n.user_id = ?1 OR n.shared = 1) AND (${cond}) ORDER BY n.updated_at DESC LIMIT 3`)
      .bind(user.id, ...words.map((w) => `%${w.replace(/[\\%_]/g, "")}%`)).all();
    byBody = r.results;
  }
  const pick = [...new Map([...byTitle, ...byBody].map((n) => [n.id, n])).values()].slice(0, 4);
  let notes = [];
  if (pick.length) {
    const r = await env.DB.prepare(`SELECT title, body FROM notes WHERE id IN (${pick.map(() => "?").join(",")})`).bind(...pick.map((n) => n.id)).all();
    notes = r.results;
  }

  const scopeName = { year: "올해 목표", month: "이번 달", week: "이번 주", day: "오늘 시간표" };
  const planLines = ["year", "month", "week", "day"].map((s) => {
    const list = plans.results.filter((x) => x.scope === s);
    if (!list.length) return "";
    return `### ${scopeName[s]}\n` + list.map((x) => `- [${x.done ? "x" : " "}] ${x.start ? `${x.start} (${x.mins}분) ` : ""}${x.text}`).join("\n");
  }).filter(Boolean).join("\n");
  let budget = 9000;
  const noteText = notes.map((n) => { const body = n.body.slice(0, Math.max(0, Math.min(2800, budget))); budget -= body.length; return `### [[${n.title}]]\n${body}`; }).join("\n\n");

  return [
    basePrompt(user),
    "",
    `지금: ${day || "?"} ${typeof b.time === "string" ? b.time : ""} (사용자 현지 시간)`,
    "",
    "## 사용자의 기록 (참고용 — 질문과 관련 있을 때만 활용하고, 노트를 인용할 땐 [[제목]]으로 표시해)",
    planLines || "(계획 없음)",
    logs.results.length ? "### 오늘 실행 기록\n" + logs.results.map((l) => `- ${l.at} ${l.text}`).join("\n") : "",
    titles.results.length ? "### 노트 제목 목록\n" + titles.results.map((n) => n.title).join(", ") : "",
    noteText ? "## 관련 노트 본문\n" + noteText : "",
  ].filter((x) => x !== "").join("\n");
}

// ---------- providers ----------
async function runModel(env, id, system, history, message, emit) {
  const m = MODELS[id];
  let lastErr = null;
  for (let round = 0; round < 2; round++) {   // 전부 붐비면 잠깐 쉬고 한 바퀴 더
    if (round) { await emit("status", "모두 붐벼서 잠시 후 다시 시도해요"); await new Promise((r) => setTimeout(r, 1200)); }
    for (const model of m.chain) {
      try {
        const text = m.provider === "gemini"
          ? await gemini(env, model, system, history, message, emit)
          : await mimo(env, model, system, history, message, emit);
        return { text, used: model };
      } catch (e) {
        lastErr = e;
        if (!e.retry) throw e;           // 이미 글자를 보냈거나 되돌릴 수 없는 오류
        await emit("status", `${model} 혼잡 → 다음 모델로`);
      }
    }
  }
  throw lastErr || new Error("답을 받지 못했어요.");
}

async function providerError(res, name) {
  let msg = "";
  try { const j = await res.json(); msg = j.error?.message || j.message || ""; } catch {}
  const e = new Error(res.status === 429 ? `${name} 사용 한도에 걸렸어요. 잠시 뒤 다시 시도해 주세요.` : res.status === 503 ? `${name}이(가) 지금 붐벼요.` : `${name} 오류 (${res.status}) ${msg.slice(0, 120)}`);
  e.retry = RETRYABLE.has(res.status);
  return e;
}

async function* sse(res) {
  const reader = res.body.getReader(), dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") return;
      try { yield JSON.parse(data); } catch {}
    }
  }
}

async function gemini(env, model, system, history, message, emit) {
  const contents = [...history, { role: "user", content: message }].map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));
  const res = await fetch(`${GEMINI_URL}${model}:streamGenerateContent?alt=sse`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
    body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents, generationConfig: { temperature: 0.7, maxOutputTokens: 4096 } }),
  });
  if (!res.ok) throw await providerError(res, "Gemini");
  let text = "";
  for await (const chunk of sse(res)) {
    for (const part of chunk.candidates?.[0]?.content?.parts || []) {
      if (!part.text) continue;
      if (part.thought) await emit("reasoning", part.text);
      else { text += part.text; await emit("delta", part.text); }
    }
  }
  if (!text) { const e = new Error("Gemini가 빈 답을 보냈어요."); e.retry = true; throw e; }
  return text;
}

async function mimo(env, model, system, history, message, emit) {
  const messages = [{ role: "system", content: system }, ...history.map((m) => ({ role: m.role, content: m.content })), { role: "user", content: message }];
  const res = await fetch(MIMO_URL, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${env.MIMO_API_KEY}` },
    body: JSON.stringify({ model, messages, stream: true, max_tokens: 8192, temperature: 0.7 }),
  });
  if (!res.ok) throw await providerError(res, "MiMo");
  let text = "";
  for await (const chunk of sse(res)) {
    const d = chunk.choices?.[0]?.delta || {};
    if (d.reasoning_content) await emit("reasoning", d.reasoning_content);
    if (d.content) { text += d.content; await emit("delta", d.content); }
  }
  if (!text) { const e = new Error("MiMo가 빈 답을 보냈어요."); e.retry = true; throw e; }
  return text;
}
