// AI 채팅: Gemini(Google AI Studio) · Groq · Cohere · Xiaomi MiMo · 여러 개 나란히 비교.
// 키는 Worker 비밀값(GEMINI_API_KEY, GROQ_API_KEY, COHERE_API_KEY, MIMO_API_KEY)에만 있고 브라우저로 나가지 않아요.

const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/";
const MIMO_URL = "https://api.xiaomimimo.com/v1/chat/completions";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const COHERE_URL = "https://api.cohere.com/v2/chat";
const KEY = { gemini: "GEMINI_API_KEY", groq: "GROQ_API_KEY", cohere: "COHERE_API_KEY", mimo: "MIMO_API_KEY" };

// 혼잡(503)·한도(429)·폐지(404)면 다음 모델로 넘어가요
const MODELS = {
  gemini: { label: "Gemini Flash", desc: "빠르고 한국어가 자연스러워요", provider: "gemini", chain: ["gemini-3.8-flash", "gemini-flash-latest", "gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-3.5-flash"] },
  // 무료 키는 Pro 한도가 거의 없어서(429) 막히면 Flash로 내려가요
  "gemini-pro": { label: "Gemini Pro", desc: "깊게 풀어요 · 무료 한도가 작아요", provider: "gemini", chain: ["gemini-3.1-pro-preview", "gemini-pro-latest", "gemini-3.8-flash", "gemini-flash-latest"] },
  // Groq 무료 등급은 분당 토큰(8천)이 작아서, 막히면 더 작은 모델로 내려가요
  groq: { label: "Groq GPT-OSS", desc: "아주 빨라요", provider: "groq", chain: ["openai/gpt-oss-120b", "openai/gpt-oss-20b", "qwen/qwen3.8-27b"] },
  cohere: { label: "Cohere Command A", desc: "한국어 정리가 깔끔해요", provider: "cohere", chain: ["command-a-03-2025", "command-a-plus-05-2026"] },
  mimo: { label: "MiMo Flash", desc: "생각 과정을 보여줘요", provider: "mimo", chain: ["mimo-v2.6-flash", "mimo-v2.5"] },
  "mimo-pro": { label: "MiMo Pro", desc: "추론이 강한 큰 모델", provider: "mimo", chain: ["mimo-v2.6-pro", "mimo-v2.5-pro"] },
};
const COMPARE = ["gemini", "groq", "cohere"]; // "all" = 이 셋을 나란히 (MiMo는 따로 골라요)
const DAILY_LIMIT = 200;             // 사람당 하루 질문 수
// 413 = Groq "한 번에 너무 큼(분당 토큰 초과)" → 다음 모델/회사로
const RETRYABLE = new Set([404, 413, 429, 500, 502, 503, 504]);

const hasKey = (env, provider) => !!env[KEY[provider]];
const available = (env, id) => hasKey(env, MODELS[id].provider);

export function registerAi(on, { json, body, fail, str, uid, now }) {
  on("GET", "/ai/models", ({ env }) => json({
    models: [
      // 키가 하나라도 있으면 비교를 열어 두고, 없는 모델은 meta.skipped 로 알려줘요
      { id: "all", label: "전체 비교", desc: "Gemini · Groq · Cohere 답을 나란히", available: COMPARE.some((m) => available(env, m)), targets: COMPARE },
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
          await send({ type: "done", model: t, used: r.used, fallback: r.used !== MODELS[t].chain[0] }); // fallback = 첫 모델이 아닌 걸로 답함
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
    `너는 세 친구가 함께 쓰는 공부 앱 'Dsm-mafia'의 AI 튜터야. 지금 대화하는 사람은 ${user.display_name}이야.`,
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
    env.DB.prepare("SELECT id, title FROM notes WHERE user_id = ?1 ORDER BY updated_at DESC LIMIT 80").bind(user.id),
  ]);

  // 질문과 관련된 노트: [[제목]] 언급 > 제목이 질문에 들어감 > 본문에 질문 단어가 들어감
  const q = message.toLowerCase();
  const mentioned = [...message.matchAll(/\[\[([^\]]+)\]\]/g)].map((m) => m[1].trim().toLowerCase());
  const byTitle = titles.results.filter((n) => mentioned.includes(n.title.toLowerCase()) || (n.title.length >= 2 && q.includes(n.title.toLowerCase())));
  const words = [...new Set(message.split(/[\s,.?!·()\[\]"'“”]+/).filter((w) => w.length >= 2))].slice(0, 6);
  let byBody = [];
  if (byTitle.length < 3 && words.length) {
    const cond = words.map((_, i) => `(n.title LIKE ?${i + 2} OR n.body LIKE ?${i + 2})`).join(" OR ");
    const r = await env.DB.prepare(`SELECT n.id, n.title FROM notes n WHERE n.user_id = ?1 AND (${cond}) ORDER BY n.updated_at DESC LIMIT 3`)
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

// ---------- JSON 한 번에 받기 (노트 정리·생성용) ----------
// Gemini(JSON 모드) → Groq → Cohere → MiMo 순서. 키가 하나도 없으면 503.
// 한 회사 안에서는 붐빌 때만 다음 모델로, 그 회사가 아예 안 되면(키·요청 오류) 다음 회사로 넘어가요.
export async function aiJson(env, system, prompt) {
  const JSON_RUN = { gemini: geminiJson, groq: groqJson, cohere: cohereJson, mimo: mimoJson };
  const groups = ["gemini", "groq", "cohere", "mimo"].filter((p) => hasKey(env, p));
  if (!groups.length) { const e = new Error("AI 키가 설정되지 않았어요. README의 'AI 키' 부분을 확인해 주세요."); e.status = 503; throw e; }
  let lastErr = null;
  for (const p of groups) {
    for (const model of MODELS[p].chain) {
      try { return await JSON_RUN[p](env, model, system, prompt); }
      catch (e) { lastErr = e; if (!e.retry) break; }
    }
  }
  throw lastErr || new Error("AI 답을 받지 못했어요.");
}

function parseJsonText(text, name) {
  const s = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  try { return JSON.parse(a >= 0 && b > a ? s.slice(a, b + 1) : s); }
  catch { const e = new Error(`${name}가 형식에 맞지 않는 답을 보냈어요.`); e.retry = true; throw e; }
}

async function geminiJson(env, model, system, prompt) {
  const res = await fetch(`${GEMINI_URL}${model}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 16384, responseMimeType: "application/json" },
    }),
  });
  if (!res.ok) throw await providerError(res, "Gemini");
  const j = await res.json();
  const text = (j.candidates?.[0]?.content?.parts || []).filter((p) => p.text && !p.thought).map((p) => p.text).join("");
  if (!text) { const e = new Error("Gemini가 빈 답을 보냈어요."); e.retry = true; throw e; }
  return { data: parseJsonText(text, "Gemini"), used: model };
}

async function mimoJson(env, model, system, prompt) {
  const res = await fetch(MIMO_URL, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${env.MIMO_API_KEY}` },
    body: JSON.stringify({ model, messages: [{ role: "system", content: system + "\n반드시 JSON 객체 하나만 출력해." }, { role: "user", content: prompt }], max_tokens: 16384, temperature: 0.3 }),
  });
  if (!res.ok) throw await providerError(res, "MiMo");
  const j = await res.json();
  const text = j.choices?.[0]?.message?.content || "";
  if (!text) { const e = new Error("MiMo가 빈 답을 보냈어요."); e.retry = true; throw e; }
  return { data: parseJsonText(text, "MiMo"), used: model };
}

// OpenAI 모양 API(Groq)에서 JSON 한 덩어리 받기
async function groqJson(env, model, system, prompt) {
  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${env.GROQ_API_KEY}` },
    body: JSON.stringify({ model, ...groqExtra(model), messages: [{ role: "system", content: system + "\n반드시 JSON 객체 하나만 출력해." }, { role: "user", content: prompt }], response_format: { type: "json_object" }, max_tokens: 8192, temperature: 0.3 }),
  });
  if (!res.ok) throw await providerError(res, "Groq");
  const j = await res.json();
  const text = j.choices?.[0]?.message?.content || "";
  if (!text) { const e = new Error("Groq가 빈 답을 보냈어요."); e.retry = true; throw e; }
  return { data: parseJsonText(text, "Groq"), used: model };
}

async function cohereJson(env, model, system, prompt) {
  const res = await fetch(COHERE_URL, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${env.COHERE_API_KEY}` },
    body: JSON.stringify({ model, messages: [{ role: "system", content: system }, { role: "user", content: prompt }], response_format: { type: "json_object" }, max_tokens: 8000, temperature: 0.3 }),
  });
  if (!res.ok) throw await providerError(res, "Cohere");
  const j = await res.json();
  const text = (j.message?.content || []).filter((c) => c.type === "text").map((c) => c.text).join("");
  if (!text) { const e = new Error("Cohere가 빈 답을 보냈어요."); e.retry = true; throw e; }
  return { data: parseJsonText(text, "Cohere"), used: model };
}

// Qwen은 생각 과정을 따로 빼 달라고 해야 본문에 <think>가 안 섞여요 (gpt-oss는 원래 따로 줘요)
const groqExtra = (model) => (model.startsWith("qwen/") ? { reasoning_format: "parsed" } : {});

// ---------- providers ----------
async function runModel(env, id, system, history, message, emit) {
  const m = MODELS[id];
  let lastErr = null;
  for (let round = 0; round < 2; round++) {   // 전부 붐비면 잠깐 쉬고 한 바퀴 더
    if (round) { await emit("status", "모두 붐벼서 잠시 후 다시 시도해요"); await new Promise((r) => setTimeout(r, 1200)); }
    for (const model of m.chain) {
      try {
        const text = await RUN[m.provider](env, model, system, history, message, emit);
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
  const e = new Error(res.status === 429 || res.status === 413 ? `${name} 사용 한도에 걸렸어요. 잠시 뒤 다시 시도해 주세요.` : res.status === 503 ? `${name}이(가) 지금 붐벼요.` : `${name} 오류 (${res.status}) ${msg.slice(0, 120)}`);
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

// OpenAI 모양 스트림 (MiMo · Groq 둘 다): 생각 과정은 reasoning_content(MiMo) 또는 reasoning(Groq)으로 와요
async function openaiStream(url, key, name, payload, emit) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({ ...payload, stream: true }),
  });
  if (!res.ok) throw await providerError(res, name);
  let text = "";
  for await (const chunk of sse(res)) {
    if (chunk.error) { const e = new Error(`${name} 오류: ${String(chunk.error.message || "").slice(0, 120)}`); e.retry = !text; throw e; }
    const d = chunk.choices?.[0]?.delta || {};
    const think = d.reasoning_content || d.reasoning;
    if (think) await emit("reasoning", think);
    if (d.content) { text += d.content; await emit("delta", d.content); }
  }
  if (!text) { const e = new Error(`${name}가 빈 답을 보냈어요.`); e.retry = true; throw e; }
  return text;
}

const chatMessages = (system, history, message) => [{ role: "system", content: system }, ...history.map((m) => ({ role: m.role, content: m.content })), { role: "user", content: message }];

function mimo(env, model, system, history, message, emit) {
  return openaiStream(MIMO_URL, env.MIMO_API_KEY, "MiMo", { model, messages: chatMessages(system, history, message), max_tokens: 8192, temperature: 0.7 }, emit);
}

function groq(env, model, system, history, message, emit) {
  return openaiStream(GROQ_URL, env.GROQ_API_KEY, "Groq", { model, ...groqExtra(model), messages: chatMessages(system, history, message), max_tokens: 4096, temperature: 0.7 }, emit);
}

// Cohere v2: event 이름이 data 안의 type 에도 들어 있어요 → content-delta 만 글자로 받아요
async function cohere(env, model, system, history, message, emit) {
  const res = await fetch(COHERE_URL, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${env.COHERE_API_KEY}` },
    body: JSON.stringify({ model, messages: chatMessages(system, history, message), stream: true, max_tokens: 4096, temperature: 0.7 }),
  });
  if (!res.ok) throw await providerError(res, "Cohere");
  let text = "";
  for await (const ev of sse(res)) {
    if (ev.type === "content-delta") {
      const c = ev.delta?.message?.content || {};
      if (c.thinking) await emit("reasoning", c.thinking);   // 추론 모델(command-a-reasoning)일 때
      if (c.text) { text += c.text; await emit("delta", c.text); }
    } else if (ev.type === "error" || (ev.message && !ev.type)) {
      const e = new Error(`Cohere 오류: ${String(ev.message || "").slice(0, 120)}`); e.retry = !text; throw e;
    }
  }
  if (!text) { const e = new Error("Cohere가 빈 답을 보냈어요."); e.retry = true; throw e; }
  return text;
}

const RUN = { gemini, mimo, groq, cohere };
